// A STYLE RECORD AS THE ATELIER IS HANDED IT (@gt/domain/styleView), read through the one
// ratchet (@gt/domain/style.ratchet) and nothing else: status, coverage, the lock gate's
// sentence and the references are the ratchet's functions applied once, here, on the server -
// the screen re-derives none of them (v1 recomputed `canLock` in SpecEditor and `sheetCoverage`
// in parts.tsx, and `useThemes.lock` then skipped the gate both drew).
//
// Pure: the record, its revision and its last write time in; the view out. The fixture side reads
// through it today; the real side (wave B, over the kernel's `styles` module) hands the same
// shape, so whichever lands the projector first, the other adopts it (asked of L48 / the Director).
import type { Style } from "@gt/domain/style";
import {
  LOCK_PROBLEMS,
  PROOF_CAP,
  PROVEN_KEEPS,
  isLegacySheet,
  keptCells,
  lockBlocker,
  problemOfTrial,
  sheetCoverage,
  statusOf,
  styleRefs,
} from "@gt/domain/style.ratchet";
import type { ProofLineage, StyleSummary, StyleView } from "@gt/domain/styleView";

import { wordsOf } from "./apply.ts";

/** One sentence: where the style stands, or what moves it next - the work's words, not the app's. */
export function whyOf(s: Style, blocker: string | null): string {
  const status = statusOf(s);
  if (status === "locked") return "locked — projects build on this block";
  // A proven style with no look is held by exactly the gate's first sentence: say it once.
  if (s.block === undefined) return status === "proven" ? (blocker ?? "no look yet") : `operator keeps in ${keptCells(s)} of ${PROVEN_KEEPS} cells`;
  if (blocker === null) return "the gate holds — it may lock";
  if (status === "candidate") return `operator keeps in ${keptCells(s)} of ${PROVEN_KEEPS} cells — approvals on trial problems count`;
  return blocker;
}

export function viewOf(s: Style, rev: number, updatedAt: string): StyleView {
  const cov = sheetCoverage(s);
  const blocker = lockBlocker(s);
  const status = statusOf(s);
  const lineage = (p: Style["proofs"][number]): ProofLineage => (cov.unknown.has(p.id) ? "unknown" : p.blockDigest === cov.digest ? "current" : "stale");
  const approved = s.proofs.filter((p) => p.state === "approved").length;
  const pending = s.proofs.filter((p) => p.state === "pending").length;
  const priced = s.proofs.filter((p) => p.costUsd !== undefined);
  return {
    id: s.id,
    rev,
    name: s.name,
    family: s.family,
    status,
    why: whyOf(s, blocker),
    origin: s.origin,
    ...(s.duplicatedFrom === undefined ? {} : { duplicatedFrom: s.duplicatedFrom }),
    ...(s.discipline === undefined ? {} : { discipline: s.discipline }),
    observables: wordsOf(s.observables),
    recipe: s.recipe,
    negative: s.negative,
    palette: s.block?.palette ?? s.palette ?? null,
    block: s.block ?? null,
    blockDigest: cov.digest,
    elements: s.elements,
    evidence: s.evidence.map((e) => ({ ...e, counts: e.verdict === "keep" && e.by === "operator" })),
    keptCells: keptCells(s),
    provenKeeps: PROVEN_KEEPS,
    exemplars: s.exemplars.map((x) => ({ ...x, abandoned: x.settled === "generation-failed" || x.settled === "no-usable-fix" })),
    proofs: s.proofs.map((p) => {
      const problem = problemOfTrial(p.trialId);
      const { promotedAt: _promoted, ...rest } = p;
      return { ...rest, lineage: lineage(p), ...(problem === undefined ? {} : { problem }) };
    }),
    coverage: [...cov.byProblem].map(([problem, c]) => ({ problem, trialIds: c.trialIds, approved: c.approved, rejected: c.rejected, covered: c.approved > 0 })),
    lockProblems: LOCK_PROBLEMS,
    lock: {
      can: status !== "locked" && blocker === null,
      blocker,
      legacySheet: isLegacySheet(s),
      ...(s.lock === undefined ? {} : { lockedAt: s.lock.at, lockedBy: s.lock.by }),
    },
    sheet: {
      approved,
      pending,
      rejected: s.proofs.length - approved - pending,
      cap: PROOF_CAP,
      full: approved - cov.stale.size >= PROOF_CAP,
      spend: { usd: Math.round(priced.reduce((a, p) => a + (p.costUsd ?? 0), 0) * 1000) / 1000, unpriced: s.proofs.length - priced.length },
    },
    refs: styleRefs(s),
    updatedAt,
  };
}

export function summaryOf(v: StyleView): StyleSummary {
  const cover = v.proofs.find((p) => p.state === "approved" && p.lineage === "current")?.media ?? v.exemplars[0]?.media ?? null;
  return {
    id: v.id,
    rev: v.rev,
    name: v.name,
    family: v.family,
    status: v.status,
    originKind: v.origin.kind,
    ...(v.discipline === undefined ? {} : { discipline: v.discipline }),
    palette: v.palette,
    cover,
    proofs: { approved: v.sheet.approved, pending: v.sheet.pending, rejected: v.sheet.rejected },
    keptCells: v.keptCells,
    lockBlocker: v.lock.blocker,
    updatedAt: v.updatedAt,
  };
}
