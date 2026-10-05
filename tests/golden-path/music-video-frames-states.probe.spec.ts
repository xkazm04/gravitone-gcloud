// LANE — NO MUSIC-VIDEO FRAMES STATE IS A DEAD END (static).
//
// Once `posterAssetId` existed the generate control never rendered again, so a
// poster whose bytes did not resolve drew nothing at all, and an incomplete
// composition told the creator to "re-generate" with no control on screen. The
// generate block must be reachable whenever the composition is not renderable,
// and an unresolved poster must be a stated state, not a silent null.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

const FILE = join(process.cwd(), "app/_phases/frames/music-video/MusicVideoFrames.tsx");
const src = () => stripComments(readFileSync(FILE, "utf8"));

test("generate block is reachable whenever the composition is not renderable", () => {
  const s = src();
  expect(s.length).toBeGreaterThan(1000);
  const at = s.indexOf('data-testid="music-video-generate-poster"');
  expect(at).toBeGreaterThan(0);
  // The guard that opens the block containing the button must not be the bare
  // `!comp.posterAssetId &&` it used to be.
  const guard = s.lastIndexOf("{", s.lastIndexOf("&&", at));
  expect(s.slice(guard, at)).not.toMatch(/^\{\s*!comp\.posterAssetId\s*&&/);
  expect(s).toMatch(/const renderable\s*=/);
  expect(s).toMatch(/!renderable/);
});

test("an unresolved poster is a stated state and a rejected read is caught", () => {
  const s = src();
  expect(s).toMatch(/loadPosterAsset\([^)]*\)[\s\S]{0,400}\.catch\(/);
  expect(s).toContain('data-testid="music-video-poster-missing"');
  expect(s).not.toContain("re-generate the poster");
});

test("the no-envelope state is the drawn UpstreamBreak with a route to Research", () => {
  const s = src();
  expect(s).toMatch(/import\s*\{[^}]*\bUpstreamBreak\b[^}]*\}\s*from\s*"@\/components\/ui\/signal"/);
  expect(s).toContain('blockedAt="research"');
  expect(s).toContain('current="frames"');
  expect(s).toContain("step=research");
  expect(s).not.toContain("attach one in Research");
});
