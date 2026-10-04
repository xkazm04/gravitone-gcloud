// Small shared pieces of the /foundry surface: the status words, the mapping from
// each module's lifecycle to the kit's status marks, and the commit gates. The
// score chips, verdict stamps and credit marks that used to live here are the
// kit's now (components/kit); nothing here draws and nothing here fetches.

import type { StatusKind } from "@/components/kit";
import type { ExtractStatus } from "@/lib/foundry/extract/types";
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

/** The forge run's state as a kit mark. */
export function runKind(s: RunStatus): StatusKind {
  return LIVE.includes(s) ? "live" : s === "done" ? "ready" : s === "incomplete" ? "inc" : s === "failed" ? "failed" : "committed";
}

export function extractKind(s: ExtractStatus): StatusKind {
  return EXTRACT_LIVE.includes(s) ? "live" : s === "done" ? "ready" : s === "failed" ? "failed" : "committed";
}

export function cycleKind(s: CycleStatus): StatusKind {
  return s === "awaiting-gate" ? "gate" : s === "failed" ? "failed" : s === "committed" ? "committed" : "live";
}
