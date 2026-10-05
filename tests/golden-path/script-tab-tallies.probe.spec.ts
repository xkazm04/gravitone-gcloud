// SOURCE RATCHET — each tab's tally counts the version THAT tab draws.
//
// The chips were computed from `shown`, which depends on the ACTIVE tab, so the
// Tracks chip could count a staged candidate while Tracks always draws the
// baseline, and the Coverage chip changed value when another tab was opened.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

const src = stripComments(readFileSync(join(process.cwd(), "app/_phases/script/ScriptStep.tsx"), "utf8"));
const at = src.indexOf("const state = ready");
const state = src.slice(at, src.indexOf("const tallyFor", at));

test("the tally expression was found", () => {
  expect(at).toBeGreaterThan(-1);
  expect(state.length).toBeGreaterThan(100);
});

test("no tally count reads the active-tab-dependent `shown`", () => {
  expect((state.match(/\(shown,/g) ?? []).length).toBe(0);
});

test("the Tracks count reads the baseline Tracks draws", () => {
  expect(state).toContain("usageIn(versions.baseline");
});
