// LANE — AN EMPTY GAP LIST IS DRAWN AS EMPTY (static).
//
// migrationMap.ts's GAPS is [] once every measured gap is closed. The Migration tab
// must not then show a live (amber, pulsing) tally on 0 above a header-only table:
// the tally goes neutral and the table gives way to a Ghost row.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

const ROOT = resolve(__dirname, "..", "..");
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), "utf8"));

test("the migration tally is live only while gaps exist", () => {
  const src = read("app/kit/KitView.tsx");
  expect(src.length).toBeGreaterThan(0);
  expect(src).toMatch(/GAPS\.length\s*\?\s*"amber"/);
  expect(src).not.toMatch(/tone:\s*"amber"\s*\}/);
});

test("the gaps table has an empty branch drawn as a Ghost", () => {
  const src = read("app/kit/Migration.tsx");
  expect(src.length).toBeGreaterThan(0);
  expect(src).toContain("<Ghost");
  expect(src).toMatch(/ranked\.length\s*===\s*0|ranked\.length\s*\?/);
});
