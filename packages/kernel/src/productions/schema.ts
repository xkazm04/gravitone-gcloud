import { z } from "zod";
import { ACTOR_KINDS } from "@gt/domain/event";
import { TAKE_KINDS, TAKE_STATES, productionBoardSchema, productionSourceSchema, productionStageSchema } from "@gt/domain/production";

import type { ModuleMigrations } from "../migrate.ts";

// THE PRODUCTION RECORD (spark concept-casting-stages S1): a kept concept started by the operator, one row, and its
// takes, appended. A production's stage is read from THIS row, never inferred from a night's state.
//
// The schema holds what the store's code holds, so a hand edit cannot make a record the code would never have written:
//   - one production per concept (`(source_kind, source_ref)` UNIQUE): a Start pressed twice is one production;
//   - the concept as it stood at Start (its words and frames, `board`) is fixed: no later edit moves a take's frames;
//   - only the stage moves on the head; legality of a move is the store's (`refusalOfMove`), the table it reads is data;
//   - a take is appended, never deleted; what it was asked to render is fixed, and only its outcome and proof are written.

const STAGES = "('accepted', 'hero', 'rough', 'proven', 'casting', 'audio', 'cutting', 'done', 'dropped')";
const ACTORS = "('operator', 'agent', 'machine')";

export const productionMigrations: ModuleMigrations = {
  module: "productions",
  steps: [
    {
      version: 1,
      sql: `
CREATE TABLE productions (
  id TEXT PRIMARY KEY CHECK (id GLOB 'prdn:?*'),
  title TEXT NOT NULL CHECK (length(title) > 0),
  source_kind TEXT NOT NULL CHECK (source_kind IN ('episode', 'codex-board', 'outline')),
  source_ref TEXT NOT NULL CHECK (length(source_ref) > 0),
  stage TEXT NOT NULL CHECK (stage IN ${STAGES}),
  board TEXT NOT NULL CHECK (json_valid(board) AND json_type(board) = 'object'),
  started_at TEXT NOT NULL,
  started_by_kind TEXT NOT NULL CHECK (started_by_kind IN ${ACTORS}),
  started_by TEXT NOT NULL CHECK (length(started_by) > 0),
  UNIQUE (source_kind, source_ref)
);
CREATE TRIGGER productions_fixed_at_start BEFORE UPDATE OF id, title, source_kind, source_ref, board, started_at, started_by_kind, started_by ON productions
BEGIN SELECT RAISE(ABORT, 'a production is fixed when it starts; only its stage moves'); END;
CREATE TRIGGER productions_never_deleted BEFORE DELETE ON productions
BEGIN SELECT RAISE(ABORT, 'a production is dropped, never deleted'); END;
CREATE TABLE production_takes (
  production_id TEXT NOT NULL REFERENCES productions (id),
  id TEXT NOT NULL CHECK (length(id) > 0),
  n INTEGER NOT NULL CHECK (n > 0),
  kind TEXT NOT NULL CHECK (kind IN ('hero', 'rough')),
  state TEXT NOT NULL CHECK (state IN ('rendering', 'ready', 'failed')),
  beats TEXT NOT NULL CHECK (json_valid(beats) AND json_type(beats) = 'array'),
  frames TEXT NOT NULL CHECK (json_valid(frames) AND json_type(frames) = 'array'),
  prompt TEXT NOT NULL CHECK (length(prompt) > 0),
  seed INTEGER NOT NULL CHECK (seed >= 0),
  engine TEXT NOT NULL CHECK (length(engine) > 0),
  job_id TEXT NOT NULL CHECK (length(job_id) > 0),
  dry INTEGER NOT NULL DEFAULT 0 CHECK (dry IN (0, 1)),
  at TEXT NOT NULL,
  video TEXT,
  poster TEXT,
  error TEXT,
  duration_s REAL CHECK (duration_s IS NULL OR duration_s >= 0),
  gpu_seconds REAL CHECK (gpu_seconds IS NULL OR gpu_seconds >= 0),
  proven_at TEXT,
  proven_by TEXT,
  stale INTEGER NOT NULL DEFAULT 0 CHECK (stale IN (0, 1)),
  PRIMARY KEY (production_id, id),
  UNIQUE (production_id, n),
  CHECK (state <> 'ready' OR video IS NOT NULL),
  CHECK (state <> 'failed' OR error IS NOT NULL),
  CHECK (proven_at IS NULL OR state = 'ready')
);
CREATE TRIGGER production_takes_fixed BEFORE UPDATE OF production_id, id, n, kind, beats, frames, prompt, seed, engine, job_id, dry, at ON production_takes
BEGIN SELECT RAISE(ABORT, 'a take is fixed when it is requested; only its outcome and proof are written'); END;
CREATE TRIGGER production_takes_settle_once BEFORE UPDATE OF state ON production_takes
WHEN OLD.state <> 'rendering' AND NEW.state <> OLD.state
BEGIN SELECT RAISE(ABORT, 'a take settles once'); END;
CREATE TRIGGER production_takes_never_deleted BEFORE DELETE ON production_takes
BEGIN SELECT RAISE(ABORT, 'a take is never deleted'); END;`,
    },
  ],
};

/* ── the door ────────────────────────────────────────────────────────────── */

export const startInputSchema = z.object({ source: productionSourceSchema, title: z.string().trim().min(1), board: productionBoardSchema }).strict();

export const HEAD_COLUMNS = "id, title, source_kind, source_ref, stage, board, started_at, started_by_kind, started_by";
export const TAKE_COLUMNS = "production_id, id, n, kind, state, beats, frames, prompt, seed, engine, job_id, dry, at, video, poster, error, duration_s, gpu_seconds, proven_at, proven_by, stale";

const opt = z.string().nullable();

export const headRowSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  source_kind: z.string(),
  source_ref: z.string().min(1),
  stage: productionStageSchema,
  board: z.string(),
  started_at: z.string(),
  started_by_kind: z.enum(ACTOR_KINDS),
  started_by: z.string().min(1),
});

export const takeRowSchema = z.object({
  production_id: z.string(),
  id: z.string().min(1),
  n: z.number().int().positive(),
  kind: z.enum(TAKE_KINDS),
  state: z.enum(TAKE_STATES),
  beats: z.string(),
  frames: z.string(),
  prompt: z.string().min(1),
  seed: z.number().int().nonnegative(),
  engine: z.string().min(1),
  job_id: z.string().min(1),
  dry: z.number(),
  at: z.string(),
  video: opt,
  poster: opt,
  error: opt,
  duration_s: z.number().nullable(),
  gpu_seconds: z.number().nullable(),
  proven_at: opt,
  proven_by: opt,
  stale: z.number(),
});

export const stringListSchema = z.array(z.string().min(1)).min(1);
