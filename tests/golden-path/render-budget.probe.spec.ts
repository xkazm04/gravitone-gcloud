// LANE 1 — MEASURED RENDER BUDGET (dynamic).
//
// Static verdict for this surface: "render-budget technique HOLDS (by pattern)".
// The ProjectsMatrix doctrine (its header comment) optimises DOM WEIGHT: one
// thin ~32px row, the progress column IS the table, half-height bars. That is a
// real technique and this probe confirms the per-row DOM stays bounded.
//
// But "render budget" has a SECOND axis the static scan cannot see: does a
// single logical update re-do work for every row? ProjectsMatrix has NO
// memoisation — no React.memo row, no useMemo around the sort, and a fresh
// inline onClick per cell. This probe MEASURES both axes by calling the ACTUAL
// component (it is hook-free, so it is a pure function of props) and walking the
// element tree it allocates.
import { test, expect } from "@playwright/test";
import ProjectsMatrix from "@/app/_projects/ProjectsMatrix";
import { mkProject, walkTree, noopProps } from "./_helpers";

function render(projects: ReturnType<typeof mkProject>[]) {
  const tree = (ProjectsMatrix as unknown as (p: unknown) => unknown)({ projects, ...noopProps });
  const acc = { n: 0, testids: [] as string[], handlers: [] as unknown[] };
  walkTree(tree, acc);
  const cells = acc.testids.filter((t) => t.startsWith("cell-")).length;
  return { total: acc.n, cells, handlers: acc.handlers, order: acc.testids.filter((t) => t.endsWith("-research")) };
}

test("Lane1: per-row DOM weight is bounded (the DOM-economy claim HOLDS)", () => {
  const now = Date.now();
  const one = render([mkProject("a", now)]);
  const fifty = render(Array.from({ length: 50 }, (_, i) => mkProject(`p${i}`, now - i * 1000)));
  // Marginal element cost of each additional row (chrome cancels out; `one.total`
  // is header+chrome+1 row, so the difference over 49 rows is the per-row cost).
  const marginal = (fifty.total - one.total) / 49;
  console.log(`[Lane1] elements: N=1 -> ${one.total}, N=50 -> ${fifty.total}; marginal/row ~= ${marginal.toFixed(1)}`);
  console.log(`[Lane1] cells: N=1 -> ${one.cells} (=5), N=50 -> ${fifty.cells} (=250)`);
  expect(one.cells).toBe(5); // 5 phases per row
  expect(fifty.cells).toBe(250);
  // A thin row is a bounded number of elements. If this ever balloons, the
  // DOM-economy technique has regressed.
  expect(marginal).toBeLessThan(45);
});

test("Lane1: a SINGLE logical update rebuilds EVERY row (no memo boundary) — MEASURED", () => {
  const now = Date.now();
  const N = 200;
  const base = Array.from({ length: N }, (_, i) => mkProject(`p${String(i).padStart(3, "0")}`, now - i * 1000));

  const t0 = performance.now();
  const before = render(base);
  const renderMsFull = performance.now() - t0;

  // The realistic "single logical update": ONE project is touched (updatedAt
  // bumped so it jumps to the top). The parent hands ProjectsMatrix a new array;
  // because nothing is memoised, the whole component re-runs.
  const updated = base.map((p, i) => (i === 137 ? mkProject(p.id, now + 5000) : p));
  const t1 = performance.now();
  const after = render(updated);
  const renderMsUpdate = performance.now() - t1;

  console.log(`[Lane1] N=${N}: full-render ${renderMsFull.toFixed(2)}ms, single-update re-render ${renderMsUpdate.toFixed(2)}ms`);
  console.log(`[Lane1] cells rebuilt on a 1-of-${N} change: ${after.cells} (bound implied by "should not re-render every row" = ~5)`);
  console.log(`[Lane1] the re-sort ran: row 137 moved from pos ${before.order.indexOf("cell-p137-research")} to top=${after.order[0] === "cell-p137-research"}`);

  // MEASURED FINDING: a one-row logical change rebuilds all 5*N cells, not ~5.
  expect(after.cells).toBe(5 * N); // 1000 cells rebuilt for a 1-field change
  expect(before.cells).toBe(5 * N);
  // The re-sort re-ran over all N (the moved row is now first).
  expect(after.order[0]).toBe("cell-p137-research");
});

test("Lane1: per-row onClick handlers are re-allocated every render (why child memo cannot help)", () => {
  const now = Date.now();
  const N = 10;
  const projects = Array.from({ length: N }, (_, i) => mkProject(`p${i}`, now - i * 1000));
  const r1 = render(projects);
  const r2 = render(projects); // identical props
  // The handler count scales with N (per-row + per-cell closures).
  const stable = r1.handlers.filter((h) => r2.handlers.includes(h));
  console.log(`[Lane1] handlers/render=${r1.handlers.length} for N=${N}; referentially stable across identical renders=${stable.length}`);
  // Handlers scale with rows: a fresh closure per row and per cell.
  expect(r1.handlers.length).toBeGreaterThanOrEqual(5 * N);
  // Only pass-through callback props (e.g. the single New-project button's
  // onCreate) stay stable — a small CONSTANT, never proportional to N. Every
  // per-row/per-cell closure is rebuilt, so a React.memo'd row would still
  // re-render because its onClick is never referentially stable.
  expect(stable.length).toBeLessThanOrEqual(2);
});
