// LANE — THE AUDIO MODULE'S LEDGER IS WHAT IS ON DISK (dynamic).
//
// The Library's audio module was ported from the contest entry it was judged
// on (2026-10-05, platform-consolidation WP1). The entry persisted to its own
// localStorage overlay; the port puts every per-take judgment on lib/assets
// (Asset.meta through updateAssetMeta) and derives "proven" from the scores
// instead of storing it. Three things can silently go wrong with that, and each
// is a test here, run against fake-indexeddb so the store is the real code:
//
//   1. THE SEED. 160 fixture rows, flagged as fixture, none storing "proven",
//      and covering every id of the eight-row seed it replaces — otherwise an
//      account that held the old seed keeps eight orphans beside the new one.
//   2. THE ROUND TRIP. A rejection with its reason and a single rubric score,
//      written the way the page writes them, read back through a fresh list
//      (what a reload does), come back as the same verdict, reason and score.
//   3. THE DERIVATION. A kept take is "proven" only when it scores 7+; a row
//      the previous module stored as "proven" reads as kept, and its verdict
//      then follows the scores like any other.

import "fake-indexeddb/auto";

import { test, expect } from "@playwright/test";

import { listAssets, putAssets, updateAssetMeta } from "@/lib/assets";
import { seedAudioAssets } from "@/app/library/audio/audioSeed";
import { counts, takeFromAsset, verdict, vocabulary } from "@/app/library/audio/book";

const UID = "uid-audio-probe";

/** The ids the first audio seed (2026-10-04, eight hand-written rows) wrote. */
const LEGACY_IDS = [
  "seed-au-trk-0001",
  "seed-au-trk-0002",
  "seed-au-trk-0003",
  "seed-au-trk-0004",
  "seed-au-trk-0005",
  "seed-au-sfx-0001",
  "seed-au-sfx-0002",
  "seed-au-sfx-0003",
];

test("seed: 160 fixture rows, flagged, no stored 'proven', covering the old seed's ids", () => {
  const now = Date.parse("2026-10-05T12:00:00Z");
  const rows = seedAudioAssets(UID, now);
  console.log(`[audio] seed rows=${rows.length}`);
  expect(rows.length).toBe(160);
  for (const r of rows) {
    expect(r.uid).toBe(UID);
    expect(r.kind).toBe("audio");
    expect(r.path).toEqual(["audio"]);
    expect(r.id.startsWith("seed-au-")).toBe(true);
    expect(r.meta?.fixture, `${r.id} is not flagged as fixture`).toBe(true);
    expect(["unjudged", "kept", "rejected"]).toContain(r.meta?.verdict);
  }
  expect(new Set(rows.map((r) => r.id)).size).toBe(160);
  const ids = new Set(rows.map((r) => r.id));
  for (const id of LEGACY_IDS) expect(ids.has(id), `${id} from the old seed would be orphaned`).toBe(true);
  // Re-dated against the clock it is given: the newest row reads an hour old.
  expect(Math.max(...rows.map((r) => r.createdAt))).toBe(now - 60 * 60 * 1000);

  const takes = rows.map(takeFromAsset);
  const tracks = takes.filter((t) => t.kind === "track").length;
  console.log(`[audio] tracks=${tracks} effects=${takes.length - tracks} verdicts=${JSON.stringify(counts(takes))}`);
  expect(tracks).toBe(110);
  // The fixture's own statuses: 68 kept (proven or not), 37 rejected, 55 unrated.
  const c = counts(takes);
  expect(c.proven + c.kept).toBe(68);
  expect(c.rejected).toBe(37);
  expect(c.unjudged).toBe(55);
  // The vocabulary reads off tracks only, and has something to read.
  expect(vocabulary(takes, {}).length).toBeGreaterThan(20);
});

test("round trip: a rejection, its reason and one score survive a fresh read", async () => {
  await putAssets(seedAudioAssets(UID));
  const before = (await listAssets(UID)).filter((a) => a.kind === "audio").map(takeFromAsset);
  const target = before.find((t) => t.kind === "track" && verdict(t) === "unjudged" && !t.ratings);
  expect(target, "the fixture has an unjudged, unscored track").toBeTruthy();

  // Exactly the two writes the page makes (AudioWorkbench.tsx#rate, #reject).
  await updateAssetMeta(target!.id, { ratings: { melody: 3, instrument_choice: null, instrument_quality: null } });
  await updateAssetMeta(target!.id, { verdict: "rejected", reject_reason: "mix is harsh above 4kHz" });

  const after = (await listAssets(UID)).map(takeFromAsset).find((t) => t.id === target!.id)!;
  console.log(`[audio] ${after.id} → ${verdict(after)} "${after.reject_reason}" mel=${after.ratings?.melody}`);
  expect(verdict(after)).toBe("rejected");
  expect(after.reject_reason).toBe("mix is harsh above 4kHz");
  expect(after.ratings).toEqual({ melody: 3, instrument_choice: null, instrument_quality: null });

  // Clearing writes the reason away, not an empty string.
  await updateAssetMeta(target!.id, { verdict: "unjudged", reject_reason: undefined });
  const cleared = (await listAssets(UID)).map(takeFromAsset).find((t) => t.id === target!.id)!;
  expect(verdict(cleared)).toBe("unjudged");
  expect(cleared.reject_reason).toBeNull();
});

test("derivation: proven is kept AND scoring 7+, and a stored 'proven' reads as kept", () => {
  const base = seedAudioAssets(UID)[0];
  const as = (meta: Record<string, unknown>) => takeFromAsset({ ...base, meta: { ...base.meta, ...meta } });
  const hi = { melody: 8, instrument_choice: 8, instrument_quality: 7 };
  const lo = { melody: 4, instrument_choice: 5, instrument_quality: 6 };
  expect(verdict(as({ verdict: "kept", ratings: hi }))).toBe("proven");
  expect(verdict(as({ verdict: "kept", ratings: lo }))).toBe("kept");
  expect(verdict(as({ verdict: "kept", ratings: undefined }))).toBe("kept");
  expect(verdict(as({ verdict: "proven", ratings: lo }))).toBe("kept");
  expect(verdict(as({ verdict: "proven", ratings: hi }))).toBe("proven");
  expect(verdict(as({ verdict: "rejected", ratings: hi }))).toBe("rejected");
});
