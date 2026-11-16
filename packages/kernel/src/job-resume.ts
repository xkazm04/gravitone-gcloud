import type { Actor } from "@gt/domain/event";
import type { Holder, Job } from "@gt/domain/job";
import type { ResourceLane } from "@gt/domain/lane";
import { ok, type Result } from "@gt/domain/errors";
import type { Effects } from "./effects.ts";
import { retried } from "./job-core.ts";
import { jobEvent, loadJob, putJob } from "./job.ts";

// THE MACHINE RESUMES FREE WORK (spark scout-producers, 2026-11-08). `recover` names a dead
// holder's job `interrupted` and `retry` is the operator's door, so a worker restart used to strand
// a free local board for the night though a resume never redraws a booked step. This is the other
// door: a job interrupted on one of the lanes below goes back to the queue by the kernel's own
// `retried` - attempt counted, every output kept - under a MACHINE actor of its own, and a ledger
// event of its own (`job.auto-resumed`) so the operator can see what the machine took up.
//
// THE ALLOW-LIST IS NOT `!LANE_PAYS`. gpu.local and box.render only:
//   - seat.text is free money-wise (lane.ts) and is EXCLUDED on purpose: a worker's death can orphan
//     its `claude` child, which nothing reaps, and a re-queued reel would run beside that child,
//     writing the same strip directory. The operator looks first.
//   - box.chrome drives a signed-in browser (Suno, the Leonardo studio): it pays, it holds.
//   - box.blender keeps the operator's retry as it was.
// A producer on an allowed lane that cannot be redone unattended is simply absent from RESUMABLE_PRODUCERS (why, below).
//
// THE ATTEMPT LIMIT. A job is resumed by the machine at most MAX_AUTO_RESUMES times in a row; an
// attempt is one `job.auto-resumed` event since the operator's last `job.retried`. So a job may die
// three times - its first drive and two resumes - and the third death stays `interrupted`, visible
// on Runs exactly as today, until an operator retries it (which grants a fresh two). A crash loop
// therefore ends instead of cycling through a night.
//
// WHERE IT RUNS. Only on the live worker (job-worker.ts), over the jobs `recover` has just named: a
// holder proven gone. Never a sweep of its own, so it cannot race a live worker, and the one-shot
// callers of `recover` (the CLIs) do not resume anything. Two workers resuming one job is harmless:
// the second finds it queued and does nothing.
//
// The Python kernel (job_settle.py `recover`) does NOT share this contract: it names a dead holder's
// job interrupted and leaves the retry to the operator, as before. A job it interrupts on a free
// lane before a Node worker's sweep sees it therefore stays interrupted.

export const AUTO_RESUME_LANES: readonly ResourceLane[] = ["gpu.local", "box.render"];
export const MAX_AUTO_RESUMES = 2;
/**
 * THE ALLOW-LIST: the producers read one by one (2026-11-08) and found safe to run again unattended, by
 * exact name. The set is closed: a producer not named here stays `interrupted` for the operator, as it
 * always did, so a new one must be read and added before the machine touches it. Each of these books a step only after its artefact landed and
 * re-draws nothing it holds. Read and left OUT, and why:
 *   mv                  its `still` step buys a Leonardo studio still; its own guard (mv.ts `stuckAtStill`)
 *                       reads only INTERRUPTED jobs, so a re-queued one would walk past the look it forces.
 *   frames, still       a gpu.local option still calls the router's unpinned `generate` (agy, google, leonardo).
 *   motion              its recognize turn falls from ollama to Gemini when ollama is the thing that died.
 *   scout-scene,
 *   scout-asset         the still engine is the resuming worker's env (stillEngine.ts), not the job's: Leonardo credits.
 *   scout-sheet         its judge eye falls from ollama to Gemini the same way.
 *   scout-ingest        a crash leaves .media/frames the second run's ffmpeg (no -y) refuses: a false `failed`.
 *   profile             it runs an arbitrary argv; an orphan child inflates the new run's peaks.
 *   forge, dojo         Python drivers adopt "a PNG on disk" as finished, and a copy cut short is a torn PNG.
 */
export const RESUMABLE_PRODUCERS: ReadonlySet<string> = new Set(["cut", "media-facts", "mesh", "scout-storyboard", "scout-piece", "production-take", "production-cut", "cover", "yue2-render", "yue2-score", "yue2-post"]);

export const AUTO_RESUMED = "job.auto-resumed";
export const resumeActor = (by: Holder): Actor => ({ kind: "machine", id: `auto-resume:${by.host}/${by.pid}` });

/** Whether the machine may put this interrupted job back, before the count of earlier resumes. */
export const resumable = (job: Job): boolean => job.state === "interrupted" && AUTO_RESUME_LANES.includes(job.lane) && RESUMABLE_PRODUCERS.has(job.producer);

/**
 * Re-queue each of `interrupted` that is resumable and under the limit, one transaction per job,
 * and return the jobs it put back. A job that is no longer interrupted (an operator, or another
 * worker, got there first) is left alone.
 */
export function resumeFreeWork(fx: Effects, interrupted: readonly Job[], by: Holder): Result<Job[]> {
  const out: Job[] = [];
  for (const j of interrupted) {
    if (!resumable(j)) continue;
    const r = fx.tx("auto-resume", (t): Job | undefined => {
      const { job } = loadJob(t, j.id);
      if (!resumable(job)) return undefined;
      const since = t.get("SELECT coalesce(max(seq), 0) AS s FROM events WHERE subject_id = ? AND type = 'job.retried'", job.id)?.["s"];
      const n = t.get("SELECT count(*) AS c FROM events WHERE subject_id = ? AND type = ? AND seq > ?", job.id, AUTO_RESUMED, typeof since === "number" ? since : 0)?.["c"];
      const done = typeof n === "number" ? n : 0;
      if (done >= MAX_AUTO_RESUMES) return undefined;
      const next = retried(job);
      putJob(t, next);
      const stage = job.interruption?.stage;
      jobEvent(t, resumeActor(by), next, AUTO_RESUMED, { from: "interrupted", resume: done + 1, of: MAX_AUTO_RESUMES, ...(stage === undefined ? {} : { stage }) });
      return next;
    });
    if (!r.ok) return r;
    if (r.value !== undefined) out.push(r.value);
  }
  return ok(out);
}
