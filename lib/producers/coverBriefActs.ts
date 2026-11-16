import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

import type { CoverRecord } from "@gt/domain/cover";
import { AppError, errorMessage } from "@gt/domain/errors";
import type { EventData } from "@gt/domain/event";
import type { CallIntent } from "@gt/kernel/dryrun";
import type { StepContext, StepOutcome } from "@gt/kernel/job-core";
import { assertFence } from "@gt/kernel/lease";
import type { SettleEntry } from "@gt/kernel/spend/ledger";
import { JOB_USD } from "@gt/kernel/spend/meter";
import { COVER_BRIEF, LISTEN_COUNT, parseBriefAnswer, type CoverBriefPorts, type CoverBriefRequest } from "@gt/producers/cover-brief/define";

import type { AgentResult, RunAgentInput } from "../agent/cliSeam.ts";
import { coverListenPrompt, COVER_LISTEN_SCHEMA, coverReadOf, inlineRefusal, standInCoverRead, vendorMime, type CoverRead } from "../sound/cover/brief/listen.ts";
import { measureSong, type Spawn } from "../sound/cover/brief/measure.ts";
import { briefPromptText, collectWrite, dropWrite, prepareWrite, standInWrite } from "../sound/cover/brief/write.ts";
import { coverFileAbs, mutateCover, readCover, writeCoverFile } from "../sound/cover/store.ts";
import { LISTEN_MODEL, LISTEN_PROVIDER, listenQuote, listenUsage, settledQuote, SUNO_LISTEN_TURN } from "../sound/suno/listenPrompt.ts";
import type { TextRequest, TextResult } from "../text/types.ts";

// THE BRIEF'S ACTS - the ports of packages/producers/src/cover-brief/define.ts over analyze.py, the text router, the
// seat and the cover store (cover brief WP-A). Settling - the brief applied, the cover launched - is ./coverBrief.ts's.
//
//   measure   analyze.py over the source (lib/sound/cover/brief/measure.ts), its report kept whole as brief/measure.json.
//   listen-n  one `suno-listen` turn through the router, the audio inline, the neutral prompt; on the job's meter at
//             listenQuote's figure and settled at the vendor's counts. The read kept as brief/listen-<n>.json. A read
//             the door refuses fails the job with the door's sentence: never re-bought silently. DRY: the stand-in.
//   write     one Claude Code turn on the seat over the kept files; its out/brief.json through parseBriefAnswer, kept
//             as brief/brief.json and booked as the step's output, which settle applies. DRY: the stand-in brief.
//
// A file already kept for a step is the step's (a drive that died between the write and the booking): it is booked as
// held and nothing is bought twice. Every record write is fenced against the job's slot first (the cover acts' fence).

/** What a test replaces: the interpreter and its spawn, the router, the seat, the clock. */
export type CoverBriefEngines = {
  readonly python?: string;
  readonly spawn?: Spawn;
  readonly reason?: (req: TextRequest) => Promise<TextResult>;
  readonly seat?: (input: RunAgentInput) => Promise<AgentResult>;
  readonly now?: () => number;
};

export const MEASURE_FILE = "brief/measure.json";
export const listenFile = (n: number): string => `brief/listen-${n}.json`;
export const BRIEF_FILE = "brief/brief.json";

const SEAT_NOTE = "a seat turn is priced by the seat's own report after it ends";
const data = (x: unknown): EventData => JSON.parse(JSON.stringify(x)) as EventData;
const produced = (output: unknown, costUsd = 0): StepOutcome => ({ kind: "produced", output: data(output), costUsd });
const fatal = (e: unknown): StepOutcome => ({ kind: "fatal", code: e instanceof AppError ? e.code : "internal", message: errorMessage(e) });
const secondsSince = (now: () => number, t0: number): number => Math.round((now() - t0) / 100) / 10;

function fence(ctx: StepContext): void {
  const { slot, lease } = ctx.job;
  if (slot === undefined || lease === undefined) throw new AppError("conflict", `job ${ctx.job.id} holds no slot; cover.json is not written`);
  const r = ctx.fx.tx("cover-brief.fence", (t) => assertFence(t, slot, lease.fence));
  if (!r.ok) throw r.error;
}

/** The cover, its brief moved to running by the first step a drive performs. */
async function running(req: CoverBriefRequest, ctx: StepContext, now: () => number): Promise<CoverRecord> {
  const c = await readCover(req.coverId);
  if (c === undefined) throw new AppError("not-found", `no cover ${req.coverId}`);
  if (c.brief?.jobId === ctx.job.id && c.brief.state === "running") return c;
  fence(ctx);
  const at = new Date(now()).toISOString();
  return mutateCover(c.id, (x) => (x.brief === undefined || x.brief.jobId === ctx.job.id ? { ...x, brief: { state: "running", jobId: ctx.job.id, at } } : x));
}

async function kept(c: CoverRecord, rel: string): Promise<string | undefined> {
  const abs = coverFileAbs(c.id, rel);
  return existsSync(abs) ? readFile(abs, "utf8") : undefined;
}

/* ── measure ──────────────────────────────────────────────────────────────── */

async function measureAct(e: CoverBriefEngines, req: CoverBriefRequest, ctx: StepContext): Promise<StepOutcome> {
  const now = e.now ?? Date.now;
  const c = await running(req, ctx, now);
  const held = await kept(c, MEASURE_FILE);
  const t0 = now();
  let text = held;
  if (text === undefined) {
    const m = await measureSong(coverFileAbs(c.id, c.source.file), { ...(e.python === undefined ? {} : { python: e.python }), ...(e.spawn === undefined ? {} : { spawn: e.spawn }) });
    if (!m.ok) return { kind: "fatal", code: m.error.code, message: m.error.message };
    text = m.value.text;
    fence(ctx);
    await writeCoverFile(c.id, MEASURE_FILE, new TextEncoder().encode(text));
  }
  return produced({ file: MEASURE_FILE, chars: text.length, held: held !== undefined, seconds: secondsSince(now, t0) });
}

/* ── listen-n ─────────────────────────────────────────────────────────────── */

type Heard = { readonly answer: unknown; readonly model: string; readonly usd?: number; readonly standIn?: true };

async function listenAct(e: CoverBriefEngines, req: CoverBriefRequest, n: number, ctx: StepContext): Promise<StepOutcome> {
  const now = e.now ?? Date.now;
  const c = await running(req, ctx, now);
  const rel = listenFile(n);
  const held = await kept(c, rel);
  if (held !== undefined) return produced({ file: rel, read: n, held: true });
  if (req.model !== LISTEN_MODEL) return { kind: "fatal", code: "refused", message: `the receipt priced a listen on ${req.model}; this server listens with ${LISTEN_MODEL}` };
  const mimeType = vendorMime(c.source.mime);
  if (mimeType === undefined) return { kind: "fatal", code: "invalid", message: `cover ${c.id}'s source is ${c.source.mime}, not audio; nothing to listen to` };
  const prompt = await coverListenPrompt(req.durationS);
  if (!prompt.ok) return { kind: "fatal", code: prompt.error.code, message: prompt.error.message };
  const bytes = new Uint8Array(await readFile(coverFileAbs(c.id, c.source.file)));
  const tooBig = inlineRefusal(c.id, bytes.byteLength, Buffer.byteLength(prompt.value, "utf8"));
  if (tooBig !== undefined) return { kind: "fatal", code: "refused", message: tooBig };
  const t0 = now();
  const day = new Date(t0).toISOString();
  const quote = listenQuote(req.durationS, day);
  if (quote.usd === null) return { kind: "fatal", code: "refused", message: `a listen is unpriced, so it is not run: ${quote.note}` };
  const intent: CallIntent<Heard> = {
    provider: LISTEN_PROVIDER,
    model: LISTEN_MODEL,
    usage: listenUsage(req.durationS),
    quote,
    payload: { turn: SUNO_LISTEN_TURN, cover: c.id, read: n, mimeType, promptChars: prompt.value.length, audio: createHash("sha256").update(bytes).digest("hex") },
    subject: { kind: "job", id: ctx.job.id },
    stand: () => ({ answer: undefined, model: "stand-in", standIn: true }),
  };
  const reason = e.reason ?? (await import("../text/router.ts")).reason;
  let heard: Heard;
  try {
    const r = await ctx.meter.paid(JOB_USD, 0, intent, async () => {
      const served = await reason({ turn: SUNO_LISTEN_TURN, prompt: prompt.value, schema: COVER_LISTEN_SCHEMA, audio: { mimeType, bytes } });
      const settled = settledQuote(req.durationS, served.provenance.inputTokens, served.provenance.outputTokens, day, quote);
      const usd = settled.usd ?? quote.usd;
      const entry: SettleEntry = { amount: usd, outcome: "served", basis: "vendor", axes: { producer: COVER_BRIEF, cover: c.id, read: String(n), model: `${LISTEN_PROVIDER}/${served.provenance.model}` } };
      return { value: { answer: served.json, model: served.provenance.model, usd }, entries: [entry] };
    });
    if (!r.ok) return { kind: "fatal", code: r.error.code, message: r.error.message };
    heard = r.value;
  } catch (x) {
    return { kind: "vendor-failure", message: `listen ${n}: ${errorMessage(x)}` };
  }
  let read: CoverRead;
  if (heard.standIn === true) read = standInCoverRead(day);
  else {
    const r = coverReadOf(heard.answer, { model: heard.model, at: day });
    if (!r.ok) return { kind: "fatal", code: "invalid", message: `${r.error.message} (read ${n} was not kept; the vendor may have billed it)` };
    read = r.value;
  }
  fence(ctx);
  await writeCoverFile(c.id, rel, new TextEncoder().encode(JSON.stringify(read, null, 1)));
  const usd = heard.usd ?? 0;
  return produced({ file: rel, read: n, model: read.model, usd, standIn: read.standIn === true, genres: read.genres.slice(0, 3), seconds: secondsSince(now, t0) }, usd);
}

/* ── write ────────────────────────────────────────────────────────────────── */

function seatEntry(r: AgentResult, coverId: string, model: string): SettleEntry {
  const axes = { producer: COVER_BRIEF, cover: coverId, turn: "write", model: `claude-seat/${model}` };
  const outcome = r.outcome === "completed" ? "served" : "failed";
  return r.costUsd === undefined ? { amount: undefined, outcome, basis: "seat-report", axes, reason: "seat reported no cost" } : { amount: r.costUsd, outcome, basis: "seat-report", axes };
}

async function writeAct(e: CoverBriefEngines, req: CoverBriefRequest, ctx: StepContext): Promise<StepOutcome> {
  const now = e.now ?? Date.now;
  const c = await running(req, ctx, now);
  const measure = await kept(c, MEASURE_FILE);
  if (measure === undefined) return { kind: "fatal", code: "internal", message: `cover ${c.id} has no ${MEASURE_FILE} to write the brief from` };
  const reads: string[] = [];
  for (let n = 1; n <= LISTEN_COUNT; n++) {
    const r = await kept(c, listenFile(n));
    if (r === undefined) return { kind: "fatal", code: "internal", message: `cover ${c.id} has no ${listenFile(n)} to write the brief from` };
    reads.push(r);
  }
  const prompt = await briefPromptText(req.durationS);
  if (!prompt.ok) return { kind: "fatal", code: prompt.error.code, message: prompt.error.message };
  const turn = await prepareWrite({ durationS: req.durationS, measure, reads }, prompt.value);
  const t0 = now();
  try {
    const { model, effort } = turn.agent;
    const intent: CallIntent<Promise<AgentResult>> = {
      provider: "claude-seat",
      model,
      usage: {},
      quote: { usd: null, basis: "unpriced", note: SEAT_NOTE },
      payload: { turn: "cover-brief", cover: c.id, model, effort, promptChars: prompt.value.length },
      subject: { kind: "job", id: ctx.job.id },
      stand: () => standInWrite(turn, req.durationS),
    };
    const seat = e.seat ?? (await import("../agent/cliSeam.ts")).runAgent;
    // No ceiling: the seat is the operator's plan, reported and never capped (lib/producers/scoutReel.ts).
    const r = await ctx.meter.paid(JOB_USD, 0, intent, async () => {
      const out = await seat(turn.agent);
      return { value: Promise.resolve(out), entries: [seatEntry(out, c.id, model)] };
    });
    if (!r.ok) return { kind: "fatal", code: r.error.code, message: r.error.message };
    const done = await r.value;
    const why = done.errors.join(" | ");
    if (done.outcome === "seat-limit") return { kind: "money-stop", message: `the text seat's usage window is spent: ${why || "seat limit"}` };
    if (done.outcome !== "completed") return { kind: "fatal", code: done.outcome === "unavailable" ? "unavailable" : "internal", message: `the brief's turn ${done.outcome}: ${why || "no sentence"}` };
    const text = await collectWrite(turn);
    if (text === undefined) return { kind: "fatal", code: "invalid", message: `brief: the turn wrote no out/brief.json${done.final.trim() === "" ? "" : `; it said: ${done.final.trim().slice(0, 500)}`}` };
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (x) {
      return { kind: "fatal", code: "invalid", message: `brief: out/brief.json is not JSON: ${errorMessage(x)}` };
    }
    const brief = parseBriefAnswer(raw, req.durationS);
    if (!brief.ok) return { kind: "fatal", code: "invalid", message: brief.error.message };
    const standIn = ctx.job.mode.kind === "dry";
    fence(ctx);
    await writeCoverFile(c.id, BRIEF_FILE, new TextEncoder().encode(JSON.stringify({ ...brief.value, ...(standIn ? { standIn: true } : {}) }, null, 2)));
    return produced({ file: BRIEF_FILE, brief: brief.value, standIn, costUsd: done.costUsd ?? null, seconds: secondsSince(now, t0) }, done.costUsd ?? 0);
  } finally {
    await dropWrite(turn);
  }
}

const guarded =
  <A extends unknown[]>(f: (...a: A) => Promise<StepOutcome>) =>
  async (...a: A): Promise<StepOutcome> => {
    try {
      return await f(...a);
    } catch (x) {
      return fatal(x);
    }
  };

export function coverBriefActs(e: CoverBriefEngines = {}): Pick<CoverBriefPorts, "measure" | "listen" | "write"> {
  return {
    measure: guarded((req: CoverBriefRequest, ctx: StepContext) => measureAct(e, req, ctx)),
    listen: guarded((req: CoverBriefRequest, n: number, ctx: StepContext) => listenAct(e, req, n, ctx)),
    write: guarded((req: CoverBriefRequest, ctx: StepContext) => writeAct(e, req, ctx)),
  };
}
