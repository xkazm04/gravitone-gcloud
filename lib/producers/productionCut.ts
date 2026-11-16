import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";

import type { BlobRef } from "@gt/domain/blob";
import { parseAt } from "@gt/domain/door";
import { AppError, err, errorMessage, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { jobIdSchema } from "@gt/domain/ids";
import type { Job } from "@gt/domain/job";
import { LANE_CAPACITY, type ResourceLane } from "@gt/domain/lane";
import type { ModelOption, Receipt, ReceiptMode } from "@gt/domain/produce";
import { cutFormatOf, type CutFormat, type Production, type ProductionId, type ProductionTake } from "@gt/domain/production";
import { blobStore } from "@gt/kernel/blob";
import { armLive, dryOnlyFrom, DRY } from "@gt/kernel/dryrun";
import { append } from "@gt/kernel/events";
import { queryEvents } from "@gt/kernel/events-query";
import { enqueueIn, get, loadOutputs } from "@gt/kernel/job";
import type { Producer } from "@gt/kernel/job-core";
import { runJob, type RunReport } from "@gt/kernel/job-run";
import { nextCutId, openCutIn, refusalOfCut } from "@gt/kernel/productions/audio";
import { roundOf } from "@gt/kernel/productions/cast";
import { readProduction } from "@gt/kernel/productions/store";
import { readQueue } from "@gt/kernel/records/read";
import { receiptFor, type PlanLine } from "@gt/kernel/records/receipt";
import type { Reader, Store } from "@gt/kernel/store";
import { CUT_REQUEST, defineProductionCut, laysAudio, parseCutRequest, PRODUCTION_CUT, type CutRequest } from "@gt/producers/production-cut/define";
import { levelOutputSchema, levelStep } from "@gt/producers/production-voices/define";

import { blobRootOf, kernel } from "../kernelProcess.ts";
import { effectsFor } from "./extract.ts";
import { cutActs, type CutEngines } from "./productionCutActs.ts";

// THE FINAL CUT DOOR (spark concept-casting-stages S5): a receipt, one resumable job on box.render, and the result to the
// Board as a `pkt:final:` packet (lib/decision/v1/sources/final.ts). The format is the audio decision's (`cutFormatOf`): a song
// track is the music-clip craft, anything else the trailer's; never the film recipe, never the piece producer.
//
// The dub route lays each cast role's line, its picked voice's own preview (mastered, the line the operator heard), over
// the picture. No vendor call: the preview is already bought. Where the proof holds and the route is ref-audio, the lines
// are already in the speaking takes and nothing is laid.

export const PRODUCTION_CUT_LANE: ResourceLane = "box.render";
/** A 20-30 s NVENC cut on this box; not yet measured through this door. */
const ASSEMBLE_SECONDS = 180;
const LAY_SECONDS = 30;

const ESTIMATES = { assemble: { seconds: ASSEMBLE_SECONDS, usd: 0 }, lay: { seconds: LAY_SECONDS, usd: 0 } } as const;

const processStore = (): Result<Store> => {
  const k = kernel();
  return k.ok ? ok(k.value.store) : k;
};

const local = { src: "real" as const, note: "free: a local tool on this box; no vendor is paid" };

function option(key: string, label: string, seconds: number): ModelOption {
  return { key: `production-cut/${key}`, lane: PRODUCTION_CUT_LANE, provider: "ffmpeg", model: key, label, secondsPerUnit: seconds, usdPerUnit: 0, src: "illustrative", basis: { seconds: { src: "illustrative", note: "an NVENC cut of a short film, not yet measured through this door" }, usd: local } };
}

/* ── Blob references ──────────────────────────────────────────────────────── */

const SHA_RE = /[0-9a-f]{64}/;

/** A served address (`/api/blob/<sha>?type=<mime>`) or a bare sha256 to a blob ref, the size read from disk; undefined when there is no such blob. */
export async function blobOfAddress(root: string, address: string, fallbackMime: string): Promise<BlobRef | undefined> {
  const sha = SHA_RE.exec(address)?.[0];
  if (sha === undefined) return undefined;
  const typed = /[?&]type=([^&]+)/.exec(address)?.[1];
  const mime = typed === undefined ? fallbackMime : decodeURIComponent(typed);
  const ref: BlobRef = { sha256: sha, bytes: 1, mime };
  const at = blobStore(root).pathOf(ref);
  if (!at.ok) return undefined;
  try {
    const s = await stat(at.value);
    return s.isFile() ? { ...ref, bytes: s.size } : undefined;
  } catch {
    return undefined;
  }
}

/** The bytes a voice candidate's mastered preview is held under, on its round's voices job. */
export function previewBlob(store: Store, voiceJobId: string, voice: string): Result<BlobRef> {
  const outputs = store.read((r) => loadOutputs(r, voiceJobId));
  if (!outputs.ok) return outputs;
  const i = Number(voice.replace("voice-", ""));
  const raw = outputs.value.get(levelStep(i))?.value;
  if (raw === undefined) return err("not-found", `cast: ${voice} has no preview on ${voiceJobId}`);
  const level = parseAt(`${levelStep(i)} output`, levelOutputSchema, raw);
  return level.ok ? ok(level.value.blob) : level;
}

/* ── What a cut asks for ──────────────────────────────────────────────────── */

export type RequestCutInput = {
  readonly id: ProductionId;
  /** The takes to assemble, in cut order. */
  readonly takes: readonly string[];
  readonly mode: ReceiptMode;
  readonly by: string;
  readonly actor: Actor;
  readonly token?: string;
  readonly dryOnly: boolean;
  readonly now?: number;
};

export type CutLaunch =
  | { readonly kind: "receipt"; readonly receipt: Receipt }
  | { readonly kind: "stale"; readonly fresh: Receipt }
  | { readonly kind: "launched"; readonly jobId: string; readonly cutId: string; readonly receipt: Receipt };

export const cutJobId = (id: string, cutId: string): string => `job:production-cut:${id}:${cutId}`;

type Material = { readonly format: CutFormat; readonly body: Omit<CutRequest, "by" | "cutId"> };

const usableTake = (take: ProductionTake | undefined, name: string): string | undefined => {
  if (take === undefined) return `production: no ${name} on this production`;
  if (take.state !== "ready" || take.video === undefined) return `production: ${name} is ${take.state}; only a take that landed can be cut`;
  if (take.stale === true) return `production: ${name} is stale after a re-cast`;
  if (take.dry === true) return `production: ${name} is a dry stand-in; no video exists to cut`;
  if (take.durationS === undefined) return `production: ${name} has no measured length`;
  return undefined;
};

/** The takes, lines and music a cut would assemble, resolved to their bytes, or the sentence refusing it. */
async function materialOf(store: Store, p: Production, takeIds: readonly string[]): Promise<Result<Material>> {
  const audio = p.audio;
  if (audio === undefined) return err("refused", "production: the audio decision comes before the final cut");
  const shut = refusalOfCut(p);
  if (shut !== undefined) return err("refused", shut);
  if (takeIds.length === 0) return err("refused", "production: a final cut needs at least one take");
  const root = blobRootOf(store);
  const takes: { takeId: string; video: BlobRef; durationS: number }[] = [];
  for (const takeId of takeIds) {
    const take = p.takes.find((t) => t.id === takeId);
    const why = usableTake(take, takeId);
    if (why !== undefined) return err("refused", why);
    const video = await blobOfAddress(root, take?.video ?? "", "video/mp4");
    if (video === undefined) return err("not-found", `production: ${takeId}'s video is not in the blob store`);
    takes.push({ takeId, video, durationS: take?.durationS ?? 0 });
  }
  const lines: CutRequest["lines"] extends readonly (infer L)[] ? L[] : never = [];
  if (audio.voice === "dub") {
    for (const role of p.roles) {
      if (role.cast === undefined || role.auditionScript === undefined) continue;
      const round = store.read((r) => roundOf(r, p.id, role.cast?.roundId ?? ""));
      if (!round.ok) return round;
      if (round.value === undefined || round.value.pickVoice === undefined) return err("not-found", `cast: ${role.name}'s round is gone`);
      const preview = previewBlob(store, round.value.voiceJobId, round.value.pickVoice);
      if (!preview.ok) return err(preview.error.code, `cast: ${role.name}'s line: ${preview.error.message}`);
      lines.push({ roleId: role.id, name: role.name, line: role.auditionScript, audio: preview.value });
    }
    if (lines.length === 0) return err("refused", "production: the route is dub, and no cast role has a line to dub");
  }
  const format = cutFormatOf(audio.music);
  let track: BlobRef | undefined;
  let bed: BlobRef | undefined;
  if (audio.music !== "none") {
    const ref = await blobOfAddress(root, audio.musicRef ?? "", "audio/mpeg");
    if (ref === undefined) return err("not-found", `production: the music source ${audio.musicRef ?? ""} is not in the blob store`);
    if (format === "music-clip") track = ref;
    else bed = ref;
  }
  return ok({ format, body: { productionId: p.id, format, aspect: p.board.aspect === "9:16" ? "9:16" : "16:9", takes, lines, ...(track === undefined ? {} : { track }), ...(bed === undefined ? {} : { bed }), silence: audio.sound === "none", estimates: ESTIMATES } });
}

function linesFor(key: string, format: CutFormat, withLay: boolean): readonly PlanLine[] {
  const assemble: PlanLine = { key: `${key}/assemble`, label: `${format} assembly`, lane: PRODUCTION_CUT_LANE, units: 1, option: option(format, `${format} assembly · local`, ASSEMBLE_SECONDS), after: [], order: 0, status: "pending" };
  if (!withLay) return [assemble];
  return [assemble, { key: `${key}/lay`, label: "lay dub and bed", lane: PRODUCTION_CUT_LANE, units: 1, option: option("lay", "dub and bed lay · local", LAY_SECONDS), after: [assemble.key], order: 1, status: "pending" }];
}

function receiptOf(r: Reader, id: string, m: Material, mode: ReceiptMode, now: number): { readonly receipt: Receipt; readonly cutId: string } {
  const cutId = nextCutId(r, id);
  const key = `cut:${id}/${cutId}@${createHash("sha256").update(JSON.stringify(m.body)).digest("hex").slice(0, 12)}`;
  const withLay = laysAudio(m.body);
  const lines = linesFor(key, m.format, withLay);
  return { receipt: receiptFor({ subject: { kind: "run", lane: "video" }, lines: [...lines], plan: [...lines], queue: readQueue(r), capacity: LANE_CAPACITY, now, mode }), cutId };
}

/** The cut's receipt (no token), or its confirm. Operator only: the launch is a spend of the operator's attention. */
export async function requestCut(input: RequestCutInput): Promise<Result<CutLaunch>> {
  const s = processStore();
  if (!s.ok) return s;
  return requestCutIn(s.value, input);
}

export async function requestCutIn(store: Store, input: RequestCutInput): Promise<Result<CutLaunch>> {
  if (input.actor.kind !== "operator") return err("refused", `production: only the operator launches a final cut (${input.actor.kind} ${input.actor.id} tried)`);
  const now = input.now ?? Date.now();
  const held = store.read((r) => readProduction(r, input.id));
  if (!held.ok) return held;
  if (held.value === undefined) return err("not-found", `production: no ${input.id}`);
  const material = await materialOf(store, held.value, input.takes);
  if (!material.ok) return material;
  const m = material.value;
  const first = store.read((r) => receiptOf(r, input.id, m, input.mode, now));
  if (!first.ok) return first;
  if (input.token === undefined) return ok({ kind: "receipt", receipt: first.value.receipt });
  const token = input.token;
  const out = store.tx((t): Result<CutLaunch> => {
    const plan = receiptOf(t, input.id, m, input.mode, now);
    if (plan.receipt.token !== token) return ok({ kind: "stale", fresh: plan.receipt });
    const mode = input.mode === "dry" ? ok(DRY) : armLive(input.actor, t.at, `cut receipt ${token.slice(0, 12)} confirmed`, { dryOnly: input.dryOnly });
    if (!mode.ok) return mode;
    const jobId = cutJobId(input.id, plan.cutId);
    enqueueIn(t, { id: jobId, of: { kind: "run", id: `production:${input.id}/${plan.cutId}` }, producer: PRODUCTION_CUT, lane: PRODUCTION_CUT_LANE, mode: mode.value }, input.actor);
    openCutIn(t, input.id, { format: m.format, takes: input.takes, receipt: token, jobId, dry: input.mode === "dry" }, input.actor);
    const request: CutRequest = { ...m.body, cutId: plan.cutId, by: input.by };
    append(t, { actor: input.actor, type: CUT_REQUEST, subject: { kind: "job", id: jobId }, data: JSON.parse(JSON.stringify(request)) });
    return ok({ kind: "launched", jobId, cutId: plan.cutId, receipt: plan.receipt });
  });
  if (!out.ok) return out;
  return out.value;
}

/* ── The binding ──────────────────────────────────────────────────────────── */

export function cutRequestOf(store: Store, jobId: string): Result<CutRequest> {
  const page = queryEvents(store, { type: [CUT_REQUEST], subject: { kind: "job", id: jobId }, limit: 1 });
  if (!page.ok) return page;
  const e = page.value.events[0];
  return e === undefined ? err("not-found", `job ${jobId} carries no cut request`) : parseCutRequest(e.data);
}

export function productionCutProducer(o: { readonly store?: () => Result<Store>; readonly engines?: CutEngines } = {}): Producer {
  const store = o.store ?? processStore;
  return defineProductionCut(PRODUCTION_CUT_LANE, {
    request: (job) => {
      const s = store();
      return s.ok ? cutRequestOf(s.value, job.id) : s;
    },
    ...cutActs(store, o.engines ?? {}),
  });
}

/** Drive one cut's job on this process (a test, a CLI): the worker's rules. */
export function driveCut(store: Store, location: string, jobId: string, o: { readonly dryOnly?: boolean; readonly engines?: CutEngines } = {}): Promise<Result<RunReport>> {
  return runJob(effectsFor(store, location), productionCutProducer({ store: () => ok(store), ...(o.engines === undefined ? {} : { engines: o.engines }) }), jobId, { dryOnly: o.dryOnly ?? dryOnlyFrom(process.env) });
}

/** The job behind a cut; undefined when the job is gone. */
export function jobOfCut(store: Store, jobId: string): Job | undefined {
  const parsed = parseAt("job id", jobIdSchema, jobId);
  if (!parsed.ok) return undefined;
  const r = get(store, parsed.value);
  return r.ok ? r.value.job : undefined;
}

export { errorMessage, AppError };
