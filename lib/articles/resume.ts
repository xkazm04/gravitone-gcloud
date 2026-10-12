// Resume: a failed run goes back to the state whose step did not finish, and a run a dead
// driver left mid-step is made drivable as it stands. Its own file, apart from the gate acts,
// because resuming restarts a run rather than deciding one.

import { ArticleError, driverAlive, updateRun } from "./store";
import type { ArticleRun, ArticleStatus, StepName } from "./types";
import { defaultDeps, type EngineDeps } from "./engine";

/** Where a failed run goes back to: the state whose step did not finish. */
export function resumePoint(run: ArticleRun): ArticleStatus {
  const done = (n: StepName) => run.steps.some((s) => s.name === n && s.status === "done");
  if (run.approval) return "approved";
  if (!done("research")) return run.steps.length ? "researching" : "queued";
  if (!done("outline") || !done("draft")) return "drafting";
  if (!done("critique")) return "critiquing";
  return "checking";
}

const RESUMABLE: ArticleStatus[] = ["queued", "researching", "drafting", "critiquing", "checking", "approved", "landing"];

/** Make a run drivable again. A `failed` run goes back to its resume point; a
 *  run left mid-step by a driver that died is resumable as it stands. The
 *  caller then drives it (`driveRun`, or `launchRun` from a route). */
export async function resumeRun(id: string, deps: EngineDeps = defaultDeps()): Promise<ArticleRun> {
  if (await driverAlive(id)) throw new ArticleError(`run ${id} is being driven right now`, 409, "busy");
  return updateRun(
    id,
    (r) => {
      if (r.status === "failed") {
        const next = resumePoint(r);
        const out: ArticleRun = { ...r, status: next };
        delete out.error;
        return out;
      }
      if (RESUMABLE.includes(r.status)) return r;
      throw new ArticleError(`a run that is ${r.status} cannot be resumed`, 409, "bad-transition");
    },
    deps.now,
  );
}
