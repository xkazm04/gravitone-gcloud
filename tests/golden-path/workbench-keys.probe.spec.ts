// LANE — THE WORKBENCH'S ON-PURPOSE MOVES (pure).
//
// Two Wave 5 seams, held on synthetic data so a change shows up as a number:
//
//   · the broadcast week's keys (app/calendar/view.ts): which press pages a
//     week, which arrow belongs to the week and which to whatever else has
//     focus, how far away a slot's week is, and which slot `N` opens next
//   · the article gate's figures (app/articles/runModel.ts gateFigures): what
//     the summary above the records counts — a blocker the writer accepted is
//     not open, one it rejected or left unanswered is
import { test, expect } from "@playwright/test";

import { gateFigures } from "@/app/articles/runModel";
import { needsDecision } from "@/app/calendar/calendarModel";
import { nextWaiting, weekKey, weekOffsetOf } from "@/app/calendar/view";
import type { CheckReport, CritiqueDetail } from "@/lib/articles/types";

test("weekKey: brackets page anywhere, arrows only inside the week, modifiers are the browser's", () => {
  expect(weekKey({ key: "[" }, false)).toBe("prev");
  expect(weekKey({ key: "]" }, false)).toBe("next");
  expect(weekKey({ key: "ArrowLeft" }, false)).toBeNull();
  expect(weekKey({ key: "ArrowLeft" }, true)).toBe("prev");
  expect(weekKey({ key: "ArrowRight" }, true)).toBe("next");
  expect(weekKey({ key: "t" }, false)).toBe("today");
  expect(weekKey({ key: "N" }, false)).toBe("decide");
  expect(weekKey({ key: "Escape" }, false)).toBe("close");
  expect(weekKey({ key: "]", ctrlKey: true }, true)).toBeNull();
  expect(weekKey({ key: "t", metaKey: true }, true)).toBeNull();
  expect(weekKey({ key: "x" }, true)).toBeNull();
});

test("weekOffsetOf: Monday-based weeks either side of now, null for garbage", () => {
  const wed = new Date(2026, 9, 7, 15, 0).getTime(); // Wed 7 Oct 2026
  expect(weekOffsetOf(new Date(2026, 9, 5, 0, 1).toISOString(), wed)).toBe(0); // Mon, same week
  expect(weekOffsetOf(new Date(2026, 9, 11, 23, 59).toISOString(), wed)).toBe(0); // Sun, same week
  expect(weekOffsetOf(new Date(2026, 9, 12, 9, 0).toISOString(), wed)).toBe(1);
  expect(weekOffsetOf(new Date(2026, 9, 4, 9, 0).toISOString(), wed)).toBe(-1);
  expect(weekOffsetOf(new Date(2026, 11, 2, 9, 0).toISOString(), wed)).toBe(8);
  expect(weekOffsetOf("not a date", wed)).toBeNull();
});

test("nextWaiting: time order after the open slot, wrapping, skipping what does not wait", () => {
  type S = { id: string; publishAt: string; status: "scheduled" | "missed" | "failed" | "published"; error: string | null };
  const slots: S[] = [
    { id: "c", publishAt: "2026-10-09T10:00:00.000Z", status: "missed", error: null },
    { id: "a", publishAt: "2026-10-01T10:00:00.000Z", status: "failed", error: "boom" },
    { id: "b", publishAt: "2026-10-05T10:00:00.000Z", status: "published", error: null },
    { id: "d", publishAt: "2026-10-12T10:00:00.000Z", status: "scheduled", error: "export gone" },
    { id: "e", publishAt: "2026-10-13T10:00:00.000Z", status: "scheduled", error: null },
  ];
  expect(nextWaiting(slots, null, needsDecision)?.id).toBe("a");
  expect(nextWaiting(slots, "a", needsDecision)?.id).toBe("c");
  expect(nextWaiting(slots, "b", needsDecision)?.id).toBe("c");
  expect(nextWaiting(slots, "c", needsDecision)?.id).toBe("d");
  expect(nextWaiting(slots, "d", needsDecision)?.id).toBe("a");
  expect(nextWaiting(slots, "e", needsDecision)?.id).toBe("a");
  expect(nextWaiting(slots.filter((s) => s.id === "b" || s.id === "e"), null, needsDecision)).toBeUndefined();
});

test("gateFigures: check counts, and the latest round's open blockers and unanswered findings", () => {
  const check = {
    items: [
      { id: "x1", status: "fail" },
      { id: "x2", status: "pass" },
      { id: "x3", status: "not-measured" },
      { id: "x4", status: "pass" },
    ],
    notMeasured: ["storytelling", "depth"],
  } as unknown as CheckReport;
  const finding = (id: string, severity: "blocker" | "major" | "minor") => ({ id, kind: "factual", severity, location: "§1", claim: "c", evidence: [], suggestion: "s" });
  const critique = {
    reviewers: [],
    minCompleted: 2,
    rounds: [
      { round: 1, receipts: [], closed: true, reviews: [{ reviewer: "r1", verdict: "revise", summary: "", findings: [finding("f1", "blocker")] }] },
      {
        round: 2,
        receipts: [],
        closed: true,
        reviews: [
          { reviewer: "r1", verdict: "revise", summary: "", findings: [finding("b1", "blocker"), finding("b2", "blocker"), finding("m1", "minor")] },
          { reviewer: "r2", verdict: "rework", summary: "", findings: [finding("b3", "blocker")] },
        ],
        dispositions: [
          { reviewer: "r1", findingId: "b1", disposition: "accepted", reason: "fixed" },
          { reviewer: "r1", findingId: "b2", disposition: "rejected", reason: "wrong" },
          { reviewer: "r1", findingId: "m1", disposition: "deferred", reason: "later" },
        ],
      },
    ],
  } as unknown as CritiqueDetail;

  expect(gateFigures({ check, critique })).toEqual({ fail: 1, notMeasured: 3, pass: 2, blockers: 2, unanswered: 1 });
  expect(gateFigures({})).toEqual({ fail: 0, notMeasured: 0, pass: 0, blockers: 0, unanswered: 0 });
});
