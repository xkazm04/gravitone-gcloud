import { z } from "zod";

import { parseAt } from "./door.ts";
import type { Result } from "./errors.ts";
import {
  DRAW_SIZES,
  LAB_MAX,
  LAB_METRICS,
  MATCH_OUTCOMES,
  type Draw,
  type LabDecision,
  type LabSay,
  type LabTurn,
} from "./audio.yue2.lab.ts";
import { YUE2_COT, YUE2_POST_STAGES } from "./audio.yue2.ts";

// THE SONG LAB'S S2 DOORS (spark yue2-song-lab): a draw version, the owner's direction, the agent's
// turn, a keep/drop. The zod-free names are ./audio.yue2.lab.ts. A turn whose envelope does not read
// is refused whole; a single bad proposal is the relay's to drop and name (lib/yue2/labRelay.ts), so
// the proposal schema is exported on its own.

const words = (max: number) => z.string().trim().min(1).max(max);
const id = z.string().min(1).max(80);
const turnId = z.string().regex(/^[a-z0-9][a-z0-9-]{2,63}$/);
const session = z.string().regex(/^[a-z0-9][a-z0-9-]{2,47}$/);
const at = z.string().min(10).max(40);

export const labRuleSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("exclude"), metric: z.enum(LAB_METRICS), op: z.enum(["gt", "lt"]), value: z.number().finite() }),
  z.strictObject({
    kind: z.literal("only"),
    condition: z.strictObject({ cot: z.enum(YUE2_COT).optional(), cfg: z.number().min(0.5).max(4).optional(), adapter: words(120).optional() }),
  }),
  z.strictObject({ kind: z.literal("seed-by"), metric: z.enum(LAB_METRICS) }),
  z.strictObject({ kind: z.literal("size"), size: z.union([z.literal(DRAW_SIZES[0]), z.literal(DRAW_SIZES[1])]) }),
]);

const field = z.union([z.literal("main"), z.string().regex(/^post:[A-Za-z0-9_-]{1,80}$/)]);

export const drawSchema = z
  .strictObject({
    drawId: z.string().regex(/^[0-9a-f]{12}$/),
    version: z.number().int().min(1),
    field,
    size: z.union([z.literal(DRAW_SIZES[0]), z.literal(DRAW_SIZES[1])]),
    entrants: z.array(z.strictObject({ takeId: id, seed: z.number().int().min(1).max(16) })).max(16),
    rules: z.array(labRuleSchema).max(12),
    cut: z.array(id).max(64).optional(),
  })
  .refine((d) => d.entrants.length <= d.size, { message: "a draw holds at most `size` entrants" })
  .refine((d) => new Set(d.entrants.map((e) => e.seed)).size === d.entrants.length, { message: "seeds are unique" });

export function parseDraw(input: unknown): Result<Draw> {
  return parseAt("ab-draw", drawSchema, input) as Result<Draw>;
}

export const labSaySchema = z.strictObject({ session, turnId, text: words(LAB_MAX.direction), at });

export function parseLabSay(input: unknown): Result<LabSay> {
  return parseAt("lab-say", labSaySchema, input) as Result<LabSay>;
}

const label = words(LAB_MAX.item);
export const labProposalSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    id: turnId,
    kind: z.literal("rule"),
    label,
    why: label,
    rule: z.strictObject({ drawId: z.string().regex(/^[0-9a-f]{12}$/), rules: z.array(labRuleSchema).max(12) }),
  }),
  z.strictObject({
    id: turnId,
    kind: z.literal("launch"),
    label,
    why: label,
    launch: z.strictObject({
      style: words(1000),
      lyrics: z.string().min(1).max(12000),
      seeds: z.array(z.number().int().min(0).max(2 ** 31 - 1)).min(1).max(16),
      cot: z.enum(YUE2_COT),
      cfg: z.number().min(0.5).max(4).optional(),
      adapter: words(120).optional(),
      adapterStrength: z.number().min(0).max(2).optional(),
    }),
  }),
  z.strictObject({
    id: turnId,
    kind: z.literal("post"),
    label,
    why: label,
    post: z.strictObject({ takeIds: z.array(id).min(1).max(8), stages: z.array(z.enum(YUE2_POST_STAGES)).min(1).max(YUE2_POST_STAGES.length), referenceTakeId: id.optional() }),
  }),
]);

/** The envelope; `proposals` are read one by one by the relay (a bad one is dropped and named). */
export const labTurnEnvelopeSchema = z.strictObject({
  session,
  turnId,
  answers: turnId.optional(),
  line: words(LAB_MAX.line),
  ran: z.array(words(LAB_MAX.item)).max(LAB_MAX.ran),
  learned: z.array(words(LAB_MAX.item)).max(LAB_MAX.learned),
  proposals: z.array(z.unknown()).max(LAB_MAX.proposals),
  at,
});

/** A stored turn (every proposal already read). */
export const labTurnSchema = labTurnEnvelopeSchema.extend({ proposals: z.array(labProposalSchema).max(LAB_MAX.proposals) });

export function parseLabTurn(input: unknown): Result<LabTurn> {
  return parseAt("lab-turn", labTurnSchema, input) as Result<LabTurn>;
}

export const labDecisionSchema = z.strictObject({ turnId, proposalId: turnId, started: words(120).optional() });

export function parseLabDecision(input: unknown): Result<LabDecision> {
  return parseAt("lab-decision", labDecisionSchema, input) as Result<LabDecision>;
}

export const MATCH_OUTCOME_SET: ReadonlySet<string> = new Set(MATCH_OUTCOMES);
