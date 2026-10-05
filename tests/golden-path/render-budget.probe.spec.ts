// LANE 1 — MEASURED RENDER BUDGET (dynamic).
//
// This probe was written against ProjectsMatrix, whose doctrine optimised DOM
// WEIGHT — one thin row per project — and it measured the axis that doctrine
// could not see: a single logical update rebuilt EVERY row (5 × N cells, no
// memo boundary, a fresh closure per cell). That finding was true and it is now
// moot: the matrix lost the round-1 bake-off and was deleted on 2026-10-05
// (platform-consolidation round 2). The race sheet that replaced it answers the
// same two questions differently, and this file holds it to its answers:
//
//   WEIGHT. A lane is heavier than a matrix row — a title line, a meta line, a
//   five-gate track, a CTA — so per-lane cost is bounded, not minimal. `Lane`
//   is hook-free and exported for exactly this: it is called here as a plain
//   function and the element tree it allocates is counted.
//
//   WORK PER UPDATE. The sheet still re-derives all N projects when one changes
//   (deriveShelf re-filters and re-sorts; nothing is memoised per row). What it
//   no longer does is RENDER N: the list is windowed (useShelf.ts#useVirtual),
//   so the lanes a one-row change re-renders are the lanes on screen — a count
//   set by the viewport, the same at 300 projects as at 2000. That is the claim
//   measured below, through the same pure functions the sheet renders from
//   (flattenGroups → prefixOffsets → windowRange), with the sheet's own row
//   heights and overscan imported rather than restated.
import { test, expect } from "@playwright/test";

import { Lane, LANE, LIST_MIN_PX, OVERSCAN } from "@/app/_projects/RaceSheet";
import {
  deriveShelf,
  flattenGroups,
  prefixOffsets,
  queryFromParams,
  windowRange,
  type ShelfQuery,
} from "@/app/_projects/shelf";
import { mkProject, walkTree } from "./_helpers";

const noop = () => {};

function laneWeight(p: ReturnType<typeof mkProject>) {
  const tree = (Lane as unknown as (props: unknown) => unknown)({
    p,
    active: false,
    tabbable: false,
    onFocus: noop,
    onOpen: noop,
    onEdit: noop,
    onDelete: noop,
  });
  const acc = { n: 0, testids: [] as string[], handlers: [] as unknown[] };
  walkTree(tree, acc);
  return acc;
}

/** The lanes the sheet would put in the DOM for this shelf, in a list box
 *  `viewport` px tall scrolled to `scrollTop`. */
function windowed(projects: ReturnType<typeof mkProject>[], q: ShelfQuery, viewport: number, scrollTop = 0) {
  const view = deriveShelf(projects, q);
  const flat = flattenGroups(view.groups, new Set(), q.group !== "none");
  const offsets = prefixOffsets(flat.map(() => LANE));
  const [s, e] = windowRange(offsets, scrollTop, viewport, OVERSCAN);
  return { view, rendered: flat.slice(s, e) };
}

const q = (over: Partial<ShelfQuery> = {}): ShelfQuery => ({ ...queryFromParams(new URLSearchParams()), ...over });

test("Lane1: a lane's DOM weight is bounded, whatever state the project is in", () => {
  const now = Date.now();
  const fresh = laneWeight(mkProject("a", now));
  const busy = laneWeight(
    mkProject("b", now, { research: "done", script: "done", frames: "review", score: "blocked", cut: "working" }),
  );
  const done = laneWeight(
    mkProject("c", now, { research: "done", script: "done", frames: "done", score: "done", cut: "done" }),
  );
  console.log(`[Lane1] elements per lane: fresh=${fresh.n}, mid-race=${busy.n}, delivered=${done.n}`);
  for (const w of [fresh, busy, done]) expect(w.n).toBeLessThan(45);
  // Five gates, each its own button: the per-step entry point is the track.
  expect(busy.handlers.length).toBeGreaterThanOrEqual(5 + 1);
});

test("Lane1: the lanes in the DOM are set by the viewport, not by the shelf's size", () => {
  const now = Date.now();
  const make = (n: number) =>
    Array.from({ length: n }, (_, i) => mkProject(`p${String(i).padStart(4, "0")}`, now - i * 1000));
  // The shortest the list may be, and a tall 1440p list.
  for (const viewport of [LIST_MIN_PX, 1100]) {
    const bound = Math.ceil(viewport / LANE) + 1 + 2 * OVERSCAN;
    const at300 = windowed(make(300), q(), viewport).rendered.length;
    const at2000 = windowed(make(2000), q(), viewport).rendered.length;
    const deep = windowed(make(2000), q(), viewport, 2000 * LANE * 0.6).rendered.length;
    console.log(
      `[Lane1] viewport ${viewport}px: lanes rendered N=300 -> ${at300}, N=2000 -> ${at2000} (scrolled: ${deep}); bound ${bound}`,
    );
    expect(at300).toBeLessThanOrEqual(bound);
    expect(at2000).toBe(at300);
    expect(deep).toBeLessThanOrEqual(bound);
  }
});

test("Lane1: a single logical update re-derives N but re-renders only the window — MEASURED", () => {
  const now = Date.now();
  const N = 300;
  const base = Array.from({ length: N }, (_, i) => mkProject(`p${String(i).padStart(3, "0")}`, now - i * 1000));
  const byUpdated = q({ sort: "updated" });

  const t0 = performance.now();
  const before = windowed(base, byUpdated, 760);
  const fullMs = performance.now() - t0;

  // ONE project is touched (updatedAt bumped, so it jumps to the top).
  const updated = base.map((p, i) => (i === 137 ? mkProject(p.id, now + 5000) : p));
  const t1 = performance.now();
  const after = windowed(updated, byUpdated, 760);
  const updateMs = performance.now() - t1;

  console.log(
    `[Lane1] N=${N}: derive+window ${fullMs.toFixed(2)}ms, after a 1-of-${N} change ${updateMs.toFixed(2)}ms; ` +
      `rows re-derived ${after.view.rows.length}, lanes re-rendered ${after.rendered.length}`,
  );
  // The model still walks the whole shelf...
  expect(after.view.rows).toHaveLength(N);
  // ...and the re-sort ran: the touched project is now first.
  const first = after.rendered[0];
  expect(first.kind === "project" && first.project.id).toBe("p137");
  // ...but what reaches the DOM is the window, not N.
  expect(after.rendered.length).toBe(before.rendered.length);
  expect(after.rendered.length).toBeLessThan(N / 10);
});
