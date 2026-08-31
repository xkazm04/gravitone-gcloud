import type { SettleReason } from "./extract/types";

// THE FOUNDRY WIRE TYPES — shared by the disk layer (lib/foundry/store.ts,
// server only) and the /foundry page (client). Nothing here imports Node.
//
// The shapes mirror what pipeline/foundry/forge.py writes into
// foundry-out/runs/<id>/run.json. Python owns the manifest; this file is the
// TypeScript reading of it, and a field added on one side without the other is
// how the page ends up rendering `undefined` as a score.

export type CandidateStatus = "pending" | "generated" | "graded" | "unmeasured" | "failed";

export interface StyleReadback {
  has_text: boolean;
  render_mode: string;
  palette_strategy: string;
  edge_treatment: string;
  black_handling: string;
  dominant_colours: string[];
  depiction: string;
}

export interface Grade {
  grader: string;
  at: string;
  /** Craft fidelity against the source frame's annotation. Null = unmeasured. */
  craft: { score: number | null; per_field: Record<string, number>; annotation: Record<string, unknown> } | null;
  /** Style adherence against the target style's observables. Null = unmeasured. */
  style: { score: number | null; per_field: Record<string, number>; readback: StyleReadback } | null;
  veto: { has_text: boolean } | null;
  /** What could not be measured, and why. Non-empty means the grade is partial. */
  unmeasured: string[];
}

export interface Candidate {
  /** `<scene>/<style>--<mechanism>--s<seed>` — unique within a run. */
  id: string;
  scene: string;
  style: string;
  mechanism: string;
  seed: number;
  /** Run-relative path of the PNG. */
  file: string;
  sidecar: string;
  status: CandidateStatus;
  grade: Grade | null;
  error: string | null;
  prompt?: string;
  timings?: Record<string, number>;
  /** Set by a commit: the file is gone, the record stays. */
  deleted?: boolean;
}

export interface Scene {
  id: string;
  frame: string;
  note: string;
  /** Run-relative path of the letterbox-cropped source frame. */
  source: string;
  annotation: Record<string, unknown> | null;
  annotation_from: string | null;
}

export interface Evidence {
  run: string;
  scene: string;
  mechanism: string;
  verdict: Verdict;
  at: string;
}

/** A file that shows what a style looks like, outside the forge's ledger.
 *  `kind` names which output root the run lives under (see store.ts). */
export interface Exemplar {
  kind: "extract";
  run: string;
  /** Run-relative path. */
  file: string;
  /** What this exemplar is: a source the style was read from, a replica the
   *  recipe produced, or a transfer onto a scene the sources never showed. */
  role: "source" | "replica" | "transfer";
  /** For a `replica`: why its critique loop stopped. Absent on sources and
   *  transfers, and absent on rows written before this field existed.
   *
   *  A replica whose loop was ABANDONED (`no-usable-fix`, `generation-failed`)
   *  is not evidence that the recipe produces the style — the loop stopped
   *  because it could not say what to change, not because it arrived. It is
   *  kept rather than dropped, because a near miss is still material and
   *  dropping it would be a second silent decision; but anything conditioning
   *  on exemplars can now tell the two apart, which it could not before. */
  settled?: SettleReason;
}

export interface StyleDef {
  id: string;
  name: string;
  family: string;
  status: "candidate" | "proven";
  /** `extracted` — read off a gallery by the Extract module (lib/foundry/extract),
   *  replicated and transferred, and kept by a human in the /foundry cull. */
  origin: { kind: "readback" | "authored" | "extracted"; source?: string; models?: string[] };
  observables: Record<string, string>;
  recipe: string;
  negative: string;
  evidence: Evidence[];
  /** Present on extracted styles: the images the human kept the style on. */
  exemplars?: Exemplar[];
}

export interface Mechanism {
  id: string;
  reference: boolean;
  window?: number;
  label?: string;
}

export interface Plan {
  id: string;
  scenes: { id: string; frame: string; note?: string }[];
  styles: string[];
  mechanisms: Mechanism[];
  seeds: number[];
  steps?: number;
}

export type RunStatus = "created" | "annotating" | "generating" | "grading" | "done" | "failed" | "committed";

export interface RunManifest {
  id: string;
  created: string;
  finished?: string;
  plan: Plan;
  styles: Record<string, StyleDef>;
  status: RunStatus;
  progress: { stage: string; done: number; total: number };
  scenes: Scene[];
  candidates: Candidate[];
  log: { at: string; msg: string }[];
  error?: string;
  committed?: { at: string; deleted: number; kept: number; undecided: number };
}

export type Verdict = "keep" | "reject";
export interface VerdictRecord {
  verdict: Verdict;
  at: string;
  note?: string;
}
/** Keyed by candidate id. Absent = undecided. */
export type Verdicts = Record<string, VerdictRecord>;

export interface RunSummary {
  id: string;
  created: string;
  status: RunStatus;
  progress: { stage: string; done: number; total: number };
  scenes: number;
  candidates: number;
  graded: number;
  decided: number;
  kept: number;
}

export interface RunDetail {
  run: RunManifest;
  verdicts: Verdicts;
}

export interface LedgerRow {
  run: string;
  scene: string;
  style: string;
  mechanism: string;
  seed: number;
  verdict: Verdict;
  craft: number | null;
  style_score: number | null;
  has_text: boolean | null;
  at: string;
}

export interface CommitResult {
  deleted: number;
  kept: number;
  undecided: number;
  findings: string;
}

export interface Catalogue {
  styles: StyleDef[];
  ledger: LedgerRow[];
}
