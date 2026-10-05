// LANE — THE LIBRARY'S MOVE TO THE SOUND STORE (dynamic, offline).
//
// app/library/audio/soundMigration.ts pushes this browser's IndexedDB audio
// rows to the server's sound store once per account; ./soundAdapter.ts maps
// the Library's Asset/AudioMeta model onto SoundTake and back. Three things
// can silently go wrong, and each is a test here, end to end against the REAL
// pieces — fake-indexeddb for the browser store, the REAL /api/sound/takes
// handler behind a replaced `fetch` (the client's relative URL is routed into
// it), a temp directory for the server store:
//
//   1. THE MOVE: every row lands — 160 fixtures as origin "fixture" with no
//      bytes, a returned take with its bytes — and the per-account mark is set.
//   2. NO DUPLICATES: a second move with the mark lost files nothing new (the
//      store is idempotent by id), and a move with the mark set does nothing.
//   3. THE ROUND TRIP: what the Library reads back (takeFromAsset over the
//      adapter) is the verdict, reason, scores, reference, round and draft link
//      it held before — including the facts the store has no field for, which
//      ride in the per-account annex.

import "fake-indexeddb/auto";

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { ACCESS_SECRET_VAR, __resetRateLimit } from "@/lib/apiAuth";
import { assetFromUpload, putAssets, putUploads } from "@/lib/assets";
import { readLedger, readTakes } from "@/lib/sound/store";
import { seedAudioAssets } from "@/app/library/audio/audioSeed";
import { takeFromAsset } from "@/app/library/audio/book";
import { assetFromSoundTake, splitPatch, uploadMetaOf } from "@/app/library/audio/soundAdapter";
import { loadAnnex } from "@/app/library/audio/soundAnnex";
import { alreadyMigrated, migrateShelf } from "@/app/library/audio/soundMigration";
import { POST as takesPOST } from "@/app/api/sound/takes/route";
import { userScopedLocalKeys } from "@/lib/identityEviction";

import { keepEnv } from "./_helpers";

const SECRET = "migration-probe-secret";
keepEnv(["SOUND_STORE_DIR", "SOUND_LEDGER_PATH", "NEXT_PUBLIC_IMAGING_ACCESS_SECRET", "NEXT_PUBLIC_DEV_AUTH", ACCESS_SECRET_VAR]);

let root = "";
const realFetch = globalThis.fetch;
const ls = new Map<string, string>();
let posts = 0;

test.beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "sound-migration-"));
  process.env.SOUND_STORE_DIR = path.join(root, "store");
  process.env.SOUND_LEDGER_PATH = path.join(root, "ledger.json");
  process.env[ACCESS_SECRET_VAR] = SECRET;
  process.env.NEXT_PUBLIC_IMAGING_ACCESS_SECRET = SECRET;
  delete process.env.NEXT_PUBLIC_DEV_AUTH;
  __resetRateLimit();
  ls.clear();
  posts = 0;
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => (ls.has(k) ? ls.get(k)! : null),
    setItem: (k: string, v: string) => void ls.set(k, v),
    removeItem: (k: string) => void ls.delete(k),
  };
  // The browser client calls `/api/sound/takes`; route it into the real handler.
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === "/api/sound/takes" && init?.method === "POST") {
      posts++;
      return takesPOST(new Request(`http://localhost${url}`, init));
    }
    throw new Error(`probe: unexpected network call to ${url}`);
  }) as typeof fetch;
});

test.afterEach(() => {
  globalThis.fetch = realFetch;
  delete (globalThis as { localStorage?: unknown }).localStorage;
  rmSync(root, { recursive: true, force: true });
});

test("move: every IndexedDB row lands once — fixtures without bytes, a return with its bytes — and a second move files nothing new", async () => {
  const UID = "uid-migrate-a";
  await putAssets(seedAudioAssets(UID));
  ls.set(`gravitone.audio-seeded.v2.${UID}`, "1");
  const file = new File([new Uint8Array(3000).fill(9)], "suno-return.mp3", { type: "audio/mpeg" });
  const pair = assetFromUpload(UID, file, ["audio"], "audio");
  pair.asset.meta = {
    ...(pair.asset.meta ?? {}),
    verdict: "rejected",
    reject_reason: "mix is harsh above 4kHz",
    vendor: "suno",
    draft_id: "dr-probe",
    reference_track_id: "ref-ratatat-breaking-away",
    ratings: { melody: 4, instrument_choice: 6, instrument_quality: null },
    genre_tags: ["nu-disco"],
  };
  await putUploads([pair]);

  const first = await migrateShelf(UID);
  console.log(`[migrate] first move: pushed=${first.pushed} landed=${first.landed} failed=${first.failed.length}`);
  expect(first.failed).toEqual([]);
  expect(first.landed).toBe(161);
  expect(alreadyMigrated(UID)).toBe(true);
  let { takes } = await readTakes();
  expect(takes.length).toBe(161);
  expect(takes.filter((t) => t.origin === "fixture").length).toBe(160);
  expect(takes.filter((t) => t.origin === "fixture").every((t) => t.file === null)).toBe(true);
  const ret = takes.find((t) => t.id === pair.asset.id)!;
  expect(ret).toMatchObject({ origin: "suno-return", provider: "suno", verdict: "rejected", reasons: [], note: "mix is harsh above 4kHz" });
  expect(ret.file?.bytes).toBe(3000);
  expect((await readLedger()).verdicts.map((v) => v.takeId), "the real rejection is a judgement; no fixture is").toEqual([ret.id]);

  // The mark set: a reload does nothing.
  const again = await migrateShelf(UID);
  expect(again.skipped).toBe(true);
  // The mark lost (a cleared site, a second account carrying the same rows):
  // everything is pushed again and the store files nothing new.
  ls.delete(`gravitone.sound-migrated.v1.${UID}`);
  const before = posts;
  const third = await migrateShelf(UID);
  expect(posts - before).toBe(161);
  expect(third.failed).toEqual([]);
  ({ takes } = await readTakes());
  console.log(`[migrate] after a re-push with the mark lost: ${takes.length} takes`);
  expect(takes.length, "a re-push filed duplicates").toBe(161);
  expect(new Set(takes.map((t) => t.id)).size).toBe(161);
});

test("round trip: the Library reads back what it held — verdict, reason, scores, reference, round, draft link", async () => {
  const UID = "uid-migrate-b";
  ls.set(`gravitone.audio-seeded.v2.${UID}`, "1");
  const seed = seedAudioAssets(UID);
  const withRef = seed.find((a) => (a.meta as Record<string, unknown>).reference_track_id && (a.meta as Record<string, unknown>).prompt_round)!;
  await putAssets([withRef]);
  const file = new File([new Uint8Array(2000).fill(1)], "return.wav", { type: "audio/wav" });
  const pair = assetFromUpload(UID, file, ["audio"], "audio");
  pair.asset.meta = { ...(pair.asset.meta ?? {}), verdict: "kept", vendor: "suno", draft_id: "dr-x", parent_id: withRef.id, ratings: { melody: 9, instrument_choice: 8, instrument_quality: 7 } };
  await putUploads([pair]);

  const before = { fx: takeFromAsset(withRef), ret: takeFromAsset(pair.asset) };
  expect((await migrateShelf(UID)).failed).toEqual([]);
  const annex = loadAnnex(UID);
  const { takes } = await readTakes();
  const back = new Map(takes.map((t) => [t.id, takeFromAsset(assetFromSoundTake(t, UID, annex[t.id]))] as const));

  const fx = back.get(withRef.id)!;
  for (const k of ["title", "kind", "status", "ratings", "reject_reason", "genre_tags", "mood_tags", "instrumentation", "tempo_bpm", "key", "reference_track_id", "prompt_round", "sfx_category", "loopable"] as const)
    expect(fx[k], `fixture ${k}`).toEqual(before.fx[k]);
  expect(fx.fixture).toBe(true);
  expect(fx.created_at).toBe(before.fx.created_at);

  const ret = back.get(pair.asset.id)!;
  expect(ret).toMatchObject({ status: "kept", vendor: "suno", draft_id: "dr-x", parent_id: withRef.id, file_name: "return.wav", upload_id: pair.asset.id });
  expect(ret.ratings).toEqual(before.ret.ratings);
  expect(ret.stage, "a kept take is on the board").toBe("pending");
  expect(ret.fixture).toBe(false);
  console.log(`[migrate] round trip ok: fixture ref=${fx.reference_track_id} round=${fx.prompt_round}; return draft=${ret.draft_id}`);
});

test("fresh account: no IndexedDB rows and no old seed — the 160 examples go straight to the store", async () => {
  const report = await migrateShelf("uid-migrate-fresh");
  expect(report.failed).toEqual([]);
  expect(report.landed).toBe(160);
  expect((await readTakes()).takes.every((t) => t.origin === "fixture")).toBe(true);
});

test("adapter: an effect's three slots are its own rubric; a defect code is a code, other words are the note", () => {
  expect(splitPatch("sfx", { ratings: { melody: 5, instrument_choice: 6, instrument_quality: null } }).patch.ratings).toEqual({
    event_match: 5,
    sound_quality: 6,
    loop_seam: null,
  });
  expect(splitPatch("music", { ratings: { melody: 5, instrument_choice: 6, instrument_quality: 7 } }).patch.ratings).toEqual({
    melody: 5,
    instrument_choice: 6,
    instrument_quality: 7,
  });
  expect(splitPatch("music", { verdict: "rejected", reject_reason: "loop-seam" }).patch).toEqual({ verdict: "rejected", reasons: ["loop-seam"], note: null });
  expect(splitPatch("music", { verdict: "rejected", reject_reason: "muddy low end" }).patch).toEqual({ verdict: "rejected", reasons: [], note: "muddy low end" });
  expect(splitPatch("music", { verdict: "proven" }).patch.verdict, "proven is never stored").toBe("kept");
  const { meta } = uploadMetaOf({ verdict: "unjudged", sfx_category: "impacts", loopable: true }, {});
  expect(meta).toMatchObject({ kind: "sfx", provider: "local", origin: "import", loop: true });
});

test("the two new per-account keys are on the eviction list", () => {
  const keys = userScopedLocalKeys("uid-x");
  expect(keys).toContain("gravitone.sound-migrated.v1.uid-x");
  expect(keys).toContain("gravitone.audio-annex.uid-x");
});
