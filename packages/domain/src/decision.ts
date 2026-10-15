import { z } from "zod";

import { checkEditPlan, EDIT_DIRECTIVES, PICK_OUTCOMES, type EditPlan } from "./board.ts";
import type { Parsed } from "./door.ts";
import type { CandidateId, PacketId } from "./ids.ts";

// A DECISION: one changed verdict on one item of a packet (plan §2.2). This is
// a line of v1's append-only verdict log (lib/foundry/verdictLog.ts
// `VerdictLogLine`: rev, key, value, by, surface, at), not a mutable map
// entry — history outlives the media, and two tabs cannot overwrite a verdict
// one of them never saw, because every write names the revision it read.

// REASONS ARE THE SOURCE'S (./source.ts SOURCES). The record carries them as
// plain words, because a decision does not know its packet's source; the
// kernel's door checks them against it (checkVerdict) before any row is
// written. The first domain carried one `reason` from a fixed four; a store
// written then reads back as `reasons: [reason]` (kernel decision v2).

/**
 * `<packetId>::<candidateId>` — v1's Board key format (`<run>::<candidate id>`,
 * lib/board/sources/cull.ts), kept: candidate ids may carry slashes (they were
 * run-relative paths), packet ids never carry `::`, so the first `::` splits.
 */
export const decisionKeySchema = z.string().regex(/^(?:(?!::).)+::.+$/s, "a decision key is <packetId>::<candidateId>");

export function decisionKey(packet: PacketId, candidate: CandidateId): string {
  return `${packet}::${candidate}`;
}

export const decisionSchema = z
  .object({
    key: decisionKeySchema,
    /** `null` is "not judged yet" — an undecide (the Board's U) is a decision too. */
    verdict: z.enum(["keep", "reject"]).nullable(),
    /** The source's words for a reject, in its list's order; empty otherwise. */
    reasons: z.array(z.string().min(1)).max(11),
    /** The operator's note, where the source keeps one (SOURCES[source].noteMax). */
    note: z.string().min(1).max(2000).optional(),
    /** The packet's verdict revision this write produced. A write that changes
     *  nothing bumps nothing (v1), so every logged decision has rev >= 1. */
    rev: z.number().int().positive(),
    /** v1's `human | model`, in the ledger's actor words. Only an operator's
     *  keep promotes a style (v1 lib/foundry/store.ts `humanKeep`). */
    by: z.enum(["operator", "agent"]),
    /** Which surface wrote it: "board", "cli", "foundry". */
    surface: z.string().regex(/^[a-z][a-z0-9-]*$/),
    at: z.iso.datetime(),
  })
  .superRefine((d, ctx) => {
    // v1 wrote reasons only on a reject (lib/board/verdicts.ts withCullVerdict).
    if (d.reasons.length > 0 && d.verdict !== "reject")
      ctx.addIssue({ code: "custom", path: ["reasons"], message: "only a reject carries reasons" });
    if (d.note !== undefined && d.verdict === null)
      ctx.addIssue({ code: "custom", path: ["note"], message: "an undecided candidate carries no note" });
  });
/** As the door hands it out (`parseAt`): an absent note is an absent key. */
export type Decision = Parsed<z.output<typeof decisionSchema>>;

/* ── the two Board inputs a server receives, as doors ─────────────────────── */
// Each runs the check the client runs (./board.ts checkEditPlan), so the
// browser and the Server Action cannot disagree about what is valid.

export const pickOutcomeSchema = z.enum(PICK_OUTCOMES);

const editNoteSchema = z.object({ section: z.string(), directive: z.enum(EDIT_DIRECTIVES), text: z.string() });

/** An edit plan off the wire: shaped by zod, then held to ./board.ts checkEditPlan (trimmed, bounded, non-empty). */
export const editPlanSchema = z.array(editNoteSchema).transform((plan, ctx): EditPlan => {
  const checked = checkEditPlan(plan);
  if (checked.ok) return checked.value;
  ctx.addIssue({ code: "custom", message: checked.error.message });
  return z.NEVER;
});
