// SHEET COVERAGE — what a style's approvals actually vouch for.
//
// A proof used to be a picture and a verdict. It did not say which trial
// problem it answered or which version of the block rendered it, so a style
// could be ratified on one picture of one problem, and approvals rendered under
// a block the user had since rewritten kept counting (and kept being sent as
// references). This module derives, from the lineage a Proof now carries
// (`trialId`, `blockDigest`), the one reading the lock gate, the references
// window and the sheet all share.
//
// Pure, and type-only against ../themes on purpose: themes.ts imports this
// file at runtime, so a runtime edge back would be a cycle.

import { TRIALS, trialById } from "@/lib/library/trials";
import { compileStyleBlock } from "../stylePrompt";
import type { Proof, StyleBlock, Theme } from "../themes";

/** How many DISTINCT trial problems a style must be approved on, under its
 *  current block, before it may lock. Five problems exist (trials.ts); three is
 *  the proposed bar — enough that no style locks by being good at one thing,
 *  few enough that one rejected problem does not dead-end a sheet. Declared once
 *  so the gate, the blocker sentence and the sheet's pips cannot drift apart. */
export const LOCK_PROBLEMS = 3;

/** The distinct problems the trial set probes, in trial order. */
export const TRIAL_PROBLEMS: string[] = [...new Set(TRIALS.map((t) => t.problem))];

/** A stable short hash of the style half of the compiled prompt — the part
 *  every frame restates in full (stylePrompt.ts). Two blocks that compile to
 *  the same words digest the same; any edit to a slot that reaches the prompt
 *  changes it. FNV-1a, 32-bit: this is an identity check, not security. */
export function blockDigest(block: StyleBlock): string {
  const s = compileStyleBlock(block);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** The problem a proof answered, or undefined for a free subject (no trialId)
 *  or an id the trial set no longer knows. Absence, never a guess. */
export const problemOf = (p: Pick<Proof, "trialId">): string | undefined =>
  p.trialId ? trialById.get(p.trialId)?.problem : undefined;

export interface SheetCoverage {
  /** Per trial problem: verdicts rendered under the CURRENT block. */
  byProblem: Record<string, { approved: number; rejected: number }>;
  /** Approved under another block than the current one. */
  stale: Proof[];
  /** Proofs that predate lineage (no digest). Listed, never guessed about. */
  unknownLineage: Proof[];
}

export function sheetCoverage(t: Pick<Theme, "block" | "proofs">): SheetCoverage {
  // Lazy: a sheet with no lineage never needs the block compiled, so the
  // legacy path stays as cheap and as tolerant as it was.
  let digest: string | undefined;
  const byProblem: SheetCoverage["byProblem"] = {};
  for (const problem of TRIAL_PROBLEMS) byProblem[problem] = { approved: 0, rejected: 0 };
  const stale: Proof[] = [];
  const unknownLineage: Proof[] = [];
  for (const p of t.proofs) {
    if (!p.blockDigest) {
      unknownLineage.push(p);
      continue;
    }
    if (p.blockDigest !== (digest ??= blockDigest(t.block))) {
      if (p.state === "approved") stale.push(p);
      continue;
    }
    const problem = problemOf(p);
    if (!problem || !byProblem[problem]) continue;
    if (p.state === "approved") byProblem[problem].approved++;
    else if (p.state === "rejected") byProblem[problem].rejected++;
  }
  return { byProblem, stale, unknownLineage };
}

/** THE GRANDFATHER RULE, declared. A sheet in which EVERY proof predates
 *  lineage was judged under the old gate (one approval, nothing pending) and
 *  keeps it — otherwise the change would strand every unlocked sheet in the
 *  field with approvals that can never gain a problem. The moment one proof
 *  with lineage joins the sheet, the sheet is on the coverage gate and legacy
 *  proofs stop counting toward it (they remain references). Locked themes are
 *  never re-gated at all (themes.ts `canLock`). */
export const isLegacySheet = (t: Pick<Theme, "proofs">): boolean =>
  t.proofs.length > 0 && t.proofs.every((p) => !p.blockDigest);

/** Distinct problems approved under the current block. */
export function problemsCovered(t: Pick<Theme, "block" | "proofs">): number {
  return Object.values(sheetCoverage(t).byProblem).filter((c) => c.approved > 0).length;
}

/** The problems with no current approval — what the blocker names. */
export function missingProblems(t: Pick<Theme, "block" | "proofs">): string[] {
  const { byProblem } = sheetCoverage(t);
  return TRIAL_PROBLEMS.filter((p) => byProblem[p].approved === 0);
}
