import { z } from "zod";
import { blobRefSchema } from "@gt/domain/blob";
import { CHARACTER_AUDIENCES, CHARACTER_ORIGINS } from "@gt/domain/production";

import type { ModuleMigrations } from "../migrate.ts";

// THE CHARACTER RECORD (spark concept-casting-stages S2): one row per character with a stable `chr:` id. Name is NOT
// identity: two characters may share one, so `name` is not unique. A character is never deleted; the Library is a
// projection of this table (lib/library/feeds/character.ts) and a use is a `character.used` event.
//
// `character_sources` is how an importer finds a character again: one row per stable source key, many per character
// when one person came through two pools (a kept Codex set and the muse-army card it was drawn from). `digest` is what
// the source said last time, so an unchanged source is not written at all.

const ORIGINS = `(${CHARACTER_ORIGINS.map((o) => `'${o}'`).join(", ")})`;
const POOLS = "('scout-character', 'muse-army', 'codex-kept')";

export const characterMigrations: ModuleMigrations = {
  module: "characters",
  steps: [
    {
      version: 1,
      sql: `
CREATE TABLE characters (
  id TEXT PRIMARY KEY CHECK (id GLOB 'chr:?*'),
  origin TEXT NOT NULL CHECK (origin IN ${ORIGINS}),
  name TEXT NOT NULL CHECK (length(name) > 0),
  card TEXT NOT NULL CHECK (json_valid(card) AND json_type(card) = 'object'),
  images TEXT NOT NULL CHECK (json_valid(images) AND json_type(images) = 'array'),
  voice_id TEXT,
  audience TEXT,
  slots TEXT CHECK (slots IS NULL OR (json_valid(slots) AND json_type(slots) = 'object')),
  saved INTEGER NOT NULL DEFAULT 0 CHECK (saved IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX characters_saved ON characters (saved, created_at);
CREATE TRIGGER characters_never_deleted BEFORE DELETE ON characters
BEGIN SELECT RAISE(ABORT, 'a character is never deleted; its uses point at it'); END;
CREATE TRIGGER characters_id_fixed BEFORE UPDATE OF id ON characters
BEGIN SELECT RAISE(ABORT, 'a character id is stable'); END;
CREATE TABLE character_sources (
  source_key TEXT PRIMARY KEY CHECK (length(source_key) > 0),
  character_id TEXT NOT NULL REFERENCES characters (id),
  pool TEXT NOT NULL CHECK (pool IN ${POOLS}),
  digest TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX character_sources_of ON character_sources (character_id);`,
    },
  ],
};

export const CHARACTER_COLUMNS = "id, origin, name, card, images, voice_id, audience, slots, saved, created_at, updated_at";

/** One picture of a character: what it shows and the bytes it is held by. */
export const characterImageSchema = z.object({ role: z.string().min(1), blob: blobRefSchema });
export type CharacterImage = z.output<typeof characterImageSchema>;
export const characterImagesSchema = z.array(characterImageSchema);

export const characterRowSchema = z.object({
  id: z.string(),
  origin: z.enum(CHARACTER_ORIGINS),
  name: z.string().min(1),
  card: z.string(),
  images: z.string(),
  voice_id: z.string().nullable(),
  audience: z.enum(CHARACTER_AUDIENCES).nullable(),
  slots: z.string().nullable(),
  saved: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const slotsSchema = z.record(z.string().min(1), z.string().min(1));
