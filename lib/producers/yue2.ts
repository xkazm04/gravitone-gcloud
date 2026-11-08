import { AppError, ok, type Result } from "@gt/domain/errors";
import type { Job } from "@gt/domain/job";
import { blobStore } from "@gt/kernel/blob";
import { liveEffects } from "@gt/kernel/effects";
import type { MissingStep, Outputs, Producer, StepContext, StepOutcome } from "@gt/kernel/job-core";
import { runJob, type RunOptions, type RunReport } from "@gt/kernel/job-run";
import type { Store } from "@gt/kernel/store";

import { blobRootOf, kernel } from "../kernelProcess.ts";
import { abWindow, handToScore, postChain, renderSeed, scoreTake, type ActDeps, type Yue2Engines } from "./yue2Acts.ts";
import { YUE2_LANE, yue2RequestOf, type Yue2Producer, type Yue2Request } from "./yue2Jobs.ts";

// THE SONG LAB'S PRODUCERS, BOUND TO THIS BOX (spark yue2-song-lab WP3). Three, all on gpu.local
// (capacity 1: a render, a scoring and a post-chain queue behind each other and behind any other
// local GPU job). The registry lines are
//
//   { name: "yue2-render", producer: yue2RenderProducer() },
//   { name: "yue2-score", producer: yue2ScoreProducer() },
//   { name: "yue2-post", producer: yue2PostProducer() },
//
//   yue2-render  a step per seed (`gen:<seed>`): the take filed with its facts, then `score`, which
//                hands every take the batch filed to ONE yue2-score job.
//   yue2-score   a step per take (`score:<takeId>`): the take's scores into `audio_song_scores`.
//   yue2-post    `post`: a chain files a NEW take (parent = the source, facts copied with the lineage)
//                and then `score` hands it on; an ab-window writes one blind arm's file and stops.
//
// Every step reports $0 (an open-weights model on this box's card). The launches and the request
// each job carries are ./yue2Jobs.ts, the steps ./yue2Acts.ts.
//
// NOTHING HERE IMPORTS `server-only` STATICALLY: the worker's producer list must not reach one
// (tests/golden-path/producer-registry-loads.probe.spec.ts), and lib/yue2/* are server-only modules.
// The engines load on a job's first step.

export type Yue2Deps = {
  /** The engine ports; absent = lib/yue2/{wsl,facts,scores,lyrics,sha}.ts, loaded on first use. */
  readonly engines?: () => Promise<Yue2Engines>;
  /** The kernel store the requests and the scores live in; absent = this process's. */
  readonly store?: () => Result<Store>;
  /** How often a running call checks whether its job was paused or cancelled, ms. */
  readonly pollMs?: number;
  readonly now?: () => Date;
};

const processStore = (): Result<Store> => {
  const k = kernel();
  return k.ok ? ok(k.value.store) : k;
};

async function liveEngines(): Promise<Yue2Engines> {
  const [wsl, facts, scores, lyrics, sha] = await Promise.all([import("../yue2/wsl.ts"), import("../yue2/facts.ts"), import("../yue2/scores.ts"), import("../yue2/lyrics.ts"), import("../yue2/sha.ts")]);
  return {
    run: wsl.runYue2,
    toWsl: wsl.toWslPath,
    readFacts: facts.readYue2Facts,
    fileTake: (meta, file, f) => facts.fileYue2Take(meta, file, f),
    digest: lyrics.lyricsDigest,
    sha: sha.takeSha,
    putScores: scores.putSongScores,
  };
}

const ESTIMATE = { gen: { seconds: 180, usd: 0 }, score: { seconds: 60, usd: 0 }, post: { seconds: 90, usd: 0 }, hand: { seconds: 1, usd: 0 } } as const;

/** The outputs' take ids, in plan order (`gen:<seed>` / `post`). */
const filedTakes = (outputs: Outputs, steps: readonly string[]): string[] =>
  steps.flatMap((s) => {
    const v = outputs.get(s)?.value;
    const id = v !== undefined && typeof v === "object" && v !== null && !Array.isArray(v) ? (v as { readonly takeId?: unknown }).takeId : undefined;
    return typeof id === "string" ? [id] : [];
  });

type Shape<P extends Yue2Producer> = {
  readonly steps: (req: Yue2Request[P]) => readonly MissingStep[];
  readonly perform: (req: Yue2Request[P], step: MissingStep, ctx: StepContext, outputs: Outputs, d: ActDeps) => Promise<StepOutcome>;
};

/** One song-lab producer: the request read once per job (in health, outside the driver's transactions) and kept. */
function define<P extends Yue2Producer>(name: P, shape: Shape<P>, o: Yue2Deps): Producer {
  const store = o.store ?? processStore;
  const known = new Map<string, Result<Yue2Request[P]>>();
  const requestOf = (job: Job): Result<Yue2Request[P]> => {
    const held = known.get(job.id);
    if (held?.ok === true) return held;
    const s = store();
    const read = s.ok ? yue2RequestOf(s.value, name, job.id) : s;
    known.set(job.id, read);
    return read;
  };
  let engines: Promise<Yue2Engines> | undefined;
  const deps = (): Promise<ActDeps> => {
    engines ??= (o.engines ?? liveEngines)();
    return engines.then((e) => ({ engines: e, store, pollMs: o.pollMs ?? 2000, now: o.now ?? (() => new Date()) }));
  };
  return {
    lane: YUE2_LANE,
    async health(job) {
      if (job !== undefined) requestOf(job);
      return { ok: true };
    },
    plan(job, outputs) {
      const req = known.get(job.id);
      if (req === undefined) throw new AppError("internal", `${name} job ${job.id} was planned before its request was read`);
      if (!req.ok) throw req.error;
      return shape.steps(req.value).filter((s) => !outputs.has(s.name));
    },
    async perform(step, ctx) {
      const req = requestOf(ctx.job);
      if (!req.ok) return { kind: "fatal", code: req.error.code, message: req.error.message };
      return shape.perform(req.value, step, ctx, ctx.outputs, await deps());
    },
  };
}

const genStep = (seed: number): string => `gen:${seed}`;
const HAND = "score";

export function yue2RenderProducer(o: Yue2Deps = {}): Producer {
  return define("yue2-render", {
    steps: (req) => [...req.seeds.map((seed) => ({ name: genStep(seed), estimate: ESTIMATE.gen })), { name: HAND, estimate: ESTIMATE.hand }],
    perform: async (req, step, ctx, outputs, d) => {
      if (step.name === HAND) return handToScore(ctx, filedTakes(outputs, req.seeds.map(genStep)), req.by);
      const seed = Number(step.name.slice("gen:".length));
      if (!req.seeds.includes(seed)) return { kind: "fatal", code: "internal", message: `a yue2-render job has no step ${step.name}` };
      return renderSeed(req, seed, step.name, ctx, d);
    },
  }, o);
}

export function yue2ScoreProducer(o: Yue2Deps = {}): Producer {
  return define("yue2-score", {
    steps: (req) => req.takeIds.map((id) => ({ name: `score:${id}`, estimate: ESTIMATE.score })),
    perform: async (req, step, ctx, _outputs, d) => {
      const id = step.name.slice("score:".length);
      if (!req.takeIds.includes(id)) return { kind: "fatal", code: "internal", message: `a yue2-score job has no step ${step.name}` };
      return scoreTake(id, ctx, d);
    },
  }, o);
}

const POST = "post";

export function yue2PostProducer(o: Yue2Deps = {}): Producer {
  return define("yue2-post", {
    steps: (req) => ((req.op ?? "chain") === "chain" ? [{ name: POST, estimate: ESTIMATE.post }, { name: HAND, estimate: ESTIMATE.hand }] : [{ name: POST, estimate: ESTIMATE.post }]),
    perform: async (req, step, ctx, outputs, d) => {
      if (step.name === HAND) return handToScore(ctx, filedTakes(outputs, [POST]), req.by);
      if (step.name !== POST) return { kind: "fatal", code: "internal", message: `a yue2-post job has no step ${step.name}` };
      return (req.op ?? "chain") === "chain" ? postChain(req, step.name, ctx, d) : abWindow(req, ctx, d);
    },
  }, o);
}

/** Drive one song-lab job in this process (a test, a CLI): the worker's rules. */
export function driveYue2(store: Store, jobId: string, producer: Producer, opts: RunOptions = {}): Promise<Result<RunReport>> {
  return runJob(liveEffects(store, blobStore(blobRootOf(store))), producer, jobId, opts);
}
