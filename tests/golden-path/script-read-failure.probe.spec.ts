// SOURCE RATCHET — a failed Research read is a storage error, not missing research.
//
// `loadStep` flattens a failed read to the seeded default, so the Script step drew
// "blocked at Research, Open Research" over research that was done. `readStep`
// tells never-written from unreadable; the Notice comes before the UpstreamBreak.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

const src = stripComments(readFileSync(join(process.cwd(), "app/_phases/script/ScriptStep.tsx"), "utf8"));

test("ScriptStep was read", () => {
  expect(src.length).toBeGreaterThan(1000);
});

test("the Research record is read with readStep, never the flattening loadStep", () => {
  expect((src.match(/loadStep[^;]*"research"\)/g) ?? []).length).toBe(0);
  expect((src.match(/readStep\(/g) ?? []).length).toBeGreaterThanOrEqual(2);
});

test("a trouble Notice precedes the first UpstreamBreak, and both halves render it", () => {
  const notice = src.indexOf("<Notice");
  const upstream = src.indexOf("<UpstreamBreak");
  expect(notice).toBeGreaterThan(-1);
  expect(upstream).toBeGreaterThan(-1);
  expect(notice).toBeLessThan(upstream);
  expect((src.match(/<ResearchReadTrouble trouble=/g) ?? []).length).toBe(2);
});
