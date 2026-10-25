// A DATED TEXT RATE ENDS (lib/text/pricing.ts): gemini-3.8-flash's introductory rate holds through
// 2026-12-31 and a turn priced for a later day, or for a day that is not a date, is unpriced.

import { describe, expect, it } from "vitest";

import { priceTurn } from "../../lib/text/pricing.ts";

const turn = (on?: string) =>
  priceTurn({ provider: "google", model: "gemini-3.8-flash", inputTokens: 1_000_000, outputTokens: 1_000_000, ...(on === undefined ? {} : { on }) });

describe("priceTurn on a dated rate", () => {
  it("prices at the introductory rate through its last day", () => {
    expect(turn("2026-12-31")).toMatchObject({ basis: "estimated", usd: 0.75 + 3.75 });
  });

  it("is unpriced from the day after, naming the date", () => {
    const q = turn("2027-01-02");
    expect(q.basis).toBe("unpriced");
    expect(q.usd).toBeUndefined();
    expect(q.note).toContain("2026-12-31");
  });

  it("a day that is not an ISO date keeps no ended rate pricing", () => {
    expect(turn("next tuesday").basis).toBe("unpriced");
  });

  it("an undated row is unaffected by the day", () => {
    const q = priceTurn({ provider: "google", model: "gemini-3.6-flash", inputTokens: 10, on: "2099-01-01" });
    expect(q.basis).toBe("unpriced");
    expect(q.note).not.toContain("held until");
  });
});
