// THE WHOLE-RECORD SAVE. saveStep never rejects: it resolves to an outcome, and every
// failure is also published to the trouble channel by withStore.
//
// Split out of the stepStore.ts door, which re-exports saveStep.

import { STEPS_STORE, runTx } from "@/lib/studioDb";

import { claimSaveSlot, inIssueOrder } from "./saveOrder";
import { saveWatchers } from "./saveWatchers";
import { SCHEMA_VERSION } from "./schemaVersion";
import type { SaveOutcome } from "./storageOutcome";
import { key, withStore } from "./withStore";

/** Never rejects: an ignored `void saveStep(...)` must not become an unhandled
 *  rejection, and a save on every keystroke is a caller with nowhere to put a
 *  catch. The outcome is returned AND pushed to the trouble channel. */
export async function saveStep<T>(
  projectId: string,
  phase: string,
  data: T,
  /** `v`: the record version to stamp — a record def's own (records/patch.ts).
   *  Absent means `SCHEMA_VERSION`, which is every caller without a def. */
  opts?: { v?: number },
): Promise<SaveOutcome> {
  // Ticket taken HERE — at call time, in issue order — not inside the write,
  // which would be the same race one layer down. See the block above.
  const slot = claimSaveSlot(projectId, phase);
  saveWatchers.forEach((w) => w(projectId, phase, data));
  // An early out for the common overtaking case, so a superseded keystroke does
  // not even open the database. It is an optimisation, not the guard: the guard
  // is the check inside the transaction callback, which is the only one that
  // cannot be raced.
  if (!slot.stillNewest()) return { ok: true, superseded: true };

  return inIssueOrder(key(projectId, phase), async () => {
    let wrote = false;
    const r = await withStore("write", projectId, phase, (db) =>
      runTx(db, STEPS_STORE, "readwrite", (store) => {
        // The check and the put are in ONE synchronous block, so no later save can
        // be issued between them.
        if (!slot.stillNewest()) return;
        wrote = true;
        store.put({
          id: key(projectId, phase),
          projectId,
          phase,
          data: { ...data, savedAt: Date.now(), v: opts?.v ?? SCHEMA_VERSION },
        });
      }),
    );
    if (!r.ok) return r;
    return wrote ? { ok: true } : { ok: true, superseded: true };
  });
}
