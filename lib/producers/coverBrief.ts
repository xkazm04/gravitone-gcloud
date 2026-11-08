import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";

import type { CoverLaunch, CoverRecord } from "@gt/domain/cover";
import { coverIdSchema } from "@gt/domain/cover.schema";
import { parseAt } from "@gt/domain/door";
import { err, errorMessage, ok, type Result } from "@gt/domain/errors";
import { actorSchema, type Actor } from "@gt/domain/event";
import { jobIdSchema } from "@gt/domain/ids";
import type { Job } from "@gt/domain/job";
import { LANE_CAPACITY, type ResourceLane } from "@gt/domain/lane";
import type { ModelOption, Receipt, ReceiptMode } from "@gt/domain/produce";
import { armLive, dryOnlyFrom, DRY } from "@gt/kernel/dryrun";
import { append } from "@gt/kernel/events";
import { queryEvents } from "@gt/kernel/events-query";
import { enqueueIn, get, loadOutputs } from "@gt/kernel/job";
import type { Ending, Producer } from "@gt/kernel/job-core";
import { runJob, type RunOptions, type RunReport } from "@gt/kernel/job-run";
import { readQueue } from "@gt/kernel/records/read";
import { receiptFor, type PlanLine } from "@gt/kernel/records/receipt";
import type { Reader, Store } from "@gt/kernel/store";
import { COVER_BRIEF, COVER_BRIEF_REQUEST, defineCoverBrief, LISTEN_COUNT, listenStep, MEASURE_STEP, parseCoverBriefRequest, WRITE_STEP, type BriefAnswer, type CoverBriefRequest } from "@gt/producers/cover-brief/define";
import { TEXT_SEAT } from "@gt/producers/research/facts";

import { kernel } from "../kernelProcess.ts";
import { coverListenPrompt, inlineRefusal, vendorMime } from "../sound/cover/brief/listen.ts";
import { coverFileAbs, mutateCover, readCover } from "../sound/cover/store.ts";
import { LISTEN_MODEL, LISTEN_PROVIDER, listenQuote } from "../sound/suno/listenPrompt.ts";
import { launchCover } from "./cover.ts";
import { coverBriefActs, type CoverBriefEngines } from "./coverBriefActs.ts";
import { effectsFor } from "./extract.ts";

// THE COVER BRIEF PRODUCER, BOUND (cover brief WP-A) - one uploaded song measured, heard three times through Gemini and
// written up by a Claude Code turn, as one kernel job of five steps (packages/producers/src/cover-brief/define.ts says
// which). This file is the launch - receipt, then confirm - the binding, and the settle that applies the brief and
// launches the cover itself; the steps are ./coverBriefActs.ts.
//
// WHAT A BRIEF COSTS ON ITS RECEIPT: five lines - measure on the seat's lane at $0 (local, free); listen-1..3 on
// cloud.google, each at lib/sound/suno/listenPrompt.ts listenQuote over the song's length (the kernel's price table, the
// same quote a Suno take's listen carries); write on the seat, unpriced (TEXT_SEAT: the seat reports its cost after the
// turn). A source too large to ride inline is refused at the receipt, before anything is queued. Seconds illustrative.
//
// ONE JOB PER COVER, on seat.text: `job:cover-brief:<id>`, of the cover's run `cover:<id>`. The record's brief names it
// as queued once the job exists; the first step sets running; settle sets done or failed.
//
// SETTLE, ON DONE: while the cover is still a draft (or failed), its style, source style, section and lyrics become the
// brief's, and the cover is launched through ./cover.ts launchCover - a receipt, then a confirm with that receipt's
// token, as the actor who confirmed the brief, live. A refused launch is kept on brief.error, the brief still done and
// the cover a draft. A cover that left draft while the brief ran keeps its own fields. A dry job applies nothing.

export type LaunchBriefOptions = {
  readonly actor: Actor;
  /** Absent: answer with the receipt and launch nothing. */
  readonly token?: string;
  readonly dryOnly: boolean;
  readonly now?: number;
};

export const COVER_BRIEF_LANE: ResourceLane = "seat.text";
export const coverBriefJobId = (id: string): string => `job:cover-brief:${id}`;

/** Seconds on the receipt: illustrative until a brief is measured on this box. */
const MEASURE_SECONDS = 60;
const LISTEN_SECONDS = 40;
const WRITE_SECONDS = 180;

function measureOption(): ModelOption {
  return {
    key: "cover-brief/local/analyze.py",
    lane: COVER_BRIEF_LANE,
    provider: "local",
    model: "analyze.py",
    label: "measure · librosa · local",
    secondsPerUnit: MEASURE_SECONDS,
    usdPerUnit: 0,
    src: "illustrative",
    basis: { seconds: { src: "illustrative", note: "not yet measured on this box" }, usd: { src: "real", note: "free: librosa on this box; no vendor is paid" } },
  };
}

function listenOption(usd: number, note: string): ModelOption {
  return {
    key: `cover-brief/${LISTEN_PROVIDER}/${LISTEN_MODEL}`,
    lane: "cloud.google",
    provider: LISTEN_PROVIDER,
    model: LISTEN_MODEL,
    label: `listen · ${LISTEN_MODEL}`,
    secondsPerUnit: LISTEN_SECONDS,
    usdPerUnit: usd,
    src: "illustrative",
    basis: { seconds: { src: "illustrative", note: "not yet measured for a whole song" }, usd: { src: "model", note } },
  };
}

function writeOption(): ModelOption {
  return {
    key: "cover-brief/claude-seat/write",
    lane: COVER_BRIEF_LANE,
    provider: "claude-seat",
    model: "claude-seat",
    label: "brief · Claude Code turn",
    secondsPerUnit: WRITE_SECONDS,
    usdPerUnit: null,
    unpricedReason: TEXT_SEAT,
    src: "illustrative",
    basis: { seconds: { src: "illustrative", note: "not yet measured" }, usd: { src: "real", note: TEXT_SEAT } },
  };
}

/* ── The receipt ──────────────────────────────────────────────────────────── */

type Unsigned = Omit<CoverBriefRequest, "by">;
type Ask = { readonly mode: ReceiptMode; readonly now: number; readonly audioBytes: number; readonly promptBytes: number };

/** Why cover `c` cannot be briefed; nothing when it can. */
export function checkBrief(c: CoverRecord, a: Pick<Ask, "audioBytes" | "promptBytes">): Result<void> {
  if (c.state !== "draft" && c.state !== "failed") return err("refused", `cover ${c.id} is ${c.state}, not a draft or failed`);
  if (vendorMime(c.source.mime) === undefined) return err("invalid", `cover ${c.id}'s source is ${c.source.mime}, not audio; nothing to listen to`);
  const big = inlineRefusal(c.id, a.audioBytes, a.promptBytes);
  return big === undefined ? ok(undefined) : err("refused", `${big}. Nothing was queued.`);
}

function readIn(r: Reader, c: CoverRecord, o: Ask): Result<{ readonly receipt: Receipt; readonly request: Unsigned }> {
  const checked = checkBrief(c, o);
  if (!checked.ok) return checked;
  const q = listenQuote(c.source.durationS, new Date(o.now).toISOString().slice(0, 10));
  if (q.usd === null) return err("refused", `a listen is unpriced, so the brief is not run: ${q.note}`);
  const at = `cover-brief:${c.id}@${createHash("sha256").update(JSON.stringify([c.source.file, c.source.durationS, o.audioBytes, LISTEN_MODEL])).digest("hex").slice(0, 12)}`;
  const label = (what: string) => `${what} · ${c.title}`;
  const measure: PlanLine = { key: `${at}/${MEASURE_STEP}`, label: label("measure"), lane: COVER_BRIEF_LANE, units: 1, option: measureOption(), after: [], order: 0, status: "pending" };
  const lines: PlanLine[] = [measure];
  for (let n = 1; n <= LISTEN_COUNT; n++) {
    const prev = lines[lines.length - 1] ?? measure;
    lines.push({ key: `${at}/${listenStep(n)}`, label: label(`listen ${n}`), lane: "cloud.google", units: 1, option: listenOption(q.usd, q.note), after: [prev.key], order: n, status: "pending" });
  }
  const last = lines[lines.length - 1] ?? measure;
  lines.push({ key: `${at}/${WRITE_STEP}`, label: label("brief"), lane: COVER_BRIEF_LANE, units: 1, option: writeOption(), after: [last.key], order: LISTEN_COUNT + 1, status: "pending" });
  const receipt = receiptFor({ subject: { kind: "run", lane: "audio" }, lines, plan: lines, queue: readQueue(r), capacity: LANE_CAPACITY, now: o.now, mode: o.mode });
  const request: Unsigned = {
    coverId: c.id,
    durationS: c.source.durationS,
    model: LISTEN_MODEL,
    estimates: { measure: { seconds: MEASURE_SECONDS, usd: 0 }, listen: { seconds: LISTEN_SECONDS, usd: q.usd }, write: { seconds: WRITE_SECONDS, usd: null, unpricedReason: TEXT_SEAT } },
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

/** The brief's receipt (no token), or its confirm - ./cover.ts launchCover's contract. A cover that already has its
 *  brief job answers `existing` with it (a failed one is retried there, its booked steps kept). */
export async function launchCoverBrief(store: Store, id: string, opts: LaunchBriefOptions): Promise<Result<CoverLaunch>> {
  if (!coverIdSchema.safeParse(id).success) return err("not-found", `no cover ${id}`);
  const now = opts.now ?? Date.now();
  const jobId = coverBriefJobId(id);
  const c = await readCover(id);
  if (c === undefined) return err("not-found", `no cover ${id}`);
  if (jobOf(store, jobId) !== undefined) return ok({ kind: "existing", jobId });
  if (c.brief !== undefined && (c.brief.state === "queued" || c.brief.state === "running")) return ok({ kind: "existing", jobId: c.brief.jobId });
  const prompt = await coverListenPrompt(c.source.durationS);
  if (!prompt.ok) return prompt;
  let audioBytes: number;
  try {
    audioBytes = (await stat(coverFileAbs(c.id, c.source.file))).size;
  } catch (e) {
    return err("not-found", `cover ${c.id}'s source could not be read: ${errorMessage(e)}`);
  }
  const ask: Ask = { mode: opts.dryOnly ? "dry" : "live", now, audioBytes, promptBytes: Buffer.byteLength(prompt.value, "utf8") };
  const first = store.read((r) => readIn(r, c, ask));
  if (!first.ok) return first;
  if (!first.value.ok) return first.value;
  if (opts.token === undefined) return ok({ kind: "receipt", receipt: first.value.value.receipt });
  const token = opts.token;
  const out = store.tx((t): Result<CoverLaunch> => {
    const read = readIn(t, c, ask);
    if (!read.ok) return read;
    if (read.value.receipt.token !== token) return ok({ kind: "stale", fresh: read.value.receipt });
    const mode = opts.dryOnly ? ok(DRY) : armLive(opts.actor, t.at, `cover brief receipt ${token.slice(0, 12)} confirmed`);
    if (!mode.ok) return mode;
    enqueueIn(t, { id: jobId, of: { kind: "run", id: `cover:${c.id}` }, producer: COVER_BRIEF, lane: COVER_BRIEF_LANE, mode: mode.value }, opts.actor);
    append(t, { actor: opts.actor, type: COVER_BRIEF_REQUEST, subject: { kind: "job", id: jobId }, data: { ...read.value.request, by: opts.actor.id } });
    return ok({ kind: "launched", jobId });
  });
  if (!out.ok) return out;
  if (!out.value.ok || out.value.value.kind !== "launched") return out.value;
  const at = new Date(now).toISOString();
  await mutateCover(c.id, (x) => ({ ...x, brief: { state: "queued", jobId, at } }));
  return out.value;
}

/* ── The binding ──────────────────────────────────────────────────────────── */

function requestEvent(store: Store, jobId: string): Result<{ readonly data: unknown; readonly actor: unknown }> {
  const page = queryEvents(store, { type: [COVER_BRIEF_REQUEST], subject: { kind: "job", id: jobId }, limit: 1 });
  if (!page.ok) return page;
  const e = page.value.events[0];
  return e === undefined ? err("not-found", `job ${jobId} carries no cover brief request`) : ok({ data: e.data, actor: e.actor });
}

/** The request a brief job carries: the event its launch wrote beside the enqueue. */
export function coverBriefRequestOf(store: Store, jobId: string): Result<CoverBriefRequest> {
  const e = requestEvent(store, jobId);
  return e.ok ? parseCoverBriefRequest(e.value.data) : e;
}

/** Who confirmed the brief: the cover is launched as them. */
export function coverBriefActorOf(store: Store, jobId: string): Result<Actor> {
  const e = requestEvent(store, jobId);
  return e.ok ? parseAt("cover brief actor", actorSchema, e.value.actor) : e;
}

/** What settle is handed beside the store: the process's dry-only switch and the clock. */
export type SettleEngines = { readonly dryOnly?: boolean; readonly now?: () => number };

type Written = { readonly brief: BriefAnswer; readonly standIn: boolean };

/** Told the job's ending: the brief's state on the record, and on done the brief applied and the cover launched. */
export async function settleBrief(store: Store, req: CoverBriefRequest, job: Job, ending: Ending, e: SettleEngines = {}): Promise<void> {
  if (ending !== "done" && ending !== "failed") return;
  const at = new Date((e.now ?? Date.now)()).toISOString();
  const c = await readCover(req.coverId);
  if (c === undefined || (c.brief !== undefined && c.brief.jobId !== job.id)) return;
  if (ending === "failed") {
    const error = (job.error?.message ?? `the brief job ${job.id} failed`).slice(0, 2000);
    await mutateCover(c.id, (x) => ({ ...x, brief: { state: "failed", jobId: job.id, at, error } }));
    return;
  }
  if (c.brief?.state === "done") return;
  const w = store.read((r) => loadOutputs(r, job.id).get(WRITE_STEP)?.value as Written | undefined);
  if (!w.ok) throw w.error;
  const written = w.value;
  if (written === undefined) throw new Error(`job ${job.id} ended done with no ${WRITE_STEP} booked`);
  const b = written.brief;
  const done = { state: "done" as const, jobId: job.id, at, why: b.why, agreed: b.agreed };
  if (written.standIn || job.mode.kind !== "live") {
    await mutateCover(c.id, (x) => ({ ...x, brief: { ...done, error: "a dry brief heard nothing: nothing was applied and the cover was not launched" } }));
    return;
  }
  let applied = false;
  await mutateCover(c.id, (x) => {
    if (x.state !== "draft" && x.state !== "failed") return { ...x, brief: { ...done, error: `cover ${x.id} became ${x.state} while the brief ran: its own style and section were kept and nothing was launched` } };
    applied = true;
    return { ...x, style: b.style, sourceStyle: b.sourceStyle, section: { startS: b.section.startS, endS: b.section.endS }, lyrics: b.lyrics, brief: done };
  });
  if (!applied) return;
  const refused = await launchFromBrief(store, req, job, b, e);
  if (refused !== undefined) await mutateCover(c.id, (x) => ({ ...x, brief: { ...(x.brief ?? done), error: refused.slice(0, 2000) } }));
}

/** The cover's own launch, receipt then confirm; the refusal's sentence, or nothing when it launched. */
async function launchFromBrief(store: Store, req: CoverBriefRequest, job: Job, b: BriefAnswer, e: SettleEngines): Promise<string | undefined> {
  const actor = coverBriefActorOf(store, job.id);
  if (!actor.ok) return actor.error.message;
  const plan = { id: req.coverId, startS: b.section.startS, endS: b.section.endS, style: b.style, lyrics: b.lyrics, sourceStyle: b.sourceStyle };
  const o = { mode: "live" as const, actor: actor.value, dryOnly: e.dryOnly ?? dryOnlyFrom(process.env) };
  const first = await launchCover(store, plan, o);
  if (!first.ok) return first.error.message;
  if (first.value.kind === "existing") return `the cover already has its job ${first.value.jobId}; the brief launched nothing new`;
  if (first.value.kind !== "receipt") return `the cover's launch answered ${first.value.kind} where a receipt was expected`;
  const confirmed = await launchCover(store, plan, { ...o, token: first.value.receipt.token });
  if (!confirmed.ok) return confirmed.error.message;
  return confirmed.value.kind === "launched" ? undefined : `the cover's launch answered ${confirmed.value.kind}: its receipt changed between the read and the confirm`;
}

const processStore = (): Result<Store> => {
  const k = kernel();
  return k.ok ? ok(k.value.store) : k;
};

/** The bound producer - the one line lib/producers/registry.ts carries. A test hands fakes. */
export function coverBriefProducer(o: { readonly store?: () => Result<Store>; readonly engines?: CoverBriefEngines & SettleEngines } = {}): Producer {
  const store = o.store ?? processStore;
  return defineCoverBrief(COVER_BRIEF_LANE, {
    request: (job) => {
      const st = store();
      return st.ok ? coverBriefRequestOf(st.value, job.id) : st;
    },
    ...coverBriefActs(o.engines),
    ended: async (req, job, ending) => {
      const st = store();
      if (!st.ok) throw st.error;
      await settleBrief(st.value, req, job, ending, o.engines);
    },
  });
}

/** Drive one brief job on this process (a CLI, a test): the worker's rules. */
export function driveCoverBrief(store: Store, location: string, jobId: string, o: { readonly dryOnly?: boolean; readonly engines?: CoverBriefEngines & SettleEngines; readonly run?: Omit<RunOptions, "dryOnly"> } = {}): Promise<Result<RunReport>> {
  const producer = coverBriefProducer({ store: () => ok(store), ...(o.engines === undefined ? {} : { engines: o.engines }) });
  return runJob(effectsFor(store, location), producer, jobId, { ...o.run, dryOnly: o.dryOnly ?? dryOnlyFrom(process.env) });
}
