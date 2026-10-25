import { describe, expect, it } from "vitest";

import { CUT_STEP, parsePieceRequest, piecePlan } from "../src/scout-piece/define.ts";
import { parseStoryboardRequest, storyboardPlan } from "../src/scout-storyboard/define.ts";

// The trial's and the piece's step plans (spark scout-vision S2 WP3), pure: a trial clips every panel AFTER its frames,
// a plain storyboard plans no clip; a piece re-makes only the indices its request marks (a panel with no still has
// nothing to make), then cuts once; a resumed job plans only what it has not booked. The bound jobs are
// tests/next-server/scout-trial.test.ts and scout-piece.test.ts.

const est = { seconds: 101, usd: 0 };
const booked = (...names: string[]) => new Map(names.map((n) => [n, {} as never]));

describe("the storyboard plan", () => {
  const base = { nightId: "2026-10-25", candidateId: "c-01", aspect: "16:9", panels: [{ prompt: "a", seed: 1 }, { prompt: "b", seed: 2 }], by: "op" };

  it("a plain request reads as before and plans its panels only", () => {
    const r = parseStoryboardRequest({ ...base, estimates: { panel: est } });
    if (!r.ok) throw r.error;
    expect(storyboardPlan(r.value, booked()).map((s) => s.name)).toEqual(["panel:1", "panel:2"]);
  });

  it("a trial plans every panel, then a clip of each; a resumed one only what is missing", () => {
    const r = parseStoryboardRequest({ ...base, clips: [{ seed: 11 }, { seed: 12 }], estimates: { panel: est, clip: est } });
    if (!r.ok) throw r.error;
    expect(storyboardPlan(r.value, booked()).map((s) => s.name)).toEqual(["panel:1", "panel:2", "clip:1", "clip:2"]);
    expect(storyboardPlan(r.value, booked("panel:1", "panel:2", "clip:1")).map((s) => s.name)).toEqual(["clip:2"]);
  });
});

describe("the piece plan", () => {
  const clip = (k: number, o: Record<string, unknown>) => ({ k, still: `storyboards/c-02/panel-${k}.png`, prompt: `p${k}`, seed: k, ...o });
  const req = (clips: unknown[]) => {
    const r = parsePieceRequest({ nightId: "2026-10-25", candidateId: "c-03", trial: { nightId: "2026-10-20", candidateId: "c-02" }, aspect: "16:9", clips, estimates: { clip: est, cut: { seconds: 20, usd: 0 } }, by: "op" });
    if (!r.ok) throw r.error;
    return r.value;
  };

  it("re-makes only the marked indices, then cuts once", () => {
    const r = req([clip(1, { remake: false, reuse: "storyboards/c-02/clip-1.mp4" }), clip(2, { remake: true }), clip(3, { remake: false, reuse: "storyboards/c-02/clip-3.mp4" })]);
    expect(piecePlan(r, booked()).map((s) => s.name)).toEqual(["clip:2", CUT_STEP]);
    expect(piecePlan(r, booked("clip:2")).map((s) => s.name)).toEqual([CUT_STEP]);
  });

  it("a panel with no still has nothing to re-make; every clip kept is a cut alone", () => {
    expect(piecePlan(req([clip(1, { remake: true, still: null }), clip(2, { remake: true })]), booked()).map((s) => s.name)).toEqual(["clip:2", CUT_STEP]);
    expect(piecePlan(req([clip(1, { remake: false, reuse: "storyboards/c-02/clip-1.mp4" })]), booked()).map((s) => s.name)).toEqual([CUT_STEP]);
  });

  it("refuses a request with no clip, or more than five", () => {
    expect(parsePieceRequest({ nightId: "n", candidateId: "c", trial: { nightId: "t", candidateId: "c" }, aspect: "16:9", clips: [], estimates: { clip: est, cut: est }, by: "op" }).ok).toBe(false);
    expect(parsePieceRequest({ nightId: "n", candidateId: "c", trial: { nightId: "t", candidateId: "c" }, aspect: "16:9", clips: [1, 2, 3, 4, 5, 6].map((k) => clip(Math.min(k, 5), { remake: true })), estimates: { clip: est, cut: est }, by: "op" }).ok).toBe(false);
  });
});
