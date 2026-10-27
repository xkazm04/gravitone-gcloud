import {
  ageBand,
  COLUMN_GROUPS,
  LIBRARY_KINDS,
  MEDIA_KINDS,
  normText,
  techniqueBand,
  trisBand,
  type LibraryExtras,
  type LibraryKindName,
} from "@gt/domain/library";
import type { LibraryItem, LibraryItemInput } from "@gt/domain/libraryItem";
import { canonical, sha256Hex } from "../canonical.ts";

// THE INDEX'S PURE HALF - what an item contributes to the index, computed from
// the record alone (plus the styles it points at), with no store in sight. The
// write path (./write.ts) and the 50k corpus both go through `indexRowOf`, so a
// generated item is indexed exactly as a projected one is.

/** What a source hands the index: the record, the words the detail shows, and
 *  which projection feed wrote it (so that feed can prune what it no longer holds). */
export type LibraryEntry = {
  readonly item: LibraryItemInput;
  readonly meta: string;
  readonly extras: LibraryExtras;
  readonly feed: string;
};

/** A plate's family and observables are its style's (plan §2.2: read THROUGH styleId). */
export type StyleFacets = { readonly name: string; readonly family: string; readonly observables: Readonly<Record<string, string>> };

export type IndexContext = {
  readonly styleOf: (styleId: string) => StyleFacets | undefined;
  /** A project id's title, for its facet label. */
  readonly projectTitle?: (projectId: string) => string | undefined;
};

export type FacetRow = { readonly grp: string; readonly value: string; readonly label: string };

export type IndexRow = {
  readonly id: string;
  readonly kind: LibraryKindName;
  readonly kindOrd: number;
  readonly title: string;
  readonly sortName: string;
  readonly meta: string;
  readonly state: string;
  readonly origin: string;
  readonly source: string;
  readonly feed: string;
  readonly at: string | null;
  readonly mediaSha: string | null;
  readonly mediaMime: string | null;
  readonly needsMedia: boolean;
  readonly facets: readonly FacetRow[];
  readonly hay: string;
  readonly digest: string;
  readonly record: string;
  /** The row's designed face ({peaks?, palette?} as JSON, or ""), read with every grid row. */
  readonly face: string;
};

/** At most 64 buckets, each the max of what it covers: a tile's waveform, not the take's. */
export function bucketPeaks(peaks: readonly number[], n = 64): number[] {
  if (peaks.length <= n) return peaks.map((p) => Math.round(p * 1000) / 1000);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const from = Math.floor((i * peaks.length) / n);
    const to = Math.max(from + 1, Math.floor(((i + 1) * peaks.length) / n));
    out.push(Math.round(Math.max(...peaks.slice(from, to)) * 1000) / 1000);
  }
  return out;
}

/** The row's designed face. A model's poster rides here: its media is a glb, which the cover
 *  query (./query.ts rowOf) cannot draw, and the poster is a render the mesh store holds as a file. */
function faceOf(extras: LibraryExtras): string {
  const peaks = extras.audio?.peaks ?? [];
  const palette = extras.palette ?? [];
  const poster = extras.model?.poster;
  if (peaks.length === 0 && palette.length === 0 && poster === undefined) return "";
  return canonical({ ...(peaks.length === 0 ? {} : { peaks: bucketPeaks(peaks) }), ...(palette.length === 0 ? {} : { palette }), ...(poster === undefined ? {} : { poster }) });
}

const words = (s: string): string => s.replace(/[-_]/g, " ");

/** Every vocabulary and collection facet of `item`, labelled. Column groups
 *  (state, origin, source, attention) are columns, not rows. */
export function facetsOf(item: LibraryItem, ctx: IndexContext): FacetRow[] {
  const out: FacetRow[] = [];
  const add = (grp: string, value: string | undefined, label?: string): void => {
    if (value === undefined || value === "") return;
    if (out.some((f) => f.grp === grp && f.value === value)) return;
    out.push({ grp, value, label: label ?? words(value) });
  };
  const style = (id: string | undefined): void => {
    if (id === undefined) return;
    const s = ctx.styleOf(id);
    add("style", id, s?.name ?? words(id));
  };
  const throughStyle = (id: string | undefined): void => {
    const s = id === undefined ? undefined : ctx.styleOf(id);
    if (s === undefined) return;
    add("family", s.family);
    for (const [k, v] of Object.entries(s.observables)) add(k, v);
  };
  switch (item.kind) {
    case "image":
      add("set", item.vocabulary.set, item.vocabulary.set);
      add("scene", item.vocabulary.scene);
      for (const s of item.vocabulary.styles) style(s);
      add("aspect", item.vocabulary.aspect, item.vocabulary.aspect);
      break;
    case "plate":
      style(item.vocabulary.styleId);
      throughStyle(item.vocabulary.styleId);
      add("station", item.vocabulary.station);
      add("mechanism", item.vocabulary.mechanism);
      add("lesson", item.vocabulary.lesson);
      add("scene", item.vocabulary.scene);
      break;
    case "style":
      throughStyle(item.vocabulary.styleId);
      add("derivation", item.vocabulary.derivation);
      break;
    case "motion":
      add("subject", item.vocabulary.subject);
      add("format", item.vocabulary.format);
      break;
    case "audio":
      add("type", item.vocabulary.type);
      for (const g of item.vocabulary.genre) add("genre", g);
      for (const m of item.vocabulary.mood) add("mood", m);
      for (const i of item.vocabulary.instrument) add("instrument", i);
      add("provider", item.vocabulary.provider);
      add("group", item.vocabulary.group);
      add("stage", item.vocabulary.stage);
      break;
    case "video":
      add("format", item.vocabulary.format);
      add("captions", item.vocabulary.captions);
      break;
    case "doc":
      add("bundle", item.vocabulary.bundle, item.vocabulary.bundle);
      add("techniques", techniqueBand(item.vocabulary.techniques));
      break;
    case "model":
      add("class", item.vocabulary.class);
      add("technique", item.vocabulary.technique, item.vocabulary.technique);
      add("rig", item.vocabulary.rigged ? "rigged" : "static");
      if (item.vocabulary.tris !== undefined) add("tris", trisBand(item.vocabulary.tris), trisBand(item.vocabulary.tris));
      break;
    case "character":
      add("age", ageBand(item.vocabulary.age), ageBand(item.vocabulary.age));
      add("build", item.vocabulary.build);
      for (const l of item.vocabulary.looks) add("look", l);
      for (const a of item.vocabulary.applications) add("application", a);
      break;
  }
  for (const c of item.collections) {
    const grp = c.kind === "pin" ? "pin" : c.kind;
    add(grp, c.id, grp === "project" ? (ctx.projectTitle?.(c.id) ?? c.id) : c.id);
  }
  return out;
}

/** The index row for an entry: columns, facets, the search haystack and the
 *  digest that makes a re-projection of an unchanged item a no-op. */
export function indexRowOf(entry: Omit<LibraryEntry, "item"> & { readonly item: LibraryItem }, ctx: IndexContext): IndexRow {
  const { item } = entry;
  const facets = facetsOf(item, ctx);
  // The haystack: every facet value AND its label (the prototype's `hay`), the
  // id, and the lineage ids - so "arcane" finds the plates read from that source.
  const hay = normText(
    [item.id, ...facets.flatMap((f) => [f.value, f.label]), ...item.lineage.map((l) => l.id), item.state, item.origin].join(" "),
  );
  const record = canonical({ item, extras: entry.extras });
  const face = faceOf(entry.extras);
  const kindOrd = LIBRARY_KINDS.indexOf(item.kind);
  return {
    id: item.id,
    kind: item.kind,
    kindOrd,
    title: item.title,
    sortName: normText(item.title),
    meta: entry.meta,
    state: item.state,
    origin: item.origin,
    source: item.source,
    feed: entry.feed,
    at: item.at ?? null,
    mediaSha: item.media?.sha256 ?? null,
    mediaMime: item.media?.mime ?? null,
    needsMedia: MEDIA_KINDS.includes(item.kind),
    facets,
    hay,
    digest: sha256Hex(canonical({ record, meta: entry.meta, feed: entry.feed, facets, hay })),
    record,
    face,
  };
}

/** Free words as one FTS5 expression: each a quoted prefix term, all ANDed.
 *  Quoting is the escape - user text never reaches FTS5's operator grammar
 *  (search: query-parsing, one door), so `NOT`, `-x` or a stray quote is a word. */
export function ftsExpression(words: readonly string[]): string | null {
  const terms = words.filter((w) => w !== "").map((w) => `"${w.replace(/"/g, '""')}"*`);
  return terms.length === 0 ? null : terms.join(" AND ");
}

const COLUMNS: ReadonlySet<string> = new Set<string>(COLUMN_GROUPS);
/** Is `group` stored as an item column (vs a facet row)? */
export const isColumnGroup = (group: string): boolean => COLUMNS.has(group);
