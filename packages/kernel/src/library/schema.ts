import type { ModuleMigrations } from "../migrate.ts";

// THE LIBRARY INDEX'S TABLES (Phase 5, COMMON decisions 5 and 6).
//
// A PROJECTION, NOT A SECOND TRUTH. Every row here is rebuilt from a source that
// owns the thing (a forge run, a take, the Style table, a kernel blob) by
// lib/library/project.ts; dropping these tables loses nothing a sync cannot
// re-derive, except the operator's acts (`library_marks`), which are also events.
// So the projection writes no event per item (50,000 items would be 50,000
// "the index noticed" facts nobody reads); the acts do.
//
//   library_items   one row per item, HOT AND NARROW: only what the rail filters
//                   and the grid sorts on, with the sort keys PRECOMPUTED (`bad`,
//                   `kind_ord`, `sort_name`) so each order is an index walk, and
//                   `library_items_columns` covering every column, so a scan of a
//                   kind never touches the table. Everything else - the id, the
//                   words, the media pointer, the record - is in `library_docs`.
//                   Measured 2026-10-16 at 50k: with the record inline one GROUP
//                   BY origin read every overflow page (35 ms); with the words
//                   inline, the 9,399 candidate rows of a 3-group plate filter
//                   cost 23 ms against 10 ms read from a covering index.
//                   `vids` is every value the item carries - its kind, state,
//                   origin, source and each facet value - as library_values ids,
//                   packed uint32 little-endian: a filtered rail is then ONE pass
//                   over the kind's covering index, counted in JS the way the
//                   prototype counted its array, where a join per facet group cost
//                   4-12 ms each at 50k. `attention` is NOT in it: the media-facts
//                   trigger moves that column, and a packed copy would go stale.
//                   library_facets stays the truth the facet ids are derived from
//                   (and what selections and the bare counts read).
//   library_docs    the rest of an item, read for a page (60 rows) or a detail.
//   library_facets  (group, value, item) - the vocabulary groups and the
//                   collections, one row per value. `kind` is denormalised onto
//                   it so the commonest count (a kind's vocabulary with no other
//                   filter) reads the facet index alone. `by_act` marks the rows
//                   an operator's act wrote, which a re-projection keeps.
//   library_values  (group, value) -> its id, label and folded form: the labels the
//                   rail shows and the table `key:value` search resolves against
//                   (substring over a few thousand rows, never over 50k items).
//   library_fts     FTS5 over title, meta and the haystack of every facet value;
//                   unicode61 with diacritics folded (the parser folds the same
//                   way, @gt/domain/library `normText`), prefix indexes for
//                   type-ahead. A regular content-storing table, not contentless:
//                   contentless_delete needs SQLite 3.43 and the Python door's
//                   sqlite3 is exactly that (Director, 2026-10-17), so the margin
//                   is nil and the text is small.
//   media_facts     one row per blob sha, written by the media-facts producer
//                   (decodable, size, duration, poster, mean luma). The item's
//                   `attention` and `bad` columns follow it through TRIGGERS, in
//                   the same transaction as the fact: the attention facet and the
//                   sort that sinks broken media are queries over the facts, and a
//                   writer that forgets to update the item cannot exist.
//   library_ingest  the projection's memo of files it has hashed into blobs.
//   library_marks   pins and project uses, the operator's acts.

const ITEMS = `
CREATE TABLE library_items (
  seq INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,
  kind_ord INTEGER NOT NULL,
  state TEXT NOT NULL,
  origin TEXT NOT NULL,
  source TEXT NOT NULL,
  at TEXT,
  attention TEXT CHECK (attention IN ('unreadable', 'missing')),
  bad INTEGER NOT NULL CHECK (bad IN (0, 1)),
  sort_name TEXT NOT NULL,
  vids BLOB NOT NULL DEFAULT x''
);
CREATE TABLE library_docs (
  seq INTEGER PRIMARY KEY REFERENCES library_items (seq) ON DELETE CASCADE,
  id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  meta TEXT NOT NULL,
  feed TEXT NOT NULL,
  media_sha TEXT,
  media_mime TEXT,
  needs_media INTEGER NOT NULL CHECK (needs_media IN (0, 1)),
  digest TEXT NOT NULL,
  record TEXT NOT NULL,
  face TEXT NOT NULL DEFAULT ''
);
CREATE INDEX library_items_new ON library_items (bad, at DESC, seq DESC);
CREATE INDEX library_items_name ON library_items (bad, sort_name, seq);
CREATE INDEX library_items_by_kind ON library_items (bad, kind_ord, at DESC, seq DESC);
CREATE INDEX library_items_kind_new ON library_items (kind, bad, at DESC, seq DESC);
CREATE INDEX library_items_kind_name ON library_items (kind, bad, sort_name, seq);
CREATE INDEX library_items_columns ON library_items (kind, state, origin, source, attention, bad, at, kind_ord, sort_name, vids);
CREATE INDEX library_items_attention ON library_items (attention, kind) WHERE attention IS NOT NULL;
CREATE INDEX library_docs_media ON library_docs (media_sha) WHERE media_sha IS NOT NULL;
CREATE INDEX library_docs_feed ON library_docs (feed);

CREATE TABLE library_facets (
  grp TEXT NOT NULL,
  value TEXT NOT NULL,
  item_seq INTEGER NOT NULL REFERENCES library_items (seq) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  by_act INTEGER NOT NULL DEFAULT 0 CHECK (by_act IN (0, 1)),
  PRIMARY KEY (grp, value, item_seq)
) WITHOUT ROWID;
CREATE INDEX library_facets_kind ON library_facets (grp, kind, value);
CREATE INDEX library_facets_item ON library_facets (item_seq, grp, value);

-- The facet counts with NOTHING chosen (the rail of a bare kind, the commonest
-- view), kept by trigger with the rows: reading them is a range of a small
-- table, where counting the rows was 43 ms for a plate rail at 50k (2026-10-16).
CREATE TABLE library_counts (
  grp TEXT NOT NULL,
  kind TEXT NOT NULL,
  value TEXT NOT NULL,
  n INTEGER NOT NULL CHECK (n >= 0),
  PRIMARY KEY (grp, kind, value)
) WITHOUT ROWID;
CREATE TRIGGER library_facets_count_ins AFTER INSERT ON library_facets BEGIN
  INSERT INTO library_counts (grp, kind, value, n) VALUES (NEW.grp, NEW.kind, NEW.value, 1) ON CONFLICT (grp, kind, value) DO UPDATE SET n = n + 1;
END;
CREATE TRIGGER library_facets_count_del AFTER DELETE ON library_facets BEGIN
  UPDATE library_counts SET n = n - 1 WHERE grp = OLD.grp AND kind = OLD.kind AND value = OLD.value;
  DELETE FROM library_counts WHERE grp = OLD.grp AND kind = OLD.kind AND value = OLD.value AND n = 0;
END;

-- The item columns are counted in the same table, as groups of their own, so a
-- bare rail (and every kind count with nothing chosen) is one range read.
CREATE TRIGGER library_items_count_ins AFTER INSERT ON library_items BEGIN
  INSERT INTO library_counts (grp, kind, value, n) VALUES ('state', NEW.kind, NEW.state, 1) ON CONFLICT (grp, kind, value) DO UPDATE SET n = n + 1;
  INSERT INTO library_counts (grp, kind, value, n) VALUES ('origin', NEW.kind, NEW.origin, 1) ON CONFLICT (grp, kind, value) DO UPDATE SET n = n + 1;
  INSERT INTO library_counts (grp, kind, value, n) VALUES ('source', NEW.kind, NEW.source, 1) ON CONFLICT (grp, kind, value) DO UPDATE SET n = n + 1;
  INSERT INTO library_counts (grp, kind, value, n) SELECT 'attention', NEW.kind, NEW.attention, 1 WHERE NEW.attention IS NOT NULL ON CONFLICT (grp, kind, value) DO UPDATE SET n = n + 1;
END;
CREATE TRIGGER library_items_count_del AFTER DELETE ON library_items BEGIN
  UPDATE library_counts SET n = n - 1 WHERE kind = OLD.kind AND ((grp = 'state' AND value = OLD.state) OR (grp = 'origin' AND value = OLD.origin) OR (grp = 'source' AND value = OLD.source) OR (grp = 'attention' AND value = OLD.attention));
  DELETE FROM library_counts WHERE n = 0 AND kind = OLD.kind AND grp IN ('state', 'origin', 'source', 'attention');
END;
CREATE TRIGGER library_items_count_upd AFTER UPDATE OF kind, state, origin, source, attention ON library_items BEGIN
  UPDATE library_counts SET n = n - 1 WHERE kind = OLD.kind AND ((grp = 'state' AND value = OLD.state) OR (grp = 'origin' AND value = OLD.origin) OR (grp = 'source' AND value = OLD.source) OR (grp = 'attention' AND value = OLD.attention));
  DELETE FROM library_counts WHERE n = 0 AND kind = OLD.kind AND grp IN ('state', 'origin', 'source', 'attention');
  INSERT INTO library_counts (grp, kind, value, n) VALUES ('state', NEW.kind, NEW.state, 1) ON CONFLICT (grp, kind, value) DO UPDATE SET n = n + 1;
  INSERT INTO library_counts (grp, kind, value, n) VALUES ('origin', NEW.kind, NEW.origin, 1) ON CONFLICT (grp, kind, value) DO UPDATE SET n = n + 1;
  INSERT INTO library_counts (grp, kind, value, n) VALUES ('source', NEW.kind, NEW.source, 1) ON CONFLICT (grp, kind, value) DO UPDATE SET n = n + 1;
  INSERT INTO library_counts (grp, kind, value, n) SELECT 'attention', NEW.kind, NEW.attention, 1 WHERE NEW.attention IS NOT NULL ON CONFLICT (grp, kind, value) DO UPDATE SET n = n + 1;
END;

CREATE TABLE library_values (
  vid INTEGER PRIMARY KEY,
  grp TEXT NOT NULL,
  value TEXT NOT NULL,
  label TEXT NOT NULL,
  norm TEXT NOT NULL,
  UNIQUE (grp, value)
);

CREATE VIRTUAL TABLE library_fts USING fts5 (title, meta, hay, tokenize = 'unicode61 remove_diacritics 2', prefix = '2 3');

CREATE TABLE media_facts (
  sha TEXT PRIMARY KEY,
  decodable INTEGER NOT NULL CHECK (decodable IN (0, 1)),
  mime TEXT NOT NULL,
  w INTEGER,
  h INTEGER,
  duration_s REAL,
  poster_sha TEXT,
  mean_luma REAL CHECK (mean_luma IS NULL OR (mean_luma >= 0 AND mean_luma <= 255)),
  near_black INTEGER NOT NULL CHECK (near_black IN (0, 1)),
  probed_at TEXT NOT NULL,
  error TEXT
) WITHOUT ROWID;

CREATE TRIGGER media_facts_attention_ins AFTER INSERT ON media_facts BEGIN
  UPDATE library_items SET attention = CASE WHEN NEW.decodable = 0 THEN 'unreadable' END, bad = (NEW.decodable = 0) WHERE seq IN (SELECT seq FROM library_docs WHERE media_sha = NEW.sha);
END;
CREATE TRIGGER media_facts_attention_upd AFTER UPDATE OF decodable ON media_facts BEGIN
  UPDATE library_items SET attention = CASE WHEN NEW.decodable = 0 THEN 'unreadable' END, bad = (NEW.decodable = 0) WHERE seq IN (SELECT seq FROM library_docs WHERE media_sha = NEW.sha);
END;
CREATE TRIGGER media_facts_attention_del AFTER DELETE ON media_facts BEGIN
  UPDATE library_items SET attention = NULL, bad = 0 WHERE seq IN (SELECT seq FROM library_docs WHERE media_sha = OLD.sha);
END;

-- What a file on disk was, the last time the projection ingested it: a file
-- whose size and mtime have not moved is not re-read and re-hashed (a run's
-- mp4s are hundreds of MB; the blob put is idempotent but the hash is not free).
CREATE TABLE library_ingest (
  path TEXT PRIMARY KEY,
  size INTEGER NOT NULL,
  mtime_ms INTEGER NOT NULL,
  sha TEXT NOT NULL,
  mime TEXT NOT NULL
) WITHOUT ROWID;

CREATE TABLE library_marks (
  item_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('pin', 'project')),
  ref TEXT NOT NULL,
  at TEXT NOT NULL,
  PRIMARY KEY (item_id, kind, ref)
) WITHOUT ROWID;`;

export const libraryMigrations: ModuleMigrations = {
  module: "library",
  steps: [{ version: 1, sql: ITEMS }],
};
