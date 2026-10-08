// LANE: copy names a surface that exists on the screen it renders on.
//
// LiveResult is mounted only in the guided wizard, which has no triage board;
// its foot said "the triage board below" and hardcoded the stand-in's date.
//
// research-scope-board-A stage 3 (2026-10-07): the foot line is gone. It said
// the takes still dealt from the stand-in, and they deal from this notebook
// now, so the assertion that its date was read from data (`NOTEBOOK.researched`)
// became an assertion that the old rule was still printed. It is replaced by
// its inverse: the card names no stand-in.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

test("LiveResult points at no 'triage board below', hardcodes no date, and names no stand-in", () => {
  const src = stripComments(readFileSync(join(process.cwd(), "app/_phases/research/run/LiveResult.tsx"), "utf8"));
  expect(src.length, "LiveResult read as empty").toBeGreaterThan(500);
  expect(src).not.toContain("triage board below");
  expect(src).not.toMatch(/2026-\d\d-\d\d/);
  expect(src).not.toContain("stand-in");
  expect(src).not.toContain("NOTEBOOK.researched");
});
