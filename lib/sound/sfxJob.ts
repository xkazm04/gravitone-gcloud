// THE SFX PRODUCER - an effect batch rendered on ElevenLabs as ONE kernel job, a clip per step
// (Phase 6, L66). The catalog has named an `sfx` producer since Phase 4 (packages/catalog
// partOptions `sfx`, recipe `track/sfx`) and nothing bound it: the Floor's audio door refused an
// sfx launch with NO_SFX (app/(studio)/projects/_port/realLaunch.ts) and /audio drew effects as
// "no engine". v1 rendered effects from the lab's batch through POST /api/sound/generate with no
// receipt at all (app/playground/triage/Batch.tsx); here the batch is a Run launched through the
// records' receipt (lib/sound/batch.ts) and this job renders it.
//
// THE BRIEF LIVES IN THE SOUND STORE, the job names it. A Run carries what launched it, never the
// work (domain produce.ts: "no prompts"), so the envelope-first brief - event, material, space,
// loop, category, influence - is the artefact `<sound store>/batches/<run id>.json`, written once
// before the job exists and never rewritten under another brief (`writeBrief`). A run with no
// brief file (a Floor sentence) renders its composer text at the effect defaults.
//
// THE RUN ID CARRIES ITS SIZE (`sfx.<batch>.<n>`), as an mv run id carries its track: a
// producer's plan is synchronous over the job alone, and the steps are the clips.
//
// SPEND: ElevenLabs effects are metered by v1's music meter in seconds of audio (lib/music/
// budget.ts, its own 402 `over-budget`) and report no dollar figure; each served clip is booked
// unpriced with that reason, the meter's 402 is a money stop, a timeout or a rate limit feeds the
// breaker - lib/producers/score.ts's classification, for the same engine. A clip that landed in
// the store and died before its booking is a kernel interruption on cloud.elevenlabs, a paid lane
// that holds until the operator looks; the stray take is in the triage pile, not lost.
//
// DRY: the vendor is never asked. The stand-in is one silent MPEG frame filed as a FIXTURE take
// under an id derived from the job and the step - excluded from the Board's pile and the ledger,
// because judging a silent stand-in would teach the strengths a lie - and createTake is
// idempotent by id, so a resumed dry job files nothing twice.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { parseAt, parseJsonAt } from "@gt/domain/door";
import { err, ok, type Result } from "@gt/domain/errors";
import type { ResourceLane } from "@gt/domain/lane";
import type { MissingStep, Producer, StepContext, StepOutcome } from "@gt/kernel/job-core";
import { loadRun } from "@gt/kernel/records/schema";
import { failureOf, meteredCall } from "@gt/producers/research/metered";
import type { BatchBrief } from "@gt/ui/components/audio/batch.ts";

import { MusicError } from "../music/errors.ts";
import { generateTake } from "./generate.ts";
import { safeId, SoundError, storeRoot, writeJsonAtomic } from "./store.ts";
import { createTake } from "./takes.ts";
import type { GenerateRequest, SoundTake } from "./types.ts";

export const SFX_PRODUCER = "sfx";
export const SFX_LANE: ResourceLane = "cloud.elevenlabs";
export const SFX_UNPRICED = "ElevenLabs effects are metered in seconds of audio (lib/music/budget.ts); no dollar figure is reported";

/** One clip as the receipt prices it: the catalog's pace for an sfx clip (packages/catalog `sfx`). */
const CLIP_SECONDS = 20;

/** `sfx.<batch>.<n>`: the batch id the store files the brief under, and its clip count. */
export const sfxRunId = (batch: string, n: number): string => `sfx.${batch}.${n}`;

export function clipsOf(runId: string): number | null {
  const m = /^sfx\.[A-Za-z0-9_-]{1,60}\.([1-9])$/.exec(runId);
  return m === null ? null : Number(m[1]);
}

/* ── the brief, in the sound store ───────────────────────────────────────── */

export type FiledBrief = { readonly version: 1; readonly runId: string; readonly brief: BatchBrief };

const briefFile = (runId: string): string => path.join(storeRoot(), "batches", `${safeId(runId.replace(/\./g, "_"))}.json`);

const briefSchema = z
  .object({
    kind: z.enum(["music", "sfx"]),
    prompt: z.string().min(1).max(4100),
    negative: z.string().nullable(),
    durationS: z.number().positive().max(600),
    loop: z.boolean().nullable(),
    promptInfluence: z.number().min(0).max(1).nullable(),
    technique: z.array(z.string()).max(20),
    terms: z.object({ genre: z.array(z.string()), mood: z.array(z.string()), instrument: z.array(z.string()), sfxCategory: z.string().nullable() }),
    tempoBpm: z.number().nullable(),
    key: z.string().nullable(),
  })
  .strict();
const filedSchema = z.object({ version: z.literal(1), runId: z.string(), brief: briefSchema }).strict();

/** A brief through its door: the shape, then the copy the rest of the module reads. */
function briefOf(v: unknown, at: string): BatchBrief {
  const p = parseAt(at, briefSchema, v);
  if (!p.ok) throw new SoundError(p.error.message, 409);
  const b = p.value;
  return { ...b, technique: [...b.technique], terms: { genre: [...b.terms.genre], mood: [...b.terms.mood], instrument: [...b.terms.instrument], sfxCategory: b.terms.sfxCategory } };
}

/** The brief a run renders, or null when none was filed (a run the Floor launched from a sentence). */
export async function readBrief(runId: string): Promise<BatchBrief | null> {
  let raw: string;
  try {
    raw = await readFile(briefFile(runId), "utf8");
  } catch (e) {
    if (e instanceof Error && "code" in e && e.code === "ENOENT") return null;
    throw e;
  }
  const p = parseJsonAt(`batches/${runId}`, filedSchema, raw);
  if (!p.ok) throw new SoundError(p.error.message, 409);
  if (p.value.runId !== runId) throw new SoundError(`batches/${runId} is the brief of ${p.value.runId}`, 409);
  return briefOf(p.value.brief, `batches/${runId} brief`);
}

const same = (a: BatchBrief, b: BatchBrief): boolean => JSON.stringify(a) === JSON.stringify(b);

/** File a run's brief once. The same brief again is a no-op; another brief under the id is refused. */
export async function writeBrief(runId: string, brief: BatchBrief): Promise<void> {
  const held = await readBrief(runId);
  if (held !== null) {
    if (same(held, briefOf(brief, "brief"))) return;
    throw new SoundError(`batch ${runId} was filed with another brief`, 409);
  }
  const filed: FiledBrief = { version: 1, runId, brief };
  await writeJsonAtomic(briefFile(runId), filed);
}

/** A Floor sentence as an effect brief: the sentence is the event, at the lab's effect defaults. */
export function sentenceBrief(text: string): BatchBrief {
  return { kind: "sfx", prompt: text.trim(), negative: null, durationS: 3, loop: false, promptInfluence: null, technique: ["single-sentence"], terms: { genre: [], mood: [], instrument: [], sfxCategory: null }, tempoBpm: null, key: null };
}

/** What a clip is titled by: its category, else the brief's first worded phrase, else "effect" -
 *  never empty (a split's first piece is a string, so a `??` after it was never reached). */
const clipHead = (brief: BatchBrief): string =>
  brief.terms.sfxCategory?.trim() ||
  brief.prompt
    .split(/[.,]/)
    .map((s) => s.trim())
    .find((s) => s !== "") ||
  "effect";

/** The vendor request for clip `i` of `n`: identical but for its title - the batch IS its sameness. */
export function clipRequest(brief: BatchBrief, i: number, n: number): GenerateRequest {
  return {
    kind: "sfx",
    provider: "elevenlabs",
    op: "sfx",
    prompt: brief.prompt,
    negative: brief.negative,
    durationS: brief.durationS,
    loop: brief.loop ?? false,
    promptInfluence: brief.promptInfluence,
    technique: [...brief.technique],
    terms: { genre: [], mood: [...brief.terms.mood], instrument: [], sfxCategory: brief.terms.sfxCategory },
    tempoBpm: null,
    key: null,
    origin: "lab",
    sourceTakeId: null,
    editModes: null,
    plan: null,
    huntId: null,
    nodeId: null,
    title: `${clipHead(brief)} · ${i}/${n}`.slice(0, 200),
  };
}

/* ── the producer ────────────────────────────────────────────────────────── */

export const clipStep = (i: number): string => `clip:${i}`;

/** Every clip of the run not yet booked; an unreadable run id plans one step that says so. */
export function sfxPlan(runId: string, booked: ReadonlySet<string>): MissingStep[] {
  const n = clipsOf(runId);
  if (n === null) return [{ name: "unreadable", estimate: { seconds: 1, usd: 0 } }];
  return Array.from({ length: n }, (_, i) => clipStep(i + 1))
    .filter((s) => !booked.has(s))
    .map((name) => ({ name, estimate: { seconds: CLIP_SECONDS, usd: null, unpricedReason: SFX_UNPRICED } }));
}

export type SfxEngines = { readonly generateTake: (req: GenerateRequest) => Promise<SoundTake> };
const LIVE: SfxEngines = { generateTake: (req) => generateTake(req) };

/** One silent MPEG-1 Layer III frame: a playable nothing (lib/producers/score.ts's stand-in). */
const SILENT_MP3 = new Uint8Array([0xff, 0xfb, 0x90, 0x64, ...new Array<number>(413).fill(0)]);

const musicFailure = (e: unknown): StepOutcome =>
  failureOf(e, (x) => (x instanceof MusicError ? (x.kind === "over-budget" ? "money" : x.kind === "rate-limited" || x.kind === "timeout" || x.kind === "failed" ? "retry" : "fatal") : undefined));

async function briefFor(ctx: StepContext, runId: string): Promise<Result<BatchBrief>> {
  const filed = await readBrief(runId);
  if (filed !== null) return filed.kind === "sfx" ? ok(filed) : err("invalid", `batch ${runId} is a ${filed.kind} brief; the sfx producer renders effects`);
  const run = ctx.fx.tx("sfx.run", (t) => loadRun(t, runId).run);
  if (!run.ok) return run;
  const input = run.value.input;
  return "text" in input && input.text.trim() !== "" ? ok(sentenceBrief(input.text)) : err("invalid", `run ${runId} names no brief and no sentence`);
}

async function clip(ctx: StepContext, step: MissingStep, eng: SfxEngines): Promise<StepOutcome> {
  const job = ctx.job;
  if (job.of.kind !== "run") return { kind: "fatal", code: "refused", message: `the sfx producer renders a batch run; ${job.of.kind} ${job.of.id} is not one` };
  const runId = job.of.id;
  const n = clipsOf(runId);
  const i = Number(step.name.slice("clip:".length));
  if (n === null || !Number.isInteger(i) || i < 1 || i > n) return { kind: "fatal", code: "invalid", message: `sfx: ${runId} has no ${step.name}` };
  const brief = await briefFor(ctx, runId);
  if (!brief.ok) return { kind: "fatal", code: brief.error.code, message: brief.error.message };
  const req = clipRequest(brief.value, i, n);
  const live = await meteredCall<SoundTake | null>(ctx, {
    provider: "elevenlabs",
    model: "sfx",
    payload: req,
    estimate: step.estimate,
    stand: () => null,
    live: async () => ({ value: await eng.generateTake(req), unpriced: SFX_UNPRICED }),
  });
  if (live !== null) return { kind: "produced", output: { takeId: live.id }, ...(ctx.meter.used() ? {} : { costUsd: 0 }) };
  const id = `st-dry-${createHash("sha256").update(`${job.id}/${step.name}`).digest("hex").slice(0, 16)}`;
  const { take } = await createTake(
    { id, kind: "sfx", title: `${req.title ?? "effect"} (dry stand-in)`, provider: "elevenlabs", op: "sfx", origin: "fixture", prompt: req.prompt, durationS: req.durationS, loop: req.loop, technique: req.technique, terms: req.terms },
    { bytes: SILENT_MP3, mime: "audio/mpeg", name: "dry.mp3" },
  );
  return { kind: "produced", output: { takeId: take.id, dry: true }, costUsd: 0 };
}

export function sfxProducer(lane: ResourceLane = SFX_LANE, engines: Partial<SfxEngines> = {}): Producer {
  const eng: SfxEngines = { ...LIVE, ...engines };
  return {
    lane,
    plan: (job, outputs) => sfxPlan(job.of.id, new Set(outputs.keys())),
    async perform(step, ctx): Promise<StepOutcome> {
      if (step.name === "unreadable") return { kind: "fatal", code: "invalid", message: `${ctx.job.of.id} is not an sfx batch run (sfx.<batch>.<1-9>)` };
      try {
        return await clip(ctx, step, eng);
      } catch (e) {
        return musicFailure(e);
      }
    },
  };
}
