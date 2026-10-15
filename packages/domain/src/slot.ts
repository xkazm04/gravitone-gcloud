import { z } from "zod";

import { libraryItemIdSchema, slotIdSchema } from "./ids.ts";
import { holderSchema } from "./job.ts";
import { slotMachine } from "./slot.machine.ts";

// A SLOT: one ratified thing, on one channel, at one time (plan §2.2) — v1's
// calendar state machine (lib/publish/schedule.ts, ported there from
// StatReel's ADR 006), kept transition for transition.

export const CHANNELS = ["youtube", "tiktok", "instagram"] as const;
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

export const slotSchema = z
  .object({
    id: slotIdSchema,
    libraryItemId: libraryItemIdSchema,
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
    /** The channel's own sentence, verbatim — the Calendar shows publish errors as they came. */
    error: z.string().min(1).optional(),
  })
  .superRefine((s, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    if ((s.state === "publishing") !== (s.claim !== undefined)) issue("claim", "a slot holds a claim exactly while it is publishing");
    if ((s.state === "missed") !== (s.missedAt !== undefined)) issue("missedAt", "a slot says when it was missed exactly while it is missed");
    if ((s.state === "published") !== (s.publicationId !== undefined)) issue("publicationId", "a published slot names its publication, and only it");
    if ((s.state === "failed") !== (s.error !== undefined)) issue("error", "a failed slot says why, and only a failed one");
    if (s.drift !== undefined && s.state !== "scheduled" && s.state !== "missed") issue("drift", "only a slot waiting to fire can drift");
  });
export type Slot = z.output<typeof slotSchema>;
