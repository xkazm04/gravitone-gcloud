import "server-only";

// THE FIXTURE LIBRARY - an in-memory index over the generated corpus that answers the index's
// contract (@gt/domain/library) by the index's rules, so the route is built and driven before the
// kernel's index serves it (L49 builds that; the wave B cutover flips ./port.ts). Not a mock that
// answers yes - every rule the screen depends on is enforced here the way the kernel's query does:
//   · the search text through the ONE parser (`parseSearch`): free words prefix-match a word of
//     the item, `key:value` tokens match a facet value or its label, `kind:` and `id:` their fields;
//   · OR within a group, AND across groups; each group counted with its own selection left out;
//     the kind counts honour only the shared groups (library.js `compute`, the disjunctive count);
//   · a selected value at 0 is still sent; values in FIXED_ORDER keep it; TOP-N with `more`;
//   · items that cannot show their media sort last (library.js `bad`), then by the sort;
//   · `limit` is required and capped (LIBRARY_PAGE_MAX), `offset` is an index into the order;
//   · an act is an event: pin, unpin and use-in-project write the universe and its act log; an
//     export is logged and writes NO file - the fixture has no game project to write into.
// State lives for the server process; `resetLibraryFixture` starts it over.

import { parseAt } from "@gt/domain/door";
import { err, ok, type Result } from "@gt/domain/errors";
import {
  DEFAULT_PIN,
  FIXED_ORDER,
  groupLabel,
  isSharedGroup,
  KIND_LABELS,
  LIBRARY_GROUP_TOP,
  LIBRARY_KINDS,
  LIBRARY_PAGE_MAX,
  normText,
  parseSearch,
  railGroups,
  type LibraryAct,
  type LibraryGroup,
  type LibraryKindName,
  type LibraryPage,
  type LibraryQuery,
  type ParsedSearch,
} from "@gt/domain/library";
import { libraryItemSchema, type LibraryItemDetail } from "@gt/domain/libraryItem";

import { buildCorpus, labelOf, type FixtureRecord } from "./fixtureCorpus.ts";
import { PROJECTS } from "./fixtureData.ts";

type ActLog = { readonly at: string; readonly type: "library.pinned" | "library.unpinned" | "library.used" | "library.exported"; readonly id: string; readonly projectId?: string };
type Universe = { readonly items: FixtureRecord[]; readonly byId: Map<string, FixtureRecord>; readonly order: Map<string, FixtureRecord[]>; readonly acts: ActLog[] };

// On globalThis: Next may load this module once per server bundle (the page, the actions) and
// again on every hot reload, and one fixture universe must answer all of them.
declare global {
  var __gtLibraryFixture: Universe | undefined;
}

function boot(): Universe {
  const items = [...buildCorpus()];
  return { items, byId: new Map(items.map((x) => [x.row.id, x])), order: new Map(), acts: [] };
}
const universe = (): Universe => (globalThis.__gtLibraryFixture ??= boot());

/** Start the universe over (the live lane's reset). */
export function resetLibraryFixture(): void {
  globalThis.__gtLibraryFixture = boot();
}

/** The acts written since boot: what the real side appends to the ledger as events. */
export const fixtureActs = (): readonly ActLog[] => universe().acts;

const KIND_RANK = new Map<string, number>(LIBRARY_KINDS.map((k, i) => [k, i]));

function ordered(u: Universe, sort: NonNullable<LibraryQuery["sort"]>): FixtureRecord[] {
  const have = u.order.get(sort);
  if (have !== undefined) return have;
  // A tie on the date falls to the newer write, as the kernel's ORDER does (kernel library/query.ts
  // `seq DESC`); the corpus order is that write order.
  const seq = new Map(u.items.map((x, i) => [x, i]));
  const s = (x: FixtureRecord): number => seq.get(x) ?? 0;
  const bad = (x: FixtureRecord): number => (x.row.attention === undefined ? 0 : 1);
  const a = [...u.items].sort((x, y) => {
    const b = bad(x) - bad(y);
    if (b !== 0) return b;
    if (sort === "name") return x.row.title.localeCompare(y.row.title) || x.row.id.localeCompare(y.row.id);
    if (sort === "kind") return (KIND_RANK.get(x.row.kind) ?? 0) - (KIND_RANK.get(y.row.kind) ?? 0) || y.t - x.t || s(y) - s(x);
    return y.t - x.t || s(y) - s(x);
  });
  u.order.set(sort, a);
  return a;
}

const kindWords = (k: string): string => `${k} ${normText(KIND_LABELS.find((x) => x.kind === k)?.short ?? k)}`;

/** Does the item answer the parsed search? Words prefix a word of its text; tokens hit a field. */
export function matches(x: FixtureRecord, p: ParsedSearch): boolean {
  if (p.words.length > 0) {
    const ws = x.hay.split(" ");
    for (const w of p.words) if (!ws.some((h) => h.startsWith(w))) return false;
  }
  for (const t of p.tokens) {
    if (t.key === "kind") {
      if (!kindWords(x.row.kind).split(" ").some((h) => h.startsWith(t.value))) return false;
    } else if (t.key === "id") {
      if (!x.row.id.toLowerCase().startsWith(t.value.toLowerCase())) return false;
    } else {
      const vals = x.f[t.key] ?? [];
      if (!vals.some((v) => normText(v).includes(t.value) || normText(labelOf(t.key, v)).includes(t.value))) return false;
    }
  }
  return true;
}

export function fixtureQuery(q: LibraryQuery): Result<LibraryPage> {
  const limit = Math.floor(q.limit);
  const offset = Math.max(0, Math.floor(q.offset ?? 0));
  if (!(limit >= 0 && limit <= LIBRARY_PAGE_MAX)) return err("invalid", `limit is 0..${LIBRARY_PAGE_MAX}`);
  const u = universe();
  const kind = q.kind;
  const parsed = parseSearch(q.q ?? "");
  const active = Object.entries(q.facets ?? {}).flatMap(([g, vs]) => (vs !== undefined && vs.length > 0 ? [[g, new Set(vs)] as const] : []));
  const rail = railGroups(kind ?? "all");
  const counts = new Map<string, Map<string, number>>(rail.map((g) => [g.key, new Map()]));
  const kindCounts: Record<LibraryKindName | "all", number> = { all: 0, image: 0, plate: 0, style: 0, motion: 0, audio: 0, video: 0, doc: 0, model: 0, character: 0 };
  const list: FixtureRecord[] = [];
  for (const x of ordered(u, q.sort ?? "newest")) {
    if (!matches(x, parsed)) continue;
    let fails = 0;
    let failKey = "";
    let sharedFail = 0;
    for (const [g, set] of active) {
      if (!(x.f[g] ?? []).some((v) => set.has(v))) {
        fails++;
        failKey = g;
        if (isSharedGroup(g)) sharedFail++;
      }
    }
    if (sharedFail === 0) {
      kindCounts.all++;
      kindCounts[x.row.kind]++;
    }
    if (kind !== undefined && x.row.kind !== kind) continue;
    if (fails === 0) list.push(x);
    if (fails > 1) continue;
    for (const g of rail) {
      if (fails === 1 && failKey !== g.key) continue;
      const m = counts.get(g.key);
      if (m === undefined) continue;
      for (const v of x.f[g.key] ?? []) m.set(v, (m.get(v) ?? 0) + 1);
    }
  }
  let truncated = false;
  const groups: LibraryGroup[] = [];
  for (const g of rail) {
    const m = counts.get(g.key) ?? new Map<string, number>();
    const held = new Set(active.find(([k]) => k === g.key)?.[1] ?? []);
    for (const v of held) if (!m.has(v)) m.set(v, 0);
    if (m.size === 0) continue;
    const fixed = FIXED_ORDER[g.key];
    const at = (v: string): number => (fixed === undefined ? 0 : fixed.indexOf(v) < 0 ? fixed.length : fixed.indexOf(v));
    const vals = [...m].map(([value, count]) => ({ value, label: labelOf(g.key, value), count, selected: held.has(value) }));
    vals.sort((a, b) => (fixed === undefined ? b.count - a.count || a.label.localeCompare(b.label) : at(a.value) - at(b.value)));
    const top = vals.filter((v, i) => i < LIBRARY_GROUP_TOP || v.selected);
    if (top.length < vals.length) truncated = true;
    groups.push({ key: g.key, label: groupLabel(g.key), section: g.section, values: top, more: vals.length - top.length });
  }
  return ok({ items: list.slice(offset, offset + limit).map((x) => x.row), total: list.length, offset, kindCounts, groups, truncated, parsed });
}

/** Everything the universe holds, before any query. */
export const fixtureEverything = (): number => universe().items.length;

/** The vocabulary lines a detail lists: the kind's groups, then its collections (library.js `body`). */
const DETAIL_SHARED = ["project", "run", "hunt"];

export function fixtureDetail(id: string): Result<LibraryItemDetail> {
  const x = universe().byId.get(id);
  if (x === undefined) return err("not-found", `no library item ${id}`);
  const item = parseAt(`fixture library item ${id}`, libraryItemSchema, x.raw);
  if (!item.ok) return item;
  const keys = [...railGroups(x.row.kind).filter((g) => g.section === "vocabulary").map((g) => g.key), ...DETAIL_SHARED];
  const vocabulary = keys.flatMap((key) => {
    const vs = x.f[key] ?? [];
    return vs.length === 0 ? [] : [{ key, label: groupLabel(key), values: vs.map((value) => ({ value, label: labelOf(key, value) })) }];
  });
  const pinned = (x.f["pin"] ?? []).length > 0;
  return ok({ item: item.value, row: x.row, vocabulary, lineage: x.lineage, extras: x.extras, media: x.media, acts: [pinned ? "unpin" : "pin", "use-in-project", ...(x.row.kind === "model" ? (["export"] as const) : [])] });
}

/** Presentation extras the index does not carry on a row (a take's peaks, a face's palette, a player's address). */
export function fixtureLook(id: string): Pick<FixtureRecord, "peaks" | "palette" | "video" | "poster"> {
  const x = universe().byId.get(id);
  if (x === undefined) return {};
  return { ...(x.peaks === undefined ? {} : { peaks: x.peaks }), ...(x.palette === undefined ? {} : { palette: x.palette }), ...(x.video === undefined ? {} : { video: x.video }), ...(x.poster === undefined ? {} : { poster: x.poster }) };
}

export const fixtureProjects = (): readonly { readonly value: string; readonly label: string }[] => PROJECTS.map((p) => ({ value: p.id, label: p.title }));

/** One act on one item: written to the item's collections and to the act log, or refused. */
export function fixtureAct(id: string, act: LibraryAct, now: () => string): Result<{ readonly said: string }> {
  const u = universe();
  const x = u.byId.get(id);
  if (x === undefined) return err("not-found", `no library item ${id}`);
  const pins = x.f["pin"] ?? [];
  if (act.act === "pin") {
    if (pins.length > 0) return err("conflict", `${x.row.title} is already pinned`);
    x.f["pin"] = [act.collection ?? DEFAULT_PIN];
    u.acts.push({ at: now(), type: "library.pinned", id });
    return ok({ said: `Pinned · ${x.row.title}` });
  }
  if (act.act === "unpin") {
    if (pins.length === 0) return err("conflict", `${x.row.title} is not pinned`);
    x.f["pin"] = [];
    u.acts.push({ at: now(), type: "library.unpinned", id });
    return ok({ said: `Unpinned · ${x.row.title}` });
  }
  if (act.act === "export") {
    if (x.row.kind !== "model") return err("invalid", `${x.row.title} is not a model: only a model is exported to a game project`);
    u.acts.push({ at: now(), type: "library.exported", id, projectId: act.project });
    return ok({ said: `${x.row.title} → ${act.project} · fixture, no file written` });
  }
  const p = PROJECTS.find((pr) => pr.id === act.projectId);
  if (p === undefined) return err("not-found", `no project ${act.projectId}`);
  const used = x.f["project"] ?? [];
  if (!used.includes(p.id)) x.f["project"] = [...used, p.id];
  u.acts.push({ at: now(), type: "library.used", id, projectId: p.id });
  return ok({ said: `${x.row.title} → ${p.title}` });
}
