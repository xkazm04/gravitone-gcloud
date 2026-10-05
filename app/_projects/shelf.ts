// THE SHELF MODEL — one query, one order, one grouping, for the /projects race
// sheet (platform-consolidation WP2, 2026-10-04; consolidated in round 2 on
// 2026-10-05, when the race sheet won and the ledger and the pivot board went).
//
// Pure on purpose: no React, no DOM, no storage. It was written that way so
// three prototypes could be compared on how they DREW a shelf rather than on
// what "blocked" sorts ahead of; with one surface left the reason is the probe
// lane. tests/golden-path/projects-shelf.probe.spec.ts drives every export here
// without a browser, and sort-stability / render-budget hold the race sheet's
// order and its DOM bound through the same functions it renders from.
//
// Derived from StatReel's rundown (apps/studio/src): `nextAction` is logic.ts:134
// re-read against Gravitone's record, `compareNeedsYou` is display.ts:157
// `rundownOrder`, `stateCounts` is projectState.ts `bucketCounts` (the buckets
// partition the shelf, so they always sum to its total), and `GATE_POS` is
// rundown.ts:25 for five gates instead of six.

import {
  DISCIPLINES,
  DISCIPLINE_LABEL,
  PHASES,
  PHASE_TITLE,
  TEMPLATES,
  disciplineOf,
  doneCount,
  projectState,
  templateOf,
  type Discipline,
  type PhaseKey,
  type PhaseState,
  type Project,
  type ProjectState,
  type TemplateId,
} from "@/lib/projects";

/* ── The query, and its URL spelling ──────────────────────────────────────── */

export type ShelfGroup = "none" | "discipline" | "template" | "state";
export type ShelfSort = "needs-you" | "updated" | "created" | "title";

export const GROUPS: readonly ShelfGroup[] = ["none", "discipline", "template", "state"];
export const SORTS: readonly ShelfSort[] = ["needs-you", "updated", "created", "title"];

/** Worst news first — the order the State dropdown and a state grouping read in.
 *  The same precedence `projectState` (lib/projects.ts:399) resolves a project by. */
export const STATE_ORDER: readonly ProjectState[] = ["blocked", "review", "working", "draft", "delivered"];

export const PHASE_STATES: readonly PhaseState[] = ["empty", "working", "review", "done", "blocked"];

export interface ShelfQuery {
  /** Free text over title, logline, template and discipline. */
  q: string;
  states: ProjectState[];
  disciplines: Discipline[];
  templates: TemplateId[];
  /** A step, with `phaseState`: "projects whose Frames is in review". Alone it
   *  means "this step has been started" — anything but `empty`. */
  phase?: PhaseKey;
  /** Alone: any step in this state. */
  phaseState?: PhaseState;
  group: ShelfGroup;
  sort: ShelfSort;
}

/** What the shelf opens on when the URL says nothing: ungrouped, in rundown
 *  order. Absent params read as these and a value equal to them is not written
 *  back, so a clean URL stays clean.
 *
 *  It was `updated`, overridable per surface, while three variants shared this
 *  model and each opened on its own arrangement. The race sheet always opened
 *  on `needs-you`, and it is the surface left. */
export const DEFAULTS: {
  readonly group: ShelfGroup;
  readonly sort: ShelfSort;
} = {
  group: "none",
  sort: "needs-you",
};

export const PARAM = {
  q: "q",
  states: "st",
  disciplines: "d",
  templates: "t",
  phase: "ph",
  phaseState: "ps",
  group: "g",
  sort: "s",
} as const;

const TEMPLATE_IDS: readonly TemplateId[] = TEMPLATES.map((t) => t.id);

/** Read a comma list, keep only the members `allowed` knows, and return them in
 *  `allowed`'s order — so `st=review,blocked` and `st=blocked,review` are one
 *  query, and a hand-edited unknown value is dropped rather than matching nothing. */
function list<T extends string>(raw: string | null, allowed: readonly T[]): T[] {
  if (!raw) return [];
  const asked = new Set(raw.split(",").map((s) => s.trim()));
  return allowed.filter((a) => asked.has(a));
}

function one<T extends string>(raw: string | null, allowed: readonly T[]): T | undefined {
  return raw && (allowed as readonly string[]).includes(raw) ? (raw as T) : undefined;
}

type ParamsLike = { get(name: string): string | null };

export function queryFromParams(params: ParamsLike): ShelfQuery {
  return {
    q: params.get(PARAM.q) ?? "",
    states: list(params.get(PARAM.states), STATE_ORDER),
    disciplines: list(params.get(PARAM.disciplines), DISCIPLINES),
    templates: list(params.get(PARAM.templates), TEMPLATE_IDS),
    phase: one(params.get(PARAM.phase), PHASES),
    phaseState: one(params.get(PARAM.phaseState), PHASE_STATES),
    group: one(params.get(PARAM.group), GROUPS) ?? DEFAULTS.group,
    sort: one(params.get(PARAM.sort), SORTS) ?? DEFAULTS.sort,
  };
}

/** The query written into `base` (which keeps every param this model does not
 *  own — `seed`). Canonical: enum order inside a list, defaults omitted. */
export function queryToParams(
  q: ShelfQuery,
  base: ParamsLike & { toString(): string } = new URLSearchParams(),
): URLSearchParams {
  const out = new URLSearchParams(base.toString());
  for (const k of Object.values(PARAM)) out.delete(k);
  const put = (k: string, v: string | undefined) => {
    if (v) out.set(k, v);
  };
  put(PARAM.q, q.q.trim() ? q.q : undefined);
  put(PARAM.states, STATE_ORDER.filter((s) => q.states.includes(s)).join(","));
  put(PARAM.disciplines, DISCIPLINES.filter((d) => q.disciplines.includes(d)).join(","));
  put(PARAM.templates, TEMPLATE_IDS.filter((t) => q.templates.includes(t)).join(","));
  put(PARAM.phase, q.phase);
  put(PARAM.phaseState, q.phaseState);
  put(PARAM.group, q.group === DEFAULTS.group ? undefined : q.group);
  put(PARAM.sort, q.sort === DEFAULTS.sort ? undefined : q.sort);
  return out;
}

/** Is anything narrowing the shelf? Group and sort rearrange; they hide nothing. */
export function isFiltered(q: ShelfQuery): boolean {
  return (
    q.q.trim() !== "" ||
    q.states.length > 0 ||
    q.disciplines.length > 0 ||
    q.templates.length > 0 ||
    q.phase !== undefined ||
    q.phaseState !== undefined
  );
}

export function clearFilters(q: ShelfQuery): ShelfQuery {
  return { ...q, q: "", states: [], disciplines: [], templates: [], phase: undefined, phaseState: undefined };
}

/* ── The next move ────────────────────────────────────────────────────────── */

export type ActionTone = "you" | "wait" | "done" | "blocked";

export interface NextAction {
  /** Imperative, two words: "Unblock Frames". */
  verb: string;
  /** The step the action opens on — the CTA routes `?step=` here. */
  step: PhaseKey;
  tone: ActionTone;
}

/**
 * What this project wants next, and from whom.
 *
 * StatReel's version (logic.ts:134) lets a RUNNING JOB win, as `wait`. A
 * Gravitone project record carries no job state — `progress` is five words each
 * step reported about itself (lib/projects.ts:343), and `working` there means a
 * person is mid-step, not that a machine is. So `wait` is in the vocabulary for
 * parity with the contract and no record reaches it today; the first job field
 * on `Project` is where it would come from, and inventing it from `working`
 * would put "nothing for you to do" on a project that is waiting for exactly you.
 *
 * Precedence follows `projectState`: a stopped step outranks a call to make,
 * which outranks continuing, which outranks starting.
 */
export function nextAction(p: Project): NextAction {
  const blocked = PHASES.find((k) => p.progress[k] === "blocked");
  if (blocked) return { verb: `Unblock ${PHASE_TITLE[blocked]}`, step: blocked, tone: "blocked" };
  const review = PHASES.find((k) => p.progress[k] === "review");
  if (review) return { verb: `Decide ${PHASE_TITLE[review]}`, step: review, tone: "you" };
  const open = PHASES.find((k) => p.progress[k] !== "done");
  if (!open) return { verb: "Delivered", step: "cut", tone: "done" };
  if (p.progress[open] === "working") return { verb: `Continue ${PHASE_TITLE[open]}`, step: open, tone: "you" };
  return { verb: `Start ${PHASE_TITLE[open]}`, step: open, tone: "you" };
}

/** The tier a project sits in on a "needs you next" shelf: 0 is first. Delivered
 *  sinks, the way published sinks in StatReel's rundown (display.ts:157). */
export function needsYouRank(p: Project): number {
  return STATE_ORDER.indexOf(projectState(p));
}

/** Rundown order: tier, then closest to the finish line, then most recently
 *  touched, then id — a TOTAL order (tests/golden-path/sort-stability: a
 *  comparator that can return 0 for two distinct rows renders input order). */
export function compareNeedsYou(a: Project, b: Project): number {
  return (
    needsYouRank(a) - needsYouRank(b) ||
    doneCount(b) - doneCount(a) ||
    PHASES.indexOf(nextAction(b).step) - PHASES.indexOf(nextAction(a).step) ||
    b.updatedAt - a.updatedAt ||
    a.id.localeCompare(b.id)
  );
}

const COMPARE: Record<ShelfSort, (a: Project, b: Project) => number> = {
  "needs-you": compareNeedsYou,
  updated: (a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id),
  created: (a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id),
  title: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }) || a.id.localeCompare(b.id),
};

export function sortProjects(ps: readonly Project[], sort: ShelfSort): Project[] {
  return [...ps].sort(COMPARE[sort]);
}

/* ── Filtering ────────────────────────────────────────────────────────────── */

const disciplineFor = (p: Project): Discipline => p.discipline ?? disciplineOf(p.template);

/** Every whitespace-separated word must appear somewhere in the haystack. */
function matchesText(p: Project, q: string): boolean {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = `${p.title} ${p.logline} ${templateOf(p.template).label} ${DISCIPLINE_LABEL[disciplineFor(p)]}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}

function matchesPhase(p: Project, q: ShelfQuery): boolean {
  if (q.phase && q.phaseState) return p.progress[q.phase] === q.phaseState;
  if (q.phase) return p.progress[q.phase] !== "empty";
  if (q.phaseState) return PHASES.some((k) => p.progress[k] === q.phaseState);
  return true;
}

/** The three facets a dropdown narrows by. Search is not one: a word typed into
 *  the box is the population being asked about, so it narrows every count. */
export type Facet = "state" | "type" | "step";

/** Every filter but `omit`'s. Each dropdown counts its options over this — the
 *  shelf as it would be if that one dropdown were reset — so picking "blocked"
 *  never changes the number printed beside "blocked", and a menu's numbers add
 *  up to what its "any" would show. */
export function matchesExcept(p: Project, q: ShelfQuery, omit: Facet | null): boolean {
  return (
    (omit === "type" ||
      ((q.disciplines.length === 0 || q.disciplines.includes(disciplineFor(p))) &&
        (q.templates.length === 0 || q.templates.includes(p.template)))) &&
    (omit === "step" || matchesPhase(p, q)) &&
    (omit === "state" || q.states.length === 0 || q.states.includes(projectState(p))) &&
    matchesText(p, q.q)
  );
}

/** Everything but the state filter — the population the State dropdown counts. */
export function matchesFacet(p: Project, q: ShelfQuery): boolean {
  return matchesExcept(p, q, "state");
}

export function matches(p: Project, q: ShelfQuery): boolean {
  return matchesExcept(p, q, null);
}

/* ── Grouping ─────────────────────────────────────────────────────────────── */

export interface ShelfGroupBlock {
  /** Discipline id, template id, project state — or "all" when ungrouped. */
  key: string;
  projects: Project[];
}

function groupKey(p: Project, g: ShelfGroup): string {
  switch (g) {
    case "discipline":
      return disciplineFor(p);
    case "template":
      return p.template;
    case "state":
      return projectState(p);
    default:
      return "all";
  }
}

const GROUP_ORDER: Record<ShelfGroup, readonly string[]> = {
  none: ["all"],
  discipline: DISCIPLINES,
  template: TEMPLATE_IDS,
  state: STATE_ORDER,
};

/** Groups in catalogue order, each keeping the order it was handed (sort first,
 *  then group). Empty groups are not returned: a heading over nothing is a row
 *  that says "no" in a list whose whole job is saying what IS there. A key the
 *  catalogue does not know (a template id retired from TEMPLATES) still gets a
 *  group, last, rather than its projects vanishing. */
export function groupProjects(sorted: readonly Project[], g: ShelfGroup): ShelfGroupBlock[] {
  const by = new Map<string, Project[]>();
  for (const p of sorted) {
    const k = groupKey(p, g);
    const arr = by.get(k);
    if (arr) arr.push(p);
    else by.set(k, [p]);
  }
  const order = GROUP_ORDER[g];
  const known = order.filter((k) => by.has(k)).map((k) => ({ key: k, projects: by.get(k)! }));
  const strays = [...by.keys()]
    .filter((k) => !order.includes(k))
    .sort()
    .map((k) => ({ key: k, projects: by.get(k)! }));
  return [...known, ...strays];
}

/* ── Counting ─────────────────────────────────────────────────────────────── */

export type StateCounts = Record<ProjectState, number> & { total: number };

/** Every project lands in exactly one state, so the five always sum to `total`. */
export function stateCounts(ps: readonly Project[]): StateCounts {
  const c: StateCounts = { total: ps.length, blocked: 0, review: 0, working: 0, draft: 0, delivered: 0 };
  for (const p of ps) c[projectState(p)] += 1;
  return c;
}

/* ── The other dropdowns' counts ──────────────────────────────────────────── */

export type StepCounts = Record<PhaseKey, Record<PhaseState, number> & { started: number }>;

export interface FacetCounts {
  /** Over every filter but Type. */
  disciplines: Record<Discipline, number>;
  templates: Record<TemplateId, number>;
  /** Over every filter but Step: per step, how many projects stand in each
   *  state there, and how many have started it at all (anything but `empty`). */
  steps: StepCounts;
}

export function facetCounts(projects: readonly Project[], q: ShelfQuery): FacetCounts {
  const disciplines = Object.fromEntries(DISCIPLINES.map((d) => [d, 0])) as Record<Discipline, number>;
  const templates = Object.fromEntries(TEMPLATE_IDS.map((t) => [t, 0])) as Record<TemplateId, number>;
  const steps = Object.fromEntries(
    PHASES.map((k) => [k, { started: 0, ...Object.fromEntries(PHASE_STATES.map((s) => [s, 0])) }]),
  ) as StepCounts;
  for (const p of projects) {
    if (matchesExcept(p, q, "type")) {
      disciplines[disciplineFor(p)] += 1;
      if (p.template in templates) templates[p.template] += 1;
    }
    if (matchesExcept(p, q, "step")) {
      for (const k of PHASES) {
        const st = p.progress[k];
        steps[k][st] += 1;
        if (st !== "empty") steps[k].started += 1;
      }
    }
  }
  return { disciplines, templates, steps };
}

/* ── One dropdown per facet ───────────────────────────────────────────────── */
//
// The query keeps LISTS (`st=review,blocked`, `d=trailer,free`), because a URL a
// person edits, or one written before round 2 when the states were toggles, can
// hold several. A dropdown holds one. These are the two directions between
// them: one member reads as that option, none as "any", and several as MULTI —
// which no option carries, so the trigger prints its placeholder for it and the
// next pick replaces the whole list.

export const ANY = "";
export const MULTI = "multi";

/** The State dropdown: one project state, or any. */
export function stateValue(q: ShelfQuery): string {
  return q.states.length === 0 ? ANY : q.states.length === 1 ? q.states[0] : MULTI;
}

export function statePatch(v: string): Pick<ShelfQuery, "states"> {
  const s = one(v, STATE_ORDER);
  return { states: s ? [s] : [] };
}

/** The Type dropdown spans two lists — a discipline is `d:<id>`, a template
 *  `t:<id>` — so one menu offers both and neither filter is lost to the merge. */
export function typeValue(q: ShelfQuery): string {
  const n = q.disciplines.length + q.templates.length;
  if (n === 0) return ANY;
  if (n > 1) return MULTI;
  return q.disciplines.length ? `d:${q.disciplines[0]}` : `t:${q.templates[0]}`;
}

export function typePatch(v: string): Pick<ShelfQuery, "disciplines" | "templates"> {
  const id = v.slice(2);
  const d = v.startsWith("d:") ? one(id, DISCIPLINES) : undefined;
  if (d) return { disciplines: [d], templates: [] };
  const t = v.startsWith("t:") ? one(id, TEMPLATE_IDS) : undefined;
  return { disciplines: [], templates: t ? [t] : [] };
}

/** The Step dropdown carries a step AND what it says: `frames` alone is "Frames
 *  started", `frames:review` is "Frames needs a call". A state with no step
 *  (a bare `ps=`, which only a hand-edited URL holds now) is MULTI. */
export function stepValue(q: ShelfQuery): string {
  if (!q.phase) return q.phaseState ? MULTI : ANY;
  return q.phaseState ? `${q.phase}:${q.phaseState}` : q.phase;
}

export function stepPatch(v: string): Pick<ShelfQuery, "phase" | "phaseState"> {
  const [k, st] = v.split(":");
  const phase = one(k ?? null, PHASES);
  return phase ? { phase, phaseState: one(st ?? null, PHASE_STATES) } : { phase: undefined, phaseState: undefined };
}

/* ── The whole derivation ─────────────────────────────────────────────────── */

export interface ShelfView {
  /** The shelf before any filter. */
  total: number;
  /** Counted over the facet (every filter but state). */
  counts: StateCounts;
  /** Filtered and sorted. */
  rows: Project[];
  groups: ShelfGroupBlock[];
  /** What the Type and Step dropdowns print beside their options. */
  facets: FacetCounts;
}

export function deriveShelf(projects: readonly Project[], q: ShelfQuery): ShelfView {
  const facet = projects.filter((p) => matchesFacet(p, q));
  const counts = stateCounts(facet);
  const rows = sortProjects(
    q.states.length === 0 ? facet : facet.filter((p) => q.states.includes(projectState(p))),
    q.sort,
  );
  return {
    total: projects.length,
    counts,
    rows,
    groups: groupProjects(rows, q.group),
    facets: facetCounts(projects, q),
  };
}

/* ── Flattening for a windowed list ───────────────────────────────────────── */

export type ShelfRow =
  | { kind: "group"; key: string; count: number; collapsed: boolean }
  | { kind: "project"; project: Project; group: string };

/** Groups → one list of rows a virtual list can measure. A collapsed group keeps
 *  its heading and loses its rows; `headings: false` (ungrouped) emits rows only. */
export function flattenGroups(
  groups: readonly ShelfGroupBlock[],
  collapsed: ReadonlySet<string>,
  headings: boolean,
): ShelfRow[] {
  const out: ShelfRow[] = [];
  for (const g of groups) {
    const shut = headings && collapsed.has(g.key);
    if (headings) out.push({ kind: "group", key: g.key, count: g.projects.length, collapsed: shut });
    if (!shut) for (const p of g.projects) out.push({ kind: "project", project: p, group: g.key });
  }
  return out;
}

/* ── Windowing ────────────────────────────────────────────────────────────── */

/** Running offsets: `out[i]` is the top of row i, `out[n]` the full height. */
export function prefixOffsets(heights: readonly number[]): number[] {
  const out = new Array<number>(heights.length + 1);
  out[0] = 0;
  for (let i = 0; i < heights.length; i++) out[i + 1] = out[i] + heights[i];
  return out;
}

/** The first row whose bottom edge is below `y` (binary search over offsets). */
export function rowAt(offsets: readonly number[], y: number): number {
  const n = offsets.length - 1;
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (offsets[mid + 1] <= y) lo = mid + 1;
    else hi = mid;
  }
  return Math.min(lo, Math.max(0, n - 1));
}

/** [start, end) of the rows that intersect the viewport, widened by `overscan`
 *  rows each side. The DOM holds these and nothing else. */
export function windowRange(
  offsets: readonly number[],
  scrollTop: number,
  viewport: number,
  overscan = 6,
): [number, number] {
  const n = offsets.length - 1;
  if (n <= 0) return [0, 0];
  const first = rowAt(offsets, Math.max(0, scrollTop));
  const last = rowAt(offsets, Math.max(0, scrollTop + viewport - 1));
  return [Math.max(0, first - overscan), Math.min(n, last + 1 + overscan)];
}

/* ── The race sheet's track ───────────────────────────────────────────────── */

/** Centre of gate i on a five-gate track, in percent (StatReel rundown.ts:25). */
export const GATE_POS = (i: number): number => ((i + 0.5) / PHASES.length) * 100;

/** How far the trail runs: through the last step of an unbroken run of locked
 *  steps from the start. -1 when Research itself is not locked. */
export function lockedRun(p: Project): number {
  let i = -1;
  while (i + 1 < PHASES.length && p.progress[PHASES[i + 1]] === "done") i++;
  return i;
}
