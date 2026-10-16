// LANE — THE CUT AND THE ALTERNATIVES VIEW CANNOT DISAGREE (dynamic + wiring).
//
// `useAlternatives`'s header states the invariant: "the assembly ledger, the
// exports and the alternatives view all agree about which picture the cut uses
// because there is exactly one place the answer lives." `remove`'s own docstring
// restates it: "Deleting the active alternative promotes the newest survivor —
// a cut that silently keeps using a deleted picture would be lying."
//
// Measured 2026-08-29: the promotion had one uncovered path, and it was the
// reachable one. Discarding the LAST kept alternative leaves no survivor, so
// `activeId` goes null, the `activeId &&` guard skips the adoption, and
// `onAdopt` is never called — useFrames keeps the plate that was just
// discarded. The column then draws "no alternatives kept" while the assembly
// canvas and the export still render that exact picture. The trash control sat
// on every card with no guard, so one click on a freshly seeded scene reached it.
//
// The whole `alternatives/` directory had no probe of any kind before this file.

import { test, expect } from "@playwright/test";

import { canRemoveAlt, isSynthetic, SYNTH_MARK } from "@/lib/frames/alternatives/alts";

test("the last kept alternative of a real scene stays", () => {
  expect(canRemoveAlt("frame-3", 1), "one kept picture, and the cut is using it").toBe(false);
  expect(canRemoveAlt("frame-3", 2), "a survivor exists to promote").toBe(true);
  expect(canRemoveAlt("frame-3", 5)).toBe(true);
});

test("a scene with nothing in it cannot be reduced further either", () => {
  // Not reachable through the card list — there is no card to press — but the
  // rule is asked about counts and 0 is a count. Returning true here would make
  // the predicate say "yes, remove one of the zero".
  expect(canRemoveAlt("frame-3", 0)).toBe(false);
});

test("synthetic columns are exempt, because a clone has no frame to disagree with", () => {
  const clone = `frame-3${SYNTH_MARK}4`;
  expect(isSynthetic(clone), "the fixture id must actually read as synthetic").toBe(true);
  expect(canRemoveAlt(clone, 1), "a stress clone's last alternative may go").toBe(true);
  expect(canRemoveAlt(clone, 0)).toBe(true);
});
