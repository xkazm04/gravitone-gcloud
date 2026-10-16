import { z } from "zod";
import { parseAt } from "@gt/domain/door";
import { err, ok, type Result } from "@gt/domain/errors";

// A RESEARCH FOLLOW-UP AS A REAL TURN (Phase 4 wave C, L37). v1's follow-ups were a 700 ms
// canned answer (app/_phases/research/followup.ts `resultFor`: two transcribed results and
// `undefined` for everything else). The answer's shape is v1's `FollowUpResult` - a summary, the
// EFFECTS the board knows (confirms, downgrades, kills, resolves-unknown, adds-fact), sources and
// a verdict - and it passes an ALLOWLIST door before it can become a revision: an effect naming an
// id the notebook does not hold, or "adding" a fact id it already has, refuses the whole answer
// with the ids named, never a partial apply (structured-output: op-grammar-allowlisting,
// schema-validation-and-repair: missing values never arrive as confident defaults).

/** The notebook as the turn reads it: ids, claims and the unknowns' questions (lib/notebook/types). */
export type FollowUpNotebook = {
  readonly topic: string;
  readonly facts: readonly { readonly id: string; readonly claim: string; readonly confidence: string }[];
  readonly unknowns: readonly { readonly id: string; readonly what: string }[];
};

const effectSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.enum(["confirms", "downgrades", "kills", "resolves-unknown"]), targetId: z.string().min(1), note: z.string().min(1) }),
  z.object({ kind: z.literal("adds-fact"), factId: z.string().min(1), claim: z.string().min(1), confidence: z.enum(["high", "medium", "low"]), source: z.string().min(1), note: z.string().optional() }),
]);
const followUpSchema = z.object({ summary: z.string().min(1), effects: z.array(effectSchema), sources: z.array(z.string()), verdict: z.enum(["strengthened", "weakened", "resolved", "inconclusive"]) });
export type FollowUpAnswer = z.output<typeof followUpSchema>;

/** The schema handed to the engine (enforced on a cloud rung, appended on a local one). */
export const followUpJsonSchema = (): Record<string, unknown> => z.toJSONSchema(followUpSchema);

export function followUpPrompt(nb: FollowUpNotebook, q: { prompt: string; cardId?: string }): string {
  return [
    "You are revising a research notebook with ONE follow-up. Answer with ONE JSON object and nothing else.",
    "Effects you may return: confirms | downgrades | kills (a fact id) · resolves-unknown (an unknown id) · adds-fact (a NEW fact id, its claim, confidence and source).",
    "A follow-up that only confirms is the suspicious kind: say what weakened, what you could not find, and give verdict `inconclusive` when nothing moved.",
    "",
    "## THE FOLLOW-UP",
    JSON.stringify(q),
    "",
    "## FACTS (id, claim, confidence)",
    JSON.stringify(nb.facts.map((f) => ({ id: f.id, claim: f.claim, confidence: f.confidence }))),
    "",
    "## UNKNOWNS (id, what)",
    JSON.stringify(nb.unknowns.map((u) => ({ id: u.id, what: u.what }))),
    "",
    "## TOPIC",
    nb.topic,
  ].join("\n");
}

/** The answer through its door: shape, then every id against the notebook it revises. */
export function parseFollowUp(raw: unknown, nb: FollowUpNotebook): Result<FollowUpAnswer> {
  const p = parseAt("follow-up answer", followUpSchema, raw);
  if (!p.ok) return p;
  const facts = new Set(nb.facts.map((f) => f.id));
  const unknowns = new Set(nb.unknowns.map((u) => u.id));
  const stray = p.value.effects.flatMap((e) => (e.kind === "adds-fact" ? (facts.has(e.factId) ? [`${e.factId} already exists`] : []) : (e.kind === "resolves-unknown" ? unknowns : facts).has(e.targetId) ? [] : [`${e.targetId} is not in this notebook`]));
  if (stray.length > 0) return err("invalid", `The engine returned effects this notebook cannot hold (${stray.join("; ")}). Nothing was changed.`);
  return ok({ ...p.value, effects: p.value.effects.map((e) => (e.kind === "adds-fact" ? { kind: e.kind, factId: e.factId, claim: e.claim, confidence: e.confidence, source: e.source, ...(e.note === undefined ? {} : { note: e.note }) } : e)) });
}
