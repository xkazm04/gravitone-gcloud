import { z } from "zod";

import type { CandidateId, PacketId } from "./ids.ts";

// A DECISION: one changed verdict on one item of a packet (plan §2.2). This is
// a line of v1's append-only verdict log (lib/foundry/verdictLog.ts
// `VerdictLogLine`: rev, key, value, by, surface, at), not a mutable map
// entry — history outlives the media, and two tabs cannot overwrite a verdict
// one of them never saw, because every write names the revision it read.

/** The Board's four reject axes, bound to keys 1–4 in the order the matrix
 *  cull draws them (prototype index.html `REASONS`). v1's forge cull used the
 *  first two (lib/board/sources/cull.ts `reasonAxes`). */
export const REJECT_REASONS = ["style", "subject", "motion", "text"] as const;
export const rejectReasonSchema = z.enum(REJECT_REASONS);
export type RejectReason = z.output<typeof rejectReasonSchema>;

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
    reason: rejectReasonSchema.optional(),
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
    if (d.reason !== undefined && d.verdict !== "reject")
      ctx.addIssue({ code: "custom", path: ["reason"], message: "only a reject carries a reason" });
  });
export type Decision = z.output<typeof decisionSchema>;
