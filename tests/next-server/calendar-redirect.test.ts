import { describe, expect, it } from "vitest";

import { v1CalendarTarget } from "../../app/(studio)/calendar/redirect.ts";

// v1's /calendar (its own page, its tab in the query) is the Floor's month now; a slot address
// opens that slot's record over the month (COMMON decision 5: `/calendar` -> `/floor?cal=1`).
describe("a v1 calendar address", () => {
  it("opens the Floor's month", () => {
    expect(v1CalendarTarget({})).toBe("/floor?cal=1");
  });

  it("carries a slot, so its record opens over the month", () => {
    expect(v1CalendarTarget({ slot: "sl-2026-10-17-a" })).toBe("/floor?cal=1&slot=sl-2026-10-17-a");
  });

  it("encodes the slot id, never splices it raw", () => {
    expect(v1CalendarTarget({ slot: "sl:a+b" })).toBe("/floor?cal=1&slot=sl%3Aa%2Bb");
  });

  it("drops a slot id the Floor itself would refuse, and an empty one", () => {
    expect(v1CalendarTarget({ slot: "a/b?c" })).toBe("/floor?cal=1");
    expect(v1CalendarTarget({ slot: "" })).toBe("/floor?cal=1");
  });
});
