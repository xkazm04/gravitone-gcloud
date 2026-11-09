import { z } from "zod";

import { COVER_LYRICS_MAX, COVER_SECTION_MAX_S, COVER_STYLE_MAX, COVER_TAKE_COUNT } from "@gt/domain/cover";
import { parseAt, type Parsed } from "@gt/domain/door";
import { AppError, type Result } from "@gt/domain/errors";
import { estimateSchema } from "@gt/domain/estimate";
import type { Job } from "@gt/domain/job";
import type { ResourceLane } from "@gt/domain/lane";
import type { Ending, MissingStep, Outputs, Producer, StepContext, StepOutcome } from "@gt/kernel/job-core";

// A COVER, RENDERED (spark track-mirror-studio) - one uploaded song's section as ONE kernel job of six steps, priced on a
// receipt before it runs:
//
//   transcribe   the section cut to 44.1 kHz stereo wav, read by SheetSage2 (mode full) on this box's ComfyUI into an
//                ABC score: the melody and chords the five takes are conditioned on (registry reference-track-anchoring:
//                the cover route carries the source's melody, whatever its new style).
//   render-1..5  one YuE2 take each from that score, the request's style and lyrics, and the take's own seed - the same
//                number for YuE2's token seed and the KSampler's, so a take reproduces from the score, its seed and
//                max_duration (docs/concepts/yue2-audio-experiments-2026-11-06.md rule 1).
//
// RESUMABLE PER STEP. A booked step is never re-run: a drive killed after render-2 plans render-3..5 and nothing else.
// The steps run in order because each render reads the score transcribe wrote.
//
// THE PAUSE HOLDS WHAT THE RESUME NEEDS. The launch records the request - section, style, lyrics as the owner gave
// them, the five seeds and the fixed knobs that change the audio - as an event beside the enqueue, in one transaction.

export const COVER = "cover";
/** The event that carries a cover job's request (subject: the job). */
export const COVER_REQUEST = "audio.cover-requested";
export const TRANSCRIBE_STEP = "transcribe";
export const renderStep = (n: number): string => `render-${n}`;
/** The steps in the order they run. */
export const COVER_STEPS: readonly string[] = [TRANSCRIBE_STEP, ...Array.from({ length: COVER_TAKE_COUNT }, (_, i) => renderStep(i + 1))];
/** The take a step renders, 1..5, or undefined for a step that renders none. */
export function takeOf(step: string): number | undefined {
  const m = /^render-([1-9][0-9]*)$/.exec(step);
  const n = m === null ? Number.NaN : Number(m[1]);
  return Number.isInteger(n) && n >= 1 && n <= COVER_TAKE_COUNT ? n : undefined;
}

/** YuE2's sampler temperature for every cover take (Y15 at 0.8 stayed on the score's harmony). */
export const COVER_TEMPERATURE = 0.8;
/** A ceiling for length and a seed for everything else: set once, never changed (rule 4). */
export const COVER_MAX_DURATION = 360;

/**
 * The lyrics a take is sung from when the owner gave none: the score's own section labels (its `% <label>` comment
 * lines, as SheetSage2 writes them), in order, adjacent repeats once - `[Intro]\n\n[Chorus]`. Empty when it has none.
 */
export function tagsFromScore(abc: string): string {
  const tags: string[] = [];
  for (const line of abc.split(/\r?\n/)) {
    const m = /^%(?!%)\s*([A-Za-z][A-Za-z0-9 -]{0,39})\s*$/.exec(line);
    if (m?.[1] === undefined) continue;
    const label = m[1].trim().replace(/\s+/g, " ");
    const tag = `[${label.charAt(0).toUpperCase()}${label.slice(1).toLowerCase()}]`;
    if (tags[tags.length - 1] !== tag) tags.push(tag);
  }
  return tags.join("\n\n");
}

const id = z.string().min(1).max(200);
const seed = z.number().int().min(0).max(2 ** 32 - 1);

export const coverRequestSchema = z
  .object({
    coverId: z.string().regex(/^cov-[0-9a-f]{12}$/),
    startS: z.number().min(0),
    endS: z.number().positive(),
    style: z.string().min(1).max(COVER_STYLE_MAX),
    /** As the owner gave them; empty: tags derived from the score at transcribe. */
    lyrics: z.string().max(COVER_LYRICS_MAX),
    seeds: z.array(seed).length(COVER_TAKE_COUNT),
    max_duration: z.literal(COVER_MAX_DURATION),
    temperature: z.literal(COVER_TEMPERATURE),
    by: id,
    estimates: z.object({ transcribe: estimateSchema, render: estimateSchema }).strict(),
  })
  .strict()
  .refine((r) => r.endS > r.startS && r.endS - r.startS <= COVER_SECTION_MAX_S, { message: `a section ends after it starts and lasts at most ${COVER_SECTION_MAX_S} s` });
export type CoverRequest = Parsed<z.output<typeof coverRequestSchema>>;

export const parseCoverRequest = (raw: unknown): Result<CoverRequest> => parseAt("cover request", coverRequestSchema, raw);

/** What is still missing, in order: every step the job has not booked. Pure. */
export function coverPlan(req: CoverRequest, outputs: Outputs): MissingStep[] {
  return COVER_STEPS.filter((s) => !outputs.has(s)).map((name) => ({ name, estimate: name === TRANSCRIBE_STEP ? req.estimates.transcribe : req.estimates.render }));
}

/** The world, bound by lib/producers/cover.ts. */
export type CoverPorts = {
  /** The job's request (its event), read outside the drive's transactions. */
  readonly request: (job: Job) => Result<CoverRequest>;
  readonly transcribe: (req: CoverRequest, ctx: StepContext) => Promise<StepOutcome>;
  /** Take `n` (1..5), from the score transcribe booked. */
  readonly render: (req: CoverRequest, n: number, ctx: StepContext) => Promise<StepOutcome>;
  /** The record told the job's ending. */
  readonly ended: (req: CoverRequest, job: Job, ending: Ending) => Promise<void>;
};

/** The producer: the sheet producer's shape, one request read per job and kept. */
export function defineCover(lane: ResourceLane, ports: CoverPorts): Producer {
  const known = new Map<string, Result<CoverRequest>>();
  const requestOf = (job: Job): Result<CoverRequest> => {
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
      return coverPlan(req.value, outputs);
    },
    async perform(step, ctx) {
      const req = requestOf(ctx.job);
      if (!req.ok) return { kind: "fatal", code: req.error.code, message: req.error.message };
      if (step.name === TRANSCRIBE_STEP) return ports.transcribe(req.value, ctx);
      const n = takeOf(step.name);
      if (n !== undefined) return ports.render(req.value, n, ctx);
      return { kind: "fatal", code: "internal", message: `a cover job has no step ${step.name}` };
    },
    async settle(job, ending) {
      const req = requestOf(job);
      if (!req.ok) throw new AppError(req.error.code, req.error.message);
      await ports.ended(req.value, job, ending);
    },
  };
}
