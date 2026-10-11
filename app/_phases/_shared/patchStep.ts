// THE PATCH: a read and its successor written in ONE readwrite transaction.
// StepDecision and PatchStepOutcome are its vocabulary; patchStep is the operation.
//
// Split out of the stepStore.ts door, which re-exports all three names.

import { STEPS_STORE, runTx } from "@/lib/studioDb";

import { inIssueOrder } from "./saveOrder";
import { seededFor } from "./seededDefault";
import { SCHEMA_VERSION } from "./schemaVersion";
import type { StorageTrouble } from "./storageOutcome";
import { key, withStore } from "./withStore";

/** What a patch decided, having read the stored record inside its own
 *  transaction: write this, or write nothing and say why. */
export type StepDecision = { put: object } | { skip: unknown };

export type PatchStepOutcome =
  | { ok: true; wrote: true }
  | { ok: true; wrote: false; skip: unknown }
  | { ok: false; trouble: StorageTrouble };

/**
 * Read a record and write its successor in ONE readwrite transaction.
 *
 * The read-merge-write this replaces was `loadStep` then `saveStep`: two
 * transactions, so a write could land between them, and a read that FAILED came
 * back as `{}` — after which the "merge" wrote one field over the whole record.
 * Here the read and the put share a transaction: a failed read aborts it and
 * nothing is written, and no other write to this key can interleave (IndexedDB
 * serialises readwrite transactions on a store, and `inIssueOrder` makes their
 * order the order they were issued in).
 *
 * `decide` is synchronous on purpose — the transaction would auto-commit across
 * an `await`. It receives the stored data exactly as written (with its `v`), or
 * the seeded default when nothing is stored, and a throw from it aborts the
 * transaction and reports as a write failure.
 *
 * Exported for `records/patch.ts`, which supplies the version check and the
 * parse; a call site wants `patchRecord`, not this.
 */
export function patchStep(
  projectId: string,
  phase: string,
  decide: (stored: unknown) => StepDecision,
  opts?: { v?: number },
): Promise<PatchStepOutcome> {
  return inIssueOrder(key(projectId, phase), async () => {
    // A holder rather than two `let`s: assignments inside the request callback
    // are invisible to control-flow narrowing after the await.
    const seen: { decided?: StepDecision; thrown?: unknown } = {};
    const r = await withStore("write", projectId, phase, (db) =>
      runTx(db, STEPS_STORE, "readwrite", (store, tx) => {
        const req = store.get(key(projectId, phase));
        req.onsuccess = () => {
          let d: StepDecision;
          try {
            d = decide(req.result?.data ?? seededFor(projectId, phase));
          } catch (e) {
            seen.thrown = e;
            tx.abort();
            return;
          }
          seen.decided = d;
          if ("put" in d)
            store.put({
              id: key(projectId, phase),
              projectId,
              phase,
              data: { ...d.put, savedAt: Date.now(), v: opts?.v ?? SCHEMA_VERSION },
            });
        };
      }).catch((e: unknown) => {
        throw seen.thrown ?? e;
      }),
    );
    if (!r.ok) return r;
    const d = seen.decided;
    if (d && "put" in d) return { ok: true, wrote: true };
    return { ok: true, wrote: false, skip: d && "skip" in d ? d.skip : undefined };
  });
}
