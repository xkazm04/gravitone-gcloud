// Small shared pieces of the /foundry surface: the status words, the mapping from
// each module's lifecycle to one of six plant states, and the commit gates.
// Nothing here draws and nothing here fetches — the drawing is ./ui.tsx, which
// reads `PlantState` to pick a tone.

import type { ExtractStatus } from "@/lib/foundry/extract/types";
import type { CardStatus, StripRun } from "@/lib/foundry/strips/types";
import type { CycleStatus } from "@/lib/foundry/training/types";
import type { RunStatus } from "@/lib/foundry/types";
import { COMMITTABLE, EXTRACT_COMMITTABLE, EXTRACT_LIVE, LIVE, cycleKind, type PlantState } from "@/lib/foundry/plant";

// The plant's reading of each lifecycle lives in lib/foundry/plant.ts so the ledger projection
// (lib/ledger/v1) reads the same sets this page does without importing app/.
export { COMMITTABLE, EXTRACT_COMMITTABLE, EXTRACT_LIVE, LIVE, cycleKind, type PlantState };

export const STATUS_WORD: Record<RunStatus, string> = {
  created: "queued",
  annotating: "annotating sources",
  generating: "generating",
  grading: "grading",
  done: "ready to cull",
  incomplete: "gave up partway — ready to cull",
  failed: "failed",
  committed: "committed",
};

export const EXTRACT_STATUS_WORD: Record<ExtractStatus, string> = {
  created: "ready to start",
  reading: "reading sources",
  grouping: "grouping into styles",
  replicating: "replicating",
  transferring: "transferring",
  done: "ready to cull",
  failed: "failed",
  committed: "committed",
};

export const DOJO_STATUS_WORD: Record<CycleStatus, string> = {
  planning: "planning",
  generating: "generating",
  judging: "judging",
  "awaiting-gate": "awaiting your gate",
  committed: "committed",
  failed: "failed",
};

/** The forge run's state as a plant state. */
export function runKind(s: RunStatus): PlantState {
  return LIVE.includes(s) ? "live" : s === "done" ? "ready" : s === "incomplete" ? "inc" : s === "failed" ? "failed" : "committed";
}

export function extractKind(s: ExtractStatus): PlantState {
  return EXTRACT_LIVE.includes(s) ? "live" : s === "done" ? "ready" : s === "failed" ? "failed" : "committed";
}

export const STRIP_STATUS_WORD: Record<StripRun["status"], string> = {
  running: "rendering",
  "awaiting-triage": "ready to triage",
  committed: "committed",
};

/** A card's pipeline status, in the word a failed card shows instead of a player. */
export const CARD_STATUS_WORD: Record<CardStatus, string> = {
  pending: "authoring",
  rendered: "rendered",
  "lint-failed": "lint failed",
  "render-failed": "render failed",
  "author-failed": "author failed",
};

export function stripKind(s: StripRun["status"]): PlantState {
  return s === "running" ? "live" : s === "awaiting-triage" ? "ready" : "committed";
}
