// LANE 2a — SORT CORRECTNESS / STABILITY (dynamic).
//
// Corpus technique: "id-tiebreaker sort discipline" — a comparator must return a
// TOTAL order (never 0 for two distinct rows) so display order is deterministic
// regardless of the order the data arrived in. Static verdict: HOLDS, plus a
// DEFER "APPLY-2: 15 sort sites missing an id tiebreaker (masked today)".
//
// This probe used to drive the comparator through ProjectsMatrix's render. The
// matrix was deleted on 2026-10-05 (platform-consolidation round 2: the race
// sheet won), and the shelf's order is no longer decided inside a component at
// all — it is app/_projects/shelf.ts#sortProjects, and the race sheet draws
// exactly `flattenGroups(deriveShelf(...).groups)` in that order (RaceSheet.tsx
// maps that list and nothing else). So the RENDERED order is driven here
// through that same pair, for EVERY sort the toolbar offers, with equal primary
// keys and three input permutations — then the controlled no-tiebreaker
// counterfactual shows the nondeterminism the technique exists to prevent.
import { test, expect } from "@playwright/test";

import {
  SORTS,
  deriveShelf,
  flattenGroups,
  queryFromParams,
  type ShelfQuery,
  type ShelfSort,
} from "@/app/_projects/shelf";
import { mkProject } from "./_helpers";

function renderedOrder(projects: ReturnType<typeof mkProject>[], sort: ShelfSort, group: ShelfQuery["group"] = "none") {
  const q = { ...queryFromParams(new URLSearchParams()), sort, group };
  return flattenGroups(deriveShelf(projects, q).groups, new Set(), group !== "none").flatMap((r) =>
    r.kind === "project" ? [r.project.id] : [],
  );
}

/** Three projects that tie on every sort's primary key: same timestamps, same
 *  progress, same title. Only the id can tell them apart. */
function tied() {
  const T = 1_700_000_000_000;
  return ["aaa", "bbb", "ccc"].map((id) => ({ ...mkProject(id, T), title: "Same title" }));
}

for (const sort of SORTS) {
  test(`Lane2a: the "${sort}" order is deterministic on EQUAL primary keys (tiebreaker HOLDS)`, () => {
    const [a, b, c] = tied();
    const order1 = renderedOrder([a, b, c], sort);
    const order2 = renderedOrder([c, b, a], sort); // reversed input
    const order3 = renderedOrder([b, c, a], sort); // shuffled input
    console.log(
      `[Lane2a] ${sort}: abc -> ${order1.join(",")} · cba -> ${order2.join(",")} · bca -> ${order3.join(",")}`,
    );
    // Same set, any input order -> same rendered order (the whole point).
    expect(order2).toEqual(order1);
    expect(order3).toEqual(order1);
    // And it is the id-ascending tiebreak, not accidental input order.
    expect(order1).toEqual(["aaa", "bbb", "ccc"]);
  });
}

test("Lane2a: a grouping keeps the tiebroken order inside each group", () => {
  const [a, b, c] = tied();
  expect(renderedOrder([c, a, b], "updated", "template")).toEqual(["aaa", "bbb", "ccc"]);
  expect(renderedOrder([b, c, a], "needs-you", "state")).toEqual(["aaa", "bbb", "ccc"]);
});

test("Lane2a: primary key still dominates the tiebreaker", () => {
  const T = 1_700_000_000_000;
  const newer = mkProject("zzz", T + 10_000); // newest updatedAt, id sorts last
  const older = mkProject("aaa", T);
  const order = renderedOrder([older, newer], "updated");
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
  const o2 = [...rows]
    .reverse()
    .sort(withoutTiebreak)
    .map((r) => r.id);
  console.log(`[Lane2a] no-tiebreak, input abc -> ${o1.join(",")}`);
  console.log(`[Lane2a] no-tiebreak, input cba -> ${o2.join(",")}`);
  // Distinct outputs from the same set => nondeterministic display order.
  expect(o1).not.toEqual(o2);

  // The tiebroken form fixes it.
  const withTiebreak = <T extends { updatedAt: number; id: string }>(a: T, b: T) =>
    b.updatedAt - a.updatedAt || a.id.localeCompare(b.id);
  const f1 = [...rows].sort(withTiebreak).map((r) => r.id);
  const f2 = [...rows]
    .reverse()
    .sort(withTiebreak)
    .map((r) => r.id);
  expect(f1).toEqual(f2);
});
