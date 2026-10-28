import { z } from "zod";
import { ACTOR_KINDS } from "@gt/domain/event";
import { GENRE_ID_RE, VENTURE_ID_RE, VENTURE_KINDS } from "@gt/domain/genre";

import type { ModuleMigrations } from "../migrate.ts";

// THE GENRE AND VENTURE HEADS (spark scout-vision S2) and the door their rows come back through.
//
// A head is the act of birth and, at most once, the act of retirement - nothing a night proves is stored
// here (a genre's state is derived from the nights' verdicts, lib/foundry/scout/genres.ts). So the schema
// holds what the store's code holds, and a hand edit cannot make a head the code would never have written:
//   - what a head was born as (its id, name, proposal, words, frame, instant and actor) is fixed at birth;
//   - one head per kept proposal (`proposal` UNIQUE): the Board's apply may be redelivered;
//   - retiring is terminal: a retired head is never un-retired nor retired again;
//   - a genre is tied to a venture once, while live, and never untied;
//   - a head is never deleted, and `venture_ops` (every birth, tie and retirement) is append-only.
// `ventures` comes first: a genre's `venture_id` references it.

export const ventureMigrations: ModuleMigrations = {
  module: "ventures",
  steps: [
    {
      version: 1,
      sql: `
CREATE TABLE ventures (
  id TEXT PRIMARY KEY CHECK (id GLOB 'vn-?*'),
  name TEXT NOT NULL CHECK (length(name) > 0),
  kind TEXT NOT NULL CHECK (kind IN ('channel', 'album', 'game')),
  frame TEXT NOT NULL CHECK (json_valid(frame) AND json_type(frame) = 'object' AND json_type(frame, '$.genres') = 'array'),
  proposal TEXT NOT NULL UNIQUE CHECK (length(proposal) > 0),
  born_at TEXT NOT NULL,
  born_by_kind TEXT NOT NULL CHECK (born_by_kind IN ('operator', 'agent', 'machine')),
  born_by TEXT NOT NULL CHECK (length(born_by) > 0),
  retired_at TEXT CHECK (retired_at IS NULL OR retired_at >= born_at),
  CHECK (kind <> 'channel' OR json_array_length(frame, '$.genres') > 0)
);
CREATE TABLE genres (
  id TEXT PRIMARY KEY CHECK (id GLOB 'gn-?*'),
  name TEXT NOT NULL CHECK (length(name) > 0),
  born_from TEXT NOT NULL CHECK (length(born_from) > 0),
  proposal TEXT NOT NULL UNIQUE CHECK (length(proposal) > 0),
  use TEXT NOT NULL CHECK (length(use) > 0),
  look TEXT NOT NULL CHECK (length(look) > 0),
  grammar TEXT NOT NULL CHECK (json_valid(grammar) AND json_type(grammar) = 'array'),
  venture_id TEXT REFERENCES ventures (id),
  born_at TEXT NOT NULL,
  born_by_kind TEXT NOT NULL CHECK (born_by_kind IN ('operator', 'agent', 'machine')),
  born_by TEXT NOT NULL CHECK (length(born_by) > 0),
  retired_at TEXT CHECK (retired_at IS NULL OR retired_at >= born_at)
);
CREATE INDEX genres_venture ON genres (venture_id) WHERE venture_id IS NOT NULL;
CREATE TRIGGER ventures_fixed_at_birth BEFORE UPDATE OF id, name, kind, frame, proposal, born_at, born_by_kind, born_by ON ventures
BEGIN SELECT RAISE(ABORT, 'a venture is fixed when it is born'); END;
CREATE TRIGGER ventures_retire_once BEFORE UPDATE OF retired_at ON ventures
WHEN OLD.retired_at IS NOT NULL OR NEW.retired_at IS NULL
BEGIN SELECT RAISE(ABORT, 'retiring a venture is terminal, and happens once'); END;
CREATE TRIGGER ventures_never_deleted BEFORE DELETE ON ventures
BEGIN SELECT RAISE(ABORT, 'a venture is retired, never deleted'); END;
CREATE TRIGGER genres_fixed_at_birth BEFORE UPDATE OF id, name, born_from, proposal, use, look, grammar, born_at, born_by_kind, born_by ON genres
BEGIN SELECT RAISE(ABORT, 'a genre is fixed when it is born'); END;
CREATE TRIGGER genres_retire_once BEFORE UPDATE OF retired_at ON genres
WHEN OLD.retired_at IS NOT NULL OR NEW.retired_at IS NULL
BEGIN SELECT RAISE(ABORT, 'retiring a genre is terminal, and happens once'); END;
CREATE TRIGGER genres_tied_once BEFORE UPDATE OF venture_id ON genres
WHEN OLD.venture_id IS NOT NULL OR NEW.venture_id IS NULL OR OLD.retired_at IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'a live genre is tied to one venture, once'); END;
CREATE TRIGGER genres_never_deleted BEFORE DELETE ON genres
BEGIN SELECT RAISE(ABORT, 'a genre is retired, never deleted'); END;
CREATE TABLE venture_ops (
  seq INTEGER PRIMARY KEY,
  subject_kind TEXT NOT NULL CHECK (subject_kind IN ('genre', 'venture')),
  subject_id TEXT NOT NULL CHECK (length(subject_id) > 0),
  op TEXT NOT NULL CHECK (op IN ('born', 'retired', 'tied')),
  at TEXT NOT NULL,
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('operator', 'agent', 'machine')),
  actor_id TEXT NOT NULL CHECK (length(actor_id) > 0),
  data TEXT NOT NULL CHECK (json_valid(data) AND json_type(data) = 'object'),
  CHECK (op <> 'tied' OR subject_kind = 'genre')
);
CREATE INDEX venture_ops_subject ON venture_ops (subject_kind, subject_id, seq);
CREATE TRIGGER venture_ops_no_update BEFORE UPDATE ON venture_ops
BEGIN SELECT RAISE(ABORT, 'venture_ops is append-only'); END;
CREATE TRIGGER venture_ops_no_delete BEFORE DELETE ON venture_ops
BEGIN SELECT RAISE(ABORT, 'venture_ops is append-only'); END;`,
    },
  ],
};

/* ── the door ────────────────────────────────────────────────────────────── */

const words = z.string().trim().min(1);
/** `<night>/<c-id>`: the night and the candidate a head rests on. */
const ref = z.string().regex(/^[^/\s]+\/[^/\s]+$/, "a `<night>/<c-id>` reference");

/** What a kept `genre` proposal births (./store.ts GenreBirth). */
export const genreBirthSchema = z
  .object({ name: words, bornFrom: ref, proposal: ref, use: words, look: words, grammar: z.array(words) })
  .strict();

/** The frame later nights produce inside (@gt/domain/genre VentureFrame). */
export const ventureFrameSchema = z
  .object({
    tone: words,
    audience: words,
    format: words,
    look: words,
    genres: z.array(z.string().regex(GENRE_ID_RE)),
    characters: z.array(words).optional(),
  })
  .strict();

/** What a kept `venture` proposal births (./store.ts VentureBirth). */
export const ventureBirthSchema = z.object({ name: words, kind: z.enum(VENTURE_KINDS), frame: ventureFrameSchema, proposal: ref }).strict();

export const grammarSchema = z.array(z.string());

const stamped = {
  name: z.string().min(1),
  proposal: z.string().min(1),
  born_at: z.string(),
  born_by_kind: z.enum(ACTOR_KINDS),
  born_by: z.string().min(1),
  retired_at: z.string().nullable(),
};

/** One stored genre; `grammar` is text here and parses through grammarSchema. */
export const genreRowSchema = z.object({
  id: z.string().regex(GENRE_ID_RE),
  born_from: z.string().min(1),
  use: z.string().min(1),
  look: z.string().min(1),
  grammar: z.string(),
  venture_id: z.string().regex(VENTURE_ID_RE).nullable(),
  ...stamped,
});

/** One stored venture; `frame` is text here and parses through ventureFrameSchema. */
export const ventureRowSchema = z.object({ id: z.string().regex(VENTURE_ID_RE), kind: z.enum(VENTURE_KINDS), frame: z.string(), ...stamped });

export const GENRE_COLUMNS = "id, name, born_from, proposal, use, look, grammar, venture_id, born_at, born_by_kind, born_by, retired_at";
export const VENTURE_COLUMNS = "id, name, kind, frame, proposal, born_at, born_by_kind, born_by, retired_at";
