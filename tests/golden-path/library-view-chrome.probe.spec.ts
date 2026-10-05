// LANE — LIBRARY CHROME RATCHETS (source, no DOM).
//
// Small, mechanical contracts on app/library and app/_library that a gate
// could not see: one name for the filing unit, selection exposed to
// assistive tech, destructive buttons through the shared primitive, and
// failure copy that is announced. Comments are stripped before matching.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

function read(rel: string): string {
  const src = stripComments(readFileSync(join(process.cwd(), rel), "utf8"));
  expect(src.length, `${rel} read nothing`).toBeGreaterThan(0);
  return src;
}

test("the Assets rail calls its filing unit a folder, never a category", () => {
  expect(read("app/library/AssetsBrowser.tsx")).not.toMatch(/categor/i);
});
