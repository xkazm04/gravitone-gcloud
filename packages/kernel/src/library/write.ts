import { z } from "zod";
import { parseAt } from "@gt/domain/door";
import { AppError, err, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { DEFAULT_PIN, NEAR_BLACK_LUMA, normText, type LibraryAct, type MediaFacts } from "@gt/domain/library";
import { libraryItemSchema } from "@gt/domain/libraryItem";
import { append } from "../events.ts";
import type { Store, Tx } from "../store.ts";
import { extrasSchema, meshFactsSchema } from "./extras.ts";
import { indexRowOf, type IndexContext, type IndexRow, type LibraryEntry } from "./core.ts";

// WRITING THE INDEX - the projection's upsert and prune, the media-facts writer
// and the operator's acts.
//
// IDEMPOTENT BY KEY, CHEAP WHEN NOTHING MOVED. An item is keyed by its id and
// carries the digest of everything it contributes to the index; a re-projection
// of an unchanged item is one indexed read and no write (the Phase 2 ledger
// projection's `appendOnce`, lib/ledger/v1/sync.ts, is the precedent: a sync
// re-run over the same v1 files must cost reads, not writes). Unlike the ledger
// an item MAY change - a take is finalised, a plate judged - so a moved digest
// rewrites the row in place rather than reporting drift: the index is a
// projection of current state, the ledger the history of it.
//
// BATCHED BY THE CALLER, ONE TRANSACTION PER CALL: the write lock is held for
// one batch, so a reader or another writer waits milliseconds, never the backfill.

export type UpsertReport = { readonly inserted: number; readonly updated: number; readonly unchanged: number };

const valueNorm = (value: string, label: string): string => `${normText(value)}|${normText(label)}`;

function writeFacets(t: Tx, seq: number, row: IndexRow): void {
  // Every row goes, the operator's marks included, and the marks come back from
  // library_marks: a row's `kind` then always follows the item's.
  t.run("DELETE FROM library_facets WHERE item_seq = ?", seq);
  for (const f of row.facets) {
    t.run("INSERT OR IGNORE INTO library_facets (grp, value, item_seq, kind, by_act) VALUES (?, ?, ?, ?, 0)", f.grp, f.value, seq, row.kind);
    t.run(
      "INSERT INTO library_values (grp, value, label, norm) VALUES (?, ?, ?, ?) ON CONFLICT (grp, value) DO UPDATE SET label = excluded.label, norm = excluded.norm WHERE label <> excluded.label",
      f.grp,
      f.value,
      f.label,
      valueNorm(f.value, f.label),
    );
  }
}

/** A value's id in library_values, minted on first sight. */
function vidOf(t: Tx, grp: string, value: string, label: string): number {
  t.run("INSERT INTO library_values (grp, value, label, norm) VALUES (?, ?, ?, ?) ON CONFLICT (grp, value) DO NOTHING", grp, value, label, valueNorm(value, label));
  return Number(t.get("SELECT vid FROM library_values WHERE grp = ? AND value = ?", grp, value)?.["vid"]);
}

/** Pack value ids as uint32 little-endian (counts.ts `unpack` reads them). */
export function packVids(ids: readonly number[]): Uint8Array {
  const out = new Uint8Array(ids.length * 4);
  const view = new DataView(out.buffer);
  for (const [i, id] of ids.entries()) view.setUint32(i * 4, id, true);
  return out;
}

/** The hot row's packed copy of everything it carries (./schema.ts `vids`): its
 *  columns' values, then its facet rows' (the operator's marks included). */
export function refreshVids(t: Tx, seq: number): void {
  const row = t.get("SELECT kind, state, origin, source FROM library_items WHERE seq = ?", seq);
  if (row === undefined) return;
  const ids = (["kind", "state", "origin", "source"] as const).map((c) => vidOf(t, c, String(row[c]), String(row[c])));
  for (const f of t.all("SELECT v.vid AS vid FROM library_facets f JOIN library_values v ON v.grp = f.grp AND v.value = f.value WHERE f.item_seq = ? ORDER BY v.vid", seq)) ids.push(Number(f["vid"]));
  t.run("UPDATE library_items SET vids = ? WHERE seq = ?", packVids(ids), seq);
}

/** Marks survive a prune and a re-insert: an item that comes back keeps its pins. */
function restoreMarks(t: Tx, id: string, seq: number, kind: string): void {
  for (const m of t.all("SELECT kind, ref FROM library_marks WHERE item_id = ?", id)) {
    const grp = m["kind"] === "pin" ? "pin" : "project";
    t.run("INSERT OR IGNORE INTO library_facets (grp, value, item_seq, kind, by_act) VALUES (?, ?, ?, ?, 1)", grp, String(m["ref"]), seq, kind);
  }
}

function attentionOf(t: Tx, row: IndexRow): "missing" | "unreadable" | null {
  if (row.mediaSha === null) return row.needsMedia ? "missing" : null;
  const d = t.get("SELECT decodable FROM media_facts WHERE sha = ?", row.mediaSha)?.["decodable"];
  return d === 0 ? "unreadable" : null;
}

/** Upsert one index row inside the caller's transaction. */
export function upsertRowIn(t: Tx, row: IndexRow): "inserted" | "updated" | "unchanged" {
  const held = t.get("SELECT seq, digest FROM library_docs WHERE id = ?", row.id);
  if (held !== undefined && held["digest"] === row.digest) return "unchanged";
  const attention = attentionOf(t, row);
  const hot = [row.kind, row.kindOrd, row.state, row.origin, row.source, row.at, attention, attention === null ? 0 : 1, row.sortName] as const;
  const doc = [row.title, row.meta, row.feed, row.mediaSha, row.mediaMime, row.needsMedia ? 1 : 0, row.digest, row.record, row.face] as const;
  let seq: number;
  if (held === undefined) {
    seq = t.run("INSERT INTO library_items (kind, kind_ord, state, origin, source, at, attention, bad, sort_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", ...hot).lastRowid;
    t.run("INSERT INTO library_docs (seq, id, title, meta, feed, media_sha, media_mime, needs_media, digest, record, face) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", seq, row.id, ...doc);
  } else {
    seq = Number(held["seq"]);
    t.run("UPDATE library_items SET kind = ?, kind_ord = ?, state = ?, origin = ?, source = ?, at = ?, attention = ?, bad = ?, sort_name = ? WHERE seq = ?", ...hot, seq);
    t.run("UPDATE library_docs SET title = ?, meta = ?, feed = ?, media_sha = ?, media_mime = ?, needs_media = ?, digest = ?, record = ?, face = ? WHERE seq = ?", ...doc, seq);
    t.run("DELETE FROM library_fts WHERE rowid = ?", seq);
  }
  t.run("INSERT INTO library_fts (rowid, title, meta, hay) VALUES (?, ?, ?, ?)", seq, row.title, row.meta, row.hay);
  writeFacets(t, seq, row);
  restoreMarks(t, row.id, seq, row.kind);
  refreshVids(t, seq);
  return held === undefined ? "inserted" : "updated";
}

/**
 * Upsert `entries` in ONE transaction. Each record goes through the LibraryItem
 * door first: a source that hands over an item its schema refuses (a derived
 * item with no ancestor) is refused whole, with the door's words, before a row
 * is written.
 */
export function upsertItems(store: Store, entries: readonly LibraryEntry[], ctx: IndexContext): Result<UpsertReport> {
  const rows: IndexRow[] = [];
  for (const e of entries) {
    const p = parseAt(`library item ${e.item.id}`, libraryItemSchema, e.item);
    if (!p.ok) return p;
    const x = parseAt(`library extras ${e.item.id}`, extrasSchema, e.extras);
    if (!x.ok) return x;
    rows.push(indexRowOf({ ...e, item: p.value, extras: x.value }, ctx));
  }
  return store.tx((t) => {
    const n = { inserted: 0, updated: 0, unchanged: 0 };
    for (const r of rows) n[upsertRowIn(t, r)]++;
    return n;
  });
}

/** Remove what `feed` wrote and no longer holds. Its marks stay (they are acts, and events). */
export function pruneFeed(store: Store, feed: string, keep: ReadonlySet<string>): Result<number> {
  return store.tx((t) => {
    let n = 0;
    for (const r of t.all("SELECT seq, id FROM library_docs WHERE feed = ?", feed)) {
      if (keep.has(String(r["id"]))) continue;
      t.run("DELETE FROM library_fts WHERE rowid = ?", r["seq"] ?? null);
      t.run("DELETE FROM library_items WHERE seq = ?", r["seq"] ?? null);
      n++;
    }
    return n;
  });
}

// ── media facts ─────────────────────────────────────────────────────────────

const factsSchema = z.object({
  sha: z.string().regex(/^[0-9a-f]{64}$/),
  decodable: z.boolean(),
  mime: z.string().min(1),
  w: z.number().int().positive().nullable(),
  h: z.number().int().positive().nullable(),
  durationS: z.number().nonnegative().nullable(),
  posterSha: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
  meanLuma: z.number().min(0).max(255).nullable(),
  nearBlack: z.boolean(),
  probedAt: z.iso.datetime(),
  error: z.string().min(1).nullable(),
  mesh: meshFactsSchema.optional(),
});

/**
 * Record what a probe found. `nearBlack` is checked against `meanLuma` here, not
 * trusted: the rule is NEAR_BLACK_LUMA, once, and a writer that computed it
 * another way is refused. The item's attention follows by trigger (./schema.ts).
 */
export function putMediaFacts(store: Store, facts: readonly MediaFacts[]): Result<number> {
  const rows: MediaFacts[] = [];
  for (const f of facts) {
    const p = parseAt("media facts", factsSchema, f);
    if (!p.ok) return p;
    const expect = p.value.meanLuma !== null && p.value.meanLuma < NEAR_BLACK_LUMA;
    if (p.value.nearBlack !== expect) return err("invalid", `media facts ${f.sha.slice(0, 12)}: nearBlack ${String(p.value.nearBlack)} disagrees with mean luma ${String(p.value.meanLuma)} (< ${NEAR_BLACK_LUMA} is near-black)`);
    if (!p.value.decodable && p.value.error === null) return err("invalid", `media facts ${f.sha.slice(0, 12)}: an undecodable blob carries the probe's words`);
    rows.push(f);
  }
  return store.tx((t) => {
    for (const f of rows) {
      t.run(
        `INSERT INTO media_facts (sha, decodable, mime, w, h, duration_s, poster_sha, mean_luma, near_black, probed_at, error, mesh) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (sha) DO UPDATE SET decodable = excluded.decodable, mime = excluded.mime, w = excluded.w, h = excluded.h, duration_s = excluded.duration_s,
           poster_sha = excluded.poster_sha, mean_luma = excluded.mean_luma, near_black = excluded.near_black, probed_at = excluded.probed_at, error = excluded.error, mesh = excluded.mesh`,
        f.sha,
        f.decodable ? 1 : 0,
        f.mime,
        f.w,
        f.h,
        f.durationS,
        f.posterSha,
        f.meanLuma,
        f.nearBlack ? 1 : 0,
        f.probedAt,
        f.error,
        f.mesh === undefined ? null : JSON.stringify(f.mesh),
      );
    }
    return rows.length;
  });
}

export type FactsWanted = { readonly sha: string; readonly mime: string };

/** Blobs an item points at that have no facts yet: the media-facts producer's queue. One row a
 *  blob (./measures.ts `measuresMissing`'s shape): a DISTINCT over (sha, mime) queued the same
 *  bytes twice when two items named them under two mimes, and the limit counted items. */
export function factsMissing(store: Store, limit: number): Result<FactsWanted[]> {
  return store.read((r) =>
    r
      .all(
        "SELECT d.media_sha AS sha, max(d.media_mime) AS mime FROM library_docs d WHERE d.media_sha IS NOT NULL AND NOT EXISTS (SELECT 1 FROM media_facts f WHERE f.sha = d.media_sha) GROUP BY d.media_sha LIMIT ?",
        limit,
      )
      .map((row) => ({ sha: String(row["sha"]), mime: String(row["mime"] ?? "application/octet-stream") })),
  );
}

// ── the operator's acts ─────────────────────────────────────────────────────

/** The acts that are marks on the item. `export` is not one: it writes files outside the store,
 *  and the store keeps only its event (`recordExport`). */
export type MarkAct = Exclude<LibraryAct, { readonly act: "export" }>;

const EVENT: { readonly [K in MarkAct["act"]]: string } = { pin: "library.pinned", unpin: "library.unpinned", "use-in-project": "library.used" };

/**
 * Pin, unpin or use an item: the mark, its facet row and the event in one
 * transaction (the state change does not land without its event). Pinning what
 * is pinned is a no-op that writes nothing; so is unpinning what is not.
 */
export function actOnItem(store: Store, itemId: string, act: MarkAct, actor: Actor): Result<{ readonly changed: boolean }> {
  return store.tx((t) => {
    const item = t.get("SELECT i.seq AS seq, i.kind AS kind FROM library_docs d JOIN library_items i ON i.seq = d.seq WHERE d.id = ?", itemId);
    if (item === undefined) throw new AppError("not-found", `library: no item ${itemId}`);
    const [kind, ref] = act.act === "use-in-project" ? (["project", act.projectId] as const) : (["pin", act.collection ?? DEFAULT_PIN] as const);
    const grp = kind === "pin" ? "pin" : "project";
    let changed: boolean;
    if (act.act === "unpin") {
      changed = t.run("DELETE FROM library_marks WHERE item_id = ? AND kind = 'pin' AND ref = ?", itemId, ref).changes > 0;
      if (changed) t.run("DELETE FROM library_facets WHERE grp = 'pin' AND value = ? AND item_seq = ? AND by_act = 1", ref, item["seq"] ?? null);
    } else {
      changed = t.run("INSERT OR IGNORE INTO library_marks (item_id, kind, ref, at) VALUES (?, ?, ?, ?)", itemId, kind, ref, t.at).changes > 0;
      if (changed) {
        t.run("INSERT OR IGNORE INTO library_facets (grp, value, item_seq, kind, by_act) VALUES (?, ?, ?, ?, 1)", grp, ref, item["seq"] ?? null, String(item["kind"]));
        t.run("INSERT OR IGNORE INTO library_values (grp, value, label, norm) VALUES (?, ?, ?, ?)", grp, ref, ref, valueNorm(ref, ref));
      }
    }
    if (changed) refreshVids(t, Number(item["seq"]));
    if (changed) append(t, { actor, type: EVENT[act.act], subject: { kind: "library-item", id: itemId }, data: kind === "project" ? { projectId: ref } : { collection: ref } });
    return { changed };
  });
}


/**
 * An export that landed: its event, after the files were written (lib/foundry/mesh/export.ts).
 * The files are the export; this is the ledger's record of who sent which item where.
 */
export function recordExport(store: Store, itemId: string, project: string, wrote: readonly string[], actor: Actor): Result<void> {
  return store.tx((t) => {
    if (t.get("SELECT 1 AS x FROM library_docs WHERE id = ?", itemId) === undefined) throw new AppError("not-found", `library: no item ${itemId}`);
    append(t, { actor, type: "library.exported", subject: { kind: "library-item", id: itemId }, data: { project, wrote: [...wrote] } });
  });
}


// ── the ingest memo ─────────────────────────────────────────────────────────

export type IngestMemo = { readonly path: string; readonly size: number; readonly mtimeMs: number; readonly sha: string; readonly mime: string };

/** The blob a file became, if its size and mtime are what they were then. */
export function ingested(store: Store, path: string, size: number, mtimeMs: number): Result<{ readonly sha: string; readonly mime: string } | null> {
  return store.read((r) => {
    const row = r.get("SELECT sha, mime FROM library_ingest WHERE path = ? AND size = ? AND mtime_ms = ?", path, size, Math.trunc(mtimeMs));
    return row === undefined ? null : { sha: String(row["sha"]), mime: String(row["mime"]) };
  });
}

export function rememberIngest(store: Store, memos: readonly IngestMemo[]): Result<number> {
  return store.tx((t) => {
    for (const m of memos) {
      t.run(
        "INSERT INTO library_ingest (path, size, mtime_ms, sha, mime) VALUES (?, ?, ?, ?, ?) ON CONFLICT (path) DO UPDATE SET size = excluded.size, mtime_ms = excluded.mtime_ms, sha = excluded.sha, mime = excluded.mime",
        m.path,
        m.size,
        Math.trunc(m.mtimeMs),
        m.sha,
        m.mime,
      );
    }
    return memos.length;
  });
}
