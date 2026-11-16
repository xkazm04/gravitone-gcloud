// WHAT NEEDS THE OPERATOR - the one definition the studio header's count (../../../_shell/
// headerFacts.ts) and Runs (./view.ts: its rose total, its `?state=needs`, the inspector's failed
// list) both read, so the chip on every page and the screen it opens cannot disagree about which
// jobs those are. Pure and client-safe.
//
// A failed job is a known outcome waiting on a retry or a re-route; an interrupted one is an
// UNKNOWN outcome - the vendor may have been paid - and the job machine lets only the operator
// move it (@gt/domain/job.machine). Both sit until someone looks; nothing else does.

import type { JobState } from "@gt/domain/job.machine";

export const NEEDS: ReadonlySet<JobState> = new Set(["failed", "interrupted"]);

export type NeedsCount = { readonly failed: number; readonly interrupted: number };

/** The jobs in NEEDS, by state. */
export function needsCount(jobs: readonly { readonly state: JobState }[]): NeedsCount {
  let failed = 0;
  let interrupted = 0;
  for (const j of jobs) {
    if (!NEEDS.has(j.state)) continue;
    if (j.state === "failed") failed++;
    else if (j.state === "interrupted") interrupted++;
  }
  return { failed, interrupted };
}

export const needsTotal = (n: NeedsCount): number => n.failed + n.interrupted;

/** Runs showing only these jobs (./url.ts `state=needs`): the header chip's door. Spelled here, not
 *  built from url.ts, so the header on every page does not load Runs' view to link to it. */
export const NEEDS_HREF = "/projects/runs?state=needs";
