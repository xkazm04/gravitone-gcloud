// LANE 2a — SORT CORRECTNESS / STABILITY (dynamic).
//
// Corpus technique: "id-tiebreaker sort discipline" — a comparator must return a
// TOTAL order (never 0 for two distinct rows) so display order is deterministic
// regardless of the order the data arrived in. Static verdict: HOLDS, plus a
// DEFER "APPLY-2: 15 sort sites missing an id tiebreaker (masked today)".
//
// This probe drives the ACTUAL comparator through the REAL ProjectsMatrix render
// (equal primary keys, two input permutations) and asserts a stable, tiebroken
// order — then demonstrates, with a controlled no-tiebreaker comparator, the
// nondeterminism the technique exists to prevent.
import { test, expect } from "@playwright/test";
import ProjectsMatrix from "@/app/_projects/ProjectsMatrix";
import { mkProject, walkTree, noopProps } from "./_helpers";

function renderedOrder(projects: ReturnType<typeof mkProject>[]): string[] {
  const tree = (ProjectsMatrix as unknown as (p: unknown) => unknown)({ projects, ...noopProps });
  const acc = { n: 0, testids: [] as string[], handlers: [] as unknown[] };
  walkTree(tree, acc);
  return acc.testids.filter((t) => t.endsWith("-research")).map((t) => t.replace(/^cell-/, "").replace(/-research$/, ""));
}

test("Lane2a: ProjectsMatrix comparator is deterministic on EQUAL primary keys (tiebreaker HOLDS)", () => {
  const T = 1_700_000_000_000; // all three share updatedAt -> primary key ties
  const a = mkProject("aaa", T);
  const b = mkProject("bbb", T);
  const c = mkProject("ccc", T);

  const order1 = renderedOrder([a, b, c]);
  const order2 = renderedOrder([c, b, a]); // reversed input
  const order3 = renderedOrder([b, c, a]); // shuffled input

  console.log(`[Lane2a] order (input abc): ${order1.join(",")}`);
  console.log(`[Lane2a] order (input cba): ${order2.join(",")}`);
  console.log(`[Lane2a] order (input bca): ${order3.join(",")}`);

  // Same set, any input order -> same rendered order (the whole point).
  expect(order2).toEqual(order1);
  expect(order3).toEqual(order1);
  // And it is the id-ascending tiebreak, not accidental input order.
  expect(order1).toEqual(["aaa", "bbb", "ccc"]);
});

test("Lane2a: primary key still dominates the tiebreaker", () => {
  const T = 1_700_000_000_000;
  const newer = mkProject("zzz", T + 10_000); // newest updatedAt, id sorts last
  const older = mkProject("aaa", T);
  const order = renderedOrder([older, newer]);
  console.log(`[Lane2a] primary-key order: ${order.join(",")}`);
  expect(order).toEqual(["zzz", "aaa"]); // updatedAt desc wins over id asc
});

// ---- Controlled counterfactual: WHY the tiebreaker matters -------------------
// V8's Array.prototype.sort is stable (ES2019), so a comparator that returns 0
// for distinct rows preserves INPUT order -> the same data displays differently
// depending on the order it was fetched/inserted. This is the exact failure the
// id-tiebreaker discipline prevents. (Synthetic control, not a repo site.)
test("Lane2a: a NO-tiebreaker comparator is input-order-dependent (the technique's value, MEASURED)", () => {
  const withoutTiebreak = <T extends { updatedAt: number }>(a: T, b: T) => b.updatedAt - a.updatedAt;
  const T = 1_700_000_000_000;
  const rows = [
    { id: "aaa", updatedAt: T },
    { id: "bbb", updatedAt: T },
    { id: "ccc", updatedAt: T },
  ];
  const o1 = [...rows].sort(withoutTiebreak).map((r) => r.id);
  const o2 = [...rows].reverse().sort(withoutTiebreak).map((r) => r.id);
  console.log(`[Lane2a] no-tiebreak, input abc -> ${o1.join(",")}`);
  console.log(`[Lane2a] no-tiebreak, input cba -> ${o2.join(",")}`);
  // Distinct outputs from the same set => nondeterministic display order.
  expect(o1).not.toEqual(o2);

  // The tiebroken form fixes it.
  const withTiebreak = <T extends { updatedAt: number; id: string }>(a: T, b: T) =>
    b.updatedAt - a.updatedAt || a.id.localeCompare(b.id);
  const f1 = [...rows].sort(withTiebreak).map((r) => r.id);
  const f2 = [...rows].reverse().sort(withTiebreak).map((r) => r.id);
  expect(f1).toEqual(f2);
});
