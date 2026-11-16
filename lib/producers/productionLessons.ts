import { createHash } from "node:crypto";

import { z } from "zod";

import { err, errorMessage, ok, type Result } from "@gt/domain/errors";
import type { Actor, EventData } from "@gt/domain/event";
import type { Job } from "@gt/domain/job";
import { LESSON_DIMENSIONS, type LessonDimension, type LessonSource, type Production, type ProductionId, type ProductionLesson } from "@gt/domain/production";
import { DRY, armLive } from "@gt/kernel/dryrun";
import { append } from "@gt/kernel/events";
import { queryEvents } from "@gt/kernel/events-query";
import { enqueueIn } from "@gt/kernel/job";
import type { Producer, StepContext, StepOutcome } from "@gt/kernel/job-core";
import { runJob, type RunReport } from "@gt/kernel/job-run";
import { assertFence } from "@gt/kernel/lease";
import { castJobsOf, setCastJobIn } from "@gt/kernel/productions/cast";
import { acceptLessonIn, editLessonIn, lessonsOf, proposeLessonsIn, readLesson, type LessonProposal } from "@gt/kernel/productions/lessons";
import { cutsOf, readProduction } from "@gt/kernel/productions/store";
import type { PlanLine } from "@gt/kernel/records/receipt";
import type { Reader, Store, Tx } from "@gt/kernel/store";
import { TEXT_SEAT } from "@gt/producers/research/facts";
import { madePaid } from "@gt/producers/research/partAct";
import { defineProductionLessons, LESSONS_REQUEST, parseLessonsRequest, PRODUCTION_LESSONS, type LessonsRequest } from "@gt/producers/production-lessons/define";

import { CHANNEL_ID_RE, channelOfEpisode, EPISODE_ID_RE } from "@gt/domain/channel";

import { leadKey, queueEvents, type LeadEventKind } from "../foundry/scout/leads.ts";
import { kernel } from "../kernelProcess.ts";
import { effectsFor } from "./extract.ts";
import { launch, PRODUCTION_CAST_LANE, seatOption, type CastLaunch, type CastLaunchInput } from "./productionCast.ts";
import { promptSection, seatAnswer, type CastEngines } from "./productionCastActs.ts";

// A DONE PRODUCTION'S LESSONS, BOUND (spark concept-casting-stages S6). The Board's approval of a final cut enqueues one
// `production-lessons` job (`enqueueLessonsIn`, in the approval's transaction); a job that failed, or a dry rehearsal, is the
// operator's "Propose lessons" with a receipt. The seat proposes one lesson per dimension over the production's OWN
// evidence: what the operator said of its cuts and audio, its episode's verdict, and each take's record. A proposal must
// cite that evidence, or say that the evidence held none on the dimension: the seat's citation of a ref it was not given
// fails the turn. A dry job writes stand-ins that can never be accepted.
//
// ONLY THE OPERATOR ACCEPTS (`acceptLesson`). An accepted lesson feeds the taste brief per project on read
// (lib/foundry/scout/tasteLessons.ts), and queues one registry lead here, after its transaction: a press that fails on the queue
// (a different store than the kernel) says so and is pressed again, the lead's key making that one line.

export const LESSON_MAX = 400;
const PROMPT_FILE = "LESSONS-PROMPT.md";
const TURN_SECONDS = 60;
const ESTIMATE = { seconds: TURN_SECONDS, usd: null, unpricedReason: TEXT_SEAT } as const;
const JOB_KEY = "lessons";

const digest = (s: string): string => createHash("sha256").update(s).digest("hex").slice(0, 12);
const jobIdOf = (id: string, n: number): string => `job:${PRODUCTION_LESSONS}:${id}:${n}`;
const data = (x: unknown): EventData => JSON.parse(JSON.stringify(x)) as EventData;

const processStore = (): Result<Store> => {
  const k = kernel();
  return k.ok ? ok(k.value.store) : k;
};

/* ── the evidence ─────────────────────────────────────────────────────────── */

/** What is said of a production's episode, read from its channel file by the caller. */
export type EpisodeSaid = { readonly reasons: readonly string[]; readonly notes: readonly string[] };

/** A note's words in evidence, one line each (the seat cites the ref). */
function evidenceOf(p: Production, cutNotes: readonly { readonly id: string; readonly note: string }[], said: EpisodeSaid | undefined): LessonSource[] {
  const out: LessonSource[] = [];
  for (const c of cutNotes) out.push({ ref: `note:${c.id}`, words: `the operator on ${c.id}: ${c.note}` });
  if (p.audio?.note !== undefined) out.push({ ref: "note:audio", words: `the operator on the audio: ${p.audio.note}` });
  for (const [i, r] of (said?.reasons ?? []).entries()) out.push({ ref: `reason:${p.source.ref}:${i + 1}`, words: `the operator's reason on ${p.source.ref}: ${r}` });
  for (const [i, n] of (said?.notes ?? []).entries()) out.push({ ref: `note:${p.source.ref}:${i + 1}`, words: `the operator's note on ${p.source.ref}: ${n}` });
  for (const t of p.takes) {
    if (t.dry === true) continue;
    const outcome = t.state === "failed" ? `failed: ${t.error ?? "no sentence"}` : t.provenAt !== undefined ? "proven by the operator" : t.state === "ready" ? (t.stale === true ? "ready, then gone stale after a re-cast" : "ready, not proven") : "still rendering";
    out.push({ ref: `take:${t.id}`, words: `${t.id} (${t.kind}, beats: ${t.beats.join(" / ")}) on ${t.engine}: ${outcome}. Motion: ${t.prompt}` });
  }
  return out;
}

function evidenceFor(r: Reader, p: Production, said: EpisodeSaid | undefined): LessonSource[] {
  const cutNotes = cutsOf(r, p.id).flatMap((c) => (c.note === undefined ? [] : [{ id: c.id, note: c.note }]));
  return evidenceOf(p, cutNotes, said);
}

/* ── launching ────────────────────────────────────────────────────────────── */

function enqueueIn2(t: Tx, id: ProductionId, job: string, mode: Job["mode"], actor: Actor, by: string): void {
  enqueueIn(t, { id: job, of: { kind: "run", id: `production:${id}/lessons` }, producer: PRODUCTION_LESSONS, lane: PRODUCTION_CAST_LANE, mode }, actor);
  append(t, { actor, type: LESSONS_REQUEST, subject: { kind: "job", id: job }, data: data({ productionId: id, by, estimates: { turn: ESTIMATE } }) });
  setCastJobIn(t, id, JOB_KEY, job);
}

/** The Board's approval: one job, in its transaction; a redelivered approval finds it and enqueues nothing. Dry on a dry-only box. */
export function enqueueLessonsIn(t: Tx, id: ProductionId, actor: Actor, dryOnly: boolean): void {
  if (castJobsOf(t, id)[JOB_KEY] !== undefined) return;
  const mode = armLive(actor, t.at, "the operator approved the final cut on the Board", { dryOnly });
  enqueueIn2(t, id, jobIdOf(id, 1), mode.ok ? mode.value : DRY, actor, actor.id);
}

/** The operator's "Propose lessons": a receipt, then the job. Refused while any lesson stands or a job is in flight. */
export function requestLessons(store: Store, id: ProductionId, input: CastLaunchInput): Result<CastLaunch> {
  return launch(store, input, (r) => {
    const p = readProduction(r, id);
    if (p === undefined) return err("not-found", `production: no ${id}`);
    if (p.stage !== "done") return err("refused", `lessons: ${id} is at ${p.stage}; a lesson is proposed only once the Board has approved the cut`);
    if (lessonsOf(r, id).length > 0) return err("refused", `lessons: ${id} already has its proposals; edit them`);
    const n = Number(r.get("SELECT count(*) AS n FROM jobs WHERE id LIKE ?", `${jobIdOf(id, 0).slice(0, -1)}%`)?.["n"] ?? 0) + 1;
    const line: PlanLine = { key: `lessons:${id}@${digest(String(p.takes.length))}`, label: "lessons · beats, art style, technique", lane: PRODUCTION_CAST_LANE, units: 1, option: { ...seatOption(), label: "lessons turn · seat" }, after: [], order: 0, status: "pending" };
    return ok({
      lines: [line],
      lane: "article",
      apply: (t, mode) => {
        const job = jobIdOf(id, n);
        enqueueIn2(t, id, job, mode, input.actor, input.by);
        return job;
      },
    });
  });
}

/* ── the act ──────────────────────────────────────────────────────────────── */

const answerSchema = z.object({
  lessons: z
    .array(z.object({ dimension: z.enum(LESSON_DIMENSIONS), text: z.string().trim().min(1).max(LESSON_MAX).optional(), drawnFrom: z.array(z.string()).optional(), nothing: z.string().trim().min(1).max(LESSON_MAX).optional() }).strict())
    .min(1)
    .max(LESSON_DIMENSIONS.length),
});
type Answer = z.output<typeof answerSchema>;

/** The seat's answer against what it was given. A cited ref outside the evidence fails the turn: a proposal may not invent its grounds. */
export function proposalsOf(answer: Answer, evidence: readonly LessonSource[]): Result<LessonProposal[]> {
  const known = new Map(evidence.map((e) => [e.ref, e]));
  const out: LessonProposal[] = [];
  const seen = new Set<LessonDimension>();
  for (const l of answer.lessons) {
    if (seen.has(l.dimension)) return err("invalid", `lessons: the seat answered ${l.dimension} twice`);
    seen.add(l.dimension);
    if (l.nothing !== undefined) {
      if (l.text !== undefined) return err("invalid", `lessons: the ${l.dimension} answer has both words and nothing`);
      out.push({ dimension: l.dimension, nothing: l.nothing });
      continue;
    }
    if (l.text === undefined) return err("invalid", `lessons: the ${l.dimension} answer has neither a lesson nor a reason for none`);
    const refs = [...new Set(l.drawnFrom ?? [])];
    if (refs.length === 0) return err("invalid", `lessons: the ${l.dimension} lesson cites no evidence`);
    const unknownRef = refs.find((x) => !known.has(x));
    if (unknownRef !== undefined) return err("invalid", `lessons: the ${l.dimension} lesson cites ${unknownRef}, which the production's evidence does not hold`);
    out.push({ dimension: l.dimension, text: l.text, drawnFrom: refs.flatMap((x) => { const e = known.get(x); return e === undefined ? [] : [e]; }) });
  }
  for (const d of LESSON_DIMENSIONS) if (!seen.has(d)) out.push({ dimension: d, nothing: "the seat left this dimension unanswered" });
  return ok(out);
}

const STAND = (evidence: readonly LessonSource[]): Answer => {
  const ground = evidence[0]?.ref;
  return { lessons: LESSON_DIMENSIONS.map((dimension) => (ground === undefined ? { dimension, nothing: "dry-run stand-in: no evidence" } : { dimension, text: `dry-run stand-in ${dimension} lesson: no seat wrote this`, drawnFrom: [ground] })) };
};

function fence(ctx: StepContext): void {
  const { slot, lease } = ctx.job;
  if (slot === undefined || lease === undefined) throw new Error(`job ${ctx.job.id} holds no slot; the lessons are not written`);
  const r = ctx.fx.tx("lessons.fence", (t) => assertFence(t, slot, lease.fence));
  if (!r.ok) throw r.error;
}

async function lessonsAct(store: () => Result<Store>, e: Pick<CastEngines, "seat">, said: (p: Production) => Promise<EpisodeSaid | undefined>, req: LessonsRequest, ctx: StepContext): Promise<StepOutcome> {
  const fatal = (message: string, code: "invalid" | "internal" | "not-found" | "unavailable" = "internal"): StepOutcome => ({ kind: "fatal", code, message });
  const s = store();
  if (!s.ok) return fatal(s.error.message, "unavailable");
  const prior = s.value.read((r) => readProduction(r, req.productionId));
  if (!prior.ok) return fatal(prior.error.message);
  const p = prior.value;
  if (p === undefined) return fatal(`production: no ${req.productionId}`, "not-found");
  try {
    const voiced = await said(p);
    const ev = s.value.read((r) => evidenceFor(r, p, voiced));
    if (!ev.ok) return fatal(ev.error.message);
    const evidence = ev.value;
    const prompt = await promptSection("lessons", { MAX: String(LESSON_MAX) }, PROMPT_FILE);
    const answer = await seatAnswer(e, ctx, "production-lessons", prompt, { title: p.title, logline: p.board.logline, evidence }, answerSchema as z.ZodType<Answer>, () => STAND(evidence));
    const proposals = proposalsOf(answer, evidence);
    if (!proposals.ok) return fatal(proposals.error.message, "invalid");
    fence(ctx);
    const landed = ctx.fx.tx("lessons.propose", (t) => proposeLessonsIn(t, req.productionId, proposals.value, ctx.job.mode.kind !== "live", { kind: "machine", id: ctx.job.id }));
    if (!landed.ok) throw landed.error;
    return madePaid(data({ lessons: landed.value.map((l) => l.id) }), ctx);
  } catch (x) {
    if (typeof x === "object" && x !== null && (x as { code?: string }).code === "conflict") throw x;
    return fatal(errorMessage(x));
  }
}

export function lessonsRequestOf(store: Store, id: string): Result<LessonsRequest> {
  const page = queryEvents(store, { type: [LESSONS_REQUEST], subject: { kind: "job", id }, limit: 1 });
  if (!page.ok) return page;
  const e = page.value.events[0];
  return e === undefined ? err("not-found", `job ${id} carries no lessons request`) : parseLessonsRequest(e.data);
}

/** What the operator said of the episode a production came from; undefined for any other source or an episode with no verdict. */
async function episodeSaid(p: Production): Promise<EpisodeSaid | undefined> {
  if (p.source.kind !== "episode" || !EPISODE_ID_RE.test(p.source.ref) || !CHANNEL_ID_RE.test(channelOfEpisode(p.source.ref))) return undefined;
  const { episodeOf } = await import("../foundry/scout/channels.ts");
  const v = (await episodeOf(p.source.ref))?.episode.verdict;
  return v === undefined ? undefined : { reasons: v.reasons, notes: v.notes };
}

export function productionLessonsProducer(o: { readonly store?: () => Result<Store>; readonly engines?: Pick<CastEngines, "seat">; readonly said?: (p: Production) => Promise<EpisodeSaid | undefined> } = {}): Producer {
  const store = o.store ?? processStore;
  return defineProductionLessons(PRODUCTION_CAST_LANE, {
    request: (job) => {
      const s = store();
      return s.ok ? lessonsRequestOf(s.value, job.id) : s;
    },
    lessons: (req, ctx) => lessonsAct(store, o.engines ?? {}, o.said ?? episodeSaid, req, ctx),
  });
}

/** Drive one lessons job on this process (a test, the dry walk): the worker's rules. */
export function driveLessons(store: Store, location: string, id: string, o: { readonly engines?: Pick<CastEngines, "seat">; readonly said?: (p: Production) => Promise<EpisodeSaid | undefined>; readonly dryOnly?: boolean } = {}): Promise<Result<RunReport>> {
  const producer = productionLessonsProducer({ store: () => ok(store), ...(o.engines === undefined ? {} : { engines: o.engines }), ...(o.said === undefined ? {} : { said: o.said }) });
  return runJob(effectsFor(store, location), producer, id, { dryOnly: o.dryOnly ?? false });
}

/* ── the operator's acts ──────────────────────────────────────────────────── */

const LEAD_KIND: Readonly<Record<LessonDimension, LeadEventKind>> = { beats: "lesson-beats", "art-style": "lesson-art-style", technique: "lesson-technique" };

/** A lead's ref: the production and its dimension (`prdn:slug/beats`). */
export const leadRefOf = (l: ProductionLesson): string => `${l.productionId}/${l.dimension}`;

/** Queue the lead an accepted lesson earned. The key is the production and the dimension, so a retry is one line. */
async function queueLead(p: Production, l: ProductionLesson, now: Date): Promise<void> {
  const night = now.toISOString().slice(0, 10);
  const ref = leadRefOf(l);
  await queueEvents([{ key: leadKey(LEAD_KIND[l.dimension], ref), kind: LEAD_KIND[l.dimension], night, refs: [ref], evidence: [`lesson: ${l.text}`, `film: ${p.title}`, ...l.drawnFrom.map((d) => `drawn from ${d.ref}: ${d.words}`)] }], now);
}

/** The operator's edit of a proposed lesson. */
export function editLesson(store: Store, id: ProductionId, lessonId: string, text: string, who: Actor): Result<ProductionLesson> {
  return store.tx((t) => editLessonIn(t, id, lessonId, text, who));
}

/** The operator accepts a lesson. Accepted is the record; the lead is queued after, and a retry completes only the lead. */
export async function acceptLesson(store: Store, id: ProductionId, lessonId: string, text: string | undefined, who: Actor, now = new Date()): Promise<Result<ProductionLesson>> {
  const out = store.tx((t) => {
    const l = acceptLessonIn(t, id, lessonId, text, who);
    const p = readProduction(t, id);
    return p === undefined ? undefined : { lesson: l, production: p };
  });
  if (!out.ok) return out;
  if (out.value === undefined) return err("not-found", `production: no ${id}`);
  try {
    await queueLead(out.value.production, out.value.lesson, now);
  } catch (x) {
    return err("unavailable", `lessons: accepted, and its registry lead could not be queued (${errorMessage(x)}); press Accept again`);
  }
  return ok(out.value.lesson);
}

export { lessonsOf, readLesson };
