// The style atelier's pure readings over a StyleView (@gt/domain/styleView). Nothing here
// derives a gate: the view arrives with its status, coverage and lock blocker computed by the
// one ratchet on the server (v1 recomputed `canLock`/`sheetCoverage` in SpecEditor, parts.tsx
// and TrialMatrix.tsx, and `useThemes.lock` skipped the gate the views drew). These only
// arrange what the view says for drawing: which proof a trial column shows, which look a pip
// takes, where J/K land.
import type { ProofState, StyleProofView, StyleTrial } from "@gt/domain/styleView";

import type { Look } from "../status/status.ts";

/** A proof's verdict as a pip look. A stale approval no longer vouches for the block: idle. */
export function proofLook(p: Pick<StyleProofView, "state" | "lineage">): Look {
  if (p.state === "pending") return "awaiting";
  if (p.state === "rejected") return "failed";
  return p.lineage === "stale" ? "idle" : "done";
}

export const STATE_WORD: { readonly [S in ProofState]: string } = { pending: "undecided", approved: "approved", rejected: "rejected" };

/**
 * What a trial column draws: the newest proof of that trial under the CURRENT block, and the
 * counts beside it. A stale proof is counted apart (it answered the trial for a block that no
 * longer exists) and never stands as the column's face - the face is what the style does now.
 */
export type TrialColumn = {
  readonly trial: StyleTrial;
  readonly face: StyleProofView | null;
  readonly approved: number;
  readonly rejected: number;
  readonly pending: number;
  readonly stale: number;
};

export function trialColumns(trials: readonly StyleTrial[], proofs: readonly StyleProofView[]): readonly TrialColumn[] {
  return trials.map((trial) => {
    const mine = proofs.filter((p) => p.trialId === trial.id);
    const current = mine.filter((p) => p.lineage === "current");
    const newest = current.reduce<StyleProofView | null>((a, p) => (a === null || p.at > a.at || (p.at === a.at && p.id > a.id) ? p : a), null);
    return {
      trial,
      face: newest,
      approved: current.filter((p) => p.state === "approved").length,
      rejected: current.filter((p) => p.state === "rejected").length,
      pending: current.filter((p) => p.state === "pending").length,
      stale: mine.length - current.length,
    };
  });
}

/** The next proof id in sheet order, `dir` steps from `at`; the first when nothing is held. */
export function stepProof(ids: readonly string[], at: string | null, dir: 1 | -1): string | null {
  if (ids.length === 0) return null;
  const i = at === null ? -1 : ids.indexOf(at);
  if (i < 0) return dir === 1 ? (ids[0] ?? null) : (ids[ids.length - 1] ?? null);
  return ids[Math.min(ids.length - 1, Math.max(0, i + dir))] ?? null;
}

/** `$0.09 · 2 unpriced`: a sheet's spend as far as vendors said, the unknown counted, never zeroed. */
export function spendWords(spend: { readonly usd: number; readonly unpriced: number }): string {
  const usd = `$${spend.usd.toFixed(2)}`;
  return spend.unpriced > 0 ? `${usd} · ${spend.unpriced} unpriced` : usd;
}
