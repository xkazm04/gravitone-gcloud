// THE RATCHET MOVED, AND v1 STILL AGREES WITH IT (Phase 5 L48). @gt/domain/style.ratchet absorbed
// lib/themes.ts (canLock, lockBlocker, styleRefs), lib/themes/coverage.ts (blockDigest, the
// coverage gate) and lib/library/trials.ts (the trial set). A package may not import lib/, so
// the move made copies; this holds each copy equal to the v1 original it came from, so a proof
// digested by v1 is not stale here and a sheet v1 would lock locks here - until v1's copies
// retire with its /library (wave B), when this file goes with them.

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { PRESETS } from "@gt/catalog/presets";
import { styleSchema, type Style } from "@gt/domain/style";
import { blockDigest, compileStyleBlock, lockBlocker, STYLE_TRIALS, styleRefs } from "@gt/domain/style.ratchet";
import { parseAt } from "@gt/domain/door";

import { TRIALS } from "../../lib/library/trials.ts";
import { compileStyleBlock as v1Compile } from "../../lib/stylePrompt.ts";
import { blockDigest as v1Digest } from "../../lib/themes/coverage.ts";
import { lockBlocker as v1LockBlocker, styleRefs as v1StyleRefs, type Proof, type Theme } from "../../lib/themes.ts";

const block = PRESETS[0]?.block;
if (block === undefined) throw new Error("no presets");
const D = blockDigest(block);
const sha = (n: number) => n.toString(16).padStart(64, "0");

/** One sheet, in both shapes: v1's Theme (base64 proofs, epoch ms) and the store's Style. */
function both(proofs: { id: string; state: Proof["state"]; trialId?: string; digest?: string; t: number }[]): { theme: Theme; style: Style } {
  const theme: Theme = {
    id: "th-x", uid: "u", name: "X", origin: "preset", block, elements: [], createdAt: 0, updatedAt: 0,
    proofs: proofs.map((p) => ({ id: p.id, label: p.id, base64: `b64-${p.id}`, mime: "image/png", state: p.state, createdAt: p.t, ...(p.trialId ? { trialId: p.trialId } : {}), ...(p.digest ? { blockDigest: p.digest } : {}) })),
  };
  const kept = proofs.filter((p) => p.state === "approved").map((p, i) => ({ run: "r", scene: `s${i}`, mechanism: "m", verdict: "keep", at: "2026-10-17T00:00:00.000Z", by: "operator" }));
  const r = parseAt("style", styleSchema, {
    id: "x", name: "X", family: "f", status: kept.length >= 2 ? "proven" : "candidate", origin: { kind: "preset" }, observables: {}, recipe: "r", negative: "", evidence: kept, block,
    proofs: proofs.map((p, i) => ({ id: p.id, label: p.id, media: { sha256: sha(i + 1), bytes: 1, mime: "image/png" }, state: p.state, at: new Date(p.t).toISOString(), ...(p.trialId ? { trialId: p.trialId } : {}), ...(p.digest ? { blockDigest: p.digest } : {}) })),
  });
  if (!r.ok) throw r.error;
  return { theme, style: r.value };
}

describe("the copies the move made equal their v1 originals", () => {
  it("the trial set is v1's, id for id and word for word", () => {
    expect(STYLE_TRIALS.map((t) => ({ ...t }))).toEqual(TRIALS.map((t) => ({ ...t })));
  });
  it("every preset compiles to v1's words and digests to v1's digest", () => {
    for (const p of PRESETS) {
      expect(compileStyleBlock(p.block)).toBe(v1Compile(p.block));
      expect(blockDigest(p.block)).toBe(v1Digest(p.block));
    }
  });
  it("the lock gate speaks v1's sentences on v1's cases", () => {
    const cases = [
      [],
      [{ id: "a", state: "pending" as const, trialId: "flywheel", digest: D, t: 1 }],
      [{ id: "a", state: "rejected" as const, trialId: "flywheel", digest: D, t: 1 }],
      [{ id: "a", state: "approved" as const, trialId: "flywheel", digest: D, t: 1 }, { id: "b", state: "approved" as const, trialId: "wish-list", digest: "00000000", t: 2 }],
      ["peak-and-fall", "wish-list", "flywheel"].map((trialId, i) => ({ id: `p${i}`, state: "approved" as const, trialId, digest: D, t: i })),
    ];
    for (const c of cases) {
      const { theme, style } = both(c);
      expect(lockBlocker(style)).toBe(v1LockBlocker(theme));
    }
  });
  it("the references window pins and rolls as v1's did", () => {
    const sheet = ["a", "b", "c", "d", "e", "f"].map((id, i) => ({ id, state: "approved" as const, digest: D, t: i * 1000 }));
    const { theme, style } = both([...sheet, { id: "g", state: "approved", digest: "00000000", t: 9000 }]);
    const ours = styleRefs(style).map((r) => style.proofs.find((p) => p.media.sha256 === r.sha256)?.id);
    const theirs = v1StyleRefs(theme).map((r) => r.base64.replace("b64-", ""));
    expect(ours).toEqual(theirs);
  });
});
