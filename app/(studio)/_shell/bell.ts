// THE BELL'S JOB LIST, projected from the produce port's job view (the same rows Runs draws), so
// the bell and Runs cannot disagree about a job (lib/jobs.tsx holds the shape).
//
// The bell answers two questions and no others: what is running now, and what ended. So a queued,
// paused, planned or cancelled job is not in it (Runs owns the queue), and the list is the newest
// BELL_CAP by the moment that matters for each - an ending for a settled job, a start for one in
// flight - so a long history cannot grow the payload every page carries.
import type { Job, JobStatus } from "../../../lib/jobs.tsx";
import type { ProduceJob } from "../projects/_port/contract.ts";

export const BELL_CAP = 40;

const STATUS: Readonly<Partial<Record<ProduceJob["state"], JobStatus>>> = { running: "running", done: "done", failed: "failed", interrupted: "interrupted" };

export function bellJobs(jobs: readonly ProduceJob[]): Job[] {
  const out: Job[] = [];
  for (const j of jobs) {
    const status = STATUS[j.state];
    if (status === undefined) continue;
    out.push({
      id: j.id,
      kind: j.partId !== undefined ? "part" : (j.media ?? j.lane),
      label: j.title,
      status,
      startedAt: j.s,
      ...(status === "running" ? {} : { endedAt: j.e }),
      ...(j.projectId === undefined ? {} : { projectId: j.projectId }),
      href: `/projects/runs?job=${encodeURIComponent(j.id)}`,
      ...(j.error === undefined ? {} : { error: j.error }),
      measured: false,
      progress: 0,
    });
  }
  const at = (j: Job): number => j.endedAt ?? j.startedAt;
  return out.sort((a, b) => at(b) - at(a) || a.id.localeCompare(b.id)).slice(0, BELL_CAP);
}
