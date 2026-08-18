// LANE — BUDGET-DEFAULTS-UNLIMITED (dynamic).
//
// pricing.ts could price a call and the router logged what one cost, but nothing
// stood between a caller and an unbounded bill. This probe drives the ACTUAL
// budget module and the ACTUAL router chokepoint (generate) and pins the fix:
//
//   · under the ceiling a call proceeds (and, with no keys, dies on `no-key` —
//     proving the budget let it through);
//   · over the ceiling it is REFUSED with an `over-budget` ImagingError, thrown
//     at the chokepoint BEFORE any vendor is called (so nothing is billed);
//   · the window ROLLS OVER — spend older than the window no longer counts;
//   · the pending estimate errs HIGH (the dearest declared per-image rate),
//     the right direction for a money guard.
import { test, expect } from "@playwright/test";
import {
  assertWithinBudget,
  budgetCeilingUsd,
  currentSpendUsd,
  estimatePendingUsd,
  recordSpend,
  __resetBudget,
  BUDGET_VAR,
  WINDOW_VAR,
} from "@/lib/imaging/budget";
import { estimatePerImage } from "@/lib/imaging/pricing";
import { ImagingError } from "@/lib/imaging/errors";
import { generate } from "@/lib/imaging/router";

const KEY_VARS = ["GOOGLE_AI_API_KEY", "LEONARDO_API_KEY", "QWEN_API_KEY"];

test.beforeEach(() => {
  __resetBudget();
  delete process.env[BUDGET_VAR];
  delete process.env[WINDOW_VAR];
});

test("estimate: pending cost is the dearest declared per-image rate, times count", () => {
  const perImage = estimatePerImage().usd;
  expect(typeof perImage).toBe("number");
  expect(estimatePendingUsd(1)).toBeCloseTo(perImage!, 6);
  expect(estimatePendingUsd(4)).toBeCloseTo(perImage! * 4, 6);
  console.log(`[budget] perImage=$${perImage} -> pending(4)=$${estimatePendingUsd(4)}`);
});

test("gate: under the ceiling passes; the call that would cross it is refused", () => {
  process.env[BUDGET_VAR] = "0.10";
  expect(budgetCeilingUsd()).toBe(0.1);

  // $0.045 pending, nothing spent yet — comfortably under $0.10.
  expect(() => assertWithinBudget(estimatePendingUsd(1))).not.toThrow();

  // Book $0.09. Now a $0.045 pending call would reach $0.135 > $0.10 → refuse.
  recordSpend(0.09);
  expect(currentSpendUsd()).toBeCloseTo(0.09, 6);
  let err: unknown;
  try {
    assertWithinBudget(estimatePendingUsd(1));
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(ImagingError);
  expect((err as ImagingError).kind).toBe("over-budget");
  console.log(`[budget] refused over ceiling: ${(err as ImagingError).message.slice(0, 60)}...`);
});

test("window: spend older than the window no longer counts (rolls over)", () => {
  process.env[BUDGET_VAR] = "1.00";
  process.env[WINDOW_VAR] = "60000"; // 1-minute window
  const t0 = 5_000_000;

  recordSpend(0.9, t0);
  // Immediately, $0.9 is in-window: a $0.045 call is fine, but pretend a $0.2
  // pending would cross $1.00.
  expect(() => assertWithinBudget(0.2, t0)).toThrow(ImagingError);
  expect(currentSpendUsd(t0)).toBeCloseTo(0.9, 6);

  // 61s later the $0.9 has aged out of the 60s window → spend resets to 0.
  const later = t0 + 61_000;
  expect(currentSpendUsd(later)).toBe(0);
  expect(() => assertWithinBudget(0.2, later)).not.toThrow();
  console.log(`[budget] window rollover: 0.9 in-window at t0, 0 at t0+61s`);
});

test("default ceiling is a real bound, not unlimited", () => {
  // With nothing configured, the ceiling is the safe default (5), and a spend
  // over it is refused — an unset budget is bounded, not an open tab.
  delete process.env[BUDGET_VAR];
  expect(budgetCeilingUsd()).toBe(5);
  recordSpend(5.0);
  expect(() => assertWithinBudget(estimatePendingUsd(1))).toThrow(ImagingError);
});

// ── The chokepoint is actually wired: generate() enforces it BEFORE vendors ──

test("chokepoint: generate() refuses over-budget before touching a vendor", async () => {
  for (const k of KEY_VARS) delete process.env[k]; // no keys at all
  process.env[BUDGET_VAR] = "0.001"; // below even one image's estimate

  let err: unknown;
  try {
    await generate({ prompt: "probe", aspect: "16:9", count: 1 });
  } catch (e) {
    err = e;
  }
  // over-budget, NOT no-key — proving the ceiling is checked before the chain.
  expect(err).toBeInstanceOf(ImagingError);
  expect((err as ImagingError).kind).toBe("over-budget");
  console.log(`[budget] generate() over-budget -> kind=${(err as ImagingError).kind}`);
});

test("chokepoint: under the ceiling, generate() passes the budget (then dies on no-key)", async () => {
  for (const k of KEY_VARS) delete process.env[k];
  process.env[BUDGET_VAR] = "100"; // plenty

  let err: unknown;
  try {
    await generate({ prompt: "probe", aspect: "16:9", count: 1 });
  } catch (e) {
    err = e;
  }
  // The budget let it through; it failed further down for the honest reason.
  expect(err).toBeInstanceOf(ImagingError);
  expect((err as ImagingError).kind).toBe("no-key");
  console.log(`[budget] generate() under budget -> kind=${(err as ImagingError).kind}`);
});
