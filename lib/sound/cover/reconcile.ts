import type { CoverRecord } from "@gt/domain/cover";
import { jobIdSchema } from "@gt/domain/ids";
import { get } from "@gt/kernel/job";
import type { Store } from "@gt/kernel/store";

// A COVER'S RECORD AGAINST THE JOB STORE. The record says "queued" once, in the sound store; the job lives in the
// kernel store, and only the kernel store is read by the worker. On 2026-11-08 a dev server with a temporary
// GRAVITONE_STORE_PATH queued a brief into its own file and wrote "queued" onto a real cover: the worker could
// never see the job, and the page showed it waiting for four hours. A status nothing can ever advance reads as
// failed here, with the reason, so the button comes back.
//
// A server whose two stores do not belong together cannot judge anything: storesDisagree comes first, and such a
// server neither launches nor reads a real cover as failed.

export const lostJob = (id: string): string => `${id} is not in the job store the worker reads, so nothing can run it`;

/** The record as the job store has it; the same object when nothing is lost. */
export function reconcileCover(c: CoverRecord, jobExists: (id: string) => boolean): CoverRecord {
  let next = c;
  const b = c.brief;
  if (b !== undefined && (b.state === "queued" || b.state === "running") && !jobExists(b.jobId)) {
    next = { ...next, brief: { ...b, state: "failed", error: lostJob(b.jobId) } };
  }
  if ((c.state === "queued" || c.state === "rendering") && c.jobId !== undefined && !jobExists(c.jobId)) {
    const error = lostJob(c.jobId);
    next = { ...next, state: "failed", takes: c.takes.map((t) => (t.state === "pending" ? { ...t, state: "failed" as const, error } : t)) };
  }
  return next;
}

/** Does this job exist in the store the server opened? */
export function jobExistsIn(store: Store): (id: string) => boolean {
  return (id) => {
    const parsed = jobIdSchema.safeParse(id);
    return parsed.success && get(store, parsed.data).ok;
  };
}

/** The sentence when one store is pointed elsewhere and the other is not: a job would land where no worker looks. */
export function storesDisagree(env: Readonly<Record<string, string | undefined>>): string | undefined {
  const kernel = (env["GRAVITONE_STORE_PATH"] ?? "").trim();
  const sound = (env["SOUND_STORE_DIR"] ?? "").trim();
  if (kernel !== "" && sound === "") return `this server's job store is ${kernel} but its covers are in the real sound store: a job queued here would never run`;
  if (kernel === "" && sound !== "") return `this server's covers are in ${sound} but its job store is the real one: a job queued here would run against the wrong covers`;
  return undefined;
}
