// THE RATCHET MOVED, AND THE v1 HALVES STILL ALIVE AGREE WITH IT (Phase 5 L48, cut down L55).
// @gt/domain/style.ratchet absorbed lib/themes.ts (canLock, lockBlocker, styleRefs),
// lib/themes/coverage.ts (blockDigest, the coverage gate) and lib/library/trials.ts (the trial
// set). A package may not import lib/, so the move made copies, and this file held each copy
// equal to its v1 original. lib/themes.ts and its coverage retired with the v1 Library (wave B,
// L55), so their comparisons went with them: the gate and the window are proven on their own
// terms in packages/domain/test/style.test.ts and packages/kernel/test/styles.test.ts. What is
// left compares the two v1 halves that still have readers: the trial set (pipeline/
// build-style-trials.mts) and the prompt compiler every frame is sent through (lib/stylePrompt.ts).

import { describe, expect, it } from "vitest";

import { PRESETS } from "@gt/catalog/presets";
import { compileStyleBlock, STYLE_TRIALS } from "@gt/domain/style.ratchet";

import { TRIALS } from "../../lib/library/trials.ts";
import { compileStyleBlock as v1Compile } from "../../lib/stylePrompt.ts";

describe("the copies the move made equal the v1 originals still in use", () => {
  it("the trial set is v1's, id for id and word for word", () => {
    expect(STYLE_TRIALS.map((t) => ({ ...t }))).toEqual(TRIALS.map((t) => ({ ...t })));
  });
  it("every preset compiles to v1's words", () => {
    for (const p of PRESETS) expect(compileStyleBlock(p.block)).toBe(v1Compile(p.block));
  });
});
