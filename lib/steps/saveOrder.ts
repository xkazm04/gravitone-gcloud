// WRITE ORDERING for the step store, in two parts:
//   - latest-wins tickets (claimSaveSlot): of two whole-record saves for one key,
//     only the newest may land;
//   - issue order (inIssueOrder): every write to a key, save or patch, runs in the
//     order it was issued, through one chain per key.
//
// Both are module Maps owned by this file only. Split out of the stepStore.ts door.

import { key } from "./withStore";

/* ───────────────────────── latest-wins (added 2026-08-24) ──────────────────
 *
 * THE BUG. Every caller fires `void saveStep(...)` on a keystroke, which is the
 * right ergonomics for a save that runs that often and was, until now, missing
 * its other half: nothing decided which of two in-flight writes for one
 * `${projectId}:${phase}` key was allowed to land. They settled in ARRIVAL
 * order, and arrival order is not issue order — `openDb()` is awaited on every
 * call, a slow first write can be overtaken by a fast second, and the older
 * snapshot then lands on top of the newer one. The user watches their last
 * sentence disappear, the store reports success, and nothing anywhere is wrong
 * enough to notice.
 *
 * THE FIX is a monotonic ticket per key, taken at CALL time — not at write time,
 * which would be the same race one layer down — and checked immediately before
 * the `put` is queued into the transaction. Only the newest ticket for a key may
 * write; anything older abandons. Because the check and the `put` are in the same
 * synchronous block, nothing can be issued between them.
 *
 * Abandoning is a SUCCESS. The newer save carries the newer data, so the older
 * one had nothing left to contribute; reporting it as a failure would put a
 * storage alert in the bell for a keystroke that was superseded a millisecond
 * later. */

/** The newest ticket issued per key. One entry per key ever written in this
 *  session — bounded by the number of steps in the open project, not by the
 *  number of keystrokes. */
const newestTicket = new Map<string, number>();
let ticketSeq = 0;

export interface SaveSlot {
  ticket: number;
  /** Is this still the newest save issued for its key? Checked immediately
   *  before the write is queued; false means abandon. */
  stillNewest: () => boolean;
}

/**
 * Claim the right to write this key, and get back the test for whether that
 * right still holds.
 *
 * Exported and separated from `saveStep` on purpose: the IndexedDB write itself
 * cannot be driven in this repo's Node-context probe suite, and a latest-wins
 * rule that cannot be asserted is a rule nobody can trust. This is the whole
 * ordering decision, and it is a pure function of call order.
 */
export function claimSaveSlot(projectId: string, phase: string): SaveSlot {
  const k = key(projectId, phase);
  const ticket = ++ticketSeq;
  newestTicket.set(k, ticket);
  return { ticket, stillNewest: () => newestTicket.get(k) === ticket };
}

/** Test hook — forget every issued ticket, so one probe's ordering never leaks
 *  into the next one's. */
export function __resetSaveSlots(): void {
  newestTicket.clear();
  ticketSeq = 0;
}

/* ───────────────────────── issue order (added 2026-10-05) ──────────────────
 *
 * The ticket above decides which of two WHOLE-RECORD saves may land. It cannot
 * order a PATCH, because a patch is not superseded by a later write — it carries
 * a field nobody else is writing, and abandoning it loses that field. That is
 * the bug the four copied read-merge-writes had: each claimed a ticket, so the
 * first of two patches issued in one tick abandoned and its field was gone.
 *
 * So every write to a key — whole save or patch — runs in ISSUE order through
 * one chain per key. `openDb()` is awaited before a transaction exists, so
 * without the chain a later call can create its transaction first; IndexedDB
 * then serialises them in the wrong order. With it, a save issued before a
 * patch lands before it, and the patch merges onto what the save wrote.
 *
 * A link never rejects (`withStore` resolves every failure to an outcome), and
 * the chain is dropped once it drains, so the map holds only keys with a write
 * in flight. */
const writeChains = new Map<string, Promise<void>>();

export function inIssueOrder<T>(k: string, run: () => Promise<T>): Promise<T> {
  const prev = writeChains.get(k) ?? Promise.resolve();
  const next = prev.then(run, run);
  const tail = next.then(
    () => undefined,
    () => undefined,
  );
  writeChains.set(k, tail);
  void tail.then(() => {
    if (writeChains.get(k) === tail) writeChains.delete(k);
  });
  return next;
}
