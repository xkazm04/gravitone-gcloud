// A HUNT'S RENDER, AS A RUN (Phase 6, L65 -> L72). The operator picks leaves of a drafted map; the
// desk prices them in SECONDS OF AUDIO through a kernel receipt, the token confirms exactly what
// was priced, and ONE Run - its row, its job - renders the leaves on ElevenLabs, a step per leaf,
// each through the step meter. v1 (app/playground/hunt/useHunt.ts `render`) called POST
// /api/sound/generate per leaf from the browser with no receipt at all - the defect the /audio
// composer's receipt removed, and the reason the engine registry withholds ElevenLabs from the
// desk with NO_DESK_PRODUCER: this file is that desk producer, for the hunt.
//
// L65 enqueued the job with no Run row (the domain named no `hunt` producer): Runs could not draw
// it, the queue priced it at 0 s, no worker carried it. L72: a Run like every launch (`hunt` in
// PRODUCERS, ProducerRunInput, records/runplan NATIVE), its row written in the enqueue's
// transaction and this producer bound in lib/producers/registry.ts - the worker carries what the
// desk's one kick (v1's route rendered at once) did not finish.
//
// A WORKER'S PLAN IS SYNCHRONOUS OVER THE JOB (kernel job-core `plan`); the leaves live in the
// Run's input and their lengths on the hunt's map, neither of which a plan can read. So the first
// step, `leaves`, reads both and books a SNAPSHOT - each confirmed leaf with its estimate - and the
// plan expands from that booked output. The confirmed set is the Run's input, never "whatever is
// rendering" on the map (L65's drive read the map's state, which another writer can move).
//
// The Score render-cue job's pattern (lib/producers/score.ts), absorbed:
//   · a leaf's render goes through `meteredCall` and lib/sound/generate.ts `generateTake`, which
//     files the take with huntId + nodeId and marks the leaf heard (or failed, with the engine's
//     words) - the hunt store and the take agree whoever drove the job;
//   · ElevenLabs is metered in seconds of audio by v1's music meter (lib/music/budget.ts), whose
//     402 is a MONEY stop, never a breaker count (`musicFailure`);
//   · DRY asks no vendor: a stand-in (one silent MPEG frame) filed under an id from the job and
//     the leaf, so a dry hunt runs end to end and a resumed one files nothing twice.
// Kept from v1's loop: board order, and a money stop ends it with what it bought. Upgraded: a stop
// never strands the selection `rendering` - the ending is written onto every leaf left (`settle`).
import { createHash } from "node:crypto";

import { z } from "zod";

import { PART_OPTIONS } from "@gt/catalog/partOptions";
import { parseAt } from "@gt/domain/door";
import { AppError, err, ok, type Result } from "@gt/domain/errors";
import { estimateSchema } from "@gt/domain/estimate";
import type { Actor } from "@gt/domain/event";
import { LANE_CAPACITY, type ResourceLane } from "@gt/domain/lane";
import type { ModelOption, Receipt, ReceiptMode } from "@gt/domain/produce";
import { runInputSchema } from "@gt/domain/produce.schema";
import { blobStore } from "@gt/kernel/blob";
import { armLive, DRY, dryOnlyFrom } from "@gt/kernel/dryrun";
import { liveEffects } from "@gt/kernel/effects";
import { append } from "@gt/kernel/events";
import { enqueueIn } from "@gt/kernel/job";
import type { Ending, MissingStep, Outputs, Producer, StepContext, StepOutcome } from "@gt/kernel/job-core";
import { runJob, type RunReport } from "@gt/kernel/job-run";
import { recordRunIn, runJobId } from "@gt/kernel/records/launch";
import { modelOptions } from "@gt/kernel/records/options";
import { readQueue } from "@gt/kernel/records/read";
import { receiptFor, type PlanLine } from "@gt/kernel/records/receipt";
import { runPlanOf } from "@gt/kernel/records/runplan";
import { loadRun } from "@gt/kernel/records/schema";
import type { Reader, Store } from "@gt/kernel/store";
import { meteredCall } from "@gt/producers/research/metered";
import { loopOf } from "@gt/ui/components/audio/hunt.ts";

import { blobRootOf } from "../kernelProcess.ts";
import { musicFailure } from "../producers/score.ts";
import { engineById, makeOp, NO_DESK_PRODUCER, type EngineDef } from "./engines.ts";
import { generateTake } from "./generate.ts";
import { readHunts, SoundError, withStore } from "./store.ts";
import { createTake } from "./takes.ts";
import type { GenerateRequest, Hunt, HuntNode, SoundKind, SoundTake } from "./types.ts";

export const HUNT_PRODUCER = "hunt";
export const HUNT_LANE: ResourceLane = "cloud.elevenlabs";
export const HUNT_OP_RE = /^[a-z0-9]{6,40}$/;

/** `hunt.<hunt>.<op>`: one Run per confirmed render, its hunt readable off the id. */
export const huntRunId = (huntId: string, opId: string): string => `hunt.${huntId}.${opId}`;
export const huntJobId = (huntId: string, opId: string): string => runJobId(huntRunId(huntId, opId));
const RUN_RE = /^hunt\.([A-Za-z0-9_-]{1,80})\.([a-z0-9]{6,40})$/;
/** The hunt a render Run serves, or undefined when the id is not a hunt render's. */
export const huntOfRun = (runId: string): string | undefined => RUN_RE.exec(runId)?.[1];
const stepOf = (nodeId: string): string => `leaf:${nodeId}`;
const PICK = "leaves";

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

/* ── reach and price ────────────────────────────────────────────────────── */

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

const secondsOf = (n: Pick<HuntNode, "durationS">): number => Math.max(1, Math.round(n.durationS));

function estimateOf(n: Pick<HuntNode, "durationS">, option: ModelOption): MissingStep["estimate"] {
  const s = secondsOf(n);
  return { seconds: option.secondsPerUnit * s, usd: option.usdPerUnit === null ? null : option.usdPerUnit * s, ...(option.usdPerUnit === null ? { unpricedReason: option.unpricedReason ?? UNPRICED } : {}) };
}

/* ── the launch: a receipt, then a confirm ──────────────────────────────── */

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
  | { readonly kind: "launched"; readonly runId: string; readonly jobId: string; readonly leaves: readonly string[] };

/** The leaves a render may take: on the map, a leaf, ElevenLabs, not heard and not in flight. */
function leavesOf(hunt: Hunt, ids: readonly string[]): Result<HuntNode[]> {
  const parents = new Set(hunt.nodes.map((n) => n.parentId));
  const out: HuntNode[] = [];
  for (const id of ids) {
    const n = hunt.nodes.find((x) => x.id === id);
    if (n === undefined || parents.has(n.id) || n.prompt === "") return err("invalid", `${id} is not a leaf of this hunt`);
    if (n.provider !== "elevenlabs") return err("refused", `${n.label} is a ${n.provider} leaf: it goes by hand, not through the render`);
    if (n.state === "rendered" || n.state === "rendering") return err("conflict", `${n.label} is ${n.state === "rendered" ? "heard already" : "rendering now"}`);
    out.push(n);
  }
  return out.length === 0 ? err("invalid", "pick at least one leaf to render") : ok(out);
}

function receiptIn(r: Reader, jobId: string, lines: readonly PlanLine[], mode: ReceiptMode, now: number): Receipt {
  return receiptFor({ subject: { kind: "run", lane: "audio" }, lines, plan: lines, queue: readQueue(r, new Set([jobId])), capacity: LANE_CAPACITY, now, mode });
}

// A prefix compare, not LIKE: a sound id may hold `_`, which LIKE reads as "any character".
const inFlightIn = (r: Reader, huntId: string): boolean => {
  const prefix = runJobId(huntRunId(huntId, ""));
  return r.get("SELECT 1 AS x FROM jobs WHERE substr(id, 1, ?) = ? AND state IN ('queued', 'running')", prefix.length, prefix) !== undefined;
};

/** Is a render job of this hunt still queued or running? (the read's `reconcile`) */
export const renderInFlight = (store: Store, huntId: string): Result<boolean> => store.read((r) => inFlightIn(r, huntId));

const words = (e: unknown): string => (e instanceof Error ? e.message : String(e));

async function huntById(huntId: string): Promise<Result<Hunt>> {
  try {
    const h = (await readHunts()).hunts.find((x) => x.id === huntId);
    return h === undefined ? err("not-found", `no hunt ${huntId}`) : ok(h);
  } catch (e) {
    return err("unavailable", `the hunt store did not read: ${words(e)}`);
  }
}

/**
 * No token: the receipt, nothing written. A token: recomputed in the kernel transaction that
 * writes the Run row and enqueues its job - a moved queue answers the fresh receipt and writes
 * nothing - then the leaves are marked rendering in the hunt store. One render per hunt at a time
 * (v1's `if (run) return`, now held by the kernel rather than a tab's state).
 */
export async function launchHuntRender(store: Store, ask: RenderAsk, actor: Actor, now: Date, env: Readonly<Record<string, string | undefined>> = process.env): Promise<Result<RenderLaunch>> {
  const found = await huntById(ask.huntId);
  if (!found.ok) return found;
  const hunt = found.value;
  const blocked = ask.mode === "live" && ask.engines !== undefined ? liveBlock(ask.engines, hunt.kind) : undefined;
  if (blocked !== undefined) return err("refused", `no live render here: ${blocked}`);
  const runId = huntRunId(hunt.id, ask.opId);
  const jobId = huntJobId(hunt.id, ask.opId);
  // A replayed confirm (its answer lost) finds the job its op wrote - before the leaf checks, which
  // would read its own leaves as "rendering now" and refuse the launch that already happened.
  if (ask.token !== undefined) {
    const had = store.read((r) => r.get("SELECT 1 AS x FROM jobs WHERE id = ?", jobId) !== undefined);
    if (!had.ok) return had;
    if (had.value) return ok({ kind: "launched", runId, jobId, leaves: [...ask.leafIds] });
  }
  const leaves = leavesOf(hunt, ask.leafIds);
  if (!leaves.ok) return leaves;
  const option = perSecondOption(hunt.kind, now.toISOString().slice(0, 10));
  if (!option.ok) return option;
  const lines: PlanLine[] = leaves.value.map((n, i) => ({ key: stepOf(n.id), label: `${n.label} · ${n.durationS}s`, lane: HUNT_LANE, units: secondsOf(n), option: option.value, after: [], order: i, status: "pending" }));
  const at = now.getTime();
  if (ask.token === undefined) return store.read((r) => ({ kind: "receipt" as const, receipt: receiptIn(r, jobId, lines, ask.mode, at) }));
  const ids = leaves.value.map((n) => n.id);
  const input = parseAt("hunt run input", runInputSchema, { producer: HUNT_PRODUCER, hunt: hunt.id, kind: hunt.kind, leaves: ids });
  if (!input.ok) return input;
  const token = ask.token;
  const dryOnly = dryOnlyFrom(env);
  const queued = store.tx((t): RenderLaunch => {
    const fresh = receiptIn(t, jobId, lines, ask.mode, at);
    if (fresh.token !== token) return { kind: "stale", fresh };
    if (t.get("SELECT 1 AS x FROM jobs WHERE id = ?", jobId) !== undefined) return { kind: "launched", runId, jobId, leaves: ids };
    if (inFlightIn(t, hunt.id)) throw new AppError("conflict", "a render of this hunt is still running; it answers first");
    const armed = ask.mode === "dry" ? ok(DRY) : armLive(actor, t.at, `hunt render ${token.slice(0, 12)} confirmed`, { dryOnly });
    if (!armed.ok) throw armed.error;
    // The Run row first, in this transaction (records/launch `recordRunIn`): Runs draws it, the
    // queue prices the job from its quote. Its units are the leaves (the recipe's clips); its
    // estimate is the receipt's whole - every leaf's seconds on the per-second option.
    const seconds = lines.reduce((a, l) => a + l.units, 0);
    const line: PlanLine = { key: runId, label: `${hunt.idea.slice(0, 80)} · ${ids.length} leaves`, lane: HUNT_LANE, units: seconds, option: option.value, after: [], order: 0, status: "pending" };
    recordRunIn(t, { plan: runPlanOf(input.value, ids.length), input: input.value, line, picked: { option: option.value, producer: HUNT_PRODUCER, routed: false } }, runId, jobId, actor);
    enqueueIn(t, { id: jobId, of: { kind: "run", id: runId }, producer: HUNT_PRODUCER, lane: HUNT_LANE, mode: armed.value, correlation: { runId } }, actor);
    append(t, { actor, type: "hunt.render.launched", lane: "audio", subject: { kind: "hunt", id: hunt.id }, data: { run: runId, job: jobId, leaves: ids, seconds, token, mode: armed.value.kind } });
    return { kind: "launched", runId, jobId, leaves: ids };
  });
  if (!queued.ok || queued.value.kind !== "launched") return queued;
  const mine = new Set(queued.value.leaves);
  try {
    await markLeaves(hunt.id, (n) => (mine.has(n.id) && n.state !== "rendered" ? { state: "rendering", error: null } : null));
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

/** The `leaves` step's booked output: each confirmed leaf with what its step is estimated at. */
const snapshotSchema = z.object({ leaves: z.array(z.object({ id: z.string().min(1), estimate: estimateSchema }).strict()).min(1) }).strict();
type Snapshot = z.output<typeof snapshotSchema>;

function snapshotOf(outputs: Outputs): Result<Snapshot> | undefined {
  const o = outputs.get(PICK);
  return o === undefined ? undefined : parseAt("hunt leaves", snapshotSchema, o.value);
}

const fatal = (code: AppError["code"], message: string): StepOutcome => ({ kind: "fatal", code, message });

/** The `leaves` step: the Run's confirmed leaves, each read off the map and estimated. */
async function pick(ctx: StepContext): Promise<StepOutcome> {
  const runId = ctx.job.of.id;
  const read = ctx.fx.tx("hunt.run", (t) => loadRun(t, runId).run);
  if (!read.ok) return fatal(read.error.code, read.error.message);
  const input = read.value.input;
  if (!("producer" in input) || input.producer !== "hunt") return fatal("refused", `the hunt producer renders a hunt run; ${runId} is not one`);
  const found = await huntById(input.hunt);
  if (!found.ok) return fatal(found.error.code, found.error.message);
  const option = perSecondOption(input.kind, read.value.createdAt.slice(0, 10));
  if (!option.ok) return fatal(option.error.code, option.error.message);
  const leaves: { id: string; estimate: MissingStep["estimate"] }[] = [];
  for (const id of input.leaves) {
    const n = found.value.nodes.find((x) => x.id === id);
    if (n === undefined) return fatal("not-found", `leaf ${id} is no longer on hunt ${input.hunt}`);
    leaves.push({ id, estimate: estimateOf(n, option.value) });
  }
  return { kind: "produced", output: { leaves }, costUsd: 0 };
}

/** A dry leaf's stand-in, filed under an id derived from the job and the leaf (idempotent). */
async function standIn(ctx: StepContext, node: HuntNode, r: GenerateRequest): Promise<string> {
  const id = `hn-dry-${createHash("sha256").update(`${ctx.job.id}/${node.id}`).digest("hex").slice(0, 16)}`;
  const { take } = await createTake(
    { id, kind: r.kind, title: `${node.label} (dry stand-in)`, provider: "elevenlabs", op: r.op, origin: "hunt", prompt: r.prompt, technique: r.technique, terms: r.terms, tempoBpm: r.tempoBpm, key: r.key, durationS: r.durationS, loop: r.loop, huntId: r.huntId, nodeId: r.nodeId },
    { bytes: SILENT_MP3, mime: "audio/mpeg", name: "dry.mp3" },
  );
  await withStore(async (tx) => {
    const n = (await tx.get("hunts")).hunts.find((h) => h.id === r.huntId)?.nodes.find((x) => x.id === node.id);
    if (n === undefined) return;
    n.takeIds = [...n.takeIds.filter((x) => x !== take.id), take.id];
    n.state = "rendered";
    n.error = null;
    tx.touch("hunts");
  });
  return take.id;
}

async function leaf(ctx: StepContext, step: MissingStep, eng: HuntEngines): Promise<StepOutcome> {
  const huntId = huntOfRun(ctx.job.of.id);
  const nodeId = step.name.slice("leaf:".length);
  if (huntId === undefined) return fatal("invalid", `${ctx.job.of.id} is not a hunt render`);
  const found = await huntById(huntId);
  if (!found.ok) return fatal(found.error.code, found.error.message);
  const node = found.value.nodes.find((x) => x.id === nodeId);
  if (node === undefined) return fatal("not-found", `leaf ${nodeId} is no longer on hunt ${huntId}`);
  const req = generateRequestFor(found.value, node);
  const live = await meteredCall<SoundTake | null>(ctx, { provider: "elevenlabs", model: req.op === "sfx" ? "sfx" : "music", payload: req, estimate: step.estimate, stand: () => null, live: async () => ({ value: await eng.generateTake(req), unpriced: UNPRICED }) });
  if (live !== null) return { kind: "produced", output: { takeId: live.id } };
  return { kind: "produced", output: { takeId: await standIn(ctx, node, req), dry: true }, costUsd: 0 };
}

/**
 * The render's definition, store-free so the worker binds one for every hunt: its plan is the
 * `leaves` step until that is booked, then a step per confirmed leaf not yet booked - a resumed
 * job (a re-drive after a crash) skips what it already filed.
 */
export function huntProducer(lane: ResourceLane = HUNT_LANE, engines: Partial<HuntEngines> = {}): Producer {
  const eng: HuntEngines = { ...LIVE, ...engines };
  return {
    lane,
    plan(_job, outputs) {
      const snap = snapshotOf(outputs);
      if (snap === undefined) return [{ name: PICK, estimate: { seconds: 1, usd: 0 } }];
      if (!snap.ok) return [{ name: "unreadable", estimate: { seconds: 1, usd: 0 } }];
      return snap.value.leaves.filter((l) => !outputs.has(stepOf(l.id))).map((l) => ({ name: stepOf(l.id), estimate: l.estimate }));
    },
    async perform(step, ctx): Promise<StepOutcome> {
      if (step.name === "unreadable") return fatal("internal", `${ctx.job.id}: its booked leaves did not read back`);
      try {
        return step.name === PICK ? await pick(ctx) : await leaf(ctx, step, eng);
      } catch (e) {
        return musicFailure(e);
      }
    },
    async settle(job, ending: Ending) {
      const huntId = huntOfRun(job.of.id);
      if (huntId === undefined || ending === "done") return;
      // One render per hunt at a time (the launch's in-flight check): what is still rendering is this job's.
      const why = ending === "interrupted" ? "interrupted before a take came back" : `the render ${ending}: ${job.id}`;
      await markLeaves(huntId, (n) => (n.state === "rendering" ? { state: "failed", error: why } : null));
    },
  };
}

/**
 * Drive a launched render on this process: the desk's confirm kicks it once (v1's route rendered
 * at once). The worker binds the same definition, so whichever claims the lane slot first renders
 * it and the other is told `busy`.
 */
export async function driveHuntRender(store: Store, jobId: string, o: { readonly engines?: Partial<HuntEngines>; readonly env?: Readonly<Record<string, string | undefined>> } = {}): Promise<Result<RunReport>> {
  return runJob(liveEffects(store, blobStore(blobRootOf(store))), huntProducer(HUNT_LANE, o.engines), jobId, { dryOnly: dryOnlyFrom(o.env ?? process.env) });
}
