// LANE — AN EMPTY GAP LIST IS DRAWN AS EMPTY (static).
//
// The gap count is computed from app/kit/census.json (KIT-A, 2026-10-05; it was
// migrationMap.ts's hand-typed GAPS before) and is 0 once every measured gap is
// closed. The Migration tab must not then show a live (amber, pulsing) tally on 0,
// and a list with nothing in it gives way to a Ghost row, never a header-only table.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

const ROOT = resolve(__dirname, "..", "..");
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), "utf8"));

test("the migration tally is live only while gaps exist", () => {
  const src = read("app/kit/KitView.tsx");
  expect(src.length).toBeGreaterThan(0);
  expect(src).toMatch(/GAP_COUNT\s*\?\s*"amber"/);
  expect(src).not.toMatch(/tone:\s*"amber"\s*\}/);
});

test("the lists that can be empty have an empty branch drawn as a Ghost", () => {
  const src = read("app/kit/Migration.tsx");
  expect(src.length).toBeGreaterThan(0);
  expect(src).toContain("<Ghost");
  expect(src).toMatch(/unclaimed\.length\s*===\s*0/);
  expect(src).toMatch(/zeroAdopters\.length\s*===\s*0/);
});
