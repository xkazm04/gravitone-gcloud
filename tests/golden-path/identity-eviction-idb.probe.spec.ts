// LANE — IDENTITY-SCOPED-EVICTION, the IndexedDB half (dynamic).
//
// Registry: client-state / identity-scoped-eviction.
//
// identity-and-writes.probe.spec.ts drives the trigger table and the
// localStorage half of `evictIdentity` and says, in its own header, that the
// IDB transaction itself is NOT covered. This file closes that gap against
// fake-indexeddb — the same engine adopted-render and the DAL probes already
// run on — because the defect it was written for lived exactly there:
//
//   THE BYTES SURVIVED THE ROWS. An uploaded reference is the one case where
//   the shelf owns bytes (lib/assets.ts): the asset row keeps an `upload:<id>`
//   pointer and the Blob sits in UPLOADS_STORE with no uid on it. The eviction
//   deleted asset rows by KEY through the by-uid index and never read them, so
//   it never followed a pointer — every picture the departed account had handed
//   over stayed resident under an id nothing could name again, still spending
//   the quota and still readable by anything that opened the store. Measured
//   before the fix: 2 of 2 upload records survived the eviction of the account
//   that owned them.
//
// Both accounts are seeded so the assertion is two-sided: the departed
// account's rows AND bytes are gone, the other account's rows AND bytes are
// untouched. A wipe that took everybody's uploads would pass a one-sided check.

// The storage engine on globalThis before any module under test reads
// `indexedDB`. lib/studioDb.ts opens per operation, so this has to come first.
import "fake-indexeddb/auto";

import { test, expect } from "@playwright/test";

import { assetFromUpload, getUploadBlobs, listAssets, putUploads } from "@/lib/assets";
import { evictIdentity } from "@/lib/identityEviction";
import { listProjects, newProject, putProject } from "@/lib/projects";

const png = (name: string) => new File([new Uint8Array([137, 80, 78, 71, 1, 2, 3])], name, { type: "image/png" });

test("eviction: the departed account's upload BYTES go with its rows — and nobody else's do", async () => {
  const a1 = assetFromUpload("uid-a", png("plate-one.png"), ["refs"]);
  const a2 = assetFromUpload("uid-a", png("plate-two.png"), ["refs"]);
  const b1 = assetFromUpload("uid-b", png("theirs.png"), ["refs"]);
  await putUploads([a1, a2, b1]);
  await putProject(
    newProject("uid-a", {
      title: "departing",
      logline: "",
      template: "short-educational-video",
      discipline: "educational",
      targetS: 120,
      themeId: "t-1",
    }),
  );

  // The seed landed: three upload records are readable, two of them uid-a's.
  const before = await getUploadBlobs([a1.upload.id, a2.upload.id, b1.upload.id]);
  expect(before.size).toBe(3);

  const report = await evictIdentity("uid-a", "account-switched");
  console.log(
    `[identity] idb eviction -> projects=${report.projects} assets=${report.assets} uploads=${report.uploads} failed=${report.failed}`,
  );

  // THE BYTES, first, because they are the finding: uid-a's two are unreadable,
  // uid-b's one is intact. (Before the fix: all three still readable.)
  const after = await getUploadBlobs([a1.upload.id, a2.upload.id, b1.upload.id]);
  expect([...after.keys()]).toEqual([b1.upload.id]);

  // The rows are gone for uid-a and present for uid-b.
  expect(await listProjects("uid-a")).toEqual([]);
  expect((await listAssets("uid-a")).length).toBe(0);
  expect((await listAssets("uid-b")).map((r) => r.id)).toEqual([b1.asset.id]);

  // And the report says what it took, byte records apart from rows.
  expect(report.failed).toBe(false);
  expect(report.projects).toBe(1);
  expect(report.assets).toBe(2);
  expect(report.uploads).toBe(2);
});

test("eviction: an asset that only POINTS at bytes elsewhere counts as a row, not an upload", async () => {
  // A shelf of file-on-disk pointers has assets and no uploads; the report must
  // say so rather than count every row as bytes it did not touch.
  const u = assetFromUpload("uid-c", png("one.png"), []);
  await putUploads([u]);
  const { putAssets } = await import("@/lib/assets");
  await putAssets([
    { ...u.asset, id: "as-pointer-only", src: "/frames/plate.png", meta: {} },
  ]);

  const report = await evictIdentity("uid-c", "signed-out");
  expect(report.assets).toBe(2);
  expect(report.uploads).toBe(1);
  expect((await listAssets("uid-c")).length).toBe(0);
});
