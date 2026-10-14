// THE READ PATH: readStep, the honest read that tells a never-written key from a
// failed read, and loadStep, the flattened read its callers use.
//
// Split out of the stepStore.ts door, which re-exports both.

import { STEPS_STORE } from "@/lib/studioDb";

import { seededFor } from "./seededDefault";
import type { ResearchStepData } from "./stepDataResearch";
import type { ReadOutcome } from "./storageOutcome";
import { key, withStore } from "./withStore";

/** The honest read: tells a never-written key from a failed read. */
export async function readStep<T = ResearchStepData>(
  projectId: string,
  phase: string,
): Promise<ReadOutcome<T>> {
  const r = await withStore("read", projectId, phase, (db) =>
    new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STEPS_STORE, "readonly");
      const req = tx.objectStore(STEPS_STORE).get(key(projectId, phase));
      req.onsuccess = () => resolve(req.result?.data);
      req.onerror = () => reject(req.error ?? new Error("read failed"));
    }),
  );
  if (!r.ok) return r;
  return { ok: true, data: (r.value ?? seededFor(projectId, phase)) as T | undefined };
}

/** The flattened read, unchanged for its five callers: the stored value, or the
 *  seeded default when nothing is stored. A FAILED read also lands here as the
 *  seeded default — it is reported through `onStorageTrouble`, and a caller that
 *  needs to tell the two apart calls `readStep` instead. */
export async function loadStep<T = ResearchStepData>(
  projectId: string,
  phase: string,
): Promise<T | undefined> {
  const r = await readStep<T>(projectId, phase);
  return r.ok ? r.data : (seededFor(projectId, phase) as T | undefined);
}
