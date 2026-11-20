"use server";

// THE REEL STEPS' ACTS (spark reel-studio WP4): a job launched receipt-first, a table kept or sent back, and the
// words the release slots carry. Server Actions through the one action core (who, then the door, then the body,
// then the wire envelope); the step islands get them as props from the Steps server component and never import
// this module by value.
//
// THE LAUNCH IS RECEIPT -> CONFIRM. Without a token `launchReelJob` answers the receipt and launches nothing; the
// confirm carries the token back. A stale token answers the fresh receipt; a job of that kind already open answers
// that job. LIVE IS REFUSED under GRAVITONE_DRY_ONLY=1 here, before the door is asked, in the kernel's own words.
//
// The seat's inputs are read HERE from the recorded verdicts, never taken from the browser: a `reel-author` turn
// reads the film stop's redo pins in time order, a `reel-data` turn the note the table was sent back with.
import { z } from "zod";

import { err, ok, type Result } from "@gt/domain/errors";
import { receiptModeSchema } from "@gt/domain/produce.schema";
import { dryOnlyFrom } from "@gt/kernel/dryrun";

import type { ActionResult } from "../../../_server/actionCore.ts";
import { action } from "../../../_server/action.ts";
import { actorOf } from "../../../../lib/principal.ts";
import { launchReelJob, REEL_JOB_KINDS, type ReelJobKind, type ReelJobLaunch } from "../../../../lib/producers/reel.ts";
import { isReelSlug, readVerdicts, reelDir, type Recorded, type ReelPin, type ReelPublish } from "../../../../lib/reel/store.ts";
import { acceptTable, savePublish, sendBackTable } from "../../../../lib/reel/studio.ts";

const slugSchema = z.string().min(1).max(60).refine(isReelSlug, "not a reel slug");
const kindSchema = z.enum(REEL_JOB_KINDS as readonly [ReelJobKind, ...ReelJobKind[]]);

const launchInput = z.strictObject({ kind: kindSchema, slug: slugSchema, mode: receiptModeSchema, token: z.string().min(1).max(400).optional() });
const slugInput = z.strictObject({ slug: slugSchema });
const sendBackInput = z.strictObject({ slug: slugSchema, note: z.string().trim().min(1).max(2000), reasons: z.array(z.string().min(1).max(40)).max(11).optional() });
const publishInput = z.strictObject({ slug: slugSchema, title: z.string().max(200), description: z.string().max(6000), tags: z.array(z.string().max(120)).max(60) });

const LIVE_REFUSED = "live is refused: GRAVITONE_DRY_ONLY=1 - this process may only run dry";

/** What the seat reads, from the records: the redo pins in time order, the sent-back note. */
async function seatInputs(kind: ReelJobKind, slug: string): Promise<{ readonly notes?: readonly ReelPin[]; readonly note?: string }> {
  if (kind !== "reel-author" && kind !== "reel-data") return {};
  const stops = (await readVerdicts(reelDir(slug))).stops;
  if (kind === "reel-author") {
    const film = stops.film;
    const pins = film?.verdict === "reject" ? [...(film.pins ?? [])].sort((a, b) => a.t - b.t) : [];
    return pins.length > 0 ? { notes: pins } : {};
  }
  const data = stops.data;
  return data?.verdict === "reject" && data.note !== undefined ? { note: data.note } : {};
}

const launchAction = action("reel launch", launchInput, async (i, who): Promise<Result<ReelJobLaunch>> => {
  const dryOnly = dryOnlyFrom(process.env);
  if (i.mode === "live" && dryOnly) return err("refused", LIVE_REFUSED, { detail: "dry-only" });
  const seat = await seatInputs(i.kind, i.slug);
  return launchReelJob(i.kind, i.slug, { mode: i.mode, actor: actorOf(who), dryOnly, ...(i.token === undefined ? {} : { token: i.token }), ...seat });
});

const acceptAction = action("reel accept table", slugInput, (i): Promise<Result<Recorded>> => acceptTable(i.slug));
const sendBackAction = action("reel send back table", sendBackInput, (i): Promise<Result<Recorded>> => sendBackTable(i.slug, i.note, i.reasons ?? []));
const publishAction = action("reel publish words", publishInput, async (i): Promise<Result<ReelPublish>> => {
  const saved = await savePublish(i.slug, { title: i.title, description: i.description, tags: i.tags });
  return saved.ok ? ok(saved.value) : saved;
});

export type LaunchInput = z.input<typeof launchInput>;
export type PublishInput = z.input<typeof publishInput>;

export async function launchReelAction(input: LaunchInput): Promise<ActionResult<ReelJobLaunch>> {
  return launchAction(input);
}
export async function acceptTableAction(input: { readonly slug: string }): Promise<ActionResult<Recorded>> {
  return acceptAction(input);
}
export async function sendBackTableAction(input: { readonly slug: string; readonly note: string; readonly reasons?: readonly string[] }): Promise<ActionResult<Recorded>> {
  return sendBackAction(input);
}
export async function savePublishAction(input: PublishInput): Promise<ActionResult<ReelPublish>> {
  return publishAction(input);
}
