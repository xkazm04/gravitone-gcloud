import {
  FIXED_ORDER,
  groupLabel,
  isSharedGroup,
  LIBRARY_GROUP_TOP,
  LIBRARY_KINDS,
  railGroups,
  type LibraryGroup,
  type LibraryKindName,
  type LibraryPage,
  type LibraryValue,
} from "@gt/domain/library";
import type { Reader } from "../store.ts";
import { marks, num, whereOf, type Clause, type ParsedQuery } from "./clauses.ts";
import { isColumnGroup } from "./core.ts";

// COUNTING THE RAIL - the total, the kind counts and every visible group, under
// the disjunctive convention (search: faceting-and-filters; the prototype's
// library.js `compute`): a group's values are counted under every clause but
// its own, the kind counts under the shared groups and the search only.
//
// THE SHAPE IS MEASURED (2026-10-16, the 50k corpus, Ryzen 7 7800X3D, node 24).
// The first cut was the events-count.ts precedent verbatim - one GROUP BY per
// group with its own clause left out - and each statement re-ran the whole
// filter over the kind's items: ~9 ms a group, 170 ms for a plate rail under a
// 3-group selection. A second cut (one candidate pass, then a facet join per
// set) still paid 4-12 ms per join. This one does what the prototype did over
// its array, once:
//   1. NOTHING CHOSEN (a bare kind, the commonest view): every count is a range
//      of `library_counts`, kept by trigger with the rows (./schema.ts).
//   2. OTHERWISE one statement reads the SCOPE - the kind's items that pass the
//      search text and the column selections - off the covering index: per row
//      its seq, its packed value ids (`vids`: kind, state, origin, source and
//      every facet value) and its attention. In JS, over integers: a facet
//      selection passes if one of the row's ids is selected; `fails` 0 is the
//      match and counts toward every group, `fails` 1 on group g toward g alone,
//      `fails` 2 toward nothing (library.js `fails`/`failKey`). A selected
//      column's own counts are one GROUP BY with its clause left out.
// The slow end is a wide scope - a selection over All with no search text reads
// every item - and the probe (lib/library/probe.ts) measures that shape too.

const isKind = (k: string): k is LibraryKindName => (LIBRARY_KINDS as readonly string[]).includes(k);
const zeroKinds = (): { -readonly [K in keyof LibraryPage["kindCounts"]]: number } => ({ all: 0, image: 0, plate: 0, style: 0, motion: 0, audio: 0, video: 0, doc: 0 });

export type Counts = Pick<LibraryPage, "total" | "kindCounts" | "groups" | "truncated">;
type Tally = Map<string, Map<string, number>>;
type Value = { readonly grp: string; readonly value: string; readonly label: string };

const bump = (t: Tally, g: string, v: string, n: number): void => {
  const m = t.get(g) ?? new Map<string, number>();
  m.set(v, (m.get(v) ?? 0) + n);
  t.set(g, m);
};

/** Every value of `groups` the index holds, by id. */
function valuesOf(r: Reader, groups: readonly string[]): Map<number, Value> {
  const out = new Map<number, Value>();
  for (const row of r.all(`SELECT vid, grp, value, label FROM library_values WHERE grp IN (${marks(groups.length)})`, ...groups)) {
    out.set(num(row["vid"]), { grp: String(row["grp"]), value: String(row["value"]), label: String(row["label"]) });
  }
  return out;
}

/** Nothing chosen: every number from the counts table. */
function fromCountsTable(r: Reader, kind: LibraryKindName | undefined, keys: readonly string[], tally: Tally): { total: number; kindCounts: LibraryPage["kindCounts"] } {
  const kindCounts = zeroKinds();
  const groups = [...new Set(["state", ...keys])];
  for (const row of r.all(`SELECT grp, kind, value, n FROM library_counts WHERE grp IN (${marks(groups.length)})`, ...groups)) {
    const k = String(row["kind"]);
    const g = String(row["grp"]);
    const n = num(row["n"]);
    if (g === "state" && isKind(k)) {
      kindCounts[k] += n;
      kindCounts.all += n;
    }
    if ((kind === undefined || k === kind) && keys.includes(g)) bump(tally, g, String(row["value"]), n);
  }
  return { total: kind === undefined ? kindCounts.all : kindCounts[kind], kindCounts };
}

/**
 * The one pass over the scope (see the header). Column selections (state,
 * origin, source, attention) filter the scope in SQL - a row failing one is
 * wanted only by that column's own counts, which one GROUP BY answers
 * (`columnLeftOut`) - and the facet selections are tested here, on integers:
 * per value id, typed arrays say which selection it belongs to and how often it
 * was seen, so 13,000 rows cost a few hundred thousand array reads, no objects.
 */
function fromScope(
  r: Reader,
  q: ParsedQuery,
  clauses: readonly Clause[],
  values: ReadonlyMap<number, Value>,
  visible: ReadonlySet<string>,
  served: ReadonlySet<string>,
  tally: Tally,
): { match: number[]; perKind: Map<string, number> } {
  const facetSel = clauses.filter((c) => c.group !== null && c.group !== "kind" && !isColumnGroup(c.group) && !served.has(c.group)).map((c) => c.group ?? "");
  let size = 1;
  for (const vid of values.keys()) size = Math.max(size, vid + 1);
  const selOf = new Int16Array(size).fill(-1);
  for (const [vid, v] of values) {
    const s = facetSel.indexOf(v.grp);
    if (s >= 0 && (q.facets?.[v.grp] ?? []).includes(v.value)) selOf[vid] = s;
  }
  const groupOf = new Int16Array(size).fill(-1);
  for (const [vid, v] of values) groupOf[vid] = facetSel.indexOf(v.grp);
  const seen = new Int32Array(size);
  const failSeen = new Int32Array(size);

  // The scope: the search, the kind, every column selection, and every group whose
  // own counts came from the counts table (its failing rows are wanted by nobody).
  // With two or more facet selections a row failing at most one of them passes
  // one of the two narrowest, so their union bounds the scope too.
  const inScope = clauses.filter((c) => c.group === null || c.group === "kind" || isColumnGroup(c.group) || served.has(c.group));
  const scopeClauses = facetSel.length >= 2 ? [...inScope, unionOfNarrowest(r, q, facetSel)] : inScope;
  const scope = whereOf(scopeClauses);
  const rows = r.all(`SELECT i.seq AS seq, i.vids AS vids, i.attention AS attention FROM library_items i${scope.where}`, ...scope.params);
  const match: number[] = [];
  const attentionTally = new Map<string, number>();
  const passed = new Uint8Array(Math.max(1, facetSel.length));
  for (const row of rows) {
    const blob = row["vids"];
    if (!(blob instanceof Uint8Array)) continue;
    const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
    const n = blob.byteLength >>> 2;
    passed.fill(0);
    for (let i = 0; i < n; i++) {
      const id = view.getUint32(i * 4, true);
      const s = id < size ? (selOf[id] ?? -1) : -1;
      if (s >= 0) passed[s] = 1;
    }
    let fails = 0;
    let failIdx = -1;
    for (let s = 0; s < facetSel.length; s++) {
      if (passed[s] === 0) {
        fails++;
        failIdx = s;
      }
    }
    if (fails > 1) continue;
    if (fails === 1) {
      for (let i = 0; i < n; i++) {
        const id = view.getUint32(i * 4, true);
        if (id < size && groupOf[id] === failIdx) failSeen[id] = (failSeen[id] ?? 0) + 1;
      }
      continue;
    }
    match.push(num(row["seq"]));
    for (let i = 0; i < n; i++) {
      const id = view.getUint32(i * 4, true);
      if (id < size) seen[id] = (seen[id] ?? 0) + 1;
    }
    const att = row["attention"];
    if (typeof att === "string") attentionTally.set(att, (attentionTally.get(att) ?? 0) + 1);
  }
  const perKind = new Map<string, number>();
  const selectedColumns = new Set(clauses.filter((c) => c.group !== null && isColumnGroup(c.group)).map((c) => c.group));
  for (const [vid, v] of values) {
    const n = (seen[vid] ?? 0) + (failSeen[vid] ?? 0);
    if (n === 0) continue;
    if (v.grp === "kind") perKind.set(v.value, (perKind.get(v.value) ?? 0) + n);
    else if (visible.has(v.grp) && !selectedColumns.has(v.grp) && !served.has(v.grp)) bump(tally, v.grp, v.value, n);
  }
  if (visible.has("attention") && !selectedColumns.has("attention")) for (const [a, n] of attentionTally) bump(tally, "attention", a, n);
  return { match, perKind };
}

/** A selected column group, counted under every other clause: one GROUP BY. */
function columnLeftOut(r: Reader, g: string, clauses: readonly Clause[], tally: Tally): void {
  const w = whereOf([...clauses.filter((c) => c.group !== g), ...(g === "attention" ? [{ group: null, sql: "i.attention IS NOT NULL", params: [] }] : [])]);
  for (const row of r.all(`SELECT i.${g} AS v, count(*) AS n FROM library_items i${w.where} GROUP BY i.${g}`, ...w.params)) {
    if (typeof row["v"] === "string") bump(tally, g, row["v"], num(row["n"]));
  }
}

/** A selection's size within the kind, from the counts table. */
function sizeOf(r: Reader, q: ParsedQuery, group: string): number {
  const chosen = q.facets?.[group] ?? [];
  if (chosen.length === 0) return 0;
  const kind = q.kind === undefined ? [] : [q.kind];
  return num(r.get(`SELECT sum(n) AS n FROM library_counts WHERE grp = ? AND value IN (${marks(chosen.length)})${q.kind === undefined ? "" : " AND kind = ?"}`, group, ...chosen, ...kind)?.["n"]);
}

/** Items carrying a value of either of the two narrowest selections. */
function unionOfNarrowest(r: Reader, q: ParsedQuery, groups: readonly string[]): Clause {
  const two = [...groups].sort((a, b) => sizeOf(r, q, a) - sizeOf(r, q, b)).slice(0, 2);
  const parts = two.map((g) => `(grp = ? AND value IN (${marks((q.facets?.[g] ?? []).length)}))`);
  return { group: null, sql: `i.seq IN (SELECT item_seq FROM library_facets WHERE ${parts.join(" OR ")})`, params: two.flatMap((g) => [g, ...(q.facets?.[g] ?? [])]) };
}

/**
 * A selected group whose every OTHER clause is the kind: its counts are the bare
 * kind's, a range of the counts table, and the rows failing it need not be read.
 */
function servedByTable(r: Reader, q: ParsedQuery, group: string, clauses: readonly Clause[], tally: Tally): boolean {
  if (!clauses.every((c) => c.group === group || c.group === "kind")) return false;
  const kind = q.kind === undefined ? [] : [q.kind];
  for (const row of r.all(`SELECT value, sum(n) AS n FROM library_counts WHERE grp = ?${q.kind === undefined ? "" : " AND kind = ?"} GROUP BY value`, group, ...kind)) {
    bump(tally, group, String(row["value"]), num(row["n"]));
  }
  return true;
}

/** Kind counts under the shared groups and the search; vocabulary groups belong to one kind. */
function kindCountsOf(r: Reader, q: ParsedQuery, clauses: readonly Clause[]): LibraryPage["kindCounts"] {
  const out = zeroKinds();
  const counted = clauses.filter((c) => c.group === null || (c.group !== "kind" && isSharedGroup(c.group)));
  const only = counted.length === 1 ? counted[0] : undefined;
  const chosen = only?.group === null || only?.group === undefined ? [] : (q.facets?.[only.group] ?? []);
  const w = whereOf(counted);
  // One shared selection and no search: the counts table answers by kind.
  const fromTable = only !== undefined && only.group !== null && chosen.length > 0;
  const rows =
    counted.length === 0
      ? r.all("SELECT kind, sum(n) AS n FROM library_counts WHERE grp = 'state' GROUP BY kind")
      : fromTable
        ? r.all(`SELECT kind, sum(n) AS n FROM library_counts WHERE grp = ? AND value IN (${marks(chosen.length)}) GROUP BY kind`, only.group ?? "", ...chosen)
        : r.all(`SELECT i.kind AS kind, count(*) AS n FROM library_items i${w.where} GROUP BY i.kind`, ...w.params);
  for (const row of rows) {
    const k = String(row["kind"]);
    if (isKind(k)) {
      out[k] += num(row["n"]);
      out.all += num(row["n"]);
    }
  }
  return out;
}

const fallbackLabel = (group: string, value: string): string => (group === "attention" || group === "derivation" ? groupLabel(value) : value);

/** `match` is the whole match (unordered) when the counts had it in hand; null means: ask the index. */
export function countRail(r: Reader, q: ParsedQuery, clauses: readonly Clause[]): Counts & { readonly match: readonly number[] | null } {
  const rail = railGroups(q.kind ?? "all");
  const keys = rail.map((g) => g.key);
  const selected = clauses.filter((c) => c.group !== null && c.group !== "kind").map((c) => c.group ?? "");
  const values = valuesOf(r, [...new Set(["kind", ...keys, ...selected])]);
  const tally: Tally = new Map();
  let total: number;
  let kindCounts: LibraryPage["kindCounts"];
  let match: number[] | null = null;
  if (clauses.every((c) => c.group === "kind")) {
    ({ total, kindCounts } = fromCountsTable(r, q.kind, keys, tally));
  } else {
    const served = new Set<string>();
    for (const c of clauses) if (c.group !== null && c.group !== "kind" && servedByTable(r, q, c.group, clauses, tally)) served.add(c.group);
    const scope = fromScope(r, q, clauses, values, new Set(keys), served, tally);
    for (const c of clauses) if (c.group !== null && isColumnGroup(c.group) && !served.has(c.group)) columnLeftOut(r, c.group, clauses, tally);
    match = scope.match;
    total = match.length;
    // With no kind chosen and every selection shared, the match IS the kind counts' set.
    if (q.kind === undefined && clauses.every((c) => c.group === null || isSharedGroup(c.group))) {
      const k = zeroKinds();
      for (const [kind, n] of scope.perKind) if (isKind(kind)) k[kind] += n;
      k.all = total;
      kindCounts = k;
    } else kindCounts = kindCountsOf(r, q, clauses);
  }

  const labels = new Map<string, string>();
  for (const v of values.values()) labels.set(`${v.grp}\u0000${v.value}`, v.label);
  const labelOf = (g: string, v: string): string => labels.get(`${g}\u0000${v}`) ?? fallbackLabel(g, v);
  let truncated = false;
  const groups: LibraryGroup[] = [];
  for (const g of rail) {
    const chosen = new Set(q.facets?.[g.key] ?? []);
    const counted = tally.get(g.key) ?? new Map<string, number>();
    let list: LibraryValue[] = [...counted].filter(([, n]) => n > 0).map(([value, count]) => ({ value, label: labelOf(g.key, value), count, selected: chosen.has(value) }));
    for (const v of chosen) if (!list.some((x) => x.value === v)) list.push({ value: v, label: labelOf(g.key, v), count: 0, selected: true });
    const fixed = FIXED_ORDER[g.key];
    if (fixed !== undefined) list.sort((a, b) => fixed.indexOf(a.value) - fixed.indexOf(b.value));
    else list.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    let more = 0;
    if (list.length > LIBRARY_GROUP_TOP) {
      // A selected value past the top is still drawn (library.js keeps it); the rest is counted.
      const kept = [...list.slice(0, LIBRARY_GROUP_TOP), ...list.slice(LIBRARY_GROUP_TOP).filter((v) => v.selected)];
      more = list.length - kept.length;
      list = kept;
      truncated = true;
    }
    if (list.length > 0) groups.push({ key: g.key, label: groupLabel(g.key), section: g.section, values: list, more });
  }
  return { total, kindCounts, groups, truncated, match };
}
