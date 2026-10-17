import { err, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { slotItemId } from "@gt/domain/slot";
import type { SlotState } from "@gt/domain/slot.machine";
import { publishByAct } from "@gt/kernel/slots/outcome";
import { getSlot } from "@gt/kernel/slots/read";
import type { SlotRow } from "@gt/kernel/slots/schema";
import { createSlot, publishNow } from "@gt/kernel/slots/write";
import type { Store } from "@gt/kernel/store";
import { decodeSchedule, proposeAt, type ScheduleIntent } from "@gt/ui/components/review/schedule.ts";

import type { ArticleRun } from "../../../articles/types.ts";

// AN APPROVED ARTICLE ON THE CALENDAR (owner ruling 4, Phase 6) - the blog slot its approve makes,
// and the landing that publishes it. Beside ./article.ts, which stays the v1 adapter; this is the
// half that writes the kernel's calendar.
//
// THE SLOT IS MADE BEFORE THE APPROVE IS HANDED TO v1, in the commit's apply. Its pull request is
// opened by the landing job the approve starts, and the landing publishes the slot through
// `publishByAct` (@gt/kernel/slots/outcome: claim and land in one commit); a slot made AFTER the
// approve could lose that race to a fast landing and wait for ever. A slot whose approve then
// never lands is not unmade: L57's sweep reads it missed, visibly (sweep-core "blog").
//
// IDEMPOTENT ON THE SLOT'S OWN RECORD, not on its name (delivery-guarantees: marker-certifies-what-
// was-done): the id is derived from the run (`sl-art-<runId>`, the prototype's prefix), so every
// delivery of one commit names one slot; a slot of that id holding ANOTHER item or channel is a
// conflict, never "already done".
//
// THE SCHEDULE is the kept decision's note (@gt/ui review/schedule.ts): what the operator saw
// scheduled at the preview is what the apply schedules, because the note is in the token. A post
// approved with no calendar line (the CLI, an older desk) gets the prototype's proposal, taken
// from the COMMIT's instant so a redelivery a day later proposes the same hour.

export const blogSlotId = (runId: string): string => `sl-art-${runId}`;

/** The schedule a kept post carries, or the proposal from the commit's instant. */
export function blogScheduleOf(note: string | undefined, commitAt: string): Result<ScheduleIntent> {
  const d = decodeSchedule(note);
  if (d.kind === "invalid") return err("invalid", d.error);
  if (d.kind === "none") return ok({ channel: "blog", publishAt: proposeAt(Date.parse(commitAt)) });
  if (d.schedule.channel !== "blog") return err("invalid", `an article goes out by its pull request on blog, not on ${d.schedule.channel}`);
  return ok(d.schedule);
}

export type BlogSlotInput = {
  readonly runId: string;
  readonly title: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly schedule: ScheduleIntent;
};

const holds = (row: SlotRow, runId: string): boolean => row.slot.libraryItemId === slotItemId.article(runId) && row.slot.channel === "blog";

/** The run's blog slot: found when a delivery already made it, made otherwise. */
export function ensureBlogSlot(store: Store, input: BlogSlotInput, by: Actor): Result<SlotRow> {
  const id = blogSlotId(input.runId);
  const found = (): Result<SlotRow> | undefined => {
    const held = getSlot(store, id);
    if (!held.ok) return held.error.code === "not-found" ? undefined : held;
    return holds(held.value, input.runId) ? held : err("conflict", `slot ${id} holds ${held.value.slot.libraryItemId} on ${held.value.slot.channel}, not article ${input.runId} on blog`);
  };
  const before = found();
  if (before !== undefined) return before;
  const made = createSlot(store, { id, libraryItemId: slotItemId.article(input.runId), channel: "blog", at: input.schedule.publishAt, title: input.title, description: input.description, tags: input.tags }, by);
  if (made.ok || made.error.code !== "conflict") return made;
  // Two deliveries of one commit raced (a reaped lease, a redrive): the slot it lost to is this one.
  return found() ?? made;
}

/** The pull request's number, which is what the platform calls it (Publication.platformId). */
export function prNumberOf(url: string): string | undefined {
  return /\/pull\/(\d+)(?:[/?#]|$)/.exec(url)?.[1];
}

export type BlogLanding =
  | { readonly kind: "waiting" }
  | { readonly kind: "no-slot" }
  | { readonly kind: "published"; readonly slotId: string; readonly publicationId?: string }
  /** A slot the operator cancelled stays cancelled: the pull request is the run's, not the slot's. */
  | { readonly kind: "left"; readonly slotId: string; readonly state: SlotState };

const published = (row: SlotRow): BlogLanding => ({ kind: "published", slotId: row.slot.id, ...(row.slot.publicationId === undefined ? {} : { publicationId: row.slot.publicationId }) });

/**
 * The landing's half: once the run is `landed` with its pull request, publish its blog slot with
 * the PR as the publication. Safe to call any number of times, from the landing job and from a
 * redelivered apply: a published slot is answered as it is. A slot the sweep read MISSED (the
 * landing came after its window) goes out now - the pull request exists, and a calendar that
 * says it never went out would be the lie the window exists to prevent, told the other way.
 */
export function landBlogSlot(store: Store, run: Pick<ArticleRun, "id" | "status" | "landing" | "landedAt">, by: Actor, now: number): Result<BlogLanding> {
  const url = run.landing?.prUrl;
  if (run.status !== "landed" || url === undefined) return ok({ kind: "waiting" });
  const pr = prNumberOf(url);
  if (pr === undefined) return err("invalid", `the pull request ${url} names no number`);
  const id = blogSlotId(run.id);
  const row = getSlot(store, id);
  if (!row.ok) return row.error.code === "not-found" ? ok({ kind: "no-slot" }) : row;
  if (!holds(row.value, run.id)) return err("conflict", `slot ${id} is not article ${run.id}'s blog slot`);
  const state = row.value.slot.state;
  if (state === "published") return ok(published(row.value));
  if (state !== "scheduled" && state !== "missed") return ok({ kind: "left", slotId: id, state });
  if (state === "missed") {
    const back = publishNow(store, id, by, { now }, { baseRev: row.value.rev });
    if (!back.ok) return back;
  }
  const at = run.landedAt ?? new Date(now).toISOString();
  const landed = publishByAct(store, id, { platformId: pr, url, dry: false, publishedAt: new Date(Date.parse(at)).toISOString() }, by);
  if (landed.ok) return ok({ kind: "published", slotId: id, publicationId: landed.value.publication.id });
  // A second landing call that lost the race finds the publication the first one wrote.
  const again = getSlot(store, id);
  if (again.ok && again.value.slot.state === "published") return ok(published(again.value));
  return landed;
}

/** The landing's own hook (lib/producers/article.ts `land`): publish the blog slot the moment the PR
 *  opens rather than on the next apply redelivery. No `server-only` mark in this file ON PURPOSE: the
 *  article CLI (pipeline/article.mts) loads the producer, and a CLI cannot resolve that package. A
 *  failure is logged, never thrown - the landing itself has happened and must report so. */
export function landBlogOnKernel(k: Result<{ readonly store: Store }>, run: Pick<ArticleRun, "id" | "status" | "landing" | "landedAt">): void {
  if (!k.ok) return;
  const l = landBlogSlot(k.value.store, run, { kind: "machine", id: "article-landing" }, Date.now());
  if (!l.ok) console.error(`[articles] ${run.id}: blog slot: ${l.error.message}`);
}
