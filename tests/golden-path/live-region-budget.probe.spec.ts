// LANE — THE ANNOUNCER'S ONE-WRITER RULE HAS A CEILING (source ratchet).
//
// lib/announcer.tsx rule 2: components ask the service to announce; they do not
// scatter their own live regions, because two regions updated in the same breath
// race and the loser is dropped silently. Nothing measured it. This does not
// migrate anything — whether a given inline role="alert" should move is a
// judgement per site — it pins today's count so the rule stops eroding, the same
// posture check:narration takes for title=. LOWER the budget when you migrate
// one; it may never be raised.
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

const ROOT = join(__dirname, "..", "..");
const DIRS = ["app", "components", "lib"];
const OWNER = "lib/announcer.tsx";
const LIVE = /aria-live=|role="(?:status|alert)"/g;

/** Measured on the tree at 2026-10-05, after comment stripping. */
const LIVE_REGION_BUDGET = 76;

function walk(dir: string, out: string[]): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".tsx")) out.push(p);
  }
}

test("live-region attributes outside the announcer stay under the budget", () => {
  const files: string[] = [];
  for (const d of DIRS) walk(join(ROOT, d), files);
  let count = 0;
  const per: string[] = [];
  for (const f of files) {
    const rel = relative(ROOT, f).split("\\").join("/");
    if (rel === OWNER) continue;
    const n = (stripComments(readFileSync(f, "utf8")).match(LIVE) ?? []).length;
    if (n) per.push(`${rel}:${n}`);
    count += n;
  }
  expect(files.length, "the walk read nothing").toBeGreaterThan(0);
  console.log(`[live-region-budget] ${count} attributes in ${per.length} files`);
  expect(count, `lower LIVE_REGION_BUDGET when you migrate one:\n${per.join("\n")}`).toBeLessThanOrEqual(LIVE_REGION_BUDGET);
});
