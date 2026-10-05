// LANE — THE TRAILER HALF OF SCRIPT DRAWS "NO SPINE" AS THE CHAIN, WITH A WAY BACK.
//
// ScriptStep's explainer and music-video halves draw an upstream-blocked step as
// <UpstreamBreak> with an "Open Research" action. The trailer half was the one
// branch still written as a Notice and an essay about the app, with no control —
// and Frames sends trailer creators here with a "Compose the cut" button, so the
// dead end sat one click from a screen built to route people into it.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

const FILE = join(process.cwd(), "app/_phases/script/trailer/TrailerScript.tsx");

test("the trailer no-spine state is an UpstreamBreak with a way to Research", () => {
  const raw = readFileSync(FILE, "utf8");
  expect(raw.length, "the walk read nothing").toBeGreaterThan(0);
  const src = stripComments(raw);

  expect(src).toContain("<UpstreamBreak");
  expect(src).toContain('blockedAt="research"');
  expect(src).toContain("?step=research");
  expect(src).toMatch(/import\s*\{[^}]*\bUpstreamBreak\b[^}]*\}\s*from\s*"@\/components\/ui\/signal"/);
  expect(src, "the app narrating itself is gone").not.toContain("The Script step opens on");
  expect(src, "the stale-spine warning still uses Notice").toContain("<Notice");
});
