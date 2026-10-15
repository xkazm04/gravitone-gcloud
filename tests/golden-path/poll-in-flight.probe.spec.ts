// LANE — A SLOW POLL RESPONSE MUST NOT MULTIPLY REQUESTS.
// usePolling skips a tick while the previous call's promise is pending, and
// abandons a call that has been pending past IN_FLIGHT_CAP_MS so a request that
// never settles cannot stall the poll forever.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { IN_FLIGHT_CAP_MS, mayTick } from "@/lib/usePolling";

test("no call in flight: the tick runs", () => {
  expect(mayTick(null, 1_000)).toBe(true);
});

test("a call in flight inside the cap: the tick is skipped", () => {
  expect(mayTick(1_000, 5_000)).toBe(false);
  expect(mayTick(1_000, 1_000 + IN_FLIGHT_CAP_MS - 1)).toBe(false);
});

test("a call pending past the cap is abandoned: the tick runs", () => {
  expect(mayTick(1_000, 1_000 + IN_FLIGHT_CAP_MS)).toBe(true);
});

test("the foundry's one poll hands the hook its promise", () => {
  // Phase 3 retired the three detail views that polled beside it; the forge's run
  // list is what is left, polled for the plant's cull dot.
  const src = readFileSync(join(process.cwd(), "app/foundry/FoundryView.tsx"), "utf8");
  expect(src).toMatch(/usePolling\(loadRuns,/);
  expect(src).toMatch(/\(\) =>\s*fetchRuns\(\)\.then\(/);
});
