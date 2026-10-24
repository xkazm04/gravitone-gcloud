// The triage contract's mirror of the human defect vocabulary: @gt/domain/audio.triage names, per
// structural check, the lib/sound/types.ts DEFECTS code it evidences - as strings, because the
// domain cannot import lib/. This pins the mirror: a defect renamed in lib/ breaks here, not on
// a Board that quietly shows a code the cull's reasons cannot hold.
import { describe, expect, it } from "vitest";

import { CHECK_DEFECT, STRUCTURAL_CHECKS } from "@gt/domain/audio.triage";

import { DEFECTS } from "../../lib/sound/types.ts";

describe("triage -> defect codes", () => {
  it("every structural check names a defect the human vocabulary holds", () => {
    for (const c of STRUCTURAL_CHECKS) expect(DEFECTS as readonly string[]).toContain(CHECK_DEFECT[c]);
  });
});
