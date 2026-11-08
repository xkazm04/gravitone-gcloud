import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { AB_WINDOW_S, SONG_SCORER_VERSION, YUE2_ENGINE, YUE2_POST_STAGES, YUE2_RIGHTS, type SongScores, type Yue2PostStage, type Yue2TakeFacts } from "@gt/domain/audio.yue2";
import type { Yue2PostRequest, Yue2RenderRequest } from "@gt/domain/audio.yue2.jobs.schema";
import { parseSongScores } from "@gt/domain/audio.yue2.schema";
import { err, ok, type AppError, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { loadJob } from "@gt/kernel/job";
import type { StepContext, StepOutcome } from "@gt/kernel/job-core";
import type { Store } from "@gt/kernel/store";

import { filePathAbs, SoundError, soundFailure, storeRoot } from "../sound/store.ts";
import { getTake, type IncomingFile } from "../sound/takes.ts";
import type { SoundTake } from "../sound/types.ts";
import type { Yue2Answer, Yue2Op, Yue2RunOptions } from "../yue2/wsl.ts";
import { enqueueYue2In, scoreJobFor, YUE2_TIMEOUT_MS } from "./yue2Jobs.ts";

// THE SONG LAB'S STEPS (spark yue2-song-lab WP3) - one seed rendered, one take scored, one post-chain
// or one blind window made, each by one `runYue2` call into WSL (lib/yue2/wsl.ts) and each filed
// through the store that owns it: a take in the sound store with its facts (lib/yue2/facts.ts), a
// score row in the kernel's derived `audio_song_scores` (lib/yue2/scores.ts), a window file in the
// sound store's `yue2-ab/` cache. The producers that run them are ./yue2.ts.
//
// THE ENGINE'S WORD IS THE STEP'S. A `runYue2` refusal (WSL down, a venv missing, the script's own
// `{ok:false}`) fails the step with its code and sentence verbatim; no take is filed for a render
// that did not happen. A take and its facts are filed under ONE store lock (lib/yue2/facts.ts
// fileYue2Take), and its id is derived from the job and the step, so a re-drive files the same take,
// never a second. The lyrics digest is lib/yue2/lyrics.ts's and a take's sha lib/yue2/sha.ts's: one
// definition each, reached through the ports.
//
// THE CALL CAN BE KILLED. The kernel stops a job only at step boundaries; a render runs minutes. Each
// call carries an AbortSignal that fires when the job leaves `running` (an operator's pause or
// cancel), read from the job record every `pollMs` - WP1's door then kills the process tree. The
// kernel books the killed step on a job that is no longer running as no change (job-core `book`).

/** The engine ports, injected: production loads lib/yue2/* lazily (./yue2.ts), a test hands fakes. */
export type Yue2Engines = {
  readonly run: (op: Yue2Op, args: readonly string[], options: Yue2RunOptions) => Promise<Result<Yue2Answer>>;
  readonly toWsl: (windowsPath: string) => string;
  readonly readFacts: (takeIds: readonly string[]) => Promise<Result<Readonly<Record<string, Yue2TakeFacts>>>>;
  /** lib/yue2/facts.ts fileYue2Take: the take and its facts under one store lock. */
  readonly fileTake: (meta: Partial<SoundTake>, file: IncomingFile, facts: Yue2TakeFacts) => Promise<Result<{ readonly take: SoundTake }>>;
  /** lib/yue2/lyrics.ts lyricsDigest. */
  readonly digest: (lyrics: string) => string;
  /** lib/yue2/sha.ts takeSha: the sha256 of the take's stored bytes. */
  readonly sha: (take: SoundTake) => Promise<Result<string>>;
  readonly putScores: (store: Store, row: SongScores) => Result<SongScores>;
};

export type ActDeps = { readonly engines: Yue2Engines; readonly store: () => Result<Store>; readonly pollMs: number; readonly now: () => Date };

const MACHINE: Actor = { kind: "machine", id: "yue2" };

const fatal = (e: Pick<AppError, "code" | "message">): StepOutcome => ({ kind: "fatal", code: e.code, message: e.message });
const thrown = (e: unknown): StepOutcome => {
  const r = soundFailure(e);
  return r.ok ? { kind: "fatal", code: "internal", message: "unreachable" } : fatal(r.error);
};

/** A take's id from its job and step: the same step filed twice is the same take. */
export const takeIdFor = (jobId: string, step: string): string => `st-y2-${createHash("sha256").update(`${jobId}/${step}`).digest("hex").slice(0, 16)}`;

/** Where one blind arm's window is cached (not a take): `<soundStoreRoot>/yue2-ab/<pairId>-<arm>.flac`. */
export const abWindowRel = (pairId: string, arm: "a" | "b"): string => `yue2-ab/${pairId}-${arm}.flac`;
export const abWindowPath = (pairId: string, arm: "a" | "b"): string => path.join(storeRoot(), "yue2-ab", `${pairId}-${arm}.flac`);

/** `yue2 cot=off cfg=1.5 s42`; a cfg left to the model's default reads `cfg=def`. */
export const takeTitle = (r: Pick<Yue2RenderRequest, "cot" | "cfg">, seed: number): string => `yue2 cot=${r.cot} cfg=${r.cfg ?? "def"} s${seed}`;

/** A step's call, with the job's abort watch around it. */
async function call(ctx: StepContext, d: ActDeps, op: Yue2Op, args: readonly string[], timeoutMs: number): Promise<Result<Yue2Answer>> {
  const ac = new AbortController();
  const tick = setInterval(() => {
    const r = ctx.fx.tx("yue2.watch", (t) => loadJob(t, ctx.job.id).job.state);
    if (r.ok && r.value !== "running") ac.abort(new Error(`job ${ctx.job.id} is ${r.value}`));
  }, d.pollMs);
  tick.unref();
  try {
    return await d.engines.run(op, args, { timeoutMs, signal: ac.signal });
  } finally {
    clearInterval(tick);
  }
}

async function inTemp<T>(prefix: string, fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** The bytes a script said it wrote, or why there are none. */
async function written(file: string, op: string): Promise<Result<Uint8Array>> {
  try {
    const bytes = new Uint8Array(await readFile(file));
    return bytes.byteLength > 0 ? ok(bytes) : err("internal", `yue2 ${op} answered ok but ${file} is empty`);
  } catch {
    return err("internal", `yue2 ${op} answered ok but wrote no file at ${file}`);
  }
}

const positive = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined);

/* ── yue2-render: one seed ────────────────────────────────────────────────── */

export async function renderSeed(req: Yue2RenderRequest, seed: number, step: string, ctx: StepContext, d: ActDeps): Promise<StepOutcome> {
  try {
    return await inTemp("gt-yue2-gen-", async (dir) => {
      const style = path.join(dir, "style.txt");
      const lyrics = path.join(dir, "lyrics.txt");
      const out = path.join(dir, `s${seed}.flac`);
      await writeFile(style, req.style, "utf8");
      await writeFile(lyrics, req.lyrics, "utf8");
      const w = d.engines.toWsl;
      const args = [
        "--style-file", w(style), "--lyrics", w(lyrics), "--seed", String(seed), "--cot", req.cot,
        ...(req.cfg === undefined ? [] : ["--cfg", String(req.cfg)]),
        ...(req.adapter === undefined ? [] : ["--lora", req.adapter, ...(req.adapterStrength === undefined ? [] : ["--lora-strength", String(req.adapterStrength)])]),
        "--out", w(out),
      ];
      const r = await call(ctx, d, "gen", args, YUE2_TIMEOUT_MS.gen);
      if (!r.ok) return fatal(r.error);
      const durationS = positive(r.value["durationS"]);
      if (durationS === undefined) return fatal({ code: "invalid", message: `yue2 gen answered no duration for seed ${seed}` });
      const bytes = await written(out, "gen");
      if (!bytes.ok) return fatal(bytes.error);
      const id = takeIdFor(ctx.job.id, step);
      const condition = { cot: req.cot, seed, ...(req.cfg === undefined ? {} : { cfg: req.cfg }), ...(req.adapter === undefined ? {} : { adapter: req.adapter }), ...(req.adapterStrength === undefined ? {} : { adapterStrength: req.adapterStrength }) };
      const facts: Yue2TakeFacts = { engine: YUE2_ENGINE, condition, style: req.style, lyrics: req.lyrics, lyricsDigest: d.engines.digest(req.lyrics), durationS, rights: YUE2_RIGHTS, lineage: { postStages: [] } };
      const filed = await d.engines.fileTake(
        { id, kind: "music", title: takeTitle(req, seed), provider: "local", op: "compose", origin: req.origin, prompt: req.style, technique: ["yue2", `cot-${req.cot}`], durationS, fileName: `${id}.flac` },
        { bytes: bytes.value, mime: "audio/flac", name: `${id}.flac` },
        facts,
      );
      if (!filed.ok) return fatal(filed.error);
      return { kind: "produced", output: { takeId: filed.value.take.id, seed, durationS }, costUsd: 0 };
    });
  } catch (e) {
    return thrown(e);
  }
}

/** Hand the takes a job filed to one score job (enqueued once: a re-drive finds it and adds none). */
export function handToScore(ctx: StepContext, takeIds: readonly string[], by: string): StepOutcome {
  if (takeIds.length === 0) return { kind: "produced", output: { takeIds: [] }, costUsd: 0 };
  const jobId = scoreJobFor(ctx.job.id);
  const r = ctx.fx.tx("yue2.hand-to-score", (t) => {
    if (t.get("SELECT 1 AS x FROM jobs WHERE id = ?", jobId) !== undefined) return false;
    enqueueYue2In(t, "yue2-score", jobId, { takeIds: [...takeIds], by }, MACHINE);
    return true;
  });
  if (!r.ok) return fatal(r.error);
  return { kind: "produced", output: { scoreJobId: jobId, takeIds: [...takeIds], enqueued: r.value }, costUsd: 0 };
}

/* ── yue2-score: one take ─────────────────────────────────────────────────── */

async function takeFile(id: string): Promise<{ readonly take: SoundTake; readonly abs: string }> {
  const take = await getTake(id);
  if (take.file === null) throw new SoundError(`take ${id} has no audio file`, 400);
  return { take, abs: filePathAbs(take.file.path) };
}

export async function scoreTake(takeId: string, ctx: StepContext, d: ActDeps): Promise<StepOutcome> {
  try {
    const { take, abs } = await takeFile(takeId);
    const facts = await d.engines.readFacts([takeId]);
    if (!facts.ok) return fatal(facts.error);
    const f = facts.value[takeId];
    if (f === undefined) return fatal({ code: "refused", message: `take ${takeId} is not a YuE2 take (no facts); the scorer reads a take's lyrics from its facts` });
    const sha = await d.engines.sha(take);
    if (!sha.ok) return fatal(sha.error);
    return await inTemp("gt-yue2-score-", async (dir) => {
      const lyrics = path.join(dir, "lyrics.txt");
      await writeFile(lyrics, f.lyrics, "utf8");
      const r = await call(ctx, d, "score", ["--in", d.engines.toWsl(abs), "--lyrics", d.engines.toWsl(lyrics)], YUE2_TIMEOUT_MS.score);
      if (!r.ok) return fatal(r.error);
      const said = r.value["scores"];
      if (typeof said !== "object" || said === null || Array.isArray(said)) return fatal({ code: "invalid", message: `yue2 score answered no scores for take ${takeId}` });
      const row = parseSongScores({ ...said, sha: sha.value, scorerVersion: SONG_SCORER_VERSION, scoredAt: d.now().toISOString() });
      if (!row.ok) return fatal(row.error);
      const s = d.store();
      if (!s.ok) return fatal(s.error);
      const put = d.engines.putScores(s.value, row.value);
      if (!put.ok) return fatal(put.error);
      return { kind: "produced", output: { takeId, sha: sha.value, ...(row.value.wer === undefined ? {} : { wer: row.value.wer }) }, costUsd: 0 };
    });
  } catch (e) {
    return thrown(e);
  }
}

/* ── yue2-post: a chain, or one blind window ──────────────────────────────── */

const stagesOf = (a: readonly Yue2PostStage[], b: readonly Yue2PostStage[]): Yue2PostStage[] => YUE2_POST_STAGES.filter((s) => a.includes(s) || b.includes(s));

export async function postChain(req: Yue2PostRequest, step: string, ctx: StepContext, d: ActDeps): Promise<StepOutcome> {
  try {
    const src = await takeFile(req.takeId);
    const ref = req.referenceTakeId === undefined ? undefined : await takeFile(req.referenceTakeId);
    const facts = await d.engines.readFacts([req.takeId]);
    if (!facts.ok) return fatal(facts.error);
    const f = facts.value[req.takeId];
    if (f === undefined) return fatal({ code: "refused", message: `take ${req.takeId} is not a YuE2 take (no facts); a post-chain variant carries its source's facts` });
    return await inTemp("gt-yue2-post-", async (dir) => {
      const out = path.join(dir, "post.flac");
      const w = d.engines.toWsl;
      const args = ["--in", w(src.abs), "--out", w(out), "--stages", req.stages.join(","), ...(ref === undefined ? [] : ["--reference", w(ref.abs)])];
      const r = await call(ctx, d, "post", args, YUE2_TIMEOUT_MS.post);
      if (!r.ok) return fatal(r.error);
      const bytes = await written(out, "post");
      if (!bytes.ok) return fatal(bytes.error);
      const id = takeIdFor(ctx.job.id, step);
      const lineage = {
        sourceTakeId: f.lineage.sourceTakeId ?? req.takeId,
        postStages: stagesOf(f.lineage.postStages, req.stages),
        ...(req.referenceTakeId === undefined ? {} : { referenceTakeId: req.referenceTakeId }),
      };
      const filed = await d.engines.fileTake(
        {
          id, kind: "music", title: `${src.take.title} · ${req.stages.join("+")}`.slice(0, 200), provider: "local", op: "compose", origin: req.origin ?? "lab",
          prompt: src.take.prompt, technique: ["yue2", ...req.stages.map((s) => `post-${s}`)], durationS: f.durationS, parentId: req.takeId,
          variation: { axis: "post", diff: [...req.stages] }, fileName: `${id}.flac`,
        },
        { bytes: bytes.value, mime: "audio/flac", name: `${id}.flac` },
        { ...f, lineage },
      );
      if (!filed.ok) return fatal(filed.error);
      const lufs = r.value["lufs"];
      return { kind: "produced", output: { takeId: filed.value.take.id, sourceTakeId: req.takeId, stages: [...req.stages], ...(typeof lufs === "number" ? { lufs } : {}) }, costUsd: 0 };
    });
  } catch (e) {
    return thrown(e);
  }
}

export async function abWindow(req: Yue2PostRequest, ctx: StepContext, d: ActDeps): Promise<StepOutcome> {
  const { pairId, arm } = req;
  if (pairId === undefined || arm === undefined) return fatal({ code: "invalid", message: "an ab-window names its pair and arm" });
  try {
    const src = await takeFile(req.takeId);
    const out = abWindowPath(pairId, arm);
    await mkdir(path.dirname(out), { recursive: true });
    const w = d.engines.toWsl;
    const r = await call(ctx, d, "post", ["--op", "ab-window", "--in", w(src.abs), "--out", w(out), "--window-s", String(req.windowS ?? AB_WINDOW_S)], YUE2_TIMEOUT_MS.post);
    if (!r.ok) return fatal(r.error);
    const s = await stat(out).catch(() => null);
    if (s === null || s.size === 0) return fatal({ code: "internal", message: `yue2 ab-window answered ok but wrote no file at ${out}` });
    const win = r.value["windowS"];
    const onset = r.value["vocalOnsetS"];
    return {
      kind: "produced",
      output: { pairId, arm, file: abWindowRel(pairId, arm), ...(Array.isArray(win) && win.every((x) => typeof x === "number") ? { windowS: win as number[] } : {}), ...(typeof onset === "number" ? { vocalOnsetS: onset } : {}) },
      costUsd: 0,
    };
  } catch (e) {
    return thrown(e);
  }
}
