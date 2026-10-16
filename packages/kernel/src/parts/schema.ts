import { z } from "zod";
import { parseAt, parseJsonAt } from "@gt/domain/door";
import type { Result } from "@gt/domain/errors";
import type { ModuleMigrations } from "../migrate.ts";
import type { Row } from "../store.ts";

// THE PART RECORDS AND THEIR OP LOG (STEPS-DESIGN §3) - the decision kernel's shape
// (./decision/schema.ts) for a studio part's own records.
//
// `part_records` holds the CURRENT value of each step record of a project, one row per v1 record
// key (research-scope, frames, score...), owned by one part. It is a cache of the log in the same
// sense v1's verdicts.json was a cache of verdicts.log.jsonl - except that here both are written
// in ONE transaction, so they cannot disagree; the log is the history, the row is the read.
//
// `part_ops` is APPEND-ONLY (the triggers refuse UPDATE and DELETE): every edit, every job
// landing and every undo is a row, and nothing is ever taken back by deleting one. Each row
// carries, per record it wrote, the value BEFORE it and the digest AFTER it:
//   · the BEFORE is what an undo restores (registry undo-history: execution-emitted-inverse -
//     the inverse is what the act actually overwrote, never re-derived from the request);
//   · the AFTER digest is how an undo knows a later writer (a job landing, another part's op)
//     moved the record since, and refuses with that writer named instead of erasing its work.
// v1 had five undo models (INVENTORY §7.4), four of them session-only; this one survives a
// reload and another tab, because it is rows.

export const partsMigrations: ModuleMigrations = {
  module: "parts",
  steps: [
    {
      version: 1,
      sql: `
CREATE TABLE part_records (
  project_id TEXT NOT NULL REFERENCES projects (id),
  key TEXT NOT NULL,
  part_id TEXT NOT NULL,
  rev INTEGER NOT NULL CHECK (rev >= 1),
  data TEXT NOT NULL CHECK (json_valid(data) AND json_type(data) = 'object'),
  PRIMARY KEY (project_id, key)
) WITHOUT ROWID;
CREATE INDEX part_records_part ON part_records (project_id, part_id);
CREATE TABLE part_ops (
  seq INTEGER PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects (id),
  part_id TEXT NOT NULL,
  n INTEGER NOT NULL CHECK (n >= 1),
  act TEXT NOT NULL CHECK (act IN ('op', 'land', 'undo')),
  op TEXT NOT NULL CHECK (json_valid(op)),
  label TEXT NOT NULL,
  base_rev INTEGER NOT NULL CHECK (base_rev >= 1),
  undoes INTEGER,
  writes TEXT NOT NULL CHECK (json_valid(writes) AND json_type(writes) = 'array'),
  by TEXT NOT NULL,
  at TEXT NOT NULL,
  UNIQUE (project_id, part_id, n),
  CHECK ((act = 'undo') = (undoes IS NOT NULL))
);
CREATE INDEX part_ops_project ON part_ops (project_id, seq);
CREATE TRIGGER part_ops_no_update BEFORE UPDATE ON part_ops BEGIN SELECT RAISE(ABORT, 'part ops are append-only'); END;
CREATE TRIGGER part_ops_no_delete BEFORE DELETE ON part_ops BEGIN SELECT RAISE(ABORT, 'part ops are append-only'); END;`,
    },
  ],
};

/** One record an act wrote: what it was before (null = absent) and the digest of what it left. */
export const writeSchema = z.object({ key: z.string().min(1), before: z.looseObject({}).nullable(), after: z.string().nullable() });
export type Write = z.output<typeof writeSchema>;

const opRow = z.object({
  seq: z.number().int().positive(),
  part_id: z.string().min(1),
  n: z.number().int().positive(),
  act: z.enum(["op", "land", "undo"]),
  op: z.string(),
  label: z.string(),
  base_rev: z.number().int().positive(),
  undoes: z.number().int().positive().nullable(),
  writes: z.string(),
  by: z.string().min(1),
  at: z.string(),
});

export type OpRow = Omit<z.output<typeof opRow>, "writes" | "op"> & { readonly writes: readonly Write[]; readonly op: unknown };
export const OP_COLUMNS = "seq, part_id, n, act, op, label, base_rev, undoes, writes, by, at";

function must<T>(r: Result<T>): T {
  if (!r.ok) throw r.error;
  return r.value;
}

export function readOpRow(row: Row): OpRow {
  const r = must(parseAt("part op row", opRow, row));
  const writes = must(parseJsonAt("part op writes", z.array(writeSchema), r.writes));
  const op = must(parseJsonAt("part op", z.unknown(), r.op));
  return { ...r, writes, op };
}

const recordRow = z.object({ key: z.string().min(1), part_id: z.string().min(1), rev: z.number().int().positive(), data: z.string() });
export type RecordRow = { readonly key: string; readonly partId: string; readonly rev: number; readonly data: Readonly<Record<string, unknown>> };

export function readRecordRow(row: Row): RecordRow {
  const r = must(parseAt("part record row", recordRow, row));
  const data = must(parseJsonAt(`part record ${r.key}`, z.looseObject({}), r.data));
  return { key: r.key, partId: r.part_id, rev: r.rev, data };
}

