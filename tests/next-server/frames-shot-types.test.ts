import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as shots from "../../lib/frames/shots";
import * as shotTypes from "../../lib/frames/shotTypes";

const lineCount = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8").split("\n").length;

describe("lib/frames/shots re-exports shotTypes", () => {
  it("hands back the identical values", () => {
    expect(shots.SIZE_ORDER).toBe(shotTypes.SIZE_ORDER);
    expect(shots.PACE_BAND).toBe(shotTypes.PACE_BAND);
    expect(shots.TAIL_BAND).toBe(shotTypes.TAIL_BAND);
    expect(shots.SIZE_LADDER).toBe(shotTypes.SIZE_LADDER);
    expect(shots.ROLE_HINTS).toBe(shotTypes.ROLE_HINTS);
    expect(shots.TRAILER_ROLES).toBe(shotTypes.TRAILER_ROLES);
    expect(shots.sizeSteps).toBe(shotTypes.sizeSteps);
  });

  it("keeps both files at or under the 400-line cap", () => {
    expect(lineCount("lib/frames/shots.ts")).toBeLessThanOrEqual(400);
    expect(lineCount("lib/frames/shotTypes.ts")).toBeLessThanOrEqual(400);
  });
});
