// THE LIBRARY'S ADDRESS - pure, client-safe. The prototype kept its state in the hash
// (library.js `readHash`/`writeHash`), which a server never sees; here it is the search params,
// read once on the server (the page renders the answer) and written by the client.
//
//   kind  q  f=group:value (repeated)  sort      IDENTIFYING: a different result. A change is a
//                                                 navigation, and the server renders the new page.
//   view  d  sel  detail                          WINDOWING: the same result seen differently. A
//                                                 change is history.replaceState, no round trip
//                                                 (async-ui-states: windowing-vs-identifying-keys).
//
// Defaults are omitted, so the bare address is the default Library and a copied link carries
// only what was changed.

import { isSharedGroup, LIBRARY_KINDS, LIBRARY_SORTS, VOCAB_GROUPS, type LibraryKindName, type LibraryQuery, type LibrarySort } from "@gt/domain/library";
import type { Density, View } from "@gt/ui/components/library/library.ts";

export type Facets = Readonly<Record<string, readonly string[]>>;

export type LibraryUrl = {
  readonly kind: LibraryKindName | "all";
  readonly q: string;
  readonly f: Facets;
  readonly sort: LibrarySort;
  readonly view: View;
  readonly d: Density;
  readonly sel: string | null;
  /** The detail panel: open, closed, or the width's default (open when wide). */
  readonly detail: boolean | null;
};

export const DEFAULT_URL: LibraryUrl = { kind: "all", q: "", f: {}, sort: "newest", view: "grid", d: "m", sel: null, detail: null };

type Params = Readonly<Record<string, string | readonly string[] | undefined>>;

const one = (v: string | readonly string[] | undefined): string | undefined => (typeof v === "string" ? v : v?.[0]);
const all = (v: string | readonly string[] | undefined): readonly string[] => (v === undefined ? [] : typeof v === "string" ? [v] : v);

const isKind = (v: string | undefined): v is LibraryKindName => LIBRARY_KINDS.some((k) => k === v);
const isSort = (v: string | undefined): v is LibrarySort => LIBRARY_SORTS.some((k) => k === v);

/** The groups a kind's rail can hold: its own vocabulary and the shared groups. */
export const groupFits = (kind: LibraryKindName | "all", group: string): boolean => isSharedGroup(group) || VOCAB_GROUPS[kind].includes(group);

export function parseUrl(p: Params): LibraryUrl {
  const kindRaw = one(p["kind"]);
  const kind = isKind(kindRaw) ? kindRaw : "all";
  const f: Record<string, string[]> = {};
  for (const t of all(p["f"])) {
    const i = t.indexOf(":");
    if (i <= 0 || i === t.length - 1) continue;
    const g = t.slice(0, i);
    const v = t.slice(i + 1);
    // A facet the kind's rail cannot show would filter invisibly; it is dropped, as a kind change drops it.
    if (!groupFits(kind, g)) continue;
    const have = (f[g] ??= []);
    if (!have.includes(v)) have.push(v);
  }
  const sortRaw = one(p["sort"]);
  const d = one(p["d"]);
  const detail = one(p["detail"]);
  return {
    kind,
    q: (one(p["q"]) ?? "").slice(0, 400),
    f,
    sort: isSort(sortRaw) ? sortRaw : "newest",
    view: one(p["view"]) === "list" ? "list" : "grid",
    d: d === "s" || d === "l" ? d : "m",
    sel: one(p["sel"]) ?? null,
    detail: detail === "0" ? false : detail === "1" ? true : null,
  };
}

export function toSearch(u: LibraryUrl): string {
  const p = new URLSearchParams();
  if (u.kind !== "all") p.set("kind", u.kind);
  if (u.q !== "") p.set("q", u.q);
  for (const [g, vs] of Object.entries(u.f)) for (const v of vs) p.append("f", `${g}:${v}`);
  if (u.sort !== "newest") p.set("sort", u.sort);
  if (u.view !== "grid") p.set("view", u.view);
  if (u.d !== "m") p.set("d", u.d);
  if (u.sel !== null) p.set("sel", u.sel);
  if (u.detail !== null) p.set("detail", u.detail ? "1" : "0");
  // `:` reads better in an address than %3A and is legal in a query.
  return p.toString().replace(/%3A/gi, ":");
}

export const hrefOf = (u: LibraryUrl, base = "/library"): string => {
  const s = toSearch(u);
  return s === "" ? base : `${base}?${s}`;
};

/** What makes the result a different result. */
export const identity = (u: LibraryUrl): string => JSON.stringify([u.kind, u.q, Object.entries(u.f).sort(([a], [b]) => a.localeCompare(b)), u.sort]);

export function queryOf(u: LibraryUrl, offset: number, limit: number): LibraryQuery {
  return {
    ...(u.kind === "all" ? {} : { kind: u.kind }),
    ...(u.q === "" ? {} : { q: u.q }),
    ...(Object.keys(u.f).length === 0 ? {} : { facets: u.f }),
    sort: u.sort,
    offset,
    limit,
  };
}

/** A kind change keeps the shared filters and drops the vocabulary the new kind lacks (library.js `setKind`). */
export function withKind(u: LibraryUrl, kind: LibraryKindName | "all"): LibraryUrl {
  const f = Object.fromEntries(Object.entries(u.f).filter(([g]) => groupFits(kind, g)));
  return { ...u, kind, f };
}

/** One value in or out of a group; an empty group leaves the filter (OR within, AND across). */
export function toggled(u: LibraryUrl, group: string, value: string, on: boolean): LibraryUrl {
  const have = u.f[group] ?? [];
  const next = on ? (have.includes(value) ? have : [...have, value]) : have.filter((v) => v !== value);
  const f: Record<string, readonly string[]> = { ...u.f };
  if (next.length === 0) delete f[group];
  else f[group] = next;
  return { ...u, f };
}

export const activeCount = (f: Facets): number => Object.values(f).reduce((n, vs) => n + vs.length, 0);
