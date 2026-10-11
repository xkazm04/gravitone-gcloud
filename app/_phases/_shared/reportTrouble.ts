// CLASSIFYING AND PUBLISHING A FAILURE: classify (duck-typed on `name`),
// reportStorageTrouble for a caller that knows it was doing storage work, and
// reportTaskTrouble for the last-resort unhandled-rejection route.
//
// Split out of the stepStore.ts door, which re-exports the two reporters. The
// publishing itself is `report` in troubleChannel.ts.

import type { StorageFailure, StorageTrouble } from "./storageOutcome";
import { report } from "./troubleChannel";

/** Duck-typed on `name` rather than `instanceof DOMException`: the global is
 *  absent in some runtimes this module is merely IMPORTED into, and a classifier
 *  that throws while classifying is worse than the failure it was reading.
 *  The two message matches are studioDb's own two literal rejections — a
 *  coupling worth naming, because that file is the only source of them. */
export function classify(e: unknown): StorageFailure {
  const name = typeof e === "object" && e !== null ? (e as { name?: string }).name : undefined;
  if (name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED") return "quota";
  const message = e instanceof Error ? e.message : String(e);
  if (message.includes("another tab")) return "blocked";
  if (message.includes("IndexedDB unavailable")) return "unavailable";
  return "failed";
}

/**
 * Publish a storage failure raised somewhere OTHER than this module's store,
 * through this module's channel and this module's five kinds.
 *
 * Exported so the PROJECT record's writes (lib/projects.ts, lib/useProjects.ts,
 * the studio's bookmark and the frames step's progress report) land in the same
 * place with the same vocabulary, instead of growing a second error taxonomy one
 * layer up. They already fail for identical reasons — the quota is one quota and
 * a blocked upgrade blocks both stores — and `useProjects` used to degrade all
 * of it to a bare `e.message` with no kind, while `parkAt` and `reportPhase`
 * failures were swallowed by empty catches and reached nobody at all.
 *
 * `phase` is the WHERE, and it is what the bell prints; for a project-level
 * operation pass a short label ("projects", "bookmark") rather than a step key.
 * Returns the classified trouble so a caller can also show it locally.
 */
export function reportStorageTrouble(
  op: "read" | "write",
  projectId: string,
  phase: string,
  e: unknown,
): StorageTrouble {
  const t: StorageTrouble = {
    kind: classify(e),
    op,
    projectId,
    phase,
    message: e instanceof Error ? e.message : String(e),
    at: Date.now(),
  };
  report(t);
  return t;
}

/**
 * Publish a failure that reached NO owner — an unhandled promise rejection —
 * through this same channel, without claiming it was a storage write.
 *
 * `reportStorageTrouble` is for a caller that KNOWS it was doing storage work
 * and merely lost the error; this is for the last-resort reporter, which knows
 * only that something rejected. The difference matters at the bell: `failed`
 * prints "the browser refused the operation" and sends the creator to look at
 * their quota, which is the wrong remedy for a dropped fetch.
 *
 * The three RECOGNISED storage kinds are still honoured, because a rejection
 * really can be one: `saveStep` never rejects (see its header), but a direct
 * IndexedDB user in fire-and-forget code can, and a QuotaExceededError arriving
 * this way is still a quota. It is only `classify`'s catch-all — the bucket that
 * means "not storage-shaped as far as anything here can tell" — that becomes
 * `non-storage` and carries the reason's own message instead.
 */
export function reportTaskTrouble(phase: string, e: unknown): StorageTrouble {
  const storageShaped = classify(e);
  const t: StorageTrouble = {
    kind: storageShaped === "failed" ? "non-storage" : storageShaped,
    op: "write",
    projectId: "app",
    phase,
    message: e instanceof Error ? e.message : String(e),
    at: Date.now(),
  };
  report(t);
  return t;
}
