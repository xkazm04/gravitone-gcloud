import { z } from "zod";
import { parseAt, parseJsonAt } from "@gt/domain/door";
import { AppError, type Result } from "@gt/domain/errors";
import { metricSnapshotSchema, publicationSchema, type MetricSnapshot, type Publication } from "@gt/domain/publication";
import { slotSchema, type Slot } from "@gt/domain/slot";
import type { ModuleMigrations } from "../migrate.ts";
import type { Row } from "../store.ts";

// THE CALENDAR'S TABLES (owner ruling 3, 2026-10-17) - v1's three JSON files under
// <publish>/ (lib/publish/store.ts: schedule.json, publications.json, metrics.json) as rows,
// every write in one transaction with its `slot.*` event.
//
// What the files needed a lock file, an in-process queue, a stale-lock break and tmp+rename
// for (two writers - the Next server and the CLI - rewriting one schedule.json from reads
// taken moments apart), BEGIN IMMEDIATE gives here for every writer at once. What v1 kept in
// `claims` beside the slots ({pid, at}, guarded by a 6 h pid-reuse age) is a kernel lease on
// `slot:<id>` (COMMON decision 2): the holder carries a bootId, so a reused pid is not mistaken
// for the claimant, and its fence (`fence` below) is what the publisher presents to record the
// outcome - a claimant the sweep has already declared interrupted is refused at its own write.
//
// SQL BACKSTOPS for the three rules that must not depend on a polite writer:
//   one slot holding an item on a channel  the partial unique index `slots_one_holder`, over
//                                           the states `SLOT_HOLDS` names (scheduled, publishing,
//                                           published - but not published dry, step 4) - the
//                                           driver's clash check turns it into a sentence, the
//                                           index refuses it even without one;
//   one publication per item, channel   `slots_one_publication` (step 4): v1's per-mode rule,
//   and mode                                one dry and one live at most;
//   nothing deleted                         cancel is soft (v1 cancelSlot: "the history reads
//                                           true"), publications and readings are append-only.
// `record` is the domain Slot through its door; the columns beside it are what the queries
// select by, and the CHECK holds them to the record.

export const slotsMigrations: ModuleMigrations = {
  module: "slots",
  steps: [
    {
      version: 1,
      sql: `
CREATE TABLE slots (
  id TEXT PRIMARY KEY,
  item TEXT NOT NULL,
  channel TEXT NOT NULL,
  at TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('scheduled', 'publishing', 'published', 'failed', 'missed', 'cancelled')),
  part_id TEXT,
  rev INTEGER NOT NULL CHECK (rev >= 1),
  fence INTEGER CHECK (fence IS NULL OR fence > 0),
  record TEXT NOT NULL CHECK (json_valid(record) AND json_type(record) = 'object'),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (json_extract(record, '$.id') = id AND json_extract(record, '$.state') = state AND json_extract(record, '$.at') = at
     AND json_extract(record, '$.libraryItemId') = item AND json_extract(record, '$.channel') = channel),
  CHECK ((state = 'publishing') = (fence IS NOT NULL))
) WITHOUT ROWID;
CREATE UNIQUE INDEX slots_one_holder ON slots (item, channel) WHERE state IN ('scheduled', 'publishing', 'published');
CREATE INDEX slots_at ON slots (at);
CREATE INDEX slots_part ON slots (part_id) WHERE part_id IS NOT NULL;
CREATE TRIGGER slots_no_delete BEFORE DELETE ON slots BEGIN SELECT RAISE(ABORT, 'a slot is never deleted; cancel it'); END;
CREATE TABLE publications (
  id TEXT PRIMARY KEY,
  slot_id TEXT NOT NULL UNIQUE REFERENCES slots (id),
  record TEXT NOT NULL CHECK (json_valid(record) AND json_type(record) = 'object'),
  published_at TEXT NOT NULL,
  CHECK (json_extract(record, '$.id') = id AND json_extract(record, '$.slotId') = slot_id)
) WITHOUT ROWID;
CREATE TRIGGER publications_no_update BEFORE UPDATE ON publications BEGIN SELECT RAISE(ABORT, 'publications are append-only'); END;
CREATE TRIGGER publications_no_delete BEFORE DELETE ON publications BEGIN SELECT RAISE(ABORT, 'publications are append-only'); END;
CREATE TABLE metric_snapshots (
  seq INTEGER PRIMARY KEY,
  publication_id TEXT NOT NULL REFERENCES publications (id),
  at TEXT NOT NULL,
  record TEXT NOT NULL CHECK (json_valid(record) AND json_type(record) = 'object'),
  CHECK (json_extract(record, '$.publicationId') = publication_id AND json_extract(record, '$.at') = at)
);
CREATE INDEX metric_snapshots_pub ON metric_snapshots (publication_id, at);
CREATE TRIGGER metric_snapshots_no_update BEFORE UPDATE ON metric_snapshots BEGIN SELECT RAISE(ABORT, 'metric snapshots are append-only'); END;
CREATE TRIGGER metric_snapshots_no_delete BEFORE DELETE ON metric_snapshots BEGIN SELECT RAISE(ABORT, 'metric snapshots are append-only'); END;`,
    },
    {
      // A DRY PUBLICATION HOLDS NOTHING (Director's ruling on L62, v1 parity): v1's publisher
      // allowed one upload per export x channel x MODE (lib/publish/publisher.ts, "a dry run
      // does not block the live upload that follows it"). Step 1 made a published slot hold its
      // item whatever its publication was, so a rehearsal locked the item off its channel for
      // good. `dry` mirrors the slot's publication, written with the slot in the commit that
      // lands it (./outcome.ts and ./import.ts, the only two writers of a publication). A
      // publication is always its slot's and a published slot is terminal, so the published
      // slots ARE the publications here. Three steps, because a shape change and a data rewrite
      // are never one (migrations: data-migrations): the column; its backfill; then the indexes
      // that read it - the holder index stops counting a dry-published slot, and
      // `slots_one_publication` is v1's per-mode rule as a constraint, one dry and one live per
      // item x channel. A store whose history already breaks that rule fails at step 4 alone,
      // with the column and its values in place for the operator to read.
      version: 2,
      sql: `ALTER TABLE slots ADD COLUMN dry INTEGER NOT NULL DEFAULT 0 CHECK (dry IN (0, 1) AND (dry = 0 OR state = 'published'));`,
    },
    {
      // Existing rows decided one by one (data-migrations: "what existing rows get is a per-row
      // decision"): a published slot is dry exactly when its publication says so.
      version: 3,
      sql: `UPDATE slots SET dry = 1 WHERE state = 'published' AND EXISTS (SELECT 1 FROM publications p WHERE p.slot_id = slots.id AND json_extract(p.record, '$.dry') = 1);`,
    },
    {
      version: 4,
      sql: `
DROP INDEX slots_one_holder;
CREATE UNIQUE INDEX slots_one_holder ON slots (item, channel) WHERE state IN ('scheduled', 'publishing') OR (state = 'published' AND dry = 0);
CREATE UNIQUE INDEX slots_one_publication ON slots (item, channel, dry) WHERE state = 'published';`,
    },
  ],
};

export const SLOT_COLUMNS = "id, rev, fence, dry, record, created_at, updated_at";

const slotRow = z.object({
  id: z.string().min(1),
  rev: z.number().int().positive(),
  fence: z.number().int().positive().nullable(),
  dry: z.union([z.literal(0), z.literal(1)]),
  record: z.string(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
});

/** A slot as the store holds it: the record, its revision, and - while publishing - the fence
 *  of the lease its claimant holds on `slot:<id>`. */
export type SlotRow = {
  readonly slot: Slot;
  readonly rev: number;
  readonly fence?: number;
  /** A published slot whose publication was a dry run: nothing went out, so it holds nothing. */
  readonly dry?: true;
  readonly createdAt: string;
  readonly updatedAt: string;
};

function must<T>(r: Result<T>): T {
  if (!r.ok) throw r.error;
  return r.value;
}

/** A row through the record's door; a record the door refuses is a loud error, never a
 *  skipped slot (a calendar that silently lost a slot is the failure v1's store refused to
 *  risk by throwing on a corrupt schedule.json rather than resetting it). */
export function readSlotRow(row: Row): SlotRow {
  const r = must(parseAt("slot row", slotRow, row));
  const slot = must(parseJsonAt(`slot ${r.id}`, slotSchema, r.record));
  if (slot.id !== r.id) throw new AppError("internal", `slot row ${r.id} holds the record of ${slot.id}`);
  return { slot, rev: r.rev, ...(r.fence === null ? {} : { fence: r.fence }), ...(r.dry === 1 ? { dry: true as const } : {}), createdAt: r.created_at, updatedAt: r.updated_at };
}

export function readPublicationRow(row: Row): Publication {
  return must(parseJsonAt("publication", publicationSchema, String(row["record"])));
}

export function readSnapshotRow(row: Row): MetricSnapshot {
  return must(parseJsonAt("metric snapshot", metricSnapshotSchema, String(row["record"])));
}

/** The lease resource a slot's claim is held on. */
export const claimResource = (slotId: string): string => `slot:${slotId}`;
