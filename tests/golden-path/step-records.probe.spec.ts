// LANE — STEP RECORDS: the versioned read seam (card phase-shared-A).
//
// What stays of this lane after Phase 4 wave D. It drove the v1 step hooks (useRecord,
// useAlternatives, the music-video composition and source hooks) and patchRecord over a
// real IndexedDB engine; those hooks, the research record defs and the patch helper retired
// with the studio. Their guarantees moved to the kernel's part-record doors and op log:
//   · a future record is refused, an absent v reads as v1, a malformed shape is refused
//     -> packages/kernel/test/parts.test.ts "reads an absent v as v1, refuses a future v,
//        refuses a malformed shape";
//   · an atomic patch that drops no sibling field -> "keeps fields it does not know (a patch
//     never drops a sibling writer's field)" and "applies an op at its rev, answers a stale
//     base with the current rev and writes nothing" (same file);
//   · a failed read arms no save -> a part write needs the rev it read; a stale or absent
//     base writes nothing (tests/next-server/parts-real.test.ts, parts-frames.test.ts).
// The v1 registry itself stays while score/ads/record.ts reads through it
// (lib/producers/score.ts), so its refusal of a malformed record is still pinned here.
//
// The import below has a SIDE EFFECT and must come first.
import "fake-indexeddb/auto";

import { test, expect } from "@playwright/test";

import { openDb, runTx, STEPS_STORE } from "@/lib/studioDb";

async function clearSteps() {
  const db = await openDb();
  try {
    await runTx(db, STEPS_STORE, "readwrite", (s) => {
      s.clear();
    });
  } finally {
    db.close();
  }
}

/** Write a record exactly as a build (this one, an older one or a newer one)
 *  left it — bypassing every seam under test. */
async function putRaw(projectId: string, phase: string, data: Record<string, unknown>) {
  const db = await openDb();
  try {
    await runTx(db, STEPS_STORE, "readwrite", (s) => {
      s.put({ id: `${projectId}:${phase}`, projectId, phase, data });
    });
  } finally {
    db.close();
  }
}

test.beforeEach(async () => {
  await clearSteps();
});

test("case 1: a record the def cannot parse → refused \"malformed\"", async () => {
  const { readRecord } = await import("@/lib/steps/recordRegistry");
  const { FRAMES_ALTS } = await import("@/lib/frames/records");
  await putRaw("p-bad", "frames-alts", { byFrame: "not a map", v: 1 });
  const r = await readRecord(FRAMES_ALTS, "p-bad");
  expect(!r.ok && "refused" in r && r.refused).toBe("malformed");
});
