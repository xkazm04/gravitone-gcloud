import { describe, expect, it } from "vitest";

import { ASSEMBLE_STEP, cutPlan, LAND_STEP, LAY_STEP, laysAudio, parseCutRequest } from "../src/production-cut/define.ts";

// A production's final cut as steps, pure (spark concept-casting-stages S5): the door assembles, lays audio only when it
// has lines or a bed, and lands; a resumed job plans only what it has not booked. The bound job is
// tests/next-server/production-cut.test.ts.

const est = { seconds: 60, usd: 0 };
const blob = { sha256: "a".repeat(64), bytes: 4, mime: "video/mp4" };
const audio = { sha256: "b".repeat(64), bytes: 4, mime: "audio/wav" };
const booked = (...names: string[]) => new Map(names.map((n) => [n, {} as never]));

const request = (over: Record<string, unknown> = {}) => {
  const r = parseCutRequest({ productionId: "prdn:the-toll", cutId: "cut-1", format: "trailer", aspect: "16:9", takes: [{ takeId: "take-1", video: blob, durationS: 5 }], lines: [], silence: false, estimates: { assemble: est, lay: est }, by: "op", ...over });
  if (!r.ok) throw r.error;
  return r.value;
};

describe("the cut plan", () => {
  it("a bare trailer assembles and lands: nothing to lay", () => {
    const r = request();
    expect(laysAudio(r)).toBe(false);
    expect(cutPlan(r, booked()).map((s) => s.name)).toEqual([ASSEMBLE_STEP, LAND_STEP]);
  });

  it("a dub line or a bed adds the lay step, between assemble and land", () => {
    const withLine = request({ lines: [{ roleId: "r1", name: "Lead", line: "hello", audio }] });
    expect(cutPlan(withLine, booked()).map((s) => s.name)).toEqual([ASSEMBLE_STEP, LAY_STEP, LAND_STEP]);
    const withBed = request({ bed: audio });
    expect(cutPlan(withBed, booked()).map((s) => s.name)).toEqual([ASSEMBLE_STEP, LAY_STEP, LAND_STEP]);
  });

  it("a resumed job plans only what it has not booked", () => {
    const r = request({ lines: [{ roleId: "r1", name: "Lead", line: "hello", audio }] });
    expect(cutPlan(r, booked(ASSEMBLE_STEP)).map((s) => s.name)).toEqual([LAY_STEP, LAND_STEP]);
    expect(cutPlan(r, booked(ASSEMBLE_STEP, LAY_STEP)).map((s) => s.name)).toEqual([LAND_STEP]);
  });

  it("refuses a request with no take", () => {
    expect(parseCutRequest({ productionId: "prdn:x", cutId: "cut-1", format: "trailer", aspect: "16:9", takes: [], lines: [], silence: false, estimates: { assemble: est, lay: est }, by: "op" }).ok).toBe(false);
  });
});
