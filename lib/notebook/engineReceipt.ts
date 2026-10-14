// The receipt a research run saves beside its notebook. A plain interface, kept
// out of the React store (research/run/live.ts re-exports it) so the notebook,
// script and trailer modules can name it without pulling the store in.

import type { SourceReceipt } from "@/lib/text/types";

/**
 * What the run cost and who did it — the `engine` block /api/research returns.
 *
 * Structurally the same receipt /api/recalibrate hands `useVersions`, plus one
 * field neither of the other two reasoning routes has: `searched`. It is `false`
 * on every run this engine can make today, and it is on the RECEIPT rather than
 * in a comment because the receipt is what gets saved — a notebook read back in
 * six months still says that nothing in it was looked up.
 */
export interface EngineReceipt {
  kind: "local-claude-code" | "cloud-api";
  provider: string;
  model: string;
  rung: string;
  transport: string;
  schemaEnforcement: string;
  sessionId?: string;
  /** USD for the turn. `undefined` means UNPRICED, never free. */
  costUsd?: number;
  costBasis: "vendor-reported" | "estimated" | "unpriced";
  durationMs: number;
  promptChars: number;
  /** Did the engine fetch anything? `false` on every reasoned run. On the
   *  retrieval rung (TEXT_RETRIEVE, research-run-engine-B) it is DERIVED by the
   *  route from `sources` — `sources.length > 0` — never set by hand. */
  searched: boolean;
  /** Retrieval runs only: one receipt per page the engine fetched. Absent on a
   *  reasoned run, which fetched nothing and has nothing to show. */
  sources?: SourceReceipt[];
  /** Retrieval runs only: one line per fact the cross-check downgraded
   *  ("cited, not fetched"). */
  crossCheck?: string[];
}
