// LANE — AN ATTACHED MUSIC-VIDEO TRACK CAN BE REPLACED, AND IS NAMED AFTER A
// RELOAD (static + pure, card attached-track-replace).
//
// BEFORE: the Dropzone rendered only while `!mv.envelope`, so a wrong mp3 had
// no way back; and the name lived in `useState` set only by `attach`, so a
// reload drew six numbers with nothing saying which track they described.
//
// THE DECISION, held by the unit below: replacing a track CLEARS the fields
// keyed to the old one (`posterAssetId`, `seed`, `effectParams`) and keeps
// `style`. A poster generated for another song's mood, a seed "locked once set"
// and compositor parameters would otherwise survive against a different track
// with no mark. Frames reads absence as "not generated yet" already, so no
// Frames code changes. Records with no name field stay valid: the name is
// derived from the Asset row `sourceAssetId` points at (`meta.fileName`).
import "fake-indexeddb/auto";

import { readFileSync } from "node:fs";

import { test, expect } from "@playwright/test";

import { downstreamCount, withTrack } from "@/app/_phases/_shared/stepStore";

import { stripComments } from "./_helpers";

test("the Dropzone renders with an envelope present, not only without one", () => {
  const src = stripComments(readFileSync("app/_phases/research/MusicVideoResearch.tsx", "utf8"));
  expect(src.length).toBeGreaterThan(0);
  expect(src).not.toMatch(/!mv\.envelope\s*&&\s*\(\s*<div data-world/);
  expect(src).toMatch(/<Dropzone/);
  expect(src).toMatch(/mv\.trackName/);
});

test("the hook resolves the name from the stored Asset on hydration", () => {
  const src = stripComments(readFileSync("app/_phases/research/useMusicVideoSource.ts", "utf8"));
  expect(src.length).toBeGreaterThan(0);
  expect(src).toMatch(/getAsset\(saved\.sourceAssetId\)/);
});

test("replacement fields: new track in, downstream WP3 fields out, style and unknowns kept", () => {
  const env = { durationS: 1 } as never;
  const old = {
    sourceAssetId: "old",
    style: "neon",
    envelope: { durationS: 9 } as never,
    posterAssetId: "poster",
    seed: 7,
    effectParams: { a: 1 },
    savedAt: 3,
  };
  const next = withTrack(old, { sourceAssetId: "new", envelope: env });
  expect(next.sourceAssetId).toBe("new");
  expect(next.envelope).toBe(env);
  expect(next.style).toBe("neon");
  for (const k of ["posterAssetId", "seed", "effectParams"]) expect(k in next, `${k} must be absent`).toBe(false);

  // An old record with no name and nothing downstream, and a first attach.
  expect(withTrack(undefined, { sourceAssetId: "a", envelope: env })).toEqual({ sourceAssetId: "a", envelope: env });
});

// An accidental drop must not silently clear the poster, seed and effect
// settings: with an envelope AND downstream fields, the drop waits for a confirm.
test("a replace over downstream work routes through the destructive confirm", () => {
  const ui = stripComments(readFileSync("app/_phases/research/MusicVideoResearch.tsx", "utf8"));
  const hook = stripComments(readFileSync("app/_phases/research/useMusicVideoSource.ts", "utf8"));
  expect(ui.length).toBeGreaterThan(0);
  expect(hook.length).toBeGreaterThan(0);
  expect(ui).toMatch(/onFiles=\{mv\.requestAttach\}/);
  expect(ui).not.toMatch(/onFiles=\{mv\.attach\}/);
  expect(ui).toMatch(/<ConfirmDialog[\s\S]*?onCancel=\{mv\.cancelReplace\}[\s\S]*?onConfirm=\{mv\.confirmReplace\}/);
  expect(hook).toMatch(/if \(envelope && downstream > 0\) setPending\(file\)/);
  expect(hook).toMatch(/else void attach\(\[file\]\)/);
});

test("downstreamCount: none → 0 (no confirm), any Frames field → counted", () => {
  expect(downstreamCount(undefined)).toBe(0);
  expect(downstreamCount({ sourceAssetId: "a", style: "x" })).toBe(0);
  expect(downstreamCount({ posterAssetId: "p", seed: 0 })).toBe(2);
});
