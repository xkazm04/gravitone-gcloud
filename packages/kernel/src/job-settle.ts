import type { Actor } from "@gt/domain/event";
import { ok, type Result } from "@gt/domain/errors";
import type { Job } from "@gt/domain/job";
import { kernelCall } from "./dryrun.ts";
import type { Effects } from "./effects.ts";
import type { Ending, Producer } from "./job-core.ts";
import { jobEvent, loadJob } from "./job.ts";

// THE POST-JOB HOOK (Phase 4 wave B, item 2): after a drive, the producer is told how its job
// ended (job-core `Producer.settle`). Called by job-run.ts `runJob` and nowhere else, so the
// CLI, a route and the worker cannot disagree on whether a kernel stop reached the producer's
// own store. Before it, extract's CLI and route called `settleExtractManifest` after their own
// drives and the worker did not; an article run stopped at its ceiling by the worker read
// "drafting" for good. A settle that throws is reported on the drive and in the ledger
// (`job.settle-failed`); the job's ending stands - the hook copies a fact, it cannot undo one.

/** What a drive reports, as far as the hook reads it (job-run.ts `RunReport`; named here, not imported, so the two files do not import each other). */
type Report = { readonly outcome: string; readonly job?: Job; readonly settle?: { readonly ok: false; readonly message: string } };

export async function settleAfter<R extends Report>(fx: Effects, producer: Producer, jobId: string, r: Result<R>, actor: Actor): Promise<Result<R>> {
  const settle = producer.settle;
  if (settle === undefined) return r;
  const end = endingOf(fx, jobId, r);
  if (end === undefined) return r;
  const threw = await fx.call(
    "settle",
    kernelCall(async (): Promise<string | undefined> => {
      try {
        await settle(end.job, end.ending);
        return undefined;
      } catch (e) {
        // A process death (the crash harness's sentinel) is not an Error and is not ours.
        if (!(e instanceof Error)) throw e;
        return e.message;
      }
    }),
  );
  if (threw === undefined) return r;
  const logged = fx.tx("settle-failed", (t) => jobEvent(t, actor, loadJob(t, jobId).job, "job.settle-failed", { ending: end.ending, message: threw }));
  if (!logged.ok) return logged;
  return r.ok ? ok({ ...r.value, settle: { ok: false, message: threw } }) : r;
}

/** The job a drive ENDED, and how - or undefined when it ended nothing (a yield, a busy claim). */
function endingOf(fx: Effects, jobId: string, r: Result<Report>): { job: Job; ending: Ending } | undefined {
  if (r.ok) {
    const job = r.value.job;
    const o = r.value.outcome;
    if (job === undefined || !(o === "done" || o === "failed" || o === "stopped")) return undefined;
    return { job, ending: o };
  }
  // A drive that returned an error left its job failed or interrupted (`settleError`), or never claimed it.
  const read = fx.tx("settle-read", (t) => loadJob(t, jobId).job);
  if (!read.ok) return undefined;
  const s = read.value.state;
  return s === "failed" || s === "interrupted" ? { job: read.value, ending: s } : undefined;
}
