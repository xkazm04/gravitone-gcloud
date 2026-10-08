// THE HOLES IN THE SPOTTING — runs of scenes no cue sits on, in film order.
//
// The coverage rail draws them; this names them, so "add a cue" can land on
// the first one instead of on scene 1 (which, on a proposed session, is almost
// always already covered — the creator then had to retype two ordinals to move
// the new row to where the silence actually was). Counted on SCENES, the same
// set the coverage line counts, because a cue's span is the scenes it covers
// and nothing else (see the coverage note in ./ScoreSpotting.tsx).
//
// Pure, beside the step, so the Cut's own gap arithmetic (cut/edits.ts, over
// seconds) and this one (over scenes) can each be read for what it measures.

import type { Scene } from "../../_studio/projectTypes";

/** Contiguous runs of uncovered scenes, each as its scene ids in order. */
export function gapRuns(scenes: readonly Scene[], covered: ReadonlySet<string>): string[][] {
  const runs: string[][] = [];
  let run: string[] = [];
  for (const s of scenes) {
    if (covered.has(s.id)) {
      if (run.length) runs.push(run);
      run = [];
    } else run.push(s.id);
  }
  if (run.length) runs.push(run);
  return runs;
}
