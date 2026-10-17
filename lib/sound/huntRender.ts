// A HUNT'S RENDER, AS A KERNEL JOB WITH A RECEIPT (Phase 6, L65). The operator picks leaves of a
// drafted map; the desk prices them in SECONDS OF AUDIO through a kernel receipt, the token
// confirms exactly what was priced, and one job renders the leaves on ElevenLabs, one step per
// leaf, each through the step meter. v1 (app/playground/hunt/useHunt.ts `render`) called POST
// /api/sound/generate per leaf from the browser with no receipt at all - the defect the /audio
// composer's receipt removed (SeedComposer's header), and the reason the engine registry
// withholds ElevenLabs from the desk with NO_DESK_PRODUCER: this file is that desk producer, for
// the hunt.
//
// The Score render-cue job's pattern (lib/producers/score.ts), absorbed:
//   · a leaf's render goes through `meteredCall` and lib/sound/generate.ts `generateTake`, which
//     files the take with huntId + nodeId and marks the leaf heard (or failed, with the engine's
//     words) - the hunt store and the take agree whoever drove the job;
//   · ElevenLabs is metered in seconds of audio by v1's music meter (lib/music/budget.ts), whose
//     402 is a MONEY stop, never a breaker count (`musicFailure`); the step books unpriced with
//     that reason;
//   · DRY asks no vendor: a stand-in take (one silent MPEG frame) is filed under an id derived
//     from the job and the leaf, so a dry hunt runs end to end and a resumed one files nothing
//     twice.
// Kept from v1's loop: a selection renders in board order and a money stop ends it with what it
// bought. Upgraded: a stop or a failure no longer strands the rest of the selection `rendering`
// forever - the job's ending is written onto every leaf it did not answer (`settle`).
//
// NOT YET A RUN (deviation, said here and in the L65 report): the domain names no `hunt`
// producer and no hunt run input (packages/domain/src/run.ts PRODUCERS, produce.ts
// ProducerRunInput), so this job is enqueued with no Run row and the worker does not carry it
// (lib/producers/registry.ts BOUND refuses a name the domain does not know). The desk drives it in
// process right after the confirm, as v1's generate route did. The Director lines that make it a
// Run fold `launchHuntRender` into lib/producers/sound.ts `launchJobs` unchanged.
import { createHash } from "node:crypto";

import { PART_OPTIONS } from "@gt/catalog/partOptions";
import { AppError, err, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { LANE_CAPACITY, type ResourceLane } from "@gt/domain/lane";
import type { ModelOption, Receipt, ReceiptMode } from "@gt/domain/produce";
import { blobStore } from "@gt/kernel/blob";
import { armLive, DRY, dryOnlyFrom } from "@gt/kernel/dryrun";
import { liveEffects, type Effects } from "@gt/kernel/effects";
import { append } from "@gt/kernel/events";
import { enqueueIn } from "@gt/kernel/job";
import type { Ending, MissingStep, Producer, StepContext, StepOutcome } from "@gt/kernel/job-core";
import { runJob, type RunReport } from "@gt/kernel/job-run";
import { modelOptions } from "@gt/kernel/records/options";
import { readQueue } from "@gt/kernel/records/read";
import { receiptFor, type PlanLine } from "@gt/kernel/records/receipt";
import type { Reader, Store } from "@gt/kernel/store";
import { meteredCall } from "@gt/producers/research/metered";
import { loopOf } from "@gt/ui/components/audio/hunt.ts";

import { blobRootOf } from "../kernelStore.ts";
import { musicFailure } from "../producers/score.ts";
import { engineById, makeOp, NO_DESK_PRODUCER, type EngineDef } from "./engines.ts";
import { generateTake } from "./generate.ts";
import { readHunts, SoundError, withStore } from "./store.ts";
import { createTake } from "./takes.ts";
import type { GenerateRequest, Hunt, HuntNode, SoundKind, SoundTake } from "./types.ts";

export const HUNT_PRODUCER = "hunt";
export const HUNT_LANE: ResourceLane = "cloud.elevenlabs";
export const HUNT_OP_RE = /^[a-z0-9]{6,40}$/;

/** `job:hunt:<hunt>:<op>`: one job per confirmed render, its hunt readable off the id. */
export const huntJobPrefix = (huntId: string): string => `job:hunt:${huntId}:`;
export const huntJobId = (huntId: string, opId: string): string => `${huntJobPrefix(huntId)}${opId}`;
const stepOf = (nodeId: string): string => `leaf:${nodeId}`;

const UNPRICED = "ElevenLabs music is metered in seconds of audio (lib/music/budget.ts); no dollar figure is reported";
/** One silent MPEG-1 Layer III frame (lib/producers/score.ts's stand-in): a playable nothing. */
const SILENT_MP3 = new Uint8Array([0xff, 0xfb, 0x90, 0x64, ...new Array<number>(413).fill(0)]);

/* ── the brief a leaf sends ─────────────────────────────────────────────── */

/**
 * The generate request one leaf makes, from the leaf's own fields (v1 hunt/leaf.ts
 * `generateRequestFor`): terms, tempo, key and loop are what the drafter stated beside the
 * prompt, never re-read from its text, and nothing is clamped here - a duration the engine
 * refuses comes back as the engine's words on the leaf.
 */
export function generateRequestFor(hunt: Pick<Hunt, "id" | "kind">, node: HuntNode): GenerateRequest {
  const sfx = hunt.kind === "sfx";
  return {
    kind: hunt.kind,
    provider: "elevenlabs",
    op: sfx ? "sfx" : "compose",
    prompt: node.prompt,
    negative: node.negative,
    durationS: node.durationS,
    loop: sfx ? loopOf(node) : null,
    promptInfluence: null,
    technique: [...node.technique],
    terms: { genre: [...node.terms.genre], mood: [...node.terms.mood], instrument: [...node.terms.instrument], sfxCategory: node.terms.sfxCategory },
    tempoBpm: sfx ? null : node.tempoBpm,
    key: sfx ? null : node.key,
    origin: "hunt",
    sourceTakeId: null,
    editModes: null,
    plan: null,
    huntId: hunt.id,
    nodeId: node.id,
    title: node.label,
  };
}

/* ── reach ──────────────────────────────────────────────────────────────── */

/**
 * Why this deployment may not render a kind LIVE, or undefined when it may. The engine registry
 * withholds ElevenLabs from the desk for one of two reasons: NO_DESK_PRODUCER (no producer had
 * a receipt - this file is that producer for a hunt, so the hunt may render) or the deployment's
 * own (no key, the capability off), which still binds a live render.
 */
export function liveBlock(reg: readonly EngineDef[], kind: SoundKind): string | undefined {
  const w = engineById(reg, "elevenlabs")?.withheld.find((x) => x.op === makeOp(kind));
  return w === undefined || w.reason === NO_DESK_PRODUCER ? undefined : w.reason;
}

/* ── the price ──────────────────────────────────────────────────────────── */

/**
 * The catalog's ElevenLabs option for this kind, re-expressed PER SECOND OF AUDIO: the catalog
 * prices a music prompt as 120 audio-seconds and an sfx clip as 10 (packages/catalog
 * partOptions `usage`), and a hunt leaf asks for its own length - so a line's units are the
 * leaf's seconds and the receipt's figure is the seconds the render will request.
 */
export function perSecondOption(kind: SoundKind, day: string): Result<ModelOption> {
  const work = kind === "sfx" ? "sfx" : "track";
  const decl = PART_OPTIONS[work].options.find((o) => o.provider === "elevenlabs");
  const base = modelOptions(work, day).find((o) => o.provider === "elevenlabs");
  const per = decl !== undefined && "usage" in decl ? decl.usage?.perUnit : undefined;
  if (base === undefined || per === undefined || per <= 0) return err("internal", `the catalog prices no ElevenLabs ${kind} by the audio-second`);
  return ok({
    ...base,
    key: `${base.key}#audio-second`,
    label: `${base.label} · per audio-second`,
    secondsPerUnit: base.secondsPerUnit / per,
    usdPerUnit: base.usdPerUnit === null ? null : base.usdPerUnit / per,
    ...(base.usdRangePerUnit === undefined ? {} : { usdRangePerUnit: [base.usdRangePerUnit[0] / per, base.usdRangePerUnit[1] / per] as const }),
  });
}

export type RenderAsk = {
  readonly huntId: string;
  readonly leafIds: readonly string[];
  readonly mode: ReceiptMode;
  readonly opId: string;
  readonly token?: string;
  /** The deployment's engine registry: a live render is refused with its reason (`liveBlock`); a
   *  dry render asks no vendor and is never blocked. */
  readonly engines?: readonly EngineDef[];
};
export type RenderLaunch =
  | { readonly kind: "receipt"; readonly receipt: Receipt }
  | { readonly kind: "stale"; readonly fresh: Receipt }
  | { readonly kind: "launched"; readonly jobId: string; readonly leaves: readonly string[] };

type Leaf = { readonly node: HuntNode; readonly request: GenerateRequest };

/** The leaves a render may take: on the map, a leaf, ElevenLabs, not heard and not in flight. */
function leavesOf(hunt: Hunt, ids: readonly string[]): Result<Leaf[]> {
  const parents = new Set(hunt.nodes.map((n) => n.parentId));
  const out: Leaf[] = [];
  for (const id of ids) {
    const n = hunt.nodes.find((x) => x.id === id);
    if (n === undefined || parents.has(n.id) || n.prompt === "") return err("invalid", `${id} is not a leaf of this hunt`);
    if (n.provider !== "elevenlabs") return err("refused", `${n.label} is a ${n.provider} leaf: it goes by hand, not through the render`);
    if (n.state === "rendered" || n.state === "rendering") return err("conflict", `${n.label} is ${n.state === "rendered" ? "heard already" : "rendering now"}`);
    out.push({ node: n, request: generateRequestFor(hunt, n) });
  }
  return out.length === 0 ? err("invalid", "pick at least one leaf to render") : ok(out);
}

function linesOf(leaves: readonly Leaf[], option: ModelOption): PlanLine[] {
  return leaves.map((l, i) => ({ key: stepOf(l.node.id), label: `${l.node.label} · ${l.node.durationS}s`, lane: HUNT_LANE, units: Math.max(1, Math.round(l.node.durationS)), option, after: [], order: i, status: "pending" }));
}

function receiptIn(r: Reader, jobId: string, lines: readonly PlanLine[], mode: ReceiptMode, now: number): Receipt {
  return receiptFor({ subject: { kind: "run", lane: "audio" }, lines, plan: lines, queue: readQueue(r, new Set([jobId])), capacity: LANE_CAPACITY, now, mode });
}

const inFlightIn = (r: Reader, huntId: string): boolean => r.get("SELECT 1 AS x FROM jobs WHERE id LIKE ? AND state IN ('queued', 'running')", `${huntJobPrefix(huntId)}%`) !== undefined;

/** Is a render job of this hunt still queued or running? The read's `reconcile` asks. */
export function renderInFlight(store: Store, huntId: string): Result<boolean> {
  return store.read((r) => inFlightIn(r, huntId));
}

const words = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * No token: the receipt, nothing written. A token: recomputed in the kernel transaction that
 * enqueues - a moved queue answers the fresh receipt and writes nothing - then the leaves are
 * marked rendering in the hunt store. One render per hunt at a time (v1's `if (run) return`,
 * now held by the kernel rather than a tab's state).
 */
export async function launchHuntRender(store: Store, ask: RenderAsk, actor: Actor, now: Date, env: Readonly<Record<string, string | undefined>> = process.env): Promise<Result<RenderLaunch>> {
  let hunt: Hunt | undefined;
  try {
    hunt = (await readHunts()).hunts.find((h) => h.id === ask.huntId);
  } catch (e) {
    return err("unavailable", `the hunt store did not read: ${words(e)}`);
  }
  if (hunt === undefined) return err("not-found", `no hunt ${ask.huntId}`);
  const blocked = ask.mode === "live" && ask.engines !== undefined ? liveBlock(ask.engines, hunt.kind) : undefined;
  if (blocked !== undefined) return err("refused", `no live render here: ${blocked}`);
  const leaves = leavesOf(hunt, ask.leafIds);
  if (!leaves.ok) return leaves;
  const option = perSecondOption(hunt.kind, now.toISOString().slice(0, 10));
  if (!option.ok) return option;
  const lines = linesOf(leaves.value, option.value);
  const jobId = huntJobId(hunt.id, ask.opId);
  const at = now.getTime();
  if (ask.token === undefined) return store.read((r) => ({ kind: "receipt" as const, receipt: receiptIn(r, jobId, lines, ask.mode, at) }));
  const token = ask.token;
  const huntId = hunt.id;
  const dryOnly = dryOnlyFrom(env);
  const queued = store.tx((t): RenderLaunch => {
    const fresh = receiptIn(t, jobId, lines, ask.mode, at);
    if (fresh.token !== token) return { kind: "stale", fresh };
    if (t.get("SELECT 1 AS x FROM jobs WHERE id = ?", jobId) !== undefined) return { kind: "launched", jobId, leaves: leaves.value.map((l) => l.node.id) };
    if (inFlightIn(t, huntId)) throw new AppError("conflict", "a render of this hunt is still running; it answers first");
    const armed = ask.mode === "dry" ? ok(DRY) : armLive(actor, t.at, `hunt render ${token.slice(0, 12)} confirmed`, { dryOnly });
    if (!armed.ok) throw armed.error;
    enqueueIn(t, { id: jobId, of: { kind: "run", id: `hunt.${huntId}.${ask.opId}` }, producer: HUNT_PRODUCER, lane: HUNT_LANE, mode: armed.value }, actor);
    append(t, { actor, type: "hunt.render.launched", lane: "audio", subject: { kind: "hunt", id: huntId }, data: { job: jobId, leaves: leaves.value.map((l) => l.node.id), seconds: lines.reduce((a, l) => a + l.units, 0), token, mode: armed.value.kind } });
    return { kind: "launched", jobId, leaves: leaves.value.map((l) => l.node.id) };
  });
  if (!queued.ok || queued.value.kind !== "launched") return queued;
  const ids = new Set(queued.value.leaves);
  try {
    await markLeaves(huntId, (n) => (ids.has(n.id) && n.state !== "rendered" ? { state: "rendering", error: null } : null));
  } catch (e) {
    return err("unavailable", `the render is queued (${jobId}); the hunt store did not take its leaves: ${words(e)}`);
  }
  return queued;
}

/* ── the producer ───────────────────────────────────────────────────────── */

async function markLeaves(huntId: string, patch: (n: HuntNode) => Partial<Pick<HuntNode, "state" | "error">> | null): Promise<void> {
  await withStore(async (tx) => {
    const file = await tx.get("hunts");
    const h = file.hunts.find((x) => x.id === huntId);
    if (h === undefined) throw new SoundError(`no hunt ${huntId}`, 404);
    let touched = false;
    h.nodes = h.nodes.map((n) => {
      const p = patch(n);
      if (p === null) return n;
      touched = true;
      return { ...n, ...p };
    });
    if (touched) tx.touch("hunts");
  });
}

export type HuntEngines = { readonly generateTake: (req: GenerateRequest) => Promise<SoundTake> };
const LIVE: HuntEngines = { generateTake: (req) => generateTake(req) };

const huntIdOf = (jobId: string): string | undefined => /^job:hunt:([A-Za-z0-9_-]+):/.exec(jobId)?.[1];

/** A dry leaf's stand-in, filed under an id derived from the job and the leaf (idempotent). */
async function standIn(ctx: StepContext, l: Leaf): Promise<string> {
  const id = `hn-dry-${createHash("sha256").update(`${ctx.job.id}/${l.node.id}`).digest("hex").slice(0, 16)}`;
  const r = l.request;
  const { take } = await createTake(
    { id, kind: r.kind, title: `${l.node.label} (dry stand-in)`, provider: "elevenlabs", op: r.op, origin: "hunt", prompt: r.prompt, technique: r.technique, terms: r.terms, tempoBpm: r.tempoBpm, key: r.key, durationS: r.durationS, loop: r.loop, huntId: r.huntId, nodeId: r.nodeId },
    { bytes: SILENT_MP3, mime: "audio/mpeg", name: "dry.mp3" },
  );
  await withStore(async (tx) => {
    const n = (await tx.get("hunts")).hunts.find((h) => h.id === r.huntId)?.nodes.find((x) => x.id === l.node.id);
    if (n === undefined) return;
    n.takeIds = [...n.takeIds.filter((x) => x !== take.id), take.id];
    n.state = "rendered";
    n.error = null;
    tx.touch("hunts");
  });
  return take.id;
}

/**
 * The render job's definition over the leaves it was launched with. Its plan is a step per leaf
 * the job has not booked; a resumed job (a re-drive after a crash) skips what it already filed.
 */
export function huntRenderProducer(leaves: readonly Leaf[], option: ModelOption, engines: Partial<HuntEngines> = {}): Producer {
  const eng: HuntEngines = { ...LIVE, ...engines };
  const est = (l: Leaf): MissingStep["estimate"] => {
    const s = Math.max(1, Math.round(l.node.durationS));
    return { seconds: option.secondsPerUnit * s, usd: option.usdPerUnit === null ? null : option.usdPerUnit * s, ...(option.usdPerUnit === null ? { unpricedReason: option.unpricedReason ?? UNPRICED } : {}) };
  };
  return {
    lane: HUNT_LANE,
    plan: (_job, outputs) => leaves.filter((l) => !outputs.has(stepOf(l.node.id))).map((l) => ({ name: stepOf(l.node.id), estimate: est(l) })),
    async perform(step, ctx): Promise<StepOutcome> {
      const l = leaves.find((x) => stepOf(x.node.id) === step.name);
      if (l === undefined) return { kind: "fatal", code: "invalid", message: `hunt: no leaf for step ${step.name}` };
      try {
        const live = await meteredCall<SoundTake | null>(ctx, { provider: "elevenlabs", model: l.request.op === "sfx" ? "sfx" : "music", payload: l.request, estimate: est(l), stand: () => null, live: async () => ({ value: await eng.generateTake(l.request), unpriced: UNPRICED }) });
        if (live !== null) return { kind: "produced", output: { takeId: live.id } };
        return { kind: "produced", output: { takeId: await standIn(ctx, l), dry: true }, costUsd: 0 };
      } catch (e) {
        return musicFailure(e);
      }
    },
    async settle(job, ending: Ending) {
      const huntId = huntIdOf(job.id);
      if (huntId === undefined || ending === "done") return;
      const mine = new Set(leaves.map((l) => l.node.id));
      const why = ending === "interrupted" ? "interrupted before a take came back" : `the render ${ending}: ${job.id}`;
      await markLeaves(huntId, (n) => (mine.has(n.id) && n.state === "rendering" ? { state: "failed", error: why } : null));
    },
  };
}

export function huntEffects(store: Store): Effects {
  return liveEffects(store, blobStore(blobRootOf(store)));
}

/**
 * Drive a launched render on this process (the desk's confirm awaits it). The leaves are read
 * back from the hunt store - those still `rendering` - so a re-drive after a crash renders what
 * is left, never what was heard.
 */
export async function driveHuntRender(store: Store, jobId: string, o: { readonly engines?: Partial<HuntEngines>; readonly env?: Readonly<Record<string, string | undefined>>; readonly now?: Date } = {}): Promise<Result<RunReport>> {
  const huntId = huntIdOf(jobId);
  if (huntId === undefined) return err("invalid", `${jobId} is not a hunt render`);
  let hunt: Hunt | undefined;
  try {
    hunt = (await readHunts()).hunts.find((h) => h.id === huntId);
  } catch (e) {
    return err("unavailable", `the hunt store did not read: ${words(e)}`);
  }
  if (hunt === undefined) return err("not-found", `no hunt ${huntId}`);
  const h = hunt;
  const option = perSecondOption(h.kind, (o.now ?? new Date()).toISOString().slice(0, 10));
  if (!option.ok) return option;
  const leaves = h.nodes.filter((n) => n.state === "rendering").map((n) => ({ node: n, request: generateRequestFor(h, n) }));
  return runJob(huntEffects(store), huntRenderProducer(leaves, option.value, o.engines), jobId, { dryOnly: dryOnlyFrom(o.env ?? process.env) });
}
