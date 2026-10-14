// LANE -- A POLLED VALUE KEPT AFTER A FAILED POLL TRAVELS WITH ITS AGE AND HEALTH.
// The foundry views keep the last run detail when a poll fails (the cache survives
// the close). lib/pollFreshness.ts says how old it is and whether the edge is
// healthy; each view renders that beside the value, not only beside the run list.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { MAX_ACTIONABLE_AGE_MS, formatAge, pollFreshness } from "@/lib/pollFreshness";

test("no failure yet: fresh", () => {
  expect(pollFreshness(null, null, 5_000).state).toBe("fresh");
  expect(pollFreshness(1_000, null, 5_000).state).toBe("fresh");
});

test("a failure after the last success: degraded, carrying the value's age", () => {
  expect(pollFreshness(1_000, 5_000, 9_000)).toEqual({ state: "degraded", ageMs: 8_000 });
});

test("past the age bound the value is inadmissible, not merely old", () => {
  expect(pollFreshness(0, 4_000, MAX_ACTIONABLE_AGE_MS).state).toBe("degraded");
  expect(pollFreshness(0, 4_000, MAX_ACTIONABLE_AGE_MS + 1).state).toBe("lapsed");
});

test("only a success newer than the failure restores health", () => {
  expect(pollFreshness(6_000, 5_000, 9_000).state).toBe("fresh");
  expect(pollFreshness(5_000, 5_000, 9_000).state).toBe("fresh");
});

test("a failure before any success has no value to age: fresh (the Loading state owns it)", () => {
  expect(pollFreshness(null, 5_000, 9_000).state).toBe("fresh");
});

test("age reads coarse", () => {
  expect(formatAge(42_000)).toBe("42 s");
  expect(formatAge(300_000)).toBe("5 min");
});

test("every view that keeps a polled detail marks it", () => {
  for (const f of ["ExtractView", "StripsView", "DojoView"]) {
    const src = readFileSync(join(process.cwd(), `app/foundry/${f}.tsx`), "utf8");
    expect(src, f).toMatch(/pollOk\(\);/);
    expect(src, f).toMatch(/pollFail\(\);/);
    expect(src, f).toMatch(/<StalePoll freshness=\{pollFresh\.freshness\} \/>/);
  }
});
