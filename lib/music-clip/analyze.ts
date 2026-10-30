// The analysis entry point. STUB committed by the Director so the CLI (WP2)
// typechecks against the final signature; WP1 replaces the body.

import type { AnalyzeInput, TimelineV1 } from "./types";

export async function analyzeTrack(_input: AnalyzeInput): Promise<TimelineV1> {
  throw new Error("analyzeTrack: not implemented (WP1)");
}
