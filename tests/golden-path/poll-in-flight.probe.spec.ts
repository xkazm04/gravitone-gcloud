// LANE — A SLOW POLL RESPONSE MUST NOT MULTIPLY REQUESTS.
// usePolling skips a tick while the previous call's promise is pending, and
// abandons a call that has been pending past IN_FLIGHT_CAP_MS so a request that
// never settles cannot stall the poll forever.
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

// "The foundry's one poll hands the hook its promise" retired with v1's /foundry (Phase 6 wave C):
// its FoundryView polled the forge's run list for the plant's cull dot, and the Floor that replaced
// it reads its lanes on the server per render, so no poller is left there to hand anything. The
// rule itself (`mayTick`) is held above, and lib/jobs.tsx still polls through it.
