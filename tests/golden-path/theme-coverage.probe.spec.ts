// LANE — A PROOF CARRIES ITS LINEAGE, AND THE LOCK GATE READS COVERAGE.
//
// Registry: visual-style-locking / draft-proofing-locked-ratchet.
//
// A style used to lock on one approved proof and nothing pending, so it could be
// ratified on one picture of one problem, and approvals rendered under a block
// the user had since rewritten kept counting and kept being sent as references.
// `Proof` now records the trial it answered and the digest of the block that
// made it; lib/themes/coverage.ts derives the matrix the lock gate, the
// references window and the sheet all read.
import { test, expect } from "@playwright/test";

import { trialIdFor, TRIALS } from "@/app/library/trials";
import { blockDigest, LOCK_PROBLEMS, sheetCoverage } from "@/lib/themes/coverage";
import { canLock, lockBlocker, newTheme, ratchetBlocker, styleRefs, type Proof, type Theme } from "@/lib/themes";

const BLOCK = {
  technique: "ink wash",
  subject: "objects",
  palette: [
    { name: "navy", hex: "#101a33", role: "ground" as const },
    { name: "cream", hex: "#f3ead3", role: "objects" as const },
    { name: "cyan", hex: "#22d3ee", role: "accent" as const },
  ],
  finish: "matte",
};

function theme(): Theme {
  return newTheme("u1", { name: "Ink Wash", origin: "scratch", block: BLOCK, elements: ["card"] });
}

const proof = (id: string, over: Partial<Proof> = {}): Proof => ({
  id,
  label: id,
  base64: `b64-${id}`,
  mime: "image/png",
  state: "approved",
  createdAt: 1_700_000_000_000 + id.length,
  ...over,
});

/** A proof rendered from a trial, under the theme's current block. */
const trialProof = (t: Theme, trialId: string, over: Partial<Proof> = {}): Proof =>
  proof(`pr-${trialId}`, { trialId, blockDigest: blockDigest(t.block), ...over });

const withProofs = (t: Theme, proofs: Proof[]): Theme => ({ ...t, proofs });

test("1. one approved proof on one problem does not lock, and the blocker names what is missing", () => {
  const t0 = theme();
  const t = withProofs(t0, [trialProof(t0, "peak-and-fall")]);
  expect(canLock(t)).toBe(false);
  const why = lockBlocker(t) ?? "";
  expect(why).toContain(`1 of ${LOCK_PROBLEMS}`);
  expect(why).toContain("inventory");
  expect(why).not.toContain("quantity");
});

test("2. approvals on three distinct problems under the current block, nothing pending, lock", () => {
  const t0 = theme();
  const t = withProofs(t0, ["peak-and-fall", "wish-list", "flywheel"].map((id) => trialProof(t0, id)));
  expect(canLock(t)).toBe(true);
  expect(lockBlocker(t)).toBeNull();
  // Two approvals of the SAME problem are one problem.
  const twice = withProofs(t0, [trialProof(t0, "peak-and-fall"), { ...trialProof(t0, "peak-and-fall"), id: "again" }]);
  expect(canLock(twice)).toBe(false);
  // And a pending proof still blocks.
  expect(canLock(withProofs(t, [...t.proofs, trialProof(t0, "the-exit", { state: "pending" })]))).toBe(false);
});

test("3. editing the block makes the approvals stale: no lock, and none are sent as references", () => {
  const t0 = theme();
  const ok = withProofs(t0, ["peak-and-fall", "wish-list", "flywheel"].map((id) => trialProof(t0, id)));
  expect(styleRefs(ok)).toHaveLength(3);

  const edited: Theme = { ...ok, block: { ...ok.block, technique: "gouache" } };
  expect(sheetCoverage(edited).stale).toHaveLength(3);
  expect(canLock(edited)).toBe(false);
  expect(lockBlocker(edited)).toContain("no longer count");
  expect(styleRefs(edited)).toEqual([]);
});

test("4. a legacy proof is listed as unknown lineage and still sent; a wholly legacy sheet keeps the old gate", () => {
  const t0 = theme();
  const legacy = withProofs(t0, [proof("old")]);
  expect(sheetCoverage(legacy).unknownLineage.map((p) => p.id)).toEqual(["old"]);
  expect(sheetCoverage(legacy).stale).toEqual([]);
  expect(styleRefs(legacy)).toHaveLength(1);
  // Grandfather rule: every proof predates lineage, so the sheet is judged as it always was.
  expect(canLock(legacy)).toBe(true);

  // Once lineage joins the sheet, the legacy approval stops counting toward coverage.
  const mixed = withProofs(t0, [proof("old"), trialProof(t0, "peak-and-fall")]);
  expect(canLock(mixed)).toBe(false);
  expect(styleRefs(mixed)).toHaveLength(2);
});

test("5. a theme locked before the change stays locked and is not re-gated", () => {
  const locked: Theme = { ...theme(), proofs: [proof("p1")], lockedAt: 1_700_000_000_000 };
  expect(lockBlocker(locked)).toBeNull();
  expect(canLock(locked)).toBe(false); // already locked: nothing to do
  expect(ratchetBlocker(locked, { name: "Renamed" })).toBeNull();
  expect(ratchetBlocker(locked, { block: { ...locked.block, technique: "gouache" } })).toContain("duplicate");
});

test("6. a render made from the flywheel chip carries trialId flywheel; an edited subject carries none", () => {
  const fly = TRIALS.find((t) => t.id === "flywheel")!;
  expect(trialIdFor(fly.subject)).toBe("flywheel");
  expect(trialIdFor(fly.subject + " Extra.")).toBeUndefined();
});

test("the digest follows the compiled words, not the object identity", () => {
  expect(blockDigest(BLOCK)).toBe(blockDigest({ ...BLOCK, palette: [...BLOCK.palette] }));
  expect(blockDigest(BLOCK)).not.toBe(blockDigest({ ...BLOCK, finish: "glossy" }));
});
