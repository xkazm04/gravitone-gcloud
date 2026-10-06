// Small shared pieces of the /foundry surface: the status words, the mapping from
// each module's lifecycle to one of six plant states, and the commit gates.
// Nothing here draws and nothing here fetches — the drawing is ./ui.tsx, which
// reads `PlantState` to pick a tone.

/** Where a run, an extraction or a cycle stands, as the plant reads it. Six
 *  words because the page has six things to say: working, waiting on a cull,
 *  stopped short, broken, finished, and waiting on a gate. */
export type PlantState = "live" | "ready" | "inc" | "failed" | "committed" | "gate";
import type { ExtractStatus } from "@/lib/foundry/extract/types";
import type { CardStatus, StripRun } from "@/lib/foundry/strips/types";
import type { CycleStatus } from "@/lib/foundry/training/types";
import type { RunStatus } from "@/lib/foundry/types";

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

export const LIVE: RunStatus[] = ["created", "annotating", "generating", "grading"];

/** The run statuses a cull may be committed from — the SAME set
 *  `commitRun` in lib/foundry/store.ts enforces, and
 *  tests/golden-path/commit-gate-parity.probe.spec.ts reads that function's
 *  own array off disk and fails if these two drift apart.
 *
 *  `failed` belongs here and its absence was a real loss. A forge run that
 *  dies partway is marked `failed` with every plate it did generate still on
 *  disk — which is exactly the run whose survivors are worth culling, and the
 *  server has always allowed it. The button disabled itself on anything but
 *  `done`, so those plates could not be reached from the page at all: hours of
 *  GPU, unreachable, with the server standing ready. The Extract tab's own
 *  button already mirrored ITS server rule (`done` only, which is what
 *  commitExtractRun enforces) — one rule, two implementations, and only one of
 *  them had been kept true. */
export const COMMITTABLE: RunStatus[] = ["done", "incomplete", "failed"];

/** The same, for an extract run. Narrower than the forge's on purpose: a
 *  failed extraction has no partial artefact worth ratifying. */
export const EXTRACT_COMMITTABLE: ExtractStatus[] = ["done"];

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

export const EXTRACT_LIVE: ExtractStatus[] = ["created", "reading", "grouping", "replicating", "transferring"];

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

export function cycleKind(s: CycleStatus): PlantState {
  return s === "awaiting-gate" ? "gate" : s === "failed" ? "failed" : s === "committed" ? "committed" : "live";
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
