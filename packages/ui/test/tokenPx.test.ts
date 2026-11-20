// A TOKEN READ AS PIXELS (packages/ui/src/tokenPx.ts): the design baseline made some lengths clamp(); every place that
// lays out in numbers must read a finite number from them. Measured defect: the Scout's stage graph parsed
// `clamp(24px,...)` with parseFloat and drew `<svg width="NaN">` (2026-11-17).
import { describe, expect, it } from "vitest";

import { GEOMETRY, nodeBox } from "../src/components/graph/stageGraph.ts";
import { lengthPx, tokenPx } from "../src/tokenPx.ts";

describe("tokenPx", () => {
  it("reads a plain length, and a clamp by its floor", () => {
    expect(lengthPx("9px")).toBe(9);
    expect(lengthPx("clamp(24px,1.06vw,28px)")).toBe(24);
    expect(tokenPx("h-field")).toBe(32);
  });

  it("throws on what is not a px length, instead of handing back NaN", () => {
    expect(() => lengthPx("1fr")).toThrow(/not a px length/);
    expect(() => lengthPx("clamp(1rem,2vw,3rem)")).toThrow(/not a px length/);
  });

  it("the stage graph's geometry is finite over the clamped tokens", () => {
    for (const v of Object.values(GEOMETRY)) expect(Number.isFinite(v), JSON.stringify(GEOMETRY)).toBe(true);
    for (const v of Object.values(nodeBox(2, 3))) expect(Number.isFinite(v)).toBe(true);
  });
});
