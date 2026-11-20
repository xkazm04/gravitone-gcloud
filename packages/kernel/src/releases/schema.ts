import { z } from "zod";

import type { ModuleMigrations } from "../migrate.ts";

// THE RELEASE RECORD, THE TABLE (spark studio-to-release WP1): one row per release - the release itself (the JSON the
// release door holds, @gt/domain/release.schema), the agent's PENDING proposals beside it, the version every write is
// compared against, and the studio session it was born in. The store's half is ./store.ts.
//
// The schema holds what the store's code holds, so a hand edit cannot make a record the code would never have written:
//   - the id is `rel-` + 12 hex and is the release's own (`$.id` of the JSON), and the row's status is the release's;
//   - what a release was born as (its id, its session, its birth instant) is fixed;
//   - the version moves by exactly one per write: compare-and-swap is the store's, and a write that skips or repeats a
//     version is refused here as well, whoever wrote it;
//   - a release is never deleted (it is dropped from a catalog by its status, never from the store).

const HEX12 = "[0-9a-f]".repeat(12);

export const releaseMigrations: ModuleMigrations = {
  module: "releases",
  steps: [
    {
      version: 1,
      sql: `
CREATE TABLE releases (
  id TEXT PRIMARY KEY CHECK (length(id) = 16 AND id GLOB 'rel-${HEX12}'),
  version INTEGER NOT NULL CHECK (version >= 1),
  session_id TEXT CHECK (session_id IS NULL OR length(session_id) BETWEEN 1 AND 200),
  status TEXT NOT NULL CHECK (status IN ('draft', 'ready', 'scheduled', 'published')),
  release TEXT NOT NULL CHECK (json_valid(release) AND json_type(release) = 'object'),
  pending TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(pending) AND json_type(pending) = 'array'),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL CHECK (updated_at >= created_at),
  CHECK (json_extract(release, '$.id') = id),
  CHECK (json_extract(release, '$.status') = status)
);
CREATE INDEX releases_created ON releases (created_at);
CREATE TRIGGER releases_fixed_at_birth BEFORE UPDATE OF id, session_id, created_at ON releases
BEGIN SELECT RAISE(ABORT, 'a release is fixed at birth: its id, its session and when it was made'); END;
CREATE TRIGGER releases_version_by_one BEFORE UPDATE ON releases
WHEN NEW.version <> OLD.version + 1
BEGIN SELECT RAISE(ABORT, 'a release write moves its version by exactly one'); END;
CREATE TRIGGER releases_never_deleted BEFORE DELETE ON releases
BEGIN SELECT RAISE(ABORT, 'a release is never deleted'); END;`,
    },
  ],
};

/* ── the row door ────────────────────────────────────────────────────────── */

export const RELEASE_COLUMNS = "id, version, session_id, status, release, pending, created_at, updated_at";

export const releaseRowSchema = z.object({
  id: z.string(),
  version: z.number().int().positive(),
  session_id: z.string().nullable(),
  status: z.string(),
  release: z.string(),
  pending: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});
