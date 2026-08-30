// LANE — THE STEP GUARD RELEASES (dynamic).
//
// Registry: concurrency-guards / release-guarantees ("designing how a guard
// survives every exit path", "setting a reclamation bound for stale entries").
//
// WHY THERE IS A GUARD AT ALL. /api/foundry/extract/<id>/step performs ONE
// bounded unit and rewrites the manifest. Two overlapping calls for one run — a
// retry racing a slow round, two browser tabs on the same page — would both read
// the manifest, both append, and the second write would lose the first's round
// along with the vendor call that paid for it. `stepRun` serialises them on an
// in-process promise chain keyed by run id.
//
// WHAT WAS WRONG. The chain was stored as `mine.catch(() => undefined)` — a
// NEW promise — and released with `if (locks.get(id) === mine)`. That comparison
// is false always, so no entry was ever deleted: one row per run id, held for
// the life of the server process. Nothing failed, the guard kept guarding, and
// only its memory was the defect — which is exactly the shape lib/apiAuth.ts
// already had to fix in its rate-limit bucket map, one module over.
//
// WHAT THIS PROBE DRIVES. The REAL `stepRun` against run ids that do not exist,
// so the call reaches the manifest read, refuses with 404, and touches no disk,
// no vendor and no clock. Then it reads the REAL map through `__liveStepLocks`
// rather than re-deriving the rule. Every caller has settled, so the only
// correct residue is zero.
import { test, expect } from "@playwright/test";

import { FoundryError } from "@/lib/foundry/store";
import { __liveStepLocks, stepRun } from "@/lib/foundry/extract/store";

/** A syntactically valid run id that names nothing on disk: `runDir` accepts
 *  it, `readManifest` then answers 404 without writing anything. */
const absent = (n: string) => `2026-01-01-no-such-run-${n}`;

async function refused(id: string): Promise<FoundryError> {
  try {
    await stepRun(id);
  } catch (e) {
    return e as FoundryError;
  }
  throw new Error(`stepRun(${id}) resolved against a run that does not exist`);
}

test("step guard: a settled call releases its lock — the map empties", async () => {
  const before = __liveStepLocks();
  for (const n of ["a", "b", "c"]) {
    const e = await refused(absent(n));
    expect(e).toBeInstanceOf(FoundryError);
    expect(e.status).toBe(404);
  }
  const after = __liveStepLocks();
  console.log(`[foundry] step locks held: ${before} before, ${after} after 3 settled calls`);
  // Three DISTINCT ids, so a leak shows as three rows and not as one.
  expect(after, "the step lock map kept an entry for a call that has finished").toBe(before);
  expect(after).toBe(0);
});

test("step guard: overlapping calls for ONE run serialise, and still release", async () => {
  // Both calls are launched before either settles, so the second genuinely
  // chains onto the first rather than finding an empty map.
  const id = absent("overlap");
  const both = await Promise.allSettled([stepRun(id), stepRun(id)]);
  for (const r of both) {
    expect(r.status).toBe("rejected");
    expect((r as PromiseRejectedResult).reason).toBeInstanceOf(FoundryError);
  }
  // The second caller's failure must not have been swallowed by the first's —
  // the chain the next caller waits on is deliberately rejection-free, and the
  // returned promise deliberately is not.
  console.log(`[foundry] after 2 overlapping calls, locks held: ${__liveStepLocks()}`);
  expect(__liveStepLocks(), "an overlapping pair left its lock behind").toBe(0);
});
