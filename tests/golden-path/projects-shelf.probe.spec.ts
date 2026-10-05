// THE SHELF MODEL — app/_projects/shelf.ts, driven without a browser.
//
// The three /projects prototypes (platform-consolidation WP2) share one query
// model so the bake-off compares drawings, not three different ideas of what a
// filter means. This probe holds the model to the five claims the variants lean
// on: the URL is a faithful, canonical store of the query; filters narrow and
// the state tallies count the facet; groups come out in catalogue order and
// keep the sort inside them; "needs you next" puts blocked first and sinks
// delivered, as a total order; and `nextAction` names the step it opens on.
// Plus the windowing arithmetic, because "< 60 rows in the DOM" is only as true
// as `windowRange`, and the synthetic fixture, because a screenshot of a
// non-deterministic shelf measures nothing.

import { test, expect } from "@playwright/test";

import { PHASES, emptyProgress, type PhaseKey, type PhaseState, type Project, type TemplateId } from "@/lib/projects";
import {
  DEFAULTS,
  compareNeedsYou,
  deriveShelf,
  flattenGroups,
  groupProjects,
  isFiltered,
  clearFilters,
  lockedRun,
  matches,
  nextAction,
  needsYouRank,
  prefixOffsets,
  queryFromParams,
  queryToParams,
  sortProjects,
  stateCounts,
  windowRange,
  type ShelfQuery,
} from "@/app/_projects/shelf";
import { isSynthetic, syntheticProjects } from "@/app/_projects/synthetic";

const T0 = 1_700_000_000_000;

function mk(
  id: string,
  over: Partial<Project> & { prog?: Partial<Record<PhaseKey, PhaseState>> } = {},
): Project {
  const { prog, ...rest } = over;
  return {
    id,
    uid: "u1",
    title: `Project ${id}`,
    logline: "",
    template: "short-educational-video" as TemplateId,
    discipline: "educational",
    targetS: 120,
    createdAt: T0,
    updatedAt: T0,
    phase: "research",
    progress: { ...emptyProgress(), ...prog },
    ...rest,
  };
}

const ALL_DONE = Object.fromEntries(PHASES.map((k) => [k, "done"])) as Record<PhaseKey, PhaseState>;

const q = (over: Partial<ShelfQuery> = {}): ShelfQuery => ({ ...queryFromParams(new URLSearchParams()), ...over });

/* ── URL round-trip ───────────────────────────────────────────────────────── */

test("a full query survives the URL and comes back identical", () => {
  const full: ShelfQuery = {
    q: "glass harbor",
    states: ["blocked", "review"],
    disciplines: ["trailer", "educational"],
    templates: ["teaser", "trailer"],
    phase: "frames",
    phaseState: "review",
    group: "template",
    sort: "title",
  };
  const params = queryToParams(full);
  const back = queryFromParams(new URLSearchParams(params.toString()));
  // Lists come back in catalogue order, which is the canonical form.
  expect(back).toEqual({ ...full, disciplines: ["educational", "trailer"] });
  expect(params.get("st")).toBe("blocked,review");
  expect(params.get("ph")).toBe("frames");
  expect(params.get("g")).toBe("template");
});

test("defaults are not written, and an empty query is an empty string", () => {
  expect(queryToParams(q()).toString()).toBe("");
  const v2 = { group: "none", sort: "needs-you" } as const;
  expect(queryToParams(q({ sort: "needs-you" }), new URLSearchParams(), v2).toString()).toBe("");
  // ...but the same sort is explicit against a variant whose default differs,
  // so it survives a switch of variant.
  expect(queryToParams(q({ sort: "needs-you" }), new URLSearchParams(), DEFAULTS).get("s")).toBe("needs-you");
});

test("params the model does not own (v, seed) are kept; unknown values are dropped", () => {
  const base = new URLSearchParams("v=2&seed=300&st=old");
  const out = queryToParams(q({ states: ["draft"] }), base);
  expect(out.get("v")).toBe("2");
  expect(out.get("seed")).toBe("300");
  expect(out.get("st")).toBe("draft");

  const hand = queryFromParams(new URLSearchParams("st=review,bogus&d=nope&t=teaser,x&ph=motion&ps=done&g=weird&s=zzz"));
  expect(hand.states).toEqual(["review"]);
  expect(hand.disciplines).toEqual([]);
  expect(hand.templates).toEqual(["teaser"]);
  expect(hand.phase).toBeUndefined(); // "motion" is a retired step
  expect(hand.phaseState).toBe("done");
  expect(hand.group).toBe("none");
  expect(hand.sort).toBe("updated");
});

/* ── Filtering ────────────────────────────────────────────────────────────── */

const SHELF = [
  mk("a", { title: "Glass Harbor", prog: { research: "done", frames: "review" } }), // review
  mk("b", { title: "Iron Tide", template: "teaser", discipline: "trailer", prog: { script: "blocked" } }), // blocked
  mk("c", { title: "Paper Orbit", prog: ALL_DONE }), // delivered
  mk("d", { title: "Quiet Signal" }), // draft
  mk("e", { title: "Salt Engine", template: "free-form", discipline: "free", prog: { research: "working" } }), // working
];

test("each filter narrows, and the state tallies count the facet, summing to it", () => {
  expect(SHELF.filter((p) => matches(p, q({ q: "harbor" }))).map((p) => p.id)).toEqual(["a"]);
  expect(SHELF.filter((p) => matches(p, q({ q: "glass HARB" }))).map((p) => p.id)).toEqual(["a"]);
  expect(SHELF.filter((p) => matches(p, q({ q: "teaser" }))).map((p) => p.id)).toEqual(["b"]); // template label
  expect(SHELF.filter((p) => matches(p, q({ disciplines: ["trailer", "free"] }))).map((p) => p.id)).toEqual(["b", "e"]);
  expect(SHELF.filter((p) => matches(p, q({ templates: ["free-form"] }))).map((p) => p.id)).toEqual(["e"]);
  expect(SHELF.filter((p) => matches(p, q({ phase: "frames", phaseState: "review" }))).map((p) => p.id)).toEqual(["a"]);
  // A step alone means "started"; a state alone means "any step in it".
  expect(SHELF.filter((p) => matches(p, q({ phase: "research" }))).map((p) => p.id)).toEqual(["a", "c", "e"]);
  expect(SHELF.filter((p) => matches(p, q({ phaseState: "blocked" }))).map((p) => p.id)).toEqual(["b"]);

  const view = deriveShelf(SHELF, q({ states: ["blocked"], disciplines: ["educational", "trailer"] }));
  expect(view.rows.map((p) => p.id)).toEqual(["b"]);
  // Tallies ignore the state filter but honour the rest: four projects pass the
  // discipline facet, and the five buckets partition them.
  expect(view.counts).toEqual({ total: 4, blocked: 1, review: 1, working: 0, draft: 1, delivered: 1 });
  const c = stateCounts(SHELF);
  expect(c.blocked + c.review + c.working + c.draft + c.delivered).toBe(c.total);
});

test("a filter that matches nothing is an empty view, not an error", () => {
  const view = deriveShelf(SHELF, q({ q: "no such project" }));
  expect(view.rows).toEqual([]);
  expect(view.groups).toEqual([]);
  expect(view.total).toBe(5);
  expect(isFiltered(q({ q: "x" }))).toBe(true);
  expect(isFiltered(clearFilters(q({ q: "x", states: ["draft"], group: "state", sort: "title" })))).toBe(false);
  // Clearing filters leaves the arrangement alone.
  expect(clearFilters(q({ group: "state", sort: "title" }))).toMatchObject({ group: "state", sort: "title" });
});

/* ── Grouping ─────────────────────────────────────────────────────────────── */

test("groups come out in catalogue order, empty groups omitted, sort kept inside", () => {
  const sorted = sortProjects(SHELF, "title");
  const byDiscipline = groupProjects(sorted, "discipline");
  expect(byDiscipline.map((g) => g.key)).toEqual(["educational", "trailer", "free"]);
  expect(byDiscipline[0].projects.map((p) => p.title)).toEqual(["Glass Harbor", "Paper Orbit", "Quiet Signal"]);
  expect(groupProjects(sorted, "state").map((g) => g.key)).toEqual(["blocked", "review", "working", "draft", "delivered"]);
  expect(groupProjects(sorted, "none")).toEqual([{ key: "all", projects: sorted }]);
  // Every project lands in exactly one group.
  expect(groupProjects(sorted, "template").reduce((n, g) => n + g.projects.length, 0)).toBe(SHELF.length);
});

test("a collapsed group keeps its heading and loses its rows", () => {
  const groups = groupProjects(SHELF, "discipline");
  const open = flattenGroups(groups, new Set(), true);
  expect(open.filter((r) => r.kind === "group")).toHaveLength(3);
  expect(open.filter((r) => r.kind === "project")).toHaveLength(5);
  const shut = flattenGroups(groups, new Set(["educational"]), true);
  expect(shut.filter((r) => r.kind === "project")).toHaveLength(2);
  expect(shut[0]).toMatchObject({ kind: "group", key: "educational", count: 3, collapsed: true });
  expect(flattenGroups(groupProjects(SHELF, "none"), new Set(), false).every((r) => r.kind === "project")).toBe(true);
});

/* ── Needs you next ───────────────────────────────────────────────────────── */

test("needs-you order: blocked, then a call, then working, then drafts; delivered sinks", () => {
  expect(sortProjects(SHELF, "needs-you").map((p) => p.id)).toEqual(["b", "a", "e", "d", "c"]);
  expect(needsYouRank(SHELF[1])).toBe(0);
  expect(needsYouRank(SHELF[2])).toBe(4);
});

test("within a tier, closest to the line first, then most recent, then id — a total order", () => {
  const near = mk("near", { prog: { research: "done", script: "done", frames: "review" }, updatedAt: T0 });
  const far = mk("far", { prog: { research: "review" }, updatedAt: T0 + 5000 });
  const recent = mk("recent", { prog: { research: "review" }, updatedAt: T0 + 9000 });
  const tieA = mk("tie-a", { prog: { research: "review" } });
  const tieB = mk("tie-b", { prog: { research: "review" } });
  const want = ["near", "recent", "far", "tie-a", "tie-b"];
  expect(sortProjects([tieB, far, near, tieA, recent], "needs-you").map((p) => p.id)).toEqual(want);
  expect(sortProjects([recent, tieA, near, tieB, far], "needs-you").map((p) => p.id)).toEqual(want);
  expect(compareNeedsYou(tieA, tieA)).toBe(0);
  expect(compareNeedsYou(tieA, tieB)).not.toBe(0);
});

/* ── The next move ────────────────────────────────────────────────────────── */

test("nextAction names the move and the step it opens on", () => {
  expect(nextAction(mk("x"))).toEqual({ verb: "Start Research", step: "research", tone: "you" });
  expect(nextAction(mk("x", { prog: { research: "done" } }))).toEqual({ verb: "Start Script", step: "script", tone: "you" });
  expect(nextAction(mk("x", { prog: { research: "working" } }))).toEqual({
    verb: "Continue Research",
    step: "research",
    tone: "you",
  });
  // A call to make outranks continuing an earlier step.
  expect(nextAction(mk("x", { prog: { research: "working", score: "review" } }))).toEqual({
    verb: "Decide Score",
    step: "score",
    tone: "you",
  });
  // A stopped step outranks everything.
  expect(nextAction(mk("x", { prog: { research: "review", cut: "blocked" } }))).toEqual({
    verb: "Unblock Cut",
    step: "cut",
    tone: "blocked",
  });
  expect(nextAction(mk("x", { prog: ALL_DONE }))).toEqual({ verb: "Delivered", step: "cut", tone: "done" });
});

test("the trail runs over the unbroken run of locked steps from the start", () => {
  expect(lockedRun(mk("x"))).toBe(-1);
  expect(lockedRun(mk("x", { prog: { research: "done", script: "done", score: "done" } }))).toBe(1);
  expect(lockedRun(mk("x", { prog: ALL_DONE }))).toBe(4);
});

/* ── Windowing ────────────────────────────────────────────────────────────── */

test("a 500-row shelf in a 700px box puts fewer than 60 rows in the DOM", () => {
  const heights = Array.from({ length: 500 }, () => 32);
  const offsets = prefixOffsets(heights);
  expect(offsets[500]).toBe(16_000);
  for (const top of [0, 3_000, 15_300, 16_000]) {
    const [s, e] = windowRange(offsets, top, 700, 6);
    expect(e - s, `scrollTop ${top}`).toBeLessThan(60);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(e).toBeLessThanOrEqual(500);
  }
  const [s, e] = windowRange(offsets, 3_200, 700, 0);
  expect([s, e]).toEqual([100, 122]); // rows 100..121 intersect [3200, 3900)
  // Mixed heights (group headings) are found by offset, not by index.
  const mixed = prefixOffsets([44, 64, 64, 44, 64]);
  expect(windowRange(mixed, 130, 50, 0)).toEqual([2, 4]);
  expect(windowRange(prefixOffsets([]), 0, 700)).toEqual([0, 0]);
});

/* ── The synthetic fixture ────────────────────────────────────────────────── */

test("?seed=N is deterministic, tagged, valid, and spans every state", () => {
  const a = syntheticProjects(300, "u1", T0);
  const b = syntheticProjects(300, "u1", T0);
  expect(a).toEqual(b);
  expect(a).toHaveLength(300);
  expect(new Set(a.map((p) => p.id)).size).toBe(300);
  expect(a.every(isSynthetic)).toBe(true);
  const c = stateCounts(a);
  for (const s of ["blocked", "review", "working", "draft", "delivered"] as const) expect(c[s], s).toBeGreaterThan(0);
  expect(a.every((p) => p.updatedAt >= p.createdAt && p.updatedAt <= T0)).toBe(true);
  expect(syntheticProjects(0, "u1")).toEqual([]);
});
