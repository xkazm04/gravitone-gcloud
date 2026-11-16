import { createHash } from "node:crypto";

import type { CoverRecord } from "@gt/domain/cover";
import { coverIdSchema } from "@gt/domain/cover.schema";
import { coverSunoJobId, SUNO_COVER_TAKES, type CoverSunoLaunch, type CoverSunoPlan, type CoverSunoSend } from "@gt/domain/cover.suno";
import { parseAt } from "@gt/domain/door";
import { err, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { jobIdSchema } from "@gt/domain/ids";
import type { Job } from "@gt/domain/job";
import { LANE_CAPACITY } from "@gt/domain/lane";
import type { ModelOption, Receipt } from "@gt/domain/produce";
import { armLive, dryOnlyFrom } from "@gt/kernel/dryrun";
import { append } from "@gt/kernel/events";
import { queryEvents } from "@gt/kernel/events-query";
import { enqueueIn, get } from "@gt/kernel/job";
import type { Producer } from "@gt/kernel/job-core";
import { runJob, type RunOptions, type RunReport } from "@gt/kernel/job-run";
import { readQueue } from "@gt/kernel/records/read";
import { receiptFor, type PlanLine } from "@gt/kernel/records/receipt";
import type { Reader, Store } from "@gt/kernel/store";
import { COVER_SUNO, COVER_SUNO_LANE, COVER_SUNO_REQUEST, coverStep, defineCoverSuno, parseCoverSunoRequest, readStep, UPLOAD_STEP, type CoverSunoRequest } from "@gt/producers/cover-suno/define";
import { SUNO_CREDITS } from "@gt/producers/suno/producer";

import { kernel } from "../kernelProcess.ts";
import { mutateCover, readCover } from "../sound/cover/store.ts";
import { coverSunoActs, type CoverSunoEngines } from "./coverSunoActs.ts";
import { effectsFor } from "./extract.ts";

// THE COVER'S SUNO SEND, BOUND (spark suno-covers) - a picked cover's winner sent to Suno as ONE kernel job of five steps
// (packages/producers/src/cover-suno/define.ts says which). This file is the launch - receipt, then confirm - and the
// binding; the acts are ./coverSunoActs.ts.
//
// WHAT A SEND COSTS ON ITS RECEIPT: five lines on cloud.suno - upload ($0: uploads spend no credits), cover-1 and
// cover-2 (Suno song credits: unpriced, never invented as dollars, with the measured pace - about 5 credits a song),
// read-1 and read-2 ($0: Suno's analysis and listen are free). Keyed by the cover and a digest of the plan, so a plan
// changed since the receipt is a stale one. A cover whose source is `third-party-uncleared` is not refused here: the
// desk shows the warning, the owner decides.
//
// ONE JOB PER SEND on cloud.suno, naming no engine: `job:cover-suno:<id>:<n>`, of the run `cover:<id>`. cover.json names
// the send once the job exists. A send still queued or running answers `existing` with its job: a second press is the
// same send, never a second one. Only a finished (or failed) send makes room for the next.

export type LaunchCoverSunoOptions = {
  readonly actor: Actor;
  /** Absent: answer with the receipt and launch nothing. */
  readonly token?: string;
  readonly dryOnly: boolean;
  readonly now?: number;
};

/** Seconds on the receipt: illustrative until a send is timed on this box (a cover's own pace is Suno's). */
const UPLOAD_SECONDS = 30;
const COVER_SECONDS = 120;
const READ_SECONDS = 60;
/** What a create costs, as the Suno producer measured it (2026-11-10). */
const CREDITS_NOTE = "about 5 credits a song (a create, measured 2026-11-10)";
const FREE_UPLOAD = "free: uploads spend no credits";
const FREE_READ = "free: Suno's analysis and listen spend no credits";

function freeOption(step: "upload" | "read", note: string): ModelOption {
  const upload = step === "upload";
  return {
    key: `cover-suno/suno/${step}`,
    lane: COVER_SUNO_LANE,
    provider: "suno",
    model: upload ? "upload" : "analysis + listen",
    label: upload ? "Suno · upload" : "Suno · read",
    secondsPerUnit: upload ? UPLOAD_SECONDS : READ_SECONDS,
    usdPerUnit: 0,
    src: "illustrative",
    basis: { seconds: { src: "illustrative", note: "not yet timed on this box" }, usd: { src: "real", note } },
  };
}

function coverOption(model: string): ModelOption {
  return {
    key: `cover-suno/suno/${model}`,
    lane: COVER_SUNO_LANE,
    provider: "suno",
    model,
    label: `Suno ${model} · cover`,
    secondsPerUnit: COVER_SECONDS,
    usdPerUnit: null,
    unpricedReason: SUNO_CREDITS,
    src: "illustrative",
    basis: { seconds: { src: "illustrative", note: "not yet timed on this box" }, usd: { src: "real", note: `${SUNO_CREDITS}; ${CREDITS_NOTE}` } },
  };
}

/** Why a send cannot be launched for cover `c`; nothing when it can. */
export function checkCoverSuno(c: CoverRecord): Result<void> {
  if (c.state !== "picked") return err("refused", `cover ${c.id} is ${c.state}; a send to Suno follows a picked winner`);
  if (c.exportFile === undefined) return err("refused", `cover ${c.id} has no winner file to send`);
  return ok(undefined);
}

/** The send's place on the cover: the next after the ones the record holds. */
export const nextSend = (c: CoverRecord): number => (c.suno?.sends.length ?? 0) + 1;

/** A send still queued or running, if the cover holds one. */
const inFlight = (c: CoverRecord): CoverSunoSend | undefined => c.suno?.sends.find((x) => x.state === "queued" || x.state === "running");

type Unsigned = Omit<CoverSunoRequest, "by">;

function readIn(r: Reader, c: CoverRecord, plan: CoverSunoPlan, o: { readonly now: number }): Result<{ readonly receipt: Receipt; readonly request: Unsigned }> {
  const checked = checkCoverSuno(c);
  if (!checked.ok) return checked;
  const { id: _id, ...fields } = plan;
  // The key names the cover AT its plan: a plan changed since the receipt is another line.
  const at = `cover-suno:${c.id}@${createHash("sha256").update(JSON.stringify([fields.style, fields.lyrics, fields.model, fields.negativeStyle ?? null, fields.durationS ?? null, fields.controls ?? null])).digest("hex").slice(0, 12)}`;
  const lines: PlanLine[] = [];
  const add = (step: string, label: string, option: ModelOption): void => {
    const prev = lines[lines.length - 1];
    lines.push({ key: `${at}/${step}`, label, lane: COVER_SUNO_LANE, units: 1, option, after: prev === undefined ? [] : [prev.key], order: lines.length, status: "pending" });
  };
  add(UPLOAD_STEP, c.suno?.uploadClipId === undefined ? `upload · ${c.title}` : `upload · ${c.title} (already on Suno)`, freeOption("upload", FREE_UPLOAD));
  for (const t of [1, 2] as const) add(coverStep(t), `cover ${t} · ${c.title}`, coverOption(plan.model));
  for (const t of [1, 2] as const) add(readStep(t), `read ${t} · ${c.title}`, freeOption("read", FREE_READ));
  const receipt = receiptFor({ subject: { kind: "run", lane: "audio" }, lines, plan: lines, queue: readQueue(r), capacity: LANE_CAPACITY, now: o.now, mode: "live" });
  const request: Unsigned = {
    coverId: c.id,
    n: nextSend(c),
    ...fields,
    ...(c.suno?.uploadClipId === undefined ? {} : { uploadClipId: c.suno.uploadClipId }),
    takes: SUNO_COVER_TAKES,
    estimates: { upload: { seconds: UPLOAD_SECONDS, usd: 0 }, cover: { seconds: COVER_SECONDS, usd: null, unpricedReason: SUNO_CREDITS }, read: { seconds: READ_SECONDS, usd: 0 } },
  };
  return ok({ receipt, request });
}

/* ── Launch: receipt, then confirm ────────────────────────────────────────── */

function jobOf(store: Store, id: string): Job | undefined {
  const parsed = parseAt("job id", jobIdSchema, id);
  if (!parsed.ok) throw parsed.error;
  const r = get(store, parsed.value);
  if (r.ok) return r.value.job;
  if (r.error.code === "not-found") return undefined;
  throw r.error;
}

/** The send's receipt (no token), or its confirm - ./cover.ts launchCover's contract. */
export async function launchCoverSuno(store: Store, plan: CoverSunoPlan, opts: LaunchCoverSunoOptions): Promise<Result<CoverSunoLaunch>> {
  if (!coverIdSchema.safeParse(plan.id).success) return err("not-found", `no cover ${plan.id}`);
  const now = opts.now ?? Date.now();
  const c = await readCover(plan.id);
  if (c === undefined) return err("not-found", `no cover ${plan.id}`);
  const going = inFlight(c);
  if (going !== undefined) return ok({ kind: "existing", jobId: going.jobId });
  const n = nextSend(c);
  const jobId = coverSunoJobId(c.id, n);
  if (jobOf(store, jobId) !== undefined) return ok({ kind: "existing", jobId });
  const ask = { now };
  const first = store.read((r) => readIn(r, c, plan, ask));
  if (!first.ok) return first;
  if (!first.value.ok) return first.value;
  if (opts.token === undefined) return ok({ kind: "receipt", receipt: first.value.value.receipt });
  const token = opts.token;
  const out = store.tx((t): Result<CoverSunoLaunch> => {
    const read = readIn(t, c, plan, ask);
    if (!read.ok) return read;
    if (read.value.receipt.token !== token) return ok({ kind: "stale", fresh: read.value.receipt });
    const mode = armLive(opts.actor, t.at, `cover suno receipt ${token.slice(0, 12)} confirmed`, { dryOnly: opts.dryOnly });
    if (!mode.ok) return mode;
    enqueueIn(t, { id: jobId, of: { kind: "run", id: `cover:${c.id}` }, producer: COVER_SUNO, lane: COVER_SUNO_LANE, mode: mode.value }, opts.actor);
    append(t, { actor: opts.actor, type: COVER_SUNO_REQUEST, subject: { kind: "job", id: jobId }, data: { ...read.value.request, by: opts.actor.id } });
    return ok({ kind: "launched", jobId });
  });
  if (!out.ok) return out;
  if (!out.value.ok || out.value.value.kind !== "launched") return out.value;
  const { id: _id, ...fields } = plan;
  const send: CoverSunoSend = { n, at: new Date(now).toISOString(), jobId, state: "queued", plan: fields, takes: [{ take: 1, state: "pending" }, { take: 2, state: "pending" }] };
  await mutateCover(c.id, (x) => ({ ...x, suno: { ...(x.suno ?? { sends: [] }), sends: [...(x.suno?.sends ?? []).filter((s) => s.n !== n), send] } }));
  return out.value;
}

/* ── The binding ──────────────────────────────────────────────────────────── */

/** The request a send job carries: the event its launch wrote beside the enqueue. */
export function coverSunoRequestOf(store: Store, jobId: string): Result<CoverSunoRequest> {
  const page = queryEvents(store, { type: [COVER_SUNO_REQUEST], subject: { kind: "job", id: jobId }, limit: 1 });
  if (!page.ok) return page;
  const e = page.value.events[0];
  return e === undefined ? err("not-found", `job ${jobId} carries no cover-suno request`) : parseCoverSunoRequest(e.data);
}

const processStore = (): Result<Store> => {
  const k = kernel();
  return k.ok ? ok(k.value.store) : k;
};

/** Production's engines are the acts' defaults (Suno's API, the sound store); a test hands fakes. */
export function coverSunoProducer(o: { readonly store?: () => Result<Store>; readonly engines?: CoverSunoEngines } = {}): Producer {
  const store = o.store ?? processStore;
  return defineCoverSuno(COVER_SUNO_LANE, {
    request: (job) => {
      const st = store();
      return st.ok ? coverSunoRequestOf(st.value, job.id) : st;
    },
    ...coverSunoActs(o.engines),
  });
}

/** Drive one send job on this process (a CLI after a launch, a test): the worker's rules. */
export function driveCoverSuno(store: Store, location: string, jobId: string, o: { readonly dryOnly?: boolean; readonly engines?: CoverSunoEngines; readonly run?: Omit<RunOptions, "dryOnly"> } = {}): Promise<Result<RunReport>> {
  const producer = coverSunoProducer({ store: () => ok(store), ...(o.engines === undefined ? {} : { engines: o.engines }) });
  return runJob(effectsFor(store, location), producer, jobId, { ...o.run, dryOnly: o.dryOnly ?? dryOnlyFrom(process.env) });
}
