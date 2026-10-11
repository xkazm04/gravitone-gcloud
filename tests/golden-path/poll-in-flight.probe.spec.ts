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

test("the foundry polls hand the hook their promises", () => {
  for (const f of ["FoundryView", "ExtractView", "DojoView", "StripsView"]) {
    const src = readFileSync(join(process.cwd(), `app/foundry/${f}.tsx`), "utf8");
    expect(src, f).toMatch(/return Promise\.all\(\[loadDetail\(selected, true\)/);
  }
});
