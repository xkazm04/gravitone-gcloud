// REVISIONS — what a returned follow-up does to the notebook, as data.
//
// A follow-up returns typed `Effect`s (followup.ts). Until now nothing could
// land one: the notebook is a static module shared by every project, so
// `standingOf` could only say "not applied". A revision is the missing record:
// the effects of one returned request, the creator's per-effect decision, and a
// PURE function that lays the applied ones over the project's base notebook.
//
//     active notebook = applyRevisions(base, revisions)
//
// The base is never mutated and never stored twice. Undo is therefore not a
// reverse operation but a re-derivation without the revision (`undoRevision`),
// which is why it cannot leave a half-undone notebook behind.
//
// STAGE 1 ONLY: this file is the pure derivation. Persistence (stepStore key
// `research-revisions`), the Apply/Reject controls, the real `follow-up` turn
// class and `parseEffects` are later stages. Swapping the active notebook for
// the revised one also changes its digest, which orphans the stored scope
// (the digest is the scope's key) - a call that is not this file's to make.
//
// WHAT EACH KIND DOES, and what it deliberately does not:
//   · adds-fact         inserts a `Fact`. No-op if the id already exists, which is
//                       what makes applying the same revision twice idempotent.
//   · kills             removes the fact and writes a tombstone to `killed[]`.
//                       References to it are NOT scrubbed: the cards that rested on
//                       it must be reported as wounded, naming it (scope.ts).
//   · downgrades        steps `confidence` down ONE rung (high > medium > low) and
//                       sets `confidenceNote`. The effect carries no target level,
//                       so one rung is the only claim it can honestly make.
//   · resolves-unknown  sets `resolvedBy`. The unknown is kept (types.ts::Unknown).
//   · confirms          changes nothing; it is reported, not written.
// An effect whose target id is not in the notebook is reported `no such id here`
// and writes nothing - the same words standingOf uses for the same condition.

import type { Effect } from "@/lib/research/followup";
import type { Confidence, Fact, Notebook, Unknown } from "@/lib/notebook/types";

export type EffectDecision = "applied" | "rejected";

export interface NotebookRevision {
  id: string;
  /** The follow-up request this revision came back from. */
  requestId: string;
  effects: Effect[];
  /** Per-effect decision, keyed by effect index. An index with no entry is
   *  PENDING and lands nothing: a returned effect never applies itself. */
  decided: Record<number, EffectDecision>;
  /** ISO timestamp. Also the `asOf` of any fact the revision adds, which keeps
   *  `applyRevisions` a function of its inputs alone (no clock read). */
  at: string;
}

export type LandingState =
  | "landed" // changed the notebook
  | "already-there" // the notebook already carries it; nothing to write
  | "no-change" // a confirmation: valid, writes nothing
  | "no such id here" // names an id this notebook does not have
  | "pending"
  | "rejected";

export interface Landing {
  revisionId: string;
  effectIndex: number;
  state: LandingState;
}

const RUNG_DOWN: Record<Confidence, Confidence> = { high: "medium", medium: "low", low: "low" };

export function decide(rev: NotebookRevision, effectIndex: number, d: EffectDecision): NotebookRevision {
  return { ...rev, decided: { ...rev.decided, [effectIndex]: d } };
}

/** Drop a revision. The notebook is re-derived from what remains, so the digest
 *  and every card count return to what they were before it was applied. */
export function undoRevision(revs: readonly NotebookRevision[], revisionId: string): NotebookRevision[] {
  return revs.filter((r) => r.id !== revisionId);
}

/** `applyRevisions` plus what became of every effect - the reason an effect
 *  that could not land is visible rather than silently dropped. */
export function reviseNotebook(
  base: Notebook,
  revs: readonly NotebookRevision[],
): { notebook: Notebook; landings: Landing[] } {
  let facts = base.facts;
  let unknowns = base.unknowns;
  let killed = base.killed ?? [];
  let changed = false;
  const landings: Landing[] = [];
  const seen = new Set<string>();

  for (const rev of revs) {
    // The same revision listed twice is one revision. Without this a downgrade
    // would step down a rung per listing.
    if (seen.has(rev.id)) continue;
    seen.add(rev.id);

    rev.effects.forEach((e, i) => {
      const note = (state: LandingState) => landings.push({ revisionId: rev.id, effectIndex: i, state });
      const d = rev.decided[i];
      if (d === undefined) return note("pending");
      if (d === "rejected") return note("rejected");

      switch (e.kind) {
        case "adds-fact": {
          if (facts.some((f) => f.id === e.factId)) return note("already-there");
          const fact: Fact = {
            id: e.factId,
            claim: e.claim,
            loadBearing: false,
            source: e.source,
            // A follow-up names its source as a string and says nothing of its
            // class, so the class is the conservative one: the ladder demotes an
            // aggregator, and an invented "primary" would promote a claim nobody
            // checked.
            sources: [{ name: e.source, evidenceClass: "aggregator" }],
            confidence: e.confidence,
            confidenceNote: e.note,
            asOf: rev.at.slice(0, 10),
            note: e.note,
          };
          facts = [...facts, fact];
          changed = true;
          return note("landed");
        }
        case "kills": {
          const f = facts.find((x) => x.id === e.targetId);
          if (!f) return note(killed.some((k) => k.id === e.targetId) ? "already-there" : "no such id here");
          facts = facts.filter((x) => x.id !== e.targetId);
          killed = [...killed, { id: f.id, claim: f.claim, note: e.note, revisionId: rev.id }];
          changed = true;
          return note("landed");
        }
        case "downgrades": {
          const f = facts.find((x) => x.id === e.targetId);
          if (!f) return note("no such id here");
          if (f.confidenceNote === e.note) return note("already-there");
          const next: Fact = { ...f, confidence: RUNG_DOWN[f.confidence], confidenceNote: e.note };
          facts = facts.map((x) => (x.id === f.id ? next : x));
          changed = true;
          return note("landed");
        }
        case "resolves-unknown": {
          const u = unknowns.find((x) => x.id === e.targetId);
          if (!u) return note("no such id here");
          if (u.resolvedBy) return note("already-there");
          const next: Unknown = { ...u, resolvedBy: e.note };
          unknowns = unknowns.map((x) => (x.id === u.id ? next : x));
          changed = true;
          return note("landed");
        }
        case "confirms":
          return note(facts.some((f) => f.id === e.targetId) ? "no-change" : "no such id here");
      }
    });
  }

  // Nothing landed: hand back the base itself, so a memo keyed on it (and the
  // digest) cannot tell the difference from "no revisions at all".
  if (!changed) return { notebook: base, landings };
  return { notebook: { ...base, facts, unknowns, ...(killed.length ? { killed } : {}) }, landings };
}

/** The notebook with every APPLIED effect laid over `base`. Pure. */
export function applyRevisions(base: Notebook, revs: readonly NotebookRevision[]): Notebook {
  return reviseNotebook(base, revs).notebook;
}
