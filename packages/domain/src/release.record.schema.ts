import { z } from "zod";

import { parseAt, type Parsed } from "./door.ts";
import { err, ok, type Result } from "./errors.ts";
import { parseProposalPath, type ProposalPath } from "./release.record.ts";
import { releaseSchema } from "./release.schema.ts";
import type { Release } from "./release.ts";

// THE RELEASE RECORD'S DOOR (spark studio-to-release). A proposal's value is validated by APPLYING it to the release
// and re-parsing the whole release through the release door - one authority for what a release may hold, no
// per-field schema kept beside it (registry schema-driven-ui: one authority per vocabulary).

export const proposalPathSchema = z.string().refine((p) => parseProposalPath(p) !== null, "not a field a proposal may set");

export const releaseProposalSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  path: proposalPathSchema,
  value: z.json(),
  source: z.string().trim().min(1).max(300),
  turnId: z.string().min(1).max(200).nullable(),
  at: z.string().min(1),
});

export const releaseRecordSchema = z.strictObject({
  release: releaseSchema,
  version: z.number().int().positive(),
  sessionId: z.string().min(1).max(200).nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  pending: z.array(releaseProposalSchema).max(200),
});

export const parseReleaseRecord = (raw: unknown): Result<Parsed<z.output<typeof releaseRecordSchema>>> => parseAt("release record", releaseRecordSchema, raw);

/** What the agent sends for one field (the op's input): the store gives it an id and a time. */
export const proposalInputSchema = z.strictObject({
  path: proposalPathSchema,
  value: z.json(),
  source: z.string().trim().min(1).max(300),
});


function setIn(release: Release, path: ProposalPath, value: unknown): Release | null {
  const p = parseProposalPath(path);
  if (p === null) return null;
  if (p.track === null) {
    if (p.field === "genre.primary") return { ...release, genre: { ...release.genre, primary: value as Release["genre"]["primary"] } };
    if (p.field === "genre.secondary") return { ...release, genre: { ...release.genre, secondary: value as Release["genre"]["secondary"] } };
    return { ...release, [p.field]: value } as Release;
  }
  const i = p.track - 1;
  if (i >= release.tracks.length) return null;
  return { ...release, tracks: release.tracks.map((t, k) => (k === i ? ({ ...t, [p.field]: value } as typeof t) : t)) };
}

/**
 * The release with `value` at `path`, re-checked whole through the release door. A path past the last track, or a
 * value the release could not hold (a genre outside GENRES, a 300-character title, a credit without a role) is
 * refused with the door's sentence - the same refusal the operator's own edit would meet.
 */
export function applyProposal(release: Release, path: ProposalPath, value: unknown): Result<Release> {
  const next = setIn(release, path, value);
  if (next === null) return err("invalid", `${path} names no field of this release (it has ${release.tracks.length} track(s))`);
  const parsed = parseAt(`proposal ${path}`, releaseSchema, next);
  return parsed.ok ? ok(next) : parsed;
}
