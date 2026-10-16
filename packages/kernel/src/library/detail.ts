import { z } from "zod";
import { parseAt, parseJsonAt } from "@gt/domain/door";
import { AppError, type Result } from "@gt/domain/errors";
import { DEFAULT_PIN, groupLabel, railGroups, type LibraryActName, type LineageNode, type MediaFacts } from "@gt/domain/library";
import { libraryItemSchema, type LibraryItem, type LibraryItemDetail } from "@gt/domain/libraryItem";
import type { Reader, Row, Store } from "../store.ts";
import { extrasSchema } from "./extras.ts";
import { ROW_SELECT, rowOf } from "./query.ts";

// ONE ITEM, WHOLE - the detail panel's read: the record, every facet labelled in
// rail order, the lineage resolved against the index, the media facts and the
// acts open on it now. One read transaction, like the page.
//
// LINEAGE, RESOLVED HERE (library.js `lineage` built it per kind from in-memory
// parents). The record's lineage is pointers, nearest first; each is drawn as a
// node and, where the index holds the thing it points at, carries the item id to
// open. A pointer to something the index does not hold is drawn as itself - a
// broken link, never an item with no past (@gt/domain/libraryItem
// `lineageSchema`). The order is the work's: where it came from, the run that
// made it, THIS, the style it is in, and what uses it.

const recordSchema = z.object({ item: libraryItemSchema, extras: extrasSchema });

const ROLE: Readonly<Record<string, string>> = {
  "library-item": "source",
  run: "run",
  job: "job",
  candidate: "candidate",
  style: "style",
  project: "used by",
};
const BEFORE_SELF = new Set(["library-item", "run", "job", "candidate"]);

/** Library ids the projection mints for things that are themselves items (lib/library/ids). */
export const styleItemId = (styleId: string): string => `style:${styleId}`;

function lineageOf(r: Reader, item: LibraryItem): LineageNode[] {
  const has = (id: string): boolean => r.get("SELECT 1 AS x FROM library_docs WHERE id = ?", id) !== undefined;
  const labelOf = (id: string): string => {
    const t = r.get("SELECT title FROM library_docs WHERE id = ?", id)?.["title"];
    return typeof t === "string" ? t : id;
  };
  const node = (l: LibraryItem["lineage"][number]): LineageNode => {
    const role = item.source === "derived" && l.kind === "library-item" ? "derived from" : (ROLE[l.kind] ?? l.kind);
    const target = l.kind === "library-item" ? l.id : l.kind === "style" ? styleItemId(l.id) : undefined;
    const base = { role, ref: { kind: l.kind, id: l.id }, label: target !== undefined && has(target) ? labelOf(target) : l.id };
    if (target !== undefined && has(target)) return { ...base, itemId: target };
    if (l.kind === "project" || l.kind === "run") return { ...base, facet: { group: l.kind, value: l.id } };
    return base;
  };
  const before = item.lineage.filter((l) => BEFORE_SELF.has(l.kind)).map(node);
  const after = item.lineage.filter((l) => !BEFORE_SELF.has(l.kind)).map(node);
  const self: LineageNode = { role: "this", ref: { kind: "self", id: item.id }, label: item.title };
  // The facet a kind is organised by is a step of its lineage too (a plate's lesson, a doc's bundle).
  const extra: LineageNode[] = [];
  if (item.kind === "plate" && item.vocabulary.lesson !== undefined) extra.push({ role: "lesson", ref: { kind: "self", id: item.id }, label: item.vocabulary.lesson, facet: { group: "lesson", value: item.vocabulary.lesson } });
  if (item.kind === "doc") before.unshift({ role: "bundle", ref: { kind: "self", id: item.id }, label: item.vocabulary.bundle, facet: { group: "bundle", value: item.vocabulary.bundle } });
  if (item.kind === "audio" && item.vocabulary.group !== undefined) before.unshift({ role: "group", ref: { kind: "self", id: item.id }, label: item.vocabulary.group, facet: { group: "group", value: item.vocabulary.group } });
  if (item.kind === "plate" && item.vocabulary.styleId !== undefined && !item.lineage.some((l) => l.kind === "style")) after.unshift(node({ kind: "style", id: item.vocabulary.styleId }));
  return [...before, self, ...after, ...extra];
}

const factsRow = z.object({
  sha: z.string(),
  decodable: z.number(),
  mime: z.string(),
  w: z.number().nullable(),
  h: z.number().nullable(),
  duration_s: z.number().nullable(),
  poster_sha: z.string().nullable(),
  mean_luma: z.number().nullable(),
  near_black: z.number(),
  probed_at: z.string(),
  error: z.string().nullable(),
});

/** A blob's media facts, or null when it was never probed. */
export function readFacts(r: Reader, sha: string): MediaFacts | null {
  const row = r.get("SELECT sha, decodable, mime, w, h, duration_s, poster_sha, mean_luma, near_black, probed_at, error FROM media_facts WHERE sha = ?", sha);
  if (row === undefined) return null;
  const p = parseAt("media facts row", factsRow, row);
  if (!p.ok) throw p.error;
  const f = p.value;
  return {
    sha: f.sha,
    decodable: f.decodable === 1,
    mime: f.mime,
    w: f.w,
    h: f.h,
    durationS: f.duration_s,
    posterSha: f.poster_sha,
    meanLuma: f.mean_luma,
    nearBlack: f.near_black === 1,
    probedAt: f.probed_at,
    error: f.error,
  };
}

function vocabularyOf(r: Reader, seq: number, item: LibraryItem): LibraryItemDetail["vocabulary"] {
  const rows: Row[] = r.all(
    "SELECT f.grp AS g, f.value AS v, coalesce(l.label, f.value) AS label FROM library_facets f LEFT JOIN library_values l ON l.grp = f.grp AND l.value = f.value WHERE f.item_seq = ? ORDER BY f.grp, f.value",
    seq,
  );
  const order = railGroups(item.kind).map((g) => g.key);
  const keys = [...new Set(rows.map((x) => String(x["g"])))].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia < 0 ? 1e3 : ia) - (ib < 0 ? 1e3 : ib) || a.localeCompare(b);
  });
  return keys.map((key) => ({
    key,
    label: groupLabel(key),
    values: rows.filter((x) => x["g"] === key).map((x) => ({ value: String(x["v"]), label: String(x["label"]) })),
  }));
}

export function libraryDetail(store: Store, id: string): Result<LibraryItemDetail> {
  return store.read((r): LibraryItemDetail => {
    const row = r.get(`${ROW_SELECT} WHERE d.id = ?`, id);
    if (row === undefined) throw new AppError("not-found", `library: no item ${id}`);
    const seq = Number(row["seq"]);
    const rec = parseJsonAt(`library record ${id}`, recordSchema, String(r.get("SELECT record FROM library_docs WHERE seq = ?", seq)?.["record"] ?? ""));
    if (!rec.ok) throw rec.error;
    const vocabulary = vocabularyOf(r, seq, rec.value.item);
    const pinned = r.get("SELECT 1 AS x FROM library_marks WHERE item_id = ? AND kind = 'pin' AND ref = ?", id, DEFAULT_PIN) !== undefined;
    const acts: LibraryActName[] = [pinned ? "unpin" : "pin", "use-in-project"];
    // The operator's marks are collections of the item as the detail shows it.
    const marks = r.all("SELECT kind, ref FROM library_marks WHERE item_id = ? ORDER BY kind, ref", id);
    const collections = [...rec.value.item.collections];
    for (const m of marks) {
      const kind = m["kind"] === "pin" ? ("pin" as const) : ("project" as const);
      const ref = String(m["ref"]);
      if (!collections.some((c) => c.kind === kind && c.id === ref)) collections.push({ kind, id: ref });
    }
    const item = { ...rec.value.item, collections };
    const chips = vocabulary.flatMap((g) => g.values.slice(0, 1).map((v) => ({ group: g.key, value: v.value, label: v.label }))).slice(0, 3);
    return {
      item,
      row: rowOf(row, chips),
      vocabulary,
      lineage: lineageOf(r, item),
      extras: rec.value.extras,
      media: item.media === undefined ? null : readFacts(r, item.media.sha256),
      acts,
    };
  });
}

/**
 * The cover a set of items should lead with: the first, in the order given,
 * whose media decodes and is not near-black (the prototype hard-coded a list of
 * dark renders for this, index.html DARK_COVER; here it is the facts). Falls
 * back to the first with any cover, then null.
 */
export function chooseCover(store: Store, itemIds: readonly string[]): Result<string | null> {
  return store.read((r) => {
    let fallback: string | null = null;
    for (const id of itemIds) {
      const row = r.get(`${ROW_SELECT} WHERE d.id = ?`, id);
      if (row === undefined) continue;
      const c = rowOf(row, []);
      if (c.cover.blobSha === null || c.attention !== undefined) continue;
      if (!c.cover.nearBlack) return id;
      fallback ??= id;
    }
    return fallback;
  });
}
