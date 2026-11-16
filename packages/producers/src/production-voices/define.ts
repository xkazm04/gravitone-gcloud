import { z } from "zod";

import { blobRefSchema } from "@gt/domain/blob";
import { parseAt, type Parsed } from "@gt/domain/door";
import { AppError, type Result } from "@gt/domain/errors";
import type { Estimate } from "@gt/domain/estimate";
import type { Job } from "@gt/domain/job";
import type { ResourceLane } from "@gt/domain/lane";
import type { Ending, MissingStep, Outputs, Producer, StepContext, StepOutcome } from "@gt/kernel/job-core";

// A CASTING ROUND'S VOICES (spark concept-casting-stages S3) as the steps of ONE kernel job on cloud.elevenlabs.
//
//   round   `design:k`, one vendor call each (3 previews a call, so two for five), then `level:i` for each preview.
//           The bought audio is stored by the design step that bought it; levelling is a separate, free step, so a
//           level that fails or a crash after it never pays for the design again.
//   create  one step, `create`: the vendor voice from the operator's picked preview. A job of its own, launched only by
//           the pick, since it spends a voice slot.
//
// The plan is the missing outputs, so a resumed job re-does nothing it holds.

export const PRODUCTION_VOICES = "production-voices";
/** The event carrying a voices job's request (subject: the job). */
export const VOICES_REQUEST = "production.voices-requested";

export const designStep = (k: number): string => `design:${k}`;
export const levelStep = (i: number): string => `level:${i}`;
export const CREATE_STEP = "create";

/** Vendor credits, not dollars: admitted under a USD ceiling and booked unpriced with this reason. */
export const VOICE_CREDIT = "ElevenLabs credits, reported per round";
export const PREVIEWS_PER_CALL = 3;

const id = z.string().min(1).max(200);

const roundSchema = z
  .object({
    act: z.literal("round"),
    productionId: id,
    roleId: id,
    roundId: id,
    brief: z.string().min(1).max(2000),
    script: z.string().min(100).max(1000),
    count: z.number().int().min(1).max(9),
    by: id,
  })
  .strict();

const createSchema = z
  .object({
    act: z.literal("create"),
    productionId: id,
    roleId: id,
    roundId: id,
    candidateId: id,
    generatedVoiceId: id,
    name: id,
    brief: z.string().min(1).max(2000),
    pickedBy: id,
  })
  .strict();

export const voicesRequestSchema = z.discriminatedUnion("act", [roundSchema, createSchema]);
export type VoicesRequest = Parsed<z.output<typeof voicesRequestSchema>>;
export type VoicesRoundRequest = Extract<VoicesRequest, { readonly act: "round" }>;
export type VoicesCreateRequest = Extract<VoicesRequest, { readonly act: "create" }>;

export const parseVoicesRequest = (raw: unknown): Result<VoicesRequest> => parseAt("voices request", voicesRequestSchema, raw);

/** One vendor call's receipt figure: its time, and no dollars. */
const DESIGN_ESTIMATE: Estimate = { seconds: 30, usd: null, unpricedReason: VOICE_CREDIT };
const CREATE_ESTIMATE: Estimate = { seconds: 5, usd: null, unpricedReason: VOICE_CREDIT };
const LEVEL_ESTIMATE: Estimate = { seconds: 3, usd: 0 };

export const designCalls = (count: number): number => Math.ceil(count / PREVIEWS_PER_CALL);

/** What is still missing, in order. Pure: the request and what the job has booked. */
export function voicesPlan(req: VoicesRequest, outputs: Outputs): MissingStep[] {
  if (req.act === "create") return outputs.has(CREATE_STEP) ? [] : [{ name: CREATE_STEP, estimate: CREATE_ESTIMATE, credit: VOICE_CREDIT }];
  const steps: MissingStep[] = [];
  for (let k = 1; k <= designCalls(req.count); k += 1) if (!outputs.has(designStep(k))) steps.push({ name: designStep(k), estimate: DESIGN_ESTIMATE, credit: VOICE_CREDIT });
  for (let i = 1; i <= req.count; i += 1) if (!outputs.has(levelStep(i))) steps.push({ name: levelStep(i), estimate: LEVEL_ESTIMATE });
  return steps;
}

/** A stored preview, as a design step books it. */
export const storedPreviewSchema = z.object({ generatedVoiceId: id, blob: blobRefSchema, durationMs: z.number().int().nonnegative().optional() }).strict();
export type StoredPreview = z.output<typeof storedPreviewSchema>;

export const designOutputSchema = z
  .object({
    k: z.number().int().positive(),
    previews: z.array(storedPreviewSchema).min(1),
    used: z.number().int().nonnegative(),
    read: z.enum(["character-cost-header", "subscription-delta", "unread"]),
    why: z.string().min(1).optional(),
    dry: z.literal(true).optional(),
  })
  .strict();
export type DesignOutput = z.output<typeof designOutputSchema>;

export const levelOutputSchema = z.object({ i: z.number().int().positive(), blob: blobRefSchema, lufs: z.number(), dry: z.literal(true).optional() }).strict();
export type LevelOutput = z.output<typeof levelOutputSchema>;

/** The preview at 1-based position `i`, across every design call booked so far, in call order. */
export function previewAt(outputs: Outputs, count: number, i: number): Result<StoredPreview | undefined> {
  const all: StoredPreview[] = [];
  for (let k = 1; k <= designCalls(count); k += 1) {
    const raw = outputs.get(designStep(k))?.value;
    if (raw === undefined) continue;
    const parsed = parseAt(`${designStep(k)} output`, designOutputSchema, raw);
    if (!parsed.ok) return parsed;
    all.push(...parsed.value.previews);
  }
  return { ok: true, value: all[i - 1] };
}

/** The world, bound by lib/producers/productionVoices.ts. */
export type VoicesPorts = {
  readonly request: (job: Job) => Result<VoicesRequest>;
  readonly design: (req: VoicesRoundRequest, k: number, ctx: StepContext) => Promise<StepOutcome>;
  readonly level: (req: VoicesRoundRequest, i: number, ctx: StepContext) => Promise<StepOutcome>;
  readonly create: (req: VoicesCreateRequest, ctx: StepContext) => Promise<StepOutcome>;
  readonly health: (job?: Job) => Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: string }>;
  /** A create job's ending, so the role it casts can be told. */
  readonly ended?: (req: VoicesCreateRequest, job: Job, ending: Ending) => Promise<void>;
};

export function defineProductionVoices(lane: ResourceLane, ports: VoicesPorts): Producer {
  const known = new Map<string, Result<VoicesRequest>>();
  const requestOf = (job: Job): Result<VoicesRequest> => {
    const held = known.get(job.id);
    if (held?.ok === true) return held;
    const read = ports.request(job);
    known.set(job.id, read);
    return read;
  };
  return {
    lane,
    health(job) {
      if (job !== undefined) requestOf(job);
      return ports.health(job);
    },
    plan(job, outputs) {
      const req = known.get(job.id) ?? requestOf(job);
      if (!req.ok) throw req.error;
      return voicesPlan(req.value, outputs);
    },
    async perform(step, ctx) {
      const req = requestOf(ctx.job);
      if (!req.ok) return { kind: "fatal", code: req.error.code, message: req.error.message };
      if (req.value.act === "create") {
        if (step.name === CREATE_STEP) return ports.create(req.value, ctx);
        throw new AppError("internal", `a create job has no step ${step.name}`);
      }
      const [kind, at] = step.name.split(":");
      const n = Number(at);
      if (kind === "design" && Number.isInteger(n) && n >= 1) return ports.design(req.value, n, ctx);
      if (kind === "level" && Number.isInteger(n) && n >= 1) return ports.level(req.value, n, ctx);
      return { kind: "fatal", code: "internal", message: `a voices job has no step ${step.name}` };
    },
    async settle(job, ending) {
      const req = requestOf(job);
      if (!req.ok) throw req.error;
      if (req.value.act === "create") await ports.ended?.(req.value, job, ending);
    },
  };
}
