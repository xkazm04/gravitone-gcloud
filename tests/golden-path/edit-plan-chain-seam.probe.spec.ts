// LANE — STRUCTURAL INVARIANTS AT THE SEAM AN EDIT TOUCHED (dynamic).
//
// The revision loop's deliverable is a list of operations, and `applyEdits`
// performs them. A `cut` splices one beat out; every survivor keeps the
// connector it was written with. So the beat after a cut argues BUT or
// THEREFORE from a beat that is no longer in front of it, and the argument now
// runs against whatever landed there.
//
// Nothing downstream can see that. The gate re-run after apply is `gateChains`,
// which reads evidence and hedge words: both beats are individually well-formed
// and the chain between them is broken, so the lexical gate passes. The break is
// visible only where what CHANGED is still known — inside the apply.
//
// Reported, never repaired: rewriting a connector to fit its new neighbour is an
// edit nobody asked for, made by the code least qualified to judge the argument.
import { test, expect } from "@playwright/test";
import { applyEdits, type Edit } from "@/app/_phases/script/editPlan";
import { RENDERS } from "@/app/_phases/script/renders";

const render = RENDERS.find((r) => r.id === "reversal-chain")!;
const base: Record<string, string[]> = {};

const cut = (beatAt: string): Edit[] => [
  { renderId: render.id, op: "cut", beatAt, why: "the note asked for this beat to go" } as Edit,
];

test("edit-plan-chain-seam: the fixture still has the shape this probe is about", () => {
  // 0:12 delivers the wish list; 0:30 answers it with BUT ("and in that same
  // ten months, Bitcoin lost roughly half its value"). Cutting 0:12 is what
  // orphans that BUT. If the fixture is re-cut, this line fails instead of the
  // cases below going quietly green.
  expect(render.beats.map((b) => b.at)).toContain("0:12");
  expect(render.beats.find((b) => b.at === "0:30")?.connector).toBe("BUT");
});

test("edit-plan-chain-seam: cutting a beat ORPHANS its successor's connector, and that is reported", () => {
  const a = applyEdits(render, cut("0:12"), base);
  for (const b of a.chainBreaks) console.log(`[seam] ${b.at} ${b.connector} — ${b.why}`);
  expect(a.chainBreaks).toHaveLength(1);
  expect(a.chainBreaks[0].connector).toBe("BUT");
  expect(a.chainBreaks[0].why).toContain("0:12");
});

test("edit-plan-chain-seam: cutting the OPENER leaves a render that opens on a connector", () => {
  const a = applyEdits(render, cut("0:00"), base);
  expect(a.chainBreaks.some((b) => b.at === "0:00" && /opens the render/.test(b.why))).toBe(true);
});

test("edit-plan-chain-seam: a retime breaks no chain — the check does not cry wolf", () => {
  const retime: Edit[] = [
    { renderId: render.id, op: "retime", beatAt: "0:04", seconds: 6, why: "tighten" } as Edit,
  ];
  expect(applyEdits(render, retime, base).chainBreaks).toEqual([]);
});

test("edit-plan-chain-seam: an EMPTY plan breaks no chain — the base render is the control", () => {
  expect(applyEdits(render, [], base).chainBreaks).toEqual([]);
});
