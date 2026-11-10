import { z } from "zod";

import { blobRefSchema } from "@gt/domain/blob";
import { parseAt, type Parsed } from "@gt/domain/door";
import { AppError, type Result } from "@gt/domain/errors";
import { estimateSchema } from "@gt/domain/estimate";
import type { Job } from "@gt/domain/job";
import type { ResourceLane } from "@gt/domain/lane";
import type { Ending, MissingStep, Outputs, Producer, StepContext, StepOutcome } from "@gt/kernel/job-core";

// A CASTING ROUND'S WORDS AND NEW FACES (spark concept-casting-stages S4), as the steps of one kernel job on seat.text:
//
//   roles     one text turn proposes the concept's roles, and one turn per role writes its audition line.
//   audition  one text turn: one role's line.
//   round     `cards` (one turn: a card per new slot, when any lacks one), then `draw:<slot>` for each new slot, one Codex
//             still through the safety judge. A slot's failure is booked as that slot's: the job goes on.
//
// A retry is a new job naming only the failed slots, so what landed is never drawn again. Voices are their own job
// (production-voices), enqueued beside this one.

export const PRODUCTION_CAST = "production-cast";
/** The event carrying a casting job's request (subject: the job). */
export const CAST_REQUEST = "production.cast-requested";
export const ROLES_STEP = "roles";
export const AUDITION_STEP = "audition";
export const CARDS_STEP = "cards";
export const drawStep = (slot: number): string => `draw:${slot}`;

const id = z.string().min(1).max(200);
const words = z.string().min(1).max(4000);
const slot = z.number().int().min(1).max(5);

const estimates = z.object({ turn: estimateSchema, draw: estimateSchema }).strict();

const rolesSchema = z.object({ act: z.literal("roles"), productionId: id, logline: words, beats: z.array(words).max(40), by: id, estimates }).strict();
const auditionSchema = z.object({ act: z.literal("audition"), productionId: id, roleId: id, role: words, brief: words, logline: words, by: id, estimates }).strict();
const roundSchema = z
  .object({
    act: z.literal("round"),
    productionId: id,
    roundId: id,
    roleId: id,
    role: words,
    brief: words,
    logline: words,
    /** Slots the seat still owes a card; empty on a retry whose cards landed. */
    cardSlots: z.array(slot).max(5),
    /** Slots to draw: the new designs of this attempt. */
    drawSlots: z.array(slot).min(1).max(5),
    /** The concept's frames, for the look of the drawing: at most two (Codex takes 3 and the third stays free). */
    refs: z.array(blobRefSchema).max(2),
    by: id,
    estimates,
  })
  .strict();

export const castRequestSchema = z.discriminatedUnion("act", [rolesSchema, auditionSchema, roundSchema]);
export type CastRequest = Parsed<z.output<typeof castRequestSchema>>;
export type CastRolesRequest = Extract<CastRequest, { readonly act: "roles" }>;
export type CastAuditionRequest = Extract<CastRequest, { readonly act: "audition" }>;
export type CastRoundRequest = Extract<CastRequest, { readonly act: "round" }>;

export const parseCastRequest = (raw: unknown): Result<CastRequest> => parseAt("cast request", castRequestSchema, raw);

/** What is still missing, in order. Pure: the request and what the job has booked. */
export function castPlan(req: CastRequest, outputs: Outputs): MissingStep[] {
  const turn = req.estimates.turn;
  if (req.act === "roles") return outputs.has(ROLES_STEP) ? [] : [{ name: ROLES_STEP, estimate: turn }];
  if (req.act === "audition") return outputs.has(AUDITION_STEP) ? [] : [{ name: AUDITION_STEP, estimate: turn }];
  const steps: MissingStep[] = [];
  if (req.cardSlots.length > 0 && !outputs.has(CARDS_STEP)) steps.push({ name: CARDS_STEP, estimate: turn });
  for (const s of req.drawSlots) if (!outputs.has(drawStep(s))) steps.push({ name: drawStep(s), estimate: req.estimates.draw });
  return steps;
}

/** The world, bound by lib/producers/productionCast.ts. */
export type CastPorts = {
  readonly request: (job: Job) => Result<CastRequest>;
  readonly roles: (req: CastRolesRequest, ctx: StepContext) => Promise<StepOutcome>;
  readonly audition: (req: CastAuditionRequest, ctx: StepContext) => Promise<StepOutcome>;
  readonly cards: (req: CastRoundRequest, ctx: StepContext) => Promise<StepOutcome>;
  readonly draw: (req: CastRoundRequest, slot: number, ctx: StepContext) => Promise<StepOutcome>;
  /** A job that failed as a whole: every slot of its request still waiting says why. */
  readonly ended: (req: CastRequest, job: Job, ending: Ending) => Promise<void>;
};

export function defineProductionCast(lane: ResourceLane, ports: CastPorts): Producer {
  const known = new Map<string, Result<CastRequest>>();
  const requestOf = (job: Job): Result<CastRequest> => {
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
      return castPlan(req.value, outputs);
    },
    async perform(step, ctx) {
      const req = requestOf(ctx.job);
      if (!req.ok) return { kind: "fatal", code: req.error.code, message: req.error.message };
      if (step.name === ROLES_STEP && req.value.act === "roles") return ports.roles(req.value, ctx);
      if (step.name === AUDITION_STEP && req.value.act === "audition") return ports.audition(req.value, ctx);
      if (step.name === CARDS_STEP && req.value.act === "round") return ports.cards(req.value, ctx);
      const [kind, at] = step.name.split(":");
      if (kind === "draw" && req.value.act === "round") return ports.draw(req.value, Number(at), ctx);
      return { kind: "fatal", code: "internal", message: `a cast job has no step ${step.name}` };
    },
    async settle(job, ending) {
      const req = requestOf(job);
      if (!req.ok) throw new AppError(req.error.code, req.error.message);
      await ports.ended(req.value, job, ending);
    },
  };
}
