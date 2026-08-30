// THE DOJO WIRE TYPES — shared by the disk layer (lib/foundry/training/store.ts,
// server only) and the app's gate surface (client). Nothing here imports Node.
//
// The shapes mirror what the autonomous training loop (running on another
// machine) writes into foundry-out/training/<id>/cycle.json. The loop owns the
// manifest; this file is the TypeScript reading of it, and a field added on one
// side without the other is how the gate ends up rendering `undefined`.

export type CycleStatus = "planning" | "generating" | "judging" | "awaiting-gate" | "committed" | "failed";

/** One generated artefact. `file`/`poster` are cycle-relative; a video MediaRef
 *  always carries `poster` (the only image the app ever serves for it). */
export interface MediaRef {
  file: string;
  poster?: string;
  kind: "image" | "video";
  /** Set by a commit: the file is gone, the record stays. */
  deleted?: boolean;
}

/** One A/B pair: same scene, same seed, baseline recipe vs challenger recipe,
 *  judged by the loop's chokepoint model (and optionally by Gemini). */
export interface PairResult {
  id: string;
  scene: string;
  seed: number;
  baseline: MediaRef;
  challenger: MediaRef;
  judge_pick: "baseline" | "challenger" | "tie";
  reason: string;
  gemini_pick?: "baseline" | "challenger" | "tie";
  gemini_reason?: string;
}

/** One claimed improvement the human gates. `standard` names the registry
 *  standard it challenges ("<subject>/<technique>") or "none"; `thumbnail`
 *  names one pair image (cycle-relative) chosen as the keeper. */
export interface Improvement {
  id: string;
  technique: string;
  subject: string;
  claim: string;
  standard: string;
  pairs: PairResult[];
  challenger_recipe: string;
  baseline_recipe: string;
  thumbnail?: string;
}

export interface CycleManifest {
  version: 1;
  id: string;
  at: string;
  dimension: string;
  subject: string;
  status: CycleStatus;
  media: "image" | "video";
  improvements: Improvement[];
  judge_agreement?: { chokepoint_vs_human?: number; gemini_vs_human?: number };
  lease?: { owner: "app" | "cli"; at: string };
  fail_streak: number;
  costUsd?: number;
  log: { at: string; msg: string }[];
}

export type TrainingVerdict = "approve" | "reject";
/** Keyed by improvement id. Null or absent = undecided. */
export type TrainingVerdicts = Record<string, TrainingVerdict | null>;

export interface TrainingCycleSummary {
  id: string;
  at: string;
  dimension: string;
  subject: string;
  status: CycleStatus;
  media: "image" | "video";
  improvements: number;
  decided: number;
}

/** One row per human-gated improvement, appended by a commit. `reflected` is
 *  false until the loop has edited the named prompt surface, then the sha. */
export interface TrainingLedgerRow {
  cycle: string;
  dimension: string;
  subject: string;
  technique: string;
  human: TrainingVerdict;
  verdict: "better" | "not-better" | "unmeasurable";
  judge_pick_rate: number;
  gemini_agreement?: number;
  thumb?: string;
  reflected: false | string;
  at: string;
}

export interface TrainingCommitResult {
  deleted: number;
  thumbs: string[];
  ledger_rows: number;
}

export interface TrainingCycleDetail {
  cycle: CycleManifest;
  verdicts: TrainingVerdicts;
}
