// LANE — A BLOCKED FRAMES BATCH SAYS WHEN IT RESUMES AND RE-ARMS THEN (static ratchet).
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

const src = stripComments(readFileSync(join(process.cwd(), "app/_phases/frames/FramesAssembly.tsx"), "utf8"));

test("plan.resumeAt is consumed by the label and by a re-quote timer", () => {
  expect(src.length).toBeGreaterThan(0);
  expect((src.match(/plan\.resumeAt/g) ?? []).length).toBeGreaterThanOrEqual(2);
  expect(src).toMatch(/setTimeout\(/);
  expect(src).toMatch(/clearTimeout\(/);
});

test("the timer lives in an effect keyed on resumeAt", () => {
  const m = src.match(/useEffect\(\(\) => \{[\s\S]*?setTimeout\([\s\S]*?\}, \[([^\]]*)\]\)/);
  expect(m, "no effect holding setTimeout").not.toBeNull();
  expect(m![1]).toContain("plan.resumeAt");
});
