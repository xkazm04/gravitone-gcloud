// The plant's reading of a forge run, an extraction and a Dojo cycle: which states are live,
// which may be committed, and the six plant states. Moved out of app/foundry/parts.tsx so the
// /foundry page and the ledger projection (lib/ledger/v1) read ONE set - Runs then shows the
// live work /foundry shows by construction, not by a copy kept in step.
import type { ExtractStatus } from "./extract/types";
import type { CycleStatus } from "./training/types";
import type { RunStatus } from "./types";

/** Where a run, an extraction or a cycle stands, as the plant reads it. Six
 *  words because the page has six things to say: working, waiting on a cull,
 *  stopped short, broken, finished, and waiting on a gate. */
export type PlantState = "live" | "ready" | "inc" | "failed" | "committed" | "gate";

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

/** The same, for an extract run. A failed run (breaker or budget stop) keeps
 *  the styles it finished, and the operator's verdicts gate what is written. */
export const EXTRACT_COMMITTABLE: ExtractStatus[] = ["done", "failed"];

export const EXTRACT_LIVE: ExtractStatus[] = ["created", "reading", "grouping", "replicating", "transferring"];

export function cycleKind(s: CycleStatus): PlantState {
  return s === "awaiting-gate" ? "gate" : s === "failed" ? "failed" : s === "committed" ? "committed" : "live";
}
