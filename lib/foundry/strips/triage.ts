// THE STRIPS TRIAGE WIRE TYPES — the app's half. Shared by the disk layer
// (./store.ts, server only), the /api/foundry/strips/* routes and the /foundry
// Strips tab (client). Nothing here imports Node.
//
// ./types.ts is the PIPELINE's contract (run.json, the card, the verdict) and
// is co-owned with pipeline/strips/*; these shapes exist only between the app
// and its own disk writes — the list summary, the commit plan, and the two
// git-tracked indices a commit appends to — so they live beside it rather than
// in it.

import type { CardStatus, StripChip, StripGates, StripLane, StripRun, StripVerdicts } from "./types";

export interface StripLaneCount {
  cards: number;
  rendered: number;
}

export interface StripRunSummary {
  id: string;
  at: string;
  status: StripRun["status"];
  lanes: Record<StripLane, StripLaneCount>;
  cards: number;
  decided: number;
  kept: number;
}

export interface StripRunDetail {
  run: StripRun;
  verdicts: StripVerdicts;
}

/** What a commit will do, computed without touching the disk. `token` binds
 *  the preview to the commit: a verdict or a card that moved in between is a
 *  409, never a commit of something the operator did not see. */
export interface StripCommitPlan {
  counts: { kept: number; rejected: number; undecided: number };
  /** Motion-style ids the kept cards become (`<runId>--<cardId>`). */
  styles: string[];
  /** Run-relative media files the rejected cards lose. */
  delete: string[];
  token: string;
}

export interface StripCommitResult {
  kept: number;
  rejected: number;
  undecided: number;
  /** Media files removed (an already-absent file counts: a retried commit). */
  deleted: number;
  styles: string[];
  ledgerRows: number;
  findings: string;
}

/** One kept strip in pipeline/foundry/motion-styles.json. A code style is a
 *  module, not a prompt — which is why it is not a StyleDef (lib/foundry/types.ts). */
export interface MotionStyleEntry {
  id: string;
  name: string;
  lane: StripLane;
  case: string;
  approach: string;
  status: "candidate" | "proven";
  origin: { kind: "code"; run: string; card: string };
  chips: StripChip[];
  note?: string;
  gates?: StripGates;
  /** Repo-relative, forward slashes: html, style, poster, sheet. */
  files: Partial<Record<"html" | "style" | "poster" | "sheet", string>>;
}

/** One decided card in pipeline/foundry/strips-ledger.json — kept and rejected alike. */
export interface StripLedgerRow {
  run: string;
  card: string;
  approach: string;
  lane: StripLane;
  case: string;
  verdict: "keep" | "reject";
  chips: StripChip[];
  note?: string;
  at: string;
}

export interface MotionStylesDoc {
  _purpose?: string;
  styles: MotionStyleEntry[];
  _rev?: number;
}

export interface StripsLedgerDoc {
  _purpose?: string;
  rows: StripLedgerRow[];
}

/** The pipeline statuses a card can be triaged from. */
export const JUDGEABLE: CardStatus[] = ["rendered"];

/** Run statuses a commit is allowed from — the store's guard reads this same array. */
export const STRIP_COMMITTABLE: StripRun["status"][] = ["awaiting-triage"];

/** A note longer than this is refused by the verdicts route. */
export const STRIP_NOTE_MAX = 500;
/** Reason chips per verdict (docs/code-rendered-strips-plan.md, "Verdict"). */
export const STRIP_CHIPS_MAX = 3;
