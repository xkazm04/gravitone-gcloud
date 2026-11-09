import { z } from "zod";
import { ACTOR_KINDS } from "@gt/domain/event";
import { CUT_FORMATS, CUT_STATES, TAKE_KINDS, TAKE_STATES, productionBoardSchema, productionSourceSchema, productionStageSchema } from "@gt/domain/production";

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
    // The casting round (spark concept-casting-stages S4): a production's roles and the jobs writing them, one row per
    // round, one row per candidate. Who cast whom is the role's `cast` (in `roles`); a round is never deleted.
    {
      version: 2,
      sql: `
ALTER TABLE productions ADD COLUMN roles TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(roles) AND json_type(roles) = 'array');
ALTER TABLE productions ADD COLUMN cast_jobs TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(cast_jobs) AND json_type(cast_jobs) = 'object');
CREATE TABLE cast_rounds (
  production_id TEXT NOT NULL REFERENCES productions (id),
  id TEXT NOT NULL CHECK (length(id) > 0),
  role_id TEXT NOT NULL CHECK (length(role_id) > 0),
  n INTEGER NOT NULL CHECK (n > 0),
  at TEXT NOT NULL,
  dry INTEGER NOT NULL DEFAULT 0 CHECK (dry IN (0, 1)),
  voice_job_id TEXT NOT NULL CHECK (length(voice_job_id) > 0),
  draw_job_id TEXT,
  draw_attempt INTEGER NOT NULL DEFAULT 0 CHECK (draw_attempt >= 0),
  heard TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(heard) AND json_type(heard) = 'object'),
  pick_character TEXT,
  pick_voice TEXT,
  save_to_library INTEGER NOT NULL DEFAULT 0 CHECK (save_to_library IN (0, 1)),
  picked_at TEXT,
  picked_by TEXT,
  create_job_id TEXT,
  PRIMARY KEY (production_id, id),
  UNIQUE (production_id, role_id, n)
);
CREATE TRIGGER cast_rounds_never_deleted BEFORE DELETE ON cast_rounds
BEGIN SELECT RAISE(ABORT, 'a casting round is never deleted'); END;
CREATE TABLE cast_candidates (
  production_id TEXT NOT NULL,
  round_id TEXT NOT NULL,
  slot INTEGER NOT NULL CHECK (slot BETWEEN 1 AND 5),
  origin TEXT NOT NULL CHECK (origin IN ('reused', 'new')),
  state TEXT NOT NULL CHECK (state IN ('pending', 'ready', 'failed', 'refused')),
  character_id TEXT,
  card TEXT CHECK (card IS NULL OR (json_valid(card) AND json_type(card) = 'object')),
  images TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(images) AND json_type(images) = 'array'),
  blobs TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(blobs) AND json_type(blobs) = 'array'),
  match TEXT,
  error TEXT,
  PRIMARY KEY (production_id, round_id, slot),
  FOREIGN KEY (production_id, round_id) REFERENCES cast_rounds (production_id, id),
  CHECK (origin <> 'reused' OR (character_id IS NOT NULL AND card IS NOT NULL)),
  CHECK (state <> 'failed' OR error IS NOT NULL),
  CHECK (state <> 'refused' OR error IS NOT NULL)
);
CREATE TRIGGER cast_candidates_never_deleted BEFORE DELETE ON cast_candidates
BEGIN SELECT RAISE(ABORT, 'a casting candidate is never deleted'); END;`,
    },
    // The audio decision and the final cut (spark concept-casting-stages S5): one audio row on the head, cuts appended, the one voice proof.
    {
      version: 3,
      sql: `
ALTER TABLE productions ADD COLUMN audio TEXT CHECK (audio IS NULL OR (json_valid(audio) AND json_type(audio) = 'object'));
ALTER TABLE production_takes ADD COLUMN speaking TEXT CHECK (speaking IS NULL OR (json_valid(speaking) AND json_type(speaking) = 'object'));
CREATE TRIGGER production_takes_speaking_fixed BEFORE UPDATE OF speaking ON production_takes
BEGIN SELECT RAISE(ABORT, 'a take is fixed when it is requested; only its outcome and proof are written'); END;
CREATE TABLE production_cuts (
  production_id TEXT NOT NULL REFERENCES productions (id),
  id TEXT NOT NULL CHECK (length(id) > 0),
  n INTEGER NOT NULL CHECK (n > 0),
  format TEXT NOT NULL CHECK (format IN ('trailer', 'music-clip')),
  state TEXT NOT NULL CHECK (state IN ('assembling', 'on-board', 'approved', 'returned', 'failed', 'rehearsed')),
  takes TEXT NOT NULL CHECK (json_valid(takes) AND json_type(takes) = 'array'),
  receipt TEXT,
  job_id TEXT NOT NULL CHECK (length(job_id) > 0),
  dry INTEGER NOT NULL DEFAULT 0 CHECK (dry IN (0, 1)),
  packet_id TEXT,
  video TEXT,
  error TEXT,
  duration_s REAL CHECK (duration_s IS NULL OR duration_s >= 0),
  note TEXT,
  at TEXT NOT NULL,
  judged_at TEXT,
  judged_by TEXT,
  PRIMARY KEY (production_id, id),
  UNIQUE (production_id, n),
  CHECK (state <> 'failed' OR error IS NOT NULL),
  CHECK (state <> 'on-board' OR (video IS NOT NULL AND packet_id IS NOT NULL))
);
CREATE TRIGGER production_cuts_fixed BEFORE UPDATE OF production_id, id, n, format, takes, job_id, dry, at ON production_cuts
BEGIN SELECT RAISE(ABORT, 'a cut is fixed when it is launched; only its outcome and verdict are written'); END;
CREATE TRIGGER production_cuts_never_deleted BEFORE DELETE ON production_cuts
BEGIN SELECT RAISE(ABORT, 'a cut is never deleted'); END;
CREATE TABLE production_voice_proof (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  outcome TEXT NOT NULL CHECK (outcome IN ('held', 'failed')),
  note TEXT,
  evidence TEXT,
  at TEXT NOT NULL,
  by_id TEXT NOT NULL CHECK (length(by_id) > 0)
);`,
    },
    // Ventures and lessons (spark concept-casting-stages S6): a production joins one venture, once; each dimension's lesson is one row. `venture_id` has no foreign key: this module migrates without `ventures` (its own tests do), and ./venture.ts checks the head exists.
    {
      version: 4,
      sql: `
ALTER TABLE productions ADD COLUMN venture_id TEXT CHECK (venture_id IS NULL OR venture_id GLOB 'vn-?*');
CREATE TRIGGER productions_venture_once BEFORE UPDATE OF venture_id ON productions
WHEN OLD.venture_id IS NOT NULL OR NEW.venture_id IS NULL
BEGIN SELECT RAISE(ABORT, 'a production joins one venture, once'); END;
CREATE TABLE production_lessons (
  production_id TEXT NOT NULL REFERENCES productions (id),
  id TEXT NOT NULL CHECK (length(id) > 0),
  dimension TEXT NOT NULL CHECK (dimension IN ('beats', 'art-style', 'technique')),
  state TEXT NOT NULL CHECK (state IN ('proposed', 'accepted', 'nothing')),
  text TEXT NOT NULL CHECK (length(text) > 0),
  proposed_text TEXT CHECK (proposed_text IS NULL OR length(proposed_text) > 0),
  drawn_from TEXT NOT NULL CHECK (json_valid(drawn_from) AND json_type(drawn_from) = 'array'),
  dry INTEGER NOT NULL DEFAULT 0 CHECK (dry IN (0, 1)),
  proposed_at TEXT NOT NULL,
  accepted_at TEXT,
  accepted_by TEXT,
  PRIMARY KEY (production_id, id),
  UNIQUE (production_id, dimension),
  CHECK (state <> 'accepted' OR (accepted_at IS NOT NULL AND accepted_by IS NOT NULL AND dry = 0)),
  CHECK (state = 'nothing' OR json_array_length(drawn_from) > 0)
);
CREATE TRIGGER production_lessons_accepted_fixed BEFORE UPDATE ON production_lessons
WHEN OLD.state <> 'proposed'
BEGIN SELECT RAISE(ABORT, 'an accepted lesson is fixed'); END;
CREATE TRIGGER production_lessons_never_deleted BEFORE DELETE ON production_lessons
BEGIN SELECT RAISE(ABORT, 'a lesson is never deleted'); END;
CREATE INDEX production_lessons_accepted ON production_lessons (accepted_at) WHERE state = 'accepted';`,
    },
  ],
};

/* ── the door ────────────────────────────────────────────────────────────── */

export const startInputSchema = z.object({ source: productionSourceSchema, title: z.string().trim().min(1), board: productionBoardSchema }).strict();

export const HEAD_COLUMNS = "id, title, source_kind, source_ref, stage, board, started_at, started_by_kind, started_by, roles, cast_jobs, audio, venture_id";
export const TAKE_COLUMNS = "production_id, id, n, kind, state, beats, frames, prompt, seed, engine, job_id, dry, at, video, poster, error, duration_s, gpu_seconds, proven_at, proven_by, stale, speaking";
export const CUT_COLUMNS = "production_id, id, n, format, state, takes, receipt, job_id, dry, packet_id, video, error, duration_s, note, at, judged_at, judged_by";

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
  roles: z.string(),
  cast_jobs: z.string(),
  audio: z.string().nullable(),
  venture_id: z.string().nullable(),
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
  speaking: z.string().nullable(),
});

export const cutRowSchema = z.object({
  production_id: z.string(),
  id: z.string().min(1),
  n: z.number().int().positive(),
  format: z.enum(CUT_FORMATS),
  state: z.enum(CUT_STATES),
  takes: z.string(),
  receipt: opt,
  job_id: z.string().min(1),
  dry: z.number(),
  packet_id: opt,
  video: opt,
  error: opt,
  duration_s: z.number().nullable(),
  note: opt,
  at: z.string(),
  judged_at: opt,
  judged_by: opt,
});

export const LESSON_COLUMNS = "production_id, id, dimension, state, text, proposed_text, drawn_from, dry, proposed_at, accepted_at, accepted_by";

export const lessonRowSchema = z.object({
  production_id: z.string(),
  id: z.string().min(1),
  dimension: z.string(),
  state: z.string(),
  text: z.string().min(1),
  proposed_text: opt,
  drawn_from: z.string(),
  dry: z.number(),
  proposed_at: z.string(),
  accepted_at: opt,
  accepted_by: opt,
});

export const stringListSchema = z.array(z.string().min(1)).min(1);
