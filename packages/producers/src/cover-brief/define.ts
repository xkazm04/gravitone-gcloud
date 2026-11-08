import { z } from "zod";

import { COVER_SECTION_MAX_S, COVER_SECTION_MIN_S, COVER_STYLE_MAX } from "@gt/domain/cover";
import { parseAt, type Parsed } from "@gt/domain/door";
import { AppError, err, ok, type Result } from "@gt/domain/errors";
import { estimateSchema } from "@gt/domain/estimate";
import type { Job } from "@gt/domain/job";
import type { ResourceLane } from "@gt/domain/lane";
import type { Ending, MissingStep, Outputs, Producer, StepContext, StepOutcome } from "@gt/kernel/job-core";

// A COVER'S BRIEF (spark track-mirror-studio, follow-up) - one uploaded song read and written up as ONE kernel job of
// five steps on the text seat, priced on a receipt before it runs:
//
//   measure      pipeline/track-mirror/analyze.py over the source: tempo, key, chords, section boundaries, energy and
//                spectral shape. Local and free.
//   listen-1..3  one Gemini read each through the text router's `suno-listen` turn, the audio inline, the same NEUTRAL
//                open prompt every time (pipeline/cover-listen-PROMPT.md). Three reads, because one read's genre is a
//                hypothesis: docs/concepts/track-mirror-2026-11-07.md "Round 1 failed on genre" measured a listener
//                following its question.
//   write        one Claude Code turn on the seat (pipeline/cover-brief-PROMPT.md) over the measurements and the three
//                reads: the cover style, the source style, the section, the lyrics (empty) and the reason. Its answer
//                passes `parseBriefAnswer` below or the job fails with the door's sentence.
//
// RESUMABLE PER STEP. A booked step is never re-run: a drive killed after listen-2 plans listen-3 and write, and no
// listen is bought twice. On done, settle applies the brief to the cover and launches the cover's own job
// (lib/producers/coverBrief.ts).
//
// THE PAUSE HOLDS WHAT THE RESUME NEEDS. The launch records the request - the cover, its measured length, the listen
// model the receipt priced and the estimates - as an event beside the enqueue, in one transaction.

export const COVER_BRIEF = "cover-brief";
/** The event that carries a brief job's request (subject: the job). */
export const COVER_BRIEF_REQUEST = "audio.cover-brief-requested";
export const MEASURE_STEP = "measure";
export const WRITE_STEP = "write";
export const LISTEN_COUNT = 3;
export const listenStep = (n: number): string => `listen-${n}`;
/** The steps in the order they run. */
export const COVER_BRIEF_STEPS: readonly string[] = [MEASURE_STEP, ...Array.from({ length: LISTEN_COUNT }, (_, i) => listenStep(i + 1)), WRITE_STEP];

/** The read a step buys, 1..3, or undefined for a step that listens to nothing. */
export function listenOf(step: string): number | undefined {
  const m = /^listen-([1-9][0-9]*)$/.exec(step);
  const n = m === null ? Number.NaN : Number(m[1]);
  return Number.isInteger(n) && n >= 1 && n <= LISTEN_COUNT ? n : undefined;
}

const id = z.string().min(1).max(200);

export const coverBriefRequestSchema = z
  .object({
    coverId: z.string().regex(/^cov-[0-9a-f]{12}$/),
    /** The source's length as the upload measured it: what each listen was quoted over. */
    durationS: z.number().positive(),
    /** The listen model the receipt priced; a listen on another model is not the one confirmed. */
    model: id,
    by: id,
    estimates: z.object({ measure: estimateSchema, listen: estimateSchema, write: estimateSchema }).strict(),
  })
  .strict();
export type CoverBriefRequest = Parsed<z.output<typeof coverBriefRequestSchema>>;

export const parseCoverBriefRequest = (raw: unknown): Result<CoverBriefRequest> => parseAt("cover brief request", coverBriefRequestSchema, raw);

/** What is still missing, in order: every step the job has not booked. Pure. */
export function coverBriefPlan(req: CoverBriefRequest, outputs: Outputs): MissingStep[] {
  const estimate = (s: string) => (s === MEASURE_STEP ? req.estimates.measure : s === WRITE_STEP ? req.estimates.write : req.estimates.listen);
  return COVER_BRIEF_STEPS.filter((s) => !outputs.has(s)).map((name) => ({ name, estimate: estimate(name) }));
}

/* ── The writer's answer, at its door ─────────────────────────────────────── */

export const briefAnswerSchema = z
  .object({
    style: z.string().trim().min(1).max(COVER_STYLE_MAX),
    sourceStyle: z.string().trim().min(1).max(COVER_STYLE_MAX),
    section: z.object({ startS: z.number().min(0), endS: z.number().positive() }).strict(),
    /** Always empty: the cover derives its tags from the score, and the song's own words are never written. */
    lyrics: z.literal(""),
    why: z.string().trim().min(1).max(2000),
    /** How many of the three reads agreed on the genre the style names; 0 when no two agreed. */
    agreed: z.number().int().min(0).max(LISTEN_COUNT),
  })
  .strict();
export type BriefAnswer = Parsed<z.output<typeof briefAnswerSchema>>;

/** Seconds a section may end past the song and be trimmed to it: decoders disagree on an mp3's length by a frame or two. */
export const SECTION_END_SLACK_S = 2;

const s2 = (x: number): string => String(Math.round(x * 100) / 100);

/**
 * The writer's answer into a brief, or the refusal naming the first bad field. Beyond the schema, the section: inside
 * the song (an end up to SECTION_END_SLACK_S past it is trimmed to it), never longer than COVER_SECTION_MAX_S and never
 * shorter than COVER_SECTION_MIN_S. A song that fits in COVER_SECTION_MAX_S is covered whole: that rule is arithmetic,
 * so code holds it and the section the writer gave is replaced, not refused (a refusal would throw away three paid
 * reads over a choice with one right answer). Whether two reads agreed on the genre the style names is the prompt's
 * rule; the door cannot see it.
 */
export function parseBriefAnswer(raw: unknown, durationS: number): Result<BriefAnswer> {
  const r = parseAt("brief", briefAnswerSchema, raw);
  if (!r.ok) return r;
  const a = r.value;
  if (durationS <= COVER_SECTION_MAX_S) {
    if (durationS < COVER_SECTION_MIN_S) return err("invalid", `brief: the song's ${s2(durationS)} s is shorter than ${COVER_SECTION_MIN_S} s`);
    return ok({ ...a, section: { startS: 0, endS: durationS } });
  }
  const at = `brief: section ${s2(a.section.startS)}-${s2(a.section.endS)} s`;
  if (a.section.endS > durationS + SECTION_END_SLACK_S) return err("invalid", `${at} ends past the song's ${s2(durationS)} s`);
  const endS = Math.min(a.section.endS, durationS);
  if (endS <= a.section.startS) return err("invalid", `${at} ends before it starts`);
  const len = endS - a.section.startS;
  if (len > COVER_SECTION_MAX_S) return err("invalid", `${at} is longer than ${COVER_SECTION_MAX_S} s`);
  if (len < COVER_SECTION_MIN_S) return err("invalid", `${at} is shorter than ${COVER_SECTION_MIN_S} s`);
  return ok({ ...a, section: { startS: a.section.startS, endS } });
}

/* ── The ports, and the producer ──────────────────────────────────────────── */

/** The world, bound by lib/producers/coverBrief.ts. */
export type CoverBriefPorts = {
  /** The job's request (its event), read outside the drive's transactions. */
  readonly request: (job: Job) => Result<CoverBriefRequest>;
  readonly measure: (req: CoverBriefRequest, ctx: StepContext) => Promise<StepOutcome>;
  /** Read `n` (1..3). */
  readonly listen: (req: CoverBriefRequest, n: number, ctx: StepContext) => Promise<StepOutcome>;
  readonly write: (req: CoverBriefRequest, ctx: StepContext) => Promise<StepOutcome>;
  /** The record told the job's ending; on done, the brief applied and the cover launched. */
  readonly ended: (req: CoverBriefRequest, job: Job, ending: Ending) => Promise<void>;
};

/** The producer: the cover producer's shape, one request read per job and kept. */
export function defineCoverBrief(lane: ResourceLane, ports: CoverBriefPorts): Producer {
  const known = new Map<string, Result<CoverBriefRequest>>();
  const requestOf = (job: Job): Result<CoverBriefRequest> => {
    const held = known.get(job.id);
    if (held?.ok === true) return held;
    const read = ports.request(job);
    known.set(job.id, read);
    return read;
  };
  return {
    lane,
    async health(job) {
      if (job !== undefined) requestOf(job);
      return { ok: true };
    },
    plan(job, outputs) {
      const req = known.get(job.id) ?? requestOf(job);
      if (!req.ok) throw req.error;
      return coverBriefPlan(req.value, outputs);
    },
    async perform(step, ctx) {
      const req = requestOf(ctx.job);
      if (!req.ok) return { kind: "fatal", code: req.error.code, message: req.error.message };
      if (step.name === MEASURE_STEP) return ports.measure(req.value, ctx);
      if (step.name === WRITE_STEP) return ports.write(req.value, ctx);
      const n = listenOf(step.name);
      if (n !== undefined) return ports.listen(req.value, n, ctx);
      return { kind: "fatal", code: "internal", message: `a cover brief job has no step ${step.name}` };
    },
    async settle(job, ending) {
      const req = requestOf(job);
      if (!req.ok) throw new AppError(req.error.code, req.error.message);
      await ports.ended(req.value, job, ending);
    },
  };
}
