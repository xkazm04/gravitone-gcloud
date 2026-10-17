import { z } from "zod";

import { libraryItemIdSchema, partIdSchema, slotIdSchema } from "./ids.ts";
import { holderSchema } from "./job.ts";
import { slotMachine } from "./slot.machine.ts";

// A SLOT: one ratified thing, on one channel, at one time (plan §2.2) — v1's
// calendar state machine (lib/publish/schedule.ts, ported there from
// StatReel's ADR 006), kept transition for transition.

// `blog` (owner ruling 2026-10-17): an article approved on the Board takes a slot,
// and that slot "publishes" by the approve's own pull request into ai-registry
// (lib/articles) - so its publication is a PR, never an upload.
export const CHANNELS = ["youtube", "tiktok", "instagram", "blog"] as const;
export const channelSchema = z.enum(CHANNELS);
export type Channel = z.output<typeof channelSchema>;

/** The table and its union live in ./slot.machine.ts, zod-free, so a client can hold them. */
export { slotMachine, type SlotState } from "./slot.machine.ts";
export const slotStateSchema = z.enum(slotMachine.states);

/** v1's two ways a scheduled slot becomes unfireable. A drifted slot is never
 *  claimed, and the drift clears itself when its cause does. v1 had to carry
 *  this as a magic string in `error` (its wire contract was fixed); here it
 *  is a field of its own. */
export const SLOT_DRIFTS = ["export_missing", "channel_not_wired"] as const;
export type SlotDrift = (typeof SLOT_DRIFTS)[number];

/** v1's sentence for a claim whose holder died mid-publish (lib/publish/schedule.ts
 *  INTERRUPTED_TEXT), kept word for word: an interrupted slot is `failed` with this as
 *  its error, never a state of its own - interruption is why the verdict was needed,
 *  not a fifth verdict (job-coordination: terminal-state-recovery). */
export const INTERRUPTED_TEXT = "interrupted before the publish finished";

/** v1's PUBLISH_MISSED_MIN default: a slot overdue by more than this is never published late. */
export const MISSED_WINDOW_MIN = 60;

/** THE SLOT <-> LIBRARY JOIN. v1 slotted an `exportId`; the Library already feeds every
 *  export as `video:export:<exportId>` (lib/library/feeds/studio.ts), so a slot names that
 *  item and the export is recoverable from it. A blog slot's item is the article run its
 *  approve opened a PR for. */
export const slotItemId = {
  export: (exportId: string): string => `video:export:${exportId}`,
  article: (runId: string): string => `article:${runId}`,
} as const;

/** The v1 export id a slot's item names, or undefined for an item that is not an export. */
export function exportIdOf(libraryItemId: string): string | undefined {
  const prefix = "video:export:";
  return libraryItemId.startsWith(prefix) && libraryItemId.length > prefix.length ? libraryItemId.slice(prefix.length) : undefined;
}

export const slotSchema = z
  .object({
    id: slotIdSchema,
    libraryItemId: libraryItemIdSchema,
    /** The plan's slot part this slot places (plan.ts `slotted`), when a project asked for it. */
    partId: partIdSchema.optional(),
    channel: channelSchema,
    at: z.iso.datetime(),
    state: slotStateSchema,
    title: z.string().trim().min(1),
    description: z.string(),
    tags: z.array(z.string().min(1)),
    /** Who claimed it, from the claim until the publish lands or fails. */
    claim: z.object({ holder: holderSchema, at: z.iso.datetime() }).optional(),
    drift: z.enum(SLOT_DRIFTS).optional(),
    missedAt: z.iso.datetime().optional(),
    publicationId: z.string().min(1).optional(),
    /** The channel's own sentence, verbatim — the Calendar shows publish errors as they came.
     *  Set only by a failure; a person cancelling that failed slot KEEPS it (the month draws it
     *  dim), because erasing it would rewrite why the slot never went out. Missed and drift
     *  are fields of their own and never borrow this string, as v1 had to. */
    error: z.string().min(1).optional(),
  })
  .superRefine((s, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    if ((s.state === "publishing") !== (s.claim !== undefined)) issue("claim", "a slot holds a claim exactly while it is publishing");
    if ((s.state === "missed") !== (s.missedAt !== undefined)) issue("missedAt", "a slot says when it was missed exactly while it is missed");
    if ((s.state === "published") !== (s.publicationId !== undefined)) issue("publicationId", "a published slot names its publication, and only it");
    if (s.state === "failed" && s.error === undefined) issue("error", "a failed slot says why");
    if (s.error !== undefined && s.state !== "failed" && s.state !== "cancelled") issue("error", "only a failed slot, or one cancelled after failing, carries an error");
    if (s.drift !== undefined && s.state !== "scheduled" && s.state !== "missed") issue("drift", "only a slot waiting to fire can drift");
  });
export type Slot = z.output<typeof slotSchema>;
