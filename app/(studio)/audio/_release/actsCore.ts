import "server-only";

import { z } from "zod";

import { ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { RELEASE_CHANNELS } from "@gt/domain/release";
import { releaseIdSchema, releaseSchema, releaseTrackSchema, sleeveSchema } from "@gt/domain/release.schema";

import { applyToRelease, createRelease } from "../../../../lib/release/store.ts";
import type { ReleaseOutcome } from "./act.ts";

// THE RELEASE ACTS, BODIES (spark studio-to-release WP1): what ./acts.ts's Server Actions run once the action core has
// resolved who and held the input to the doors below. Pure over the actor, so the tests run them without a request;
// the store is lib/release/store.ts (the one writer of the kernel `releases` table).
//
// THE EDIT'S DOOR holds each edit to the fields the wizard's own reducer arm sets (draft.ts ReleaseFields /
// TrackFields): applyEdit spreads `fields` onto the release, so a looser door would let a crafted patch set the
// status or the id. What the patched release may then HOLD is the release door's, re-checked whole by the store.

const takeId = z.string().min(1).max(80);
const token = z.string().min(8).max(500).optional();
const index = z.number().int().min(0).max(39);

const releaseFields = releaseSchema.pick({ title: true, version: true, artist: true, label: true, releaseDate: true, language: true, genre: true, upc: true, sleevePrompt: true }).partial();
const trackFields = releaseTrackSchema.pick({ title: true, version: true, isrc: true, explicit: true, lyrics: true, songwriters: true, credits: true, ai: true, rights: true }).partial();
/** The client's shelf card; the store replaces it with the take as the sound store reads it (lib/release/store.ts). */
const shelfTake = z.strictObject({
  takeId,
  title: z.string().max(200),
  durationS: z.number().min(0),
  audioHref: z.string().max(500).nullable(),
  provider: z.string().max(80),
  label: z.string().max(200).nullable(),
  lufs: z.number().nullable(),
  truePeakDb: z.number().nullable(),
});
const splits = releaseSchema.shape.splits;

const editSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("patch"), id: releaseIdSchema, fields: releaseFields }),
  z.strictObject({ type: z.literal("patchTrack"), id: releaseIdSchema, index, fields: trackFields }),
  z.strictObject({ type: z.literal("addTrack"), id: releaseIdSchema, take: shelfTake }),
  z.strictObject({ type: z.literal("removeTrack"), id: releaseIdSchema, index }),
  z.strictObject({ type: z.literal("moveTrack"), id: releaseIdSchema, from: index, to: index }),
  z.strictObject({ type: z.literal("sleeve"), id: releaseIdSchema, sleeve: sleeveSchema.nullable() }),
  z.strictObject({ type: z.literal("toggleChannel"), id: releaseIdSchema, channel: z.enum(RELEASE_CHANNELS) }),
  z.strictObject({ type: z.literal("splits"), id: releaseIdSchema, splits }),
  z.strictObject({ type: z.literal("schedule"), id: releaseIdSchema }),
]);

const proposalIds = z.array(z.string().regex(/^[a-z0-9-]{1,40}$/)).min(1).max(200);

const actSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("edit"), edit: editSchema }),
  z.strictObject({ kind: z.literal("accept"), proposalIds }),
  z.strictObject({ kind: z.literal("dismiss"), proposalIds }),
]);

export const releaseThisInput = z.strictObject({ takeId, sessionId: z.string().min(1).max(200).nullable(), token });
export const createInput = z.strictObject({ takeIds: z.array(takeId).min(1).max(40), token });
export const applyInput = z.strictObject({ id: releaseIdSchema, version: z.number().int().positive(), act: actSchema, token });

/** "Release this": the take kept and finalized with the release title as its label, and the release made, in one act. */
export async function releaseThisBody(i: z.output<typeof releaseThisInput>, by: Actor): Promise<Result<ReleaseOutcome>> {
  const r = await createRelease({ takeIds: [i.takeId], sessionId: i.sessionId, keepTake: true, by });
  return r.ok ? ok({ record: r.value, stale: false }) : r;
}

/** A release from picked shelf takes: no session, nothing kept that was not kept already. */
export async function createBody(i: z.output<typeof createInput>, by: Actor): Promise<Result<ReleaseOutcome>> {
  const r = await createRelease({ takeIds: i.takeIds, sessionId: null, keepTake: false, by });
  return r.ok ? ok({ record: r.value, stale: false }) : r;
}

export function applyBody(i: z.output<typeof applyInput>, by: Actor): Promise<Result<ReleaseOutcome>> {
  return applyToRelease({ id: i.id, version: i.version, act: i.act, by });
}
