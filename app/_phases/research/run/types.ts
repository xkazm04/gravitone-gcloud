// The research RUN — a local Claude Code process, as a type.
//
// Shared rather than research-owned because the run is infrastructure: it is a
// long local process that emits a trace and can die, and any step that needs one
// renders it the same way.

export type TracePhase =
  | "spine"
  | "tension"
  | "mechanisms"
  | "turns"
  | "numbers"
  | "steelman"
  | "unknowns"
  | "fit"
  | "gaps";

export type TraceKind = "search" | "judgement" | "write";

export interface TraceStep {
  id: string;
  phase: TracePhase;
  kind: TraceKind;
  label: string;
  detail: string;
  /** Mocked wall time. The real run was ~6 web searches and one session. */
  ms: number;
}

/** How a run can end. Two of the three are not "success", and one of the two
 *  is still a correct outcome: a topic with no tension is not a video, and
 *  saying so is a successful run (RESEARCH-PROMPT § Phase 2). */
export type RunOutcome = "notebook" | "no-tension" | "process-failed";

export type RunState =
  | { status: "idle" }
  | { status: "running"; done: number; elapsedMs: number }
  | { status: "done"; elapsedMs: number }
  | { status: "no-tension"; elapsedMs: number; reason: string }
  | { status: "failed"; elapsedMs: number; atStep: number; error: string };
