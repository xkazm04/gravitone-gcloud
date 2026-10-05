// LANE: copy names a surface that exists on the screen it renders on.
//
// LiveResult is mounted only in the guided wizard, which has no triage board;
// its foot said "the triage board below" and hardcoded the stand-in's date.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

test("LiveResult points at no 'triage board below' and reads the date from data", () => {
  const src = stripComments(readFileSync(join(process.cwd(), "app/_phases/research/run/LiveResult.tsx"), "utf8"));
  expect(src.length, "LiveResult read as empty").toBeGreaterThan(500);
  expect(src).not.toContain("triage board below");
  expect(src).not.toMatch(/2026-\d\d-\d\d/);
  expect(src).toContain("NOTEBOOK.researched");
});
