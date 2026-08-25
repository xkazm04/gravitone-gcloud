// STEP 2 (Script) — the nouns of notebook → candidate renders.
//
// Script-owned on purpose. A beat, a craft check and a declared deviation are
// things only this step produces and only this step reads; the notebook it is
// written from is the shared contract (_shared/notebook/types.ts).

import type { Connector } from "../_shared/notebook/types";

export type BeatKind =
  | "hook"
  | "question"
  | "answer"
  | "promise"
  | "movement"
  | "turn"
  | "candidate"
  | "steelman"
  | "verdict"
  | "close";

export interface Beat {
  at: string;
  kind: BeatKind;
  /** The connector to the PREVIOUS beat. "AND THEN" is a defect, drawn as one. */
  connector: Connector;
  label: string;
  text: string;
  device?: string;
}

export type CheckState = "pass" | "declared" | "fail" | "unmeasured";

export interface CheckRow {
  label: string;
  state: CheckState;
  detail: string;
}

/** A fact the render deliberately left out, and why. The notebook records the
 *  confidence; only the render knows it acted on it. */
export interface CutFact {
  factId: string;
  why: string;
}

export interface ScriptRender {
  /** THE FORM DISCRIMINANT. An explainer pays every debt it opens; a trailer's
   *  whole product is a debt another artifact pays. They are different objects
   *  with disjoint beat vocabularies, and a checker written for one must not be
   *  able to report `pass` over the other — so the tag is required on both sides
   *  and `NarrativeCut` below narrows on it. The trailer half is
   *  `./trailer/types.ts` → `TrailerCut`. */
  form: "explainer";
  id: string;
  engine: string;
  engineLabel: string;
  /** What the viewer gets out of this shape (ENGINES.md § viewer's pleasure). */
  pleasure: string;
  title: string;
  template: string;
  durationS: number;
  words: number;
  wordBudget: number;
  wpm: number;
  turns: number | null;
  turnBand: [number, number] | null;
  questionsAloud: number;
  promiseForm: string;
  /** Set on the derived short — this render is scoped out of another one. */
  derivedFromId?: string;
  derivedFromBeat?: string;
  feelsLike: string;
  bestFor: string;
  weakness: string;
  beats: Beat[];
  checks: CheckRow[];
  /** Declared deviations from the library's bands. Flagged, never hidden. */
  deviations: string[];
  cutFacts: CutFact[];
  /** null when the corpus cannot measure it (e.g. ASR without punctuation). */
  causalDensityPct: number | null;
}

/** A render is one form or the other. Written here rather than in the trailer
 *  file so both halves of the union are reachable from the step's own nouns. */
export type NarrativeCut = ScriptRender | import("./trailer/types").TrailerCut;

export type { Connector };
