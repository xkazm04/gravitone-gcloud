import { z } from "zod";
import { parseAt, parseJsonAt } from "@gt/domain/door";
import { AppError, type Result } from "@gt/domain/errors";
import { styleSchema, type Style } from "@gt/domain/style";
import type { ModuleMigrations } from "../migrate.ts";
import type { Row } from "../store.ts";

// THE STYLE TABLE AND ITS OP LOG (Phase 5 decision 1-3) - the part records' shape
// (../parts/schema.ts) for the one record that replaced pipeline/foundry/styles.json and the
// browser's IndexedDB `themes` store.
//
// `styles` holds each style's CURRENT record, one row, with its revision; `style_ops` is
// APPEND-ONLY (the triggers refuse UPDATE and DELETE) and holds every write that made it, so the
// catalogue's history is rows rather than v1's catalogue-journal.jsonl (lib/foundry/catalogue.ts),
// which recorded an INTENT before a multi-file write and needed a lock file to mean anything.
// Here the record, its log row and its ledger event commit in one transaction or not at all:
// the transaction IS the fence v1's `withCatalogue` built by hand.
//
// THE RATCHET HAS A SQL BACKSTOP. The record's door derives `status` and the kernel refuses a
// demoting write (@gt/domain/style.ratchet `ratchetBlocker`); the trigger below refuses one even
// from a writer that forgot both - the Python door, a migration, a hand-run UPDATE. A gate that
// only the polite writer consults is v1's `useThemes.lock`, which skipped `canLock`.
//
// `seq` (the log's) is the catalogue's revision: the export stamps max(seq) as `_rev`, which
// only ever grows, so a reader comparing revisions never sees the number go back (v1's `_rev`
// was minted by catalogue.ts `begin()` from the file it was about to overwrite).

export const stylesMigrations: ModuleMigrations = {
  module: "styles",
  steps: [
    {
      version: 1,
      sql: `
CREATE TABLE styles (
  id TEXT PRIMARY KEY,
  rev INTEGER NOT NULL CHECK (rev >= 1),
  status TEXT NOT NULL CHECK (status IN ('candidate', 'proven', 'locked')),
  ord INTEGER NOT NULL,
  record TEXT NOT NULL CHECK (json_valid(record) AND json_type(record) = 'object'),
  updated_at TEXT NOT NULL,
  CHECK (json_extract(record, '$.id') = id AND json_extract(record, '$.status') = status)
) WITHOUT ROWID;
CREATE INDEX styles_ord ON styles (ord);
CREATE TABLE style_ops (
  seq INTEGER PRIMARY KEY,
  style_id TEXT NOT NULL,
  rev INTEGER NOT NULL CHECK (rev >= 1),
  kind TEXT NOT NULL,
  op TEXT NOT NULL CHECK (json_valid(op)),
  by TEXT NOT NULL,
  at TEXT NOT NULL,
  UNIQUE (style_id, rev)
);
CREATE TRIGGER style_ops_no_update BEFORE UPDATE ON style_ops BEGIN SELECT RAISE(ABORT, 'style ops are append-only'); END;
CREATE TRIGGER style_ops_no_delete BEFORE DELETE ON style_ops BEGIN SELECT RAISE(ABORT, 'style ops are append-only'); END;
CREATE TRIGGER styles_no_delete BEFORE DELETE ON styles BEGIN SELECT RAISE(ABORT, 'a style is never deleted; its history is the catalogue'); END;
CREATE TRIGGER styles_ratchet BEFORE UPDATE OF status ON styles
  WHEN (OLD.status = 'locked' AND NEW.status <> 'locked') OR (OLD.status = 'proven' AND NEW.status = 'candidate')
  BEGIN SELECT RAISE(ABORT, 'the style ratchet is one-way'); END;`,
    },
  ],
};

const styleRow = z.object({
  id: z.string().min(1),
  rev: z.number().int().positive(),
  ord: z.number().int(),
  record: z.string(),
  updated_at: z.string().min(1),
});

export type StyleRow = { readonly style: Style; readonly rev: number; readonly ord: number; readonly updatedAt: string };
export const STYLE_COLUMNS = "id, rev, ord, record, updated_at";

function must<T>(r: Result<T>): T {
  if (!r.ok) throw r.error;
  return r.value;
}

/** A row through the record's door. A record the door refuses is a loud error, never a skipped
 *  style: a catalogue that silently lost an entry is the bug the export exists to prevent. */
export function readStyleRow(row: Row): StyleRow {
  const r = must(parseAt("style row", styleRow, row));
  const style = must(parseJsonAt(`style ${r.id}`, styleSchema, r.record));
  if (style.id !== r.id) throw new AppError("internal", `style row ${r.id} holds the record of ${style.id}`);
  return { style, rev: r.rev, ord: r.ord, updatedAt: r.updated_at };
}
