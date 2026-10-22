import { z } from "zod";
import { parseAt, parseJsonAt } from "@gt/domain/door";
import type { Result } from "@gt/domain/errors";
import { CHIP_GROUPS, LIBRARY_SORTS, parseSearch, POSTER_MIME, type Attention, type LibraryChip, type LibraryKindName, type LibraryPage, type LibraryQuery, type LibraryRow } from "@gt/domain/library";
import type { Reader, Row, Store } from "../store.ts";
import { clausesOf, marks, num, querySchema, whereOf } from "./clauses.ts";
import { countRail } from "./counts.ts";

// READING THE INDEX - the one query the Library route, the CLI and an agent call.
//
// THE PROTOTYPE'S GRAMMAR, IN SQL (docs/next/prototype/app/library.js `compute`):
// every predicate is a clause tagged with the group it belongs to (./clauses.ts);
// the list is all clauses ANDed, and the rail's counts leave each group's own
// clause out (./counts.ts, which says how that is kept cheap at 50k).
//
// ONE READ TRANSACTION for the rows, the total, the kind counts and every group
// (bounded-enumeration: declare-the-inconsistency): a sync landing between two
// statements would otherwise give a total that is not the sum of any count.
//
// BOUNDED, AND IT SAYS SO: a page is at most LIBRARY_PAGE_MAX rows and the limit
// is required; a group returns its LIBRARY_GROUP_TOP largest values and `more`
// counts the rest. OFFSET, not a keyset, on purpose: a virtual grid asks for the
// rows at an index the scrollbar reached (bounded-enumeration prefers keysets for
// a feed; a window over a sorted set needs random access). Each order is an index
// walk (./schema.ts), so an offset costs a walk of the index, not a sort.

/** Above this many matches the page walks the order index under the filter instead. */
const MATCH_SORT_MAX = 8000;

const ORDER: { readonly [K in (typeof LIBRARY_SORTS)[number]]: string } = {
  newest: "i.bad, i.at DESC, i.seq DESC",
  name: "i.bad, i.sort_name, i.seq",
  kind: "i.bad, i.kind_ord, i.at DESC, i.seq DESC",
};

function chipsFor(r: Reader, rows: readonly Row[]): Map<number, LibraryChip[]> {
  const out = new Map<number, LibraryChip[]>();
  if (rows.length === 0) return out;
  const groups = [...new Set(Object.values(CHIP_GROUPS).flat())];
  const seqs = rows.map((row) => num(row["seq"]));
  const facetRows = r.all(
    `SELECT f.item_seq AS s, f.grp AS g, f.value AS v, coalesce(l.label, f.value) AS label FROM library_facets f LEFT JOIN library_values l ON l.grp = f.grp AND l.value = f.value
     WHERE f.item_seq IN (${marks(seqs.length)}) AND f.grp IN (${marks(groups.length)}) ORDER BY f.item_seq, f.grp, f.value`,
    ...seqs,
    ...groups,
  );
  const kindOf = new Map(rows.map((row) => [num(row["seq"]), String(row["kind"]) as LibraryKindName]));
  const byItem = new Map<number, Row[]>();
  for (const f of facetRows) byItem.set(num(f["s"]), [...(byItem.get(num(f["s"])) ?? []), f]);
  for (const [seq, kind] of kindOf) {
    const mine = byItem.get(seq) ?? [];
    const chips: LibraryChip[] = [];
    for (const g of CHIP_GROUPS[kind]) {
      const first = mine.find((f) => f["g"] === g);
      if (first !== undefined) chips.push({ group: g, value: String(first["v"]), label: String(first["label"]) });
    }
    out.set(seq, chips.slice(0, 3));
  }
  return out;
}

const faceSchema = z.object({ peaks: z.array(z.number()).optional(), palette: z.array(z.string()).optional(), poster: z.string().optional() });

export const ROW_SELECT = `SELECT i.seq, d.id, i.kind, d.title, d.meta, i.state, i.origin, i.source, i.at, i.attention, d.media_sha, d.media_mime, d.face,
  mf.poster_sha AS poster_sha, mf.near_black AS near_black FROM library_items i JOIN library_docs d ON d.seq = i.seq LEFT JOIN media_facts mf ON mf.sha = d.media_sha`;

/** A stored row as the grid draws it. The cover is a query over the media facts:
 *  an image is its own cover, a video its keyframe, and either says if it is near-black. */
export function rowOf(row: Row, chips: readonly LibraryChip[]): LibraryRow {
  const mime = typeof row["media_mime"] === "string" ? row["media_mime"] : null;
  const media = typeof row["media_sha"] === "string" ? row["media_sha"] : null;
  const poster = typeof row["poster_sha"] === "string" ? row["poster_sha"] : null;
  const own = media !== null && mime !== null && mime.startsWith("image/");
  const cover = own ? { blobSha: media, mime } : poster !== null ? { blobSha: poster, mime: POSTER_MIME } : { blobSha: null, mime: null };
  const attention = row["attention"];
  const faceText = typeof row["face"] === "string" ? row["face"] : "";
  const face = faceText === "" ? undefined : parseJsonAt("library face", faceSchema, faceText);
  if (face !== undefined && !face.ok) throw face.error;
  return {
    id: String(row["id"]),
    kind: String(row["kind"]) as LibraryKindName,
    title: String(row["title"]),
    meta: String(row["meta"]),
    state: String(row["state"]) as LibraryRow["state"],
    origin: String(row["origin"]) as LibraryRow["origin"],
    source: String(row["source"]) as LibraryRow["source"],
    date: typeof row["at"] === "string" ? row["at"] : null,
    cover: { ...cover, nearBlack: cover.blobSha !== null && row["near_black"] === 1 },
    ...(attention === "unreadable" || attention === "missing" ? { attention: attention satisfies Attention } : {}),
    chips,
    ...(face?.value.peaks === undefined ? {} : { peaks: face.value.peaks }),
    ...(face?.value.palette === undefined ? {} : { palette: face.value.palette }),
    ...(face?.value.poster === undefined ? {} : { poster: face.value.poster }),
  };
}

export function queryLibrary(store: Store, input: LibraryQuery): Result<LibraryPage> {
  const p = parseAt("library query", querySchema, input);
  if (!p.ok) return p;
  const q = p.value;
  return store.read((r): LibraryPage => {
    const clauses = clausesOf(r, q);
    const { total, kindCounts, groups, truncated, match } = countRail(r, q, clauses);
    const offset = q.offset ?? 0;
    // The window over the narrow index alone, then the joined row for the page
    // only: one statement with the join made every skipped row pay it - 293 ms
    // at offset 20,000 of 50k (2026-10-16), against under 1 ms for the seqs.
    // A match the counts already hold is ordered as a set (a sort of its size)
    // when that is smaller than walking the order index under the filter.
    const bySet = match !== null && match.length <= MATCH_SORT_MAX;
    const all = bySet ? { where: " WHERE i.seq IN (SELECT value FROM json_each(?))", params: [JSON.stringify(match)] } : whereOf(clauses);
    const seqs =
      q.limit === 0 || total === 0 ? [] : r.all(`SELECT i.seq FROM library_items i${all.where} ORDER BY ${ORDER[q.sort ?? "newest"]} LIMIT ? OFFSET ?`, ...all.params, q.limit, offset).map((x) => num(x["seq"]));
    const bySeq = new Map(seqs.length === 0 ? [] : r.all(`${ROW_SELECT} WHERE i.seq IN (${marks(seqs.length)})`, ...seqs).map((x) => [num(x["seq"]), x] as const));
    const rows: Row[] = [];
    for (const s of seqs) {
      const x = bySeq.get(s);
      if (x !== undefined) rows.push(x);
    }
    const chips = chipsFor(r, rows);
    return {
      items: rows.map((row) => rowOf(row, chips.get(num(row["seq"])) ?? [])),
      total,
      offset,
      kindCounts,
      groups,
      truncated,
      parsed: parseSearch(q.q ?? ""),
    };
  });
}

/** The plans SQLite picks for the page's statements: the proof a query is an index walk. */
export function explainLibrary(store: Store, input: LibraryQuery): Result<string[]> {
  const p = parseAt("library query", querySchema, input);
  if (!p.ok) return p;
  const q = p.value;
  return store.read((r) => {
    const all = whereOf(clausesOf(r, q));
    return r.all(`EXPLAIN QUERY PLAN ${ROW_SELECT}${all.where} ORDER BY ${ORDER[q.sort ?? "newest"]} LIMIT 60`, ...all.params).map((row) => String(row["detail"]));
  });
}
