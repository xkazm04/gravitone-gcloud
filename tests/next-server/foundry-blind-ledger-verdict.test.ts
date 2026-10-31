// A ZERO-SAMPLE COMPARISON IS UNMEASURABLE (lib/foundry/training/blind.ts ledgerVerdict).
// The floor check used to carry `&& measure.pairs_n > 0`, so an improvement with no blind
// pairs skipped the floor and reached the training ledger as `better` / `not-better` - a
// verdict about a comparison that never happened. Zero pairs now reads `unmeasurable`,
// whatever the human said and whatever override is set; a small sample still obeys the floor.
import { describe, expect, it } from "vitest";

import { BLIND_FLOOR, ledgerVerdict, measureBlind, type BlindMeasure } from "../../lib/foundry/training/blind.ts";
import type { Improvement, PairResult } from "../../lib/foundry/training/types.ts";

const measure = (pairs_n: number, pairs_total: number): BlindMeasure => ({ pairs_n, pairs_total, human_pick_rate: 0, chokepoint_vs_human: 0 });

const pair = (id: string): PairResult => ({
  id,
  scene: "s",
  seed: 1,
  baseline: { file: `${id}-b.png`, kind: "image" },
  challenger: { file: `${id}-c.png`, kind: "image" },
  judge_pick: "challenger",
  reason: "r",
});
const improvement = (pairs: PairResult[]): Improvement => ({
  id: "imp-1",
  technique: "t",
  subject: "s",
  claim: "c",
  standard: "std",
  pairs,
  challenger_recipe: "cr",
  baseline_recipe: "br",
});

describe("ledgerVerdict", () => {
  it("zero_pairs_is_unmeasurable_not_better", () => {
    const m = measureBlind(improvement([]), { picks: {} }, {});
    expect(m.pairs_n).toBe(0);
    expect(m.pairs_total).toBe(0);
    expect(ledgerVerdict("approve", m, { picks: {} })).toBe("unmeasurable");
    expect(ledgerVerdict("reject", m, undefined)).toBe("unmeasurable");
  });

  it("zero_pairs_is_unmeasurable_even_anchored_or_overridden", () => {
    expect(ledgerVerdict("approve", measure(0, 0), { picks: {}, anchored: true })).toBe("unmeasurable");
    expect(ledgerVerdict("approve", measure(0, 0), { picks: {}, floorOverride: true })).toBe("unmeasurable");
  });

  it("zero_blind_picks_is_unmeasurable_not_lifted_by_floor_override", () => {
    expect(ledgerVerdict("approve", measure(0, 3), { picks: {}, floorOverride: true })).toBe("unmeasurable");
  });

  it("under_floor_is_unmeasurable_unless_overridden", () => {
    expect(ledgerVerdict("approve", measure(2, 2), { picks: {} })).toBe("unmeasurable");
    expect(ledgerVerdict("approve", measure(2, 2), { picks: {}, floorOverride: true })).toBe("better");
  });

  it("at_floor_keeps_the_human_word", () => {
    expect(ledgerVerdict("approve", measure(BLIND_FLOOR, BLIND_FLOOR), { picks: {} })).toBe("better");
    expect(ledgerVerdict("reject", measure(BLIND_FLOOR, BLIND_FLOOR), { picks: {} })).toBe("not-better");
  });

  it("anchored_with_pairs_keeps_the_human_word", () => {
    const m = measureBlind(improvement([pair("p1")]), { picks: {}, anchored: true }, {});
    expect(m.pairs_total).toBe(1);
    expect(ledgerVerdict("reject", m, { picks: {}, anchored: true })).toBe("not-better");
  });
});
