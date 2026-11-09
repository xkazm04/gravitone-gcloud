import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { BlobRef } from "@gt/domain/blob";
import { parseAt } from "@gt/domain/door";
import { AppError, err, ok, type Result } from "@gt/domain/errors";
import type { Actor, EventData } from "@gt/domain/event";
import { jobIdSchema } from "@gt/domain/ids";
import type { Job } from "@gt/domain/job";
import { LANE_CAPACITY, type ResourceLane } from "@gt/domain/lane";
import type { ModelOption, Receipt, ReceiptMode } from "@gt/domain/produce";
import { ROUND_VOICES, voicePickRefusal, type CreditRead, type ProductionId, type VoiceCandidate } from "@gt/domain/production";
import { blobStore } from "@gt/kernel/blob";
import { armLive, DRY } from "@gt/kernel/dryrun";
import { append } from "@gt/kernel/events";
import { queryEvents } from "@gt/kernel/events-query";
import { enqueueIn, get, loadOutputs } from "@gt/kernel/job";
import { vendorHealth, type Outputs, type Producer, type StepContext, type StepOutcome } from "@gt/kernel/job-core";
import { readQueue } from "@gt/kernel/records/read";
import { receiptFor, type PlanLine } from "@gt/kernel/records/receipt";
import type { Store } from "@gt/kernel/store";
import { madeFree, madePaid } from "@gt/producers/research/partAct";
import { failureOf, meteredCall } from "@gt/producers/research/metered";
import {
  designCalls,
  designOutputSchema,
  designStep,
  defineProductionVoices,
  levelOutputSchema,
  levelStep,
  parseVoicesRequest,
  previewAt,
  PRODUCTION_VOICES,
  VOICE_CREDIT,
  VOICES_REQUEST,
  CREATE_STEP,
  type DesignOutput,
  type LevelOutput,
  type VoicesRequest,
  type VoicesCreateRequest,
  type VoicesRoundRequest,
} from "@gt/producers/production-voices/define";

import { binsFrom, realSpawn, type Spawn } from "../foundry/scout/ingest.ts";
import { blobRootOf, kernel } from "../kernelProcess.ts";
import { blobRoute } from "../library/media.ts";
import { isMusicConfigured } from "../music/elevenlabs";
import { MusicError } from "../music/errors";
import { VOICE_CREDITS_REASON } from "../music/pricing";
import { AUDITION_MAX, AUDITION_MIN, createVoice, designVoices, DESIGN_MODEL, levelPreview, PREVIEW_LEVEL, previewsOfCall, type CreditReading, type VoiceDeps } from "../music/voiceDesign";
import { silentWav } from "./voice.ts";

// A CASTING ROUND'S VOICES, BOUND (spark concept-casting-stages S3): the ports of
// packages/producers/src/production-voices/define.ts over lib/music/voiceDesign.ts, the blob store and ffmpeg.
//
//   design  one vendor call through the step's meter. Live: its previews stored as blobs before the step books, with
//           what the API said it consumed. Dry: the vendor is never asked; silent stand-ins, booked as a would-call.
//   level   the design step's raw preview through two-pass loudnorm. Free, and a step of its own: a failure here cannot
//           re-buy the design. A dry stand-in is silence and is not measured.
//   create  the vendor voice from the operator's pick.
//
// A CRASH: outputs booked before it are not repeated. The step that was in flight is the kernel's to report: on a paid
// lane the drive's death holds `cloud.elevenlabs` until the operator acknowledges it ("credits may be spent - look
// first"), then `retry` runs only what is missing. Nothing here can vouch that an unbooked call went unbilled.

const data = (x: unknown): EventData => JSON.parse(JSON.stringify(x)) as EventData;

export const PRODUCTION_VOICES_LANE: ResourceLane = "cloud.elevenlabs";
const DRY_PREVIEW_SECONDS = 8;
const STAND_IN_VOICE_ID = "dry-voice";

export type VoicesEngines = {
  readonly design?: typeof designVoices;
  readonly create?: typeof createVoice;
  readonly spawn?: Spawn;
  readonly ffmpeg?: string;
  readonly deps?: VoiceDeps;
};

const processStore = (): Result<Store> => {
  const k = kernel();
  return k.ok ? ok(k.value.store) : k;
};

/* ── The steps ────────────────────────────────────────────────────────────── */

/** A failure the vendor's answer may change feeds the breaker; anything else is the job's sentence. A fence lost, or a crash, stays the kernel's. */
function stepFailure(e: unknown): StepOutcome {
  if (!(e instanceof Error)) throw e;
  if (e instanceof AppError && e.code === "unavailable") return { kind: "vendor-failure", message: e.message };
  return failureOf(e, (x) => (x instanceof MusicError ? "fatal" : undefined));
}

/** The bought audio could not be stored: fatal, because a retry would pay for it again. */
const notStored = (e: AppError, what: string): StepOutcome => ({ kind: "fatal", code: e.code, message: `voices: ${what} could not be stored: ${e.message}` });

function standInDesign(req: VoicesRoundRequest, k: number): readonly { readonly generatedVoiceId: string; readonly bytes: Uint8Array; readonly durationMs: number }[] {
  const n = previewsOfCall(req.count, k);
  return Array.from({ length: n }, (_, i) => ({ generatedVoiceId: `${STAND_IN_VOICE_ID}-${req.roundId}-${k}-${i + 1}`, bytes: silentWav(DRY_PREVIEW_SECONDS), durationMs: DRY_PREVIEW_SECONDS * 1000 }));
}

async function designAct(e: VoicesEngines, req: VoicesRoundRequest, k: number, ctx: StepContext): Promise<StepOutcome> {
  const count = previewsOfCall(req.count, k);
  const design = e.design ?? designVoices;
  const estimate = { seconds: 30, usd: null, unpricedReason: VOICE_CREDIT };
  const got = await meteredCall(ctx, {
    provider: "elevenlabs",
    model: DESIGN_MODEL,
    payload: { brief: req.brief, script: req.script, count, k },
    estimate,
    stand: () => null,
    live: async () => {
      const r = await design({ brief: req.brief, script: req.script, count }, e.deps);
      if (!r.ok) throw r.error;
      return { value: r.value, unpriced: VOICE_CREDITS_REASON };
    },
  });
  const raw = got === null ? standInDesign(req, k) : got.previews;
  const reading: CreditReading = got?.calls[0] ?? { used: 0, read: "unread", why: "a dry round: no vendor call" };
  const previews = [];
  for (const p of raw) {
    const blob = await ctx.fx.blob(p.bytes, got === null ? "audio/wav" : "audio/mpeg");
    if (!blob.ok) return notStored(blob.error, "a design preview");
    previews.push({ generatedVoiceId: p.generatedVoiceId, blob: blob.value, ...(p.durationMs === undefined ? {} : { durationMs: p.durationMs }) });
  }
  const out: DesignOutput = { k, previews, used: reading.used, read: reading.read, ...(reading.read === "unread" ? { why: reading.why } : {}), ...(got === null ? { dry: true as const } : {}) };
  return got === null ? madeFree(data(out)) : madePaid(data(out), ctx);
}

async function levelAct(e: VoicesEngines, root: string, req: VoicesRoundRequest, i: number, ctx: StepContext): Promise<StepOutcome> {
  const at = previewAt(ctx.outputs, req.count, i);
  if (!at.ok) throw at.error;
  if (at.value === undefined) return { kind: "fatal", code: "internal", message: `voices: preview ${i} was never stored` };
  const preview = at.value;
  if (ctx.job.mode.kind !== "live") return madeFree(data({ i, blob: preview.blob, lufs: PREVIEW_LEVEL.lufs, dry: true } satisfies LevelOutput));
  const bytes = await blobStore(root).read(preview.blob);
  if (!bytes.ok) throw bytes.error;
  const dir = await mkdtemp(path.join(tmpdir(), "gt-voice-level-"));
  try {
    const input = path.join(dir, `preview-${i}-raw.mp3`);
    const output = path.join(dir, `preview-${i}.mp3`);
    await writeFile(input, bytes.value);
    const r = await levelPreview({ spawn: e.spawn ?? realSpawn, ffmpeg: e.ffmpeg ?? binsFrom(process.env).ffmpeg }, input, output);
    if (!r.ok) return { kind: "fatal", code: r.error.code, message: r.error.message };
    const blob = await ctx.fx.blob(new Uint8Array(await readFile(output)), "audio/mpeg");
    if (!blob.ok) return notStored(blob.error, "a levelled preview");
    return madeFree(data({ i, blob: blob.value, lufs: r.value.lufs } satisfies LevelOutput));
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function createAct(e: VoicesEngines, req: VoicesCreateRequest, ctx: StepContext): Promise<StepOutcome> {
  const create = e.create ?? createVoice;
  const estimate = { seconds: 5, usd: null, unpricedReason: VOICE_CREDIT };
  const voice = await meteredCall(ctx, {
    provider: "elevenlabs",
    model: DESIGN_MODEL,
    payload: { generatedVoiceId: req.generatedVoiceId, name: req.name },
    estimate,
    stand: () => ({ voiceId: `${STAND_IN_VOICE_ID}-${req.candidateId}` }),
    live: async () => {
      const r = await create({ generatedVoiceId: req.generatedVoiceId, name: req.name, brief: req.brief });
      if (!r.ok) throw r.error;
      return { value: r.value, unpriced: VOICE_CREDITS_REASON };
    },
  });
  const out = { voiceId: voice.voiceId, ...(ctx.job.mode.kind === "live" ? {} : { dry: true }) };
  return ctx.job.mode.kind === "live" ? madePaid(data(out), ctx) : madeFree(data(out));
}

/* ── The binding ──────────────────────────────────────────────────────────── */

export function voicesRequestOf(store: Store, jobId: string): Result<VoicesRequest> {
  const page = queryEvents(store, { type: [VOICES_REQUEST], subject: { kind: "job", id: jobId }, limit: 1 });
  if (!page.ok) return page;
  const e = page.value.events[0];
  return e === undefined ? err("not-found", `job ${jobId} carries no voices request`) : parseVoicesRequest(e.data);
}

/** Production's engines are the vendor door and ffmpeg; a test hands fakes. */
export function productionVoicesProducer(o: { readonly store?: () => Result<Store>; readonly engines?: VoicesEngines } = {}): Producer {
  const store = o.store ?? processStore;
  const e = o.engines ?? {};
  const rootOf = (): string => {
    const s = store();
    if (!s.ok) throw s.error;
    return blobRootOf(s.value);
  };
  const guarded = async (run: () => Promise<StepOutcome>): Promise<StepOutcome> => {
    try {
      return await run();
    } catch (x) {
      return stepFailure(x);
    }
  };
  return defineProductionVoices(PRODUCTION_VOICES_LANE, {
    request: (job) => {
      const s = store();
      return s.ok ? voicesRequestOf(s.value, job.id) : s;
    },
    design: (req, k, ctx) => guarded(() => designAct(e, req, k, ctx)),
    level: (req, i, ctx) => guarded(() => levelAct(e, rootOf(), req, i, ctx)),
    create: (req, ctx) => guarded(() => createAct(e, req, ctx)),
    health: vendorHealth(async () => (isMusicConfigured() ? { ok: true } : { ok: false, reason: "no ElevenLabs key is configured on this box" })),
  });
}

/* ── The launches ─────────────────────────────────────────────────────────── */

function designOption(): ModelOption {
  const note = VOICE_CREDITS_REASON;
  return {
    key: `production-voices/elevenlabs/${DESIGN_MODEL}`,
    lane: PRODUCTION_VOICES_LANE,
    provider: "elevenlabs",
    model: DESIGN_MODEL,
    label: "voice design · 3 previews a call",
    secondsPerUnit: 30,
    usdPerUnit: 0,
    src: "illustrative",
    basis: { seconds: { src: "illustrative", note: "a design call's wall time, not yet measured here" }, usd: { src: "real", note } },
  };
}

export type VoiceRoundAsk = {
  readonly productionId: ProductionId;
  readonly roleId: string;
  readonly roundId: string;
  readonly brief: string;
  /** The audition line from `writeAudition`: already checked. */
  readonly script: string;
  readonly mode: ReceiptMode;
  readonly by: string;
  readonly actor: Actor;
  readonly dryOnly: boolean;
  /** Absent: answer with the receipt and launch nothing. */
  readonly token?: string;
  readonly now?: number;
};

export type VoiceRoundLaunch = { readonly kind: "receipt"; readonly receipt: Receipt } | { readonly kind: "stale"; readonly fresh: Receipt } | { readonly kind: "launched"; readonly jobId: string; readonly receipt: Receipt };

export const voiceRoundJobId = (productionId: string, roleId: string, roundId: string): string => `job:production-voices:${productionId}:${roleId}:${roundId}`;

function roundReceipt(r: Parameters<Parameters<Store["read"]>[0]>[0], ask: VoiceRoundAsk, now: number): Receipt {
  const key = `voices:${ask.productionId}/${ask.roundId}@${createHash("sha256").update(`${ask.brief}\u0000${ask.script}`).digest("hex").slice(0, 12)}`;
  const line: PlanLine = { key, label: `voice design · ${designCalls(ROUND_VOICES)} calls, ${ROUND_VOICES} previews`, lane: PRODUCTION_VOICES_LANE, units: designCalls(ROUND_VOICES), option: designOption(), after: [], order: 0, status: "pending" };
  return receiptFor({ subject: { kind: "run", lane: "audio" }, lines: [line], plan: [line], queue: readQueue(r), capacity: LANE_CAPACITY, now, mode: ask.mode });
}

/** A round's voices: the receipt, then its confirm. */
export function requestVoiceRound(store: Store, ask: VoiceRoundAsk): Result<VoiceRoundLaunch> {
  const script = ask.script.trim();
  if (script.length < AUDITION_MIN || script.length > AUDITION_MAX) return err("refused", `voice: an audition script is ${AUDITION_MIN}-${AUDITION_MAX} characters, this one ${script.length}`);
  const now = ask.now ?? Date.now();
  const token = ask.token;
  if (token === undefined) {
    const receipt = store.read((r) => roundReceipt(r, ask, now));
    return receipt.ok ? ok({ kind: "receipt", receipt: receipt.value }) : receipt;
  }
  return store.tx((t): VoiceRoundLaunch => {
    const receipt = roundReceipt(t, ask, now);
    if (receipt.token !== token) return { kind: "stale", fresh: receipt };
    const mode = ask.mode === "dry" ? ok(DRY) : armLive(ask.actor, t.at, `voices receipt ${token.slice(0, 12)} confirmed`, { dryOnly: ask.dryOnly });
    if (!mode.ok) throw mode.error;
    const jobId = voiceRoundJobId(ask.productionId, ask.roleId, ask.roundId);
    enqueueIn(t, { id: jobId, of: { kind: "run", id: `production:${ask.productionId}/${ask.roundId}` }, producer: PRODUCTION_VOICES, lane: PRODUCTION_VOICES_LANE, mode: mode.value }, ask.actor);
    append(t, {
      actor: ask.actor,
      type: VOICES_REQUEST,
      subject: { kind: "job", id: jobId },
      data: { act: "round", productionId: ask.productionId, roleId: ask.roleId, roundId: ask.roundId, brief: ask.brief, script, count: ROUND_VOICES, by: ask.by },
    });
    return { kind: "launched", jobId, receipt };
  });
}

export type VoicePickAsk = {
  readonly roundJobId: string;
  readonly candidateId: string;
  readonly name: string;
  /** When the operator played the preview: no play, no pick. */
  readonly heardAt?: string;
  readonly by: string;
  readonly actor: Actor;
  readonly mode: ReceiptMode;
  readonly dryOnly: boolean;
};

/**
 * The operator's pick, the only way a vendor voice is created. Refused for anyone else, for a preview never played, and
 * for a round that has not finished; a pick is one job, and picking the same candidate again is that job's conflict.
 */
export function pickVoice(store: Store, ask: VoicePickAsk): Result<{ readonly jobId: string }> {
  if (ask.actor.kind !== "operator") return err("refused", `voice: only the operator picks a cast voice (${ask.actor.kind} tried)`);
  const unheard = voicePickRefusal(ask.heardAt === undefined ? {} : { heardAt: ask.heardAt });
  if (unheard !== undefined) return err("refused", unheard);
  const req = voicesRequestOf(store, ask.roundJobId);
  if (!req.ok) return req;
  if (req.value.act !== "round") return err("refused", `voice: ${ask.roundJobId} is not a design round`);
  const round = req.value;
  const parsed = parseAt("job id", jobIdSchema, ask.roundJobId);
  if (!parsed.ok) return parsed;
  const job = get(store, parsed.value);
  if (!job.ok) return job;
  if (job.value.job.state !== "done") return err("refused", `voice: the round is ${job.value.job.state}; it must finish before a pick`);
  const position = Number(/^voice-(\d+)$/.exec(ask.candidateId)?.[1] ?? NaN);
  if (!Number.isInteger(position) || position < 1 || position > round.count) return err("refused", `voice: ${ask.candidateId} is not a candidate of this round`);
  const outputs = store.read((r) => loadOutputs(r, ask.roundJobId));
  if (!outputs.ok) return outputs;
  const preview = previewAt(outputs.value, round.count, position);
  if (!preview.ok) return preview;
  if (preview.value === undefined) return err("not-found", `voice: ${ask.candidateId} has no stored preview`);
  const generatedVoiceId = preview.value.generatedVoiceId;
  const jobId = `${ask.roundJobId}:create-${ask.candidateId}`;
  return store.tx((t) => {
    const mode = ask.mode === "dry" ? ok(DRY) : armLive(ask.actor, t.at, `voice pick ${ask.candidateId}`, { dryOnly: ask.dryOnly });
    if (!mode.ok) throw mode.error;
    enqueueIn(t, { id: jobId, of: { kind: "run", id: `production:${round.productionId}/${round.roundId}` }, producer: PRODUCTION_VOICES, lane: PRODUCTION_VOICES_LANE, mode: mode.value }, ask.actor);
    append(t, {
      actor: ask.actor,
      type: VOICES_REQUEST,
      subject: { kind: "job", id: jobId },
      data: { act: "create", productionId: round.productionId, roleId: round.roleId, roundId: round.roundId, candidateId: ask.candidateId, generatedVoiceId, name: ask.name, brief: round.brief, pickedBy: ask.by },
    });
    return { jobId };
  });
}

/* ── Reading a round ──────────────────────────────────────────────────────── */

export type VoiceRound = {
  /** The job's state: `done` when every preview is levelled. */
  readonly state: Job["state"];
  readonly voices: readonly VoiceCandidate[];
  /** What the API said the round's calls consumed. */
  readonly creditsUsed: number;
  /** The weakest source among its calls; `unread` when a call could not be read, or the round was dry. */
  readonly creditsRead: CreditRead | "unread";
  /** Calls whose consumption could not be read, so `creditsUsed` is short by them. */
  readonly unreadCalls?: number;
  /** Stand-in previews: no vendor was called. */
  readonly dry?: true;
};

const servedUrl = (ref: BlobRef): string => blobRoute(ref.sha256, ref.mime) ?? `/api/blob/${ref.sha256}`;

/** The round as the job's outputs hold it, candidates in preview order. */
function roundFrom(req: VoicesRoundRequest, outputs: Outputs, state: Job["state"]): Result<VoiceRound> {
  const designs: DesignOutput[] = [];
  for (let k = 1; k <= designCalls(req.count); k += 1) {
    const raw = outputs.get(designStep(k))?.value;
    if (raw === undefined) continue;
    const d = parseAt(`${designStep(k)} output`, designOutputSchema, raw);
    if (!d.ok) return d;
    designs.push(d.value);
  }
  const voices: VoiceCandidate[] = [];
  for (let i = 1; i <= req.count; i += 1) {
    const raw = outputs.get(levelStep(i))?.value;
    if (raw === undefined) continue;
    const l = parseAt(`${levelStep(i)} output`, levelOutputSchema, raw);
    if (!l.ok) return l;
    voices.push({ id: `voice-${i}`, label: `Voice ${i}`, design: req.brief, preview: { url: servedUrl(l.value.blob), lufs: l.value.lufs } });
  }
  const unread = designs.filter((d) => d.read === "unread").length;
  const creditsRead: VoiceRound["creditsRead"] = unread > 0 || designs.length === 0 ? "unread" : designs.some((d) => d.read === "subscription-delta") ? "subscription-delta" : "character-cost-header";
  return ok({
    state,
    voices,
    creditsUsed: designs.reduce((n, d) => n + d.used, 0),
    creditsRead,
    ...(unread > 0 ? { unreadCalls: unread } : {}),
    ...(designs.some((d) => d.dry === true) ? { dry: true as const } : {}),
  });
}

/** What a round holds so far; S4 builds its `CastRound` from this. */
export function voiceRoundOf(store: Store, jobId: string): Result<VoiceRound> {
  const req = voicesRequestOf(store, jobId);
  if (!req.ok) return req;
  if (req.value.act !== "round") return err("refused", `voice: ${jobId} is not a design round`);
  const roundReq = req.value;
  const parsed = parseAt("job id", jobIdSchema, jobId);
  if (!parsed.ok) return parsed;
  const job = get(store, parsed.value);
  if (!job.ok) return job;
  const outputs = store.read((r) => loadOutputs(r, jobId));
  if (!outputs.ok) return outputs;
  return roundFrom(roundReq, outputs.value, job.value.job.state);
}

/** The vendor voice a finished create job made. */
export function createdVoiceOf(store: Store, jobId: string): Result<{ readonly voiceId: string; readonly dry: boolean }> {
  const outputs = store.read((r) => loadOutputs(r, jobId));
  if (!outputs.ok) return outputs;
  const out = outputs.value.get(CREATE_STEP)?.value;
  if (out === undefined || typeof out["voiceId"] !== "string") return err("not-found", `voice: ${jobId} has created no voice`);
  return ok({ voiceId: out["voiceId"], dry: out["dry"] === true });
}
