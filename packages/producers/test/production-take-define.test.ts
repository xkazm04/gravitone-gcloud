import { describe, expect, it } from "vitest";

import { CUT_STEP, clipStep, parseTakeRequest, takePlan } from "../src/production-take/define.ts";

// A production's take as steps, pure (spark concept-casting-stages S1): a hero take is its clip alone; a rough cut plans
// one clip per beat, then the cut; a resumed job plans only what it has not booked. The bound job is
// tests/next-server/production.test.ts.

const est = { seconds: 1223, usd: 0 };
const booked = (...names: string[]) => new Map(names.map((n) => [n, {} as never]));
const still = { sha256: "a".repeat(64), bytes: 4, mime: "image/png" };
const clip = (k: number) => ({ k, beat: `beat ${k}`, first: still, prompt: `line ${k}` });

const request = (over: Record<string, unknown>) => {
  const r = parseTakeRequest({ productionId: "prdn:the-pour", takeId: "take-1", kind: "hero", aspect: "16:9", seed: 7, clips: [clip(1)], estimates: { clip: est, cut: { seconds: 20, usd: 0 } }, by: "op", ...over });
  if (!r.ok) throw r.error;
  return r.value;
};

describe("the take plan", () => {
  it("a hero take is one clip and no cut", () => {
    expect(takePlan(request({}), booked()).map((s) => s.name)).toEqual(["clip:1"]);
  });

  it("a rough cut is every beat's clip, then the cut; a resumed job plans only what is missing", () => {
    const r = request({ kind: "rough", clips: [clip(1), clip(2), clip(3)] });
    expect(takePlan(r, booked()).map((s) => s.name)).toEqual(["clip:1", "clip:2", "clip:3", CUT_STEP]);
    expect(takePlan(r, booked(clipStep(1), clipStep(3))).map((s) => s.name)).toEqual(["clip:2", CUT_STEP]);
    expect(takePlan(r, booked(clipStep(1), clipStep(2), clipStep(3))).map((s) => s.name)).toEqual([CUT_STEP]);
  });

  it("refuses a request with no clip, or a bad seed", () => {
    expect(parseTakeRequest({ productionId: "p", takeId: "t", kind: "hero", aspect: "16:9", seed: 1, clips: [], estimates: { clip: est, cut: est }, by: "op" }).ok).toBe(false);
    expect(parseTakeRequest({ productionId: "p", takeId: "t", kind: "hero", aspect: "16:9", seed: -1, clips: [clip(1)], estimates: { clip: est, cut: est }, by: "op" }).ok).toBe(false);
  });
});
