import { describe, expect, it } from "vitest";

import { parseSheetRequest, SHEET_STEP, sheetPlan } from "../src/scout-sheet/define.ts";

// The reference sheet's plan and request (spark scout-vision S3 WP3), pure: one draw step, none once booked; the request
// holds the portrait ref, the compiled prompt, the seed and a late value under 1. The bound job is
// tests/next-server/scout-sheet.test.ts.

const booked = (...names: string[]) => new Map(names.map((n) => [n, {} as never]));
const base = { nightId: "2026-10-25", candidateId: "c-04", character: "ilse marrow", name: "Ilse Marrow", portrait: "muse:2026-10-24/c-03", prompt: "Ilse Marrow, aged 36: copper bob. Character reference sheet.", seed: 7, late: 0.25, estimates: { draw: { seconds: 96, usd: 0 } }, by: "op" };

describe("the sheet plan", () => {
  it("plans one draw, and nothing once the job booked it", () => {
    const r = parseSheetRequest(base);
    if (!r.ok) throw r.error;
    expect(sheetPlan(r.value, booked()).map((s) => s.name)).toEqual([SHEET_STEP]);
    expect(sheetPlan(r.value, booked(SHEET_STEP))).toEqual([]);
  });

  it("refuses a late value of 1 or more, a missing portrait, and an unknown audience; takes kids and a parody flag", () => {
    expect(parseSheetRequest({ ...base, late: 1 }).ok).toBe(false);
    expect(parseSheetRequest({ ...base, portrait: "" }).ok).toBe(false);
    expect(parseSheetRequest({ ...base, audience: "teen" }).ok).toBe(false);
    expect(parseSheetRequest({ ...base, audience: "kids", parody: true }).ok).toBe(true);
  });
});
