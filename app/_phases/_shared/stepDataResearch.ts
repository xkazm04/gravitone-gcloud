// THE RESEARCH STEP'S RECORD SHAPES, and GuidedModeStepData, which the Research
// and Script steps both persist.
//
// Types only. Split out of the stepStore.ts door so the shapes sit apart from the
// IndexedDB read/write path. stepStore.ts re-exports every name here, so importers
// keep using the door.

export interface ResearchStepData {
  topic: string;
  researched: boolean;
  savedAt?: number;
}

/** THE NOTEBOOK A REAL RUN PRODUCED, under phase key `"research-notebook"`.
 *
 *  Its own record, and its own key, for the cadence reason every type in this
 *  file gives — but here there is a second and stronger reason. `ResearchStepData`
 *  above is the SIMULATED path's record: `researched: true` there means "this
 *  project shows the saved 2026-08-11 Bitcoin run", which is what the seed writes
 *  and what four harness scripts drive. Folding a real notebook into that boolean
 *  would make the one bit downstream reads mean two different things — a replayed
 *  fixture and a creator's own reasoned notebook — which is the exact
 *  indistinguishability app/_phases/research/guided/RunStage.tsx's `StandInNote`
 *  exists to prevent.
 *
 *  So the two paths write two records, and WHICH RECORD A NOTEBOOK CAME FROM IS
 *  ITS PROVENANCE. A reader that finds this key knows the notebook was reasoned
 *  by an engine for `topic`; a reader that finds only `research` knows it is the
 *  replay. Nothing has to be inferred from content.
 *
 *  `engine` is the run's receipt (`/api/research`'s `engine` block), kept ON the
 *  record rather than beside it so that what a notebook cost, which rung served
 *  it, and — the field no other receipt in this app has — whether the engine
 *  could search, all survive the reload with the work they describe.
 *
 *  `notebook: null` is the CLEARED state and is distinct from no record at all:
 *  the creator discarded a notebook here, and re-adopting one on the next mount
 *  would silently undo their clear.
 *
 *  Typed loosely on purpose. `Notebook` lives in `_shared/notebook/types.ts` and
 *  importing it here would put the whole fixture-adjacent type graph into every
 *  module that touches the step store, including five that never see a notebook.
 *  The one consumer (`research/run/live.ts`) casts at its own boundary, which is
 *  also the boundary where `lib/notebook/validate.ts` has already checked it. */
export interface ResearchNotebookStepData {
  /** The topic as the creator typed it — the authority on what was asked. */
  topic: string;
  /** A validated notebook, or `null` for "cleared here". */
  notebook: unknown | null;
  /** The run's receipt, or `null` alongside a cleared notebook. */
  engine: unknown | null;
  /** The last research TURN this record took (landed, or found to have nothing
   *  to land). The real run is a server-owned turn since AIO-A stage 4b, and a
   *  mount lands a settled one it has not taken — so this is what makes
   *  "written once per turn" survive a reload, and what keeps a Clear from
   *  being undone by a turn that was already taken. Absent on every record
   *  written before the turn existed. */
  turn?: string;
  savedAt?: number;
}

/** The creator's scoping decisions, kept under their own phase key.
 *
 *  Separate from ResearchStepData on purpose: the two are written by different
 *  components on different cadences, and sharing one record would have them
 *  overwrite each other's field on every save. */
export interface ScopeStepData {
  scope: Record<string, { descoped: boolean; liked: boolean; deepen: boolean }>;
  confirmed: Record<string, { descoped: boolean; liked: boolean; deepen: boolean }> | null;
  /** The `digest` of the NotebookSource these decisions were made on
   *  (_shared/notebook/source.ts), stamped on every save since
   *  research-scope-board-A stage 3. A scope is a set of verdicts on card ids,
   *  and two notebooks can share an id while meaning different cards — so a
   *  scope whose digest is not the dealt source's is ORPHANED and applies
   *  nothing (research/useScope.ts). Absent on every record written before the
   *  stamp, and every one of those was written against the fixture: absent
   *  means the fixture's digest. */
  digest?: string;
  savedAt?: number;
}

/** The beat-variant picks of a trailer / free project's Research step, under
 *  phase key `"research-beats"`.
 *
 *  A separate key from `research` and `research-scope` for the same cadence
 *  reason ScopeStepData gives: the beat board writes on every tile click, the
 *  research record is written by whichever surface owns `researched`, and one
 *  record shared between them would have each save erase the other's field.
 *
 *  `picks` is slot id → chosen variant id, `null` for a slot the creator has
 *  deliberately cleared (absent means never touched). `confirmed` is the frozen
 *  spine — Script opens on THIS, never on the live picks. `mode` is the free
 *  discipline's answer to "facts or beats"; trailer projects store `"beats"`. */
export interface BeatPicksStepData {
  mode: "facts" | "beats";
  picks: Record<string, string | null>;
  confirmed: Record<string, string> | null;
  savedAt?: number;
}

/** Which face of a step the creator works in — the guided card wizard or the
 *  full expert surface — under phase keys `"research-mode"` and `"script-mode"`.
 *
 *  Its own record per step for the cadence reason above, and its own TYPE
 *  because the mode must never ride along with a step's decisions: switching
 *  faces discards nothing (the ModeChooser doctrine), so the record that says
 *  "guided" cannot be the record that holds what was decided there. Absent
 *  means never chosen — surfaces default to guided only while the step has no
 *  prior decisions, and that default is computed, never stored. */
export interface GuidedModeStepData {
  mode: "guided" | "expert";
  savedAt?: number;
}
