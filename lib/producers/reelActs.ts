import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { err, errorMessage, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { slotItemId, type Channel } from "@gt/domain/slot";
import { getSlot } from "@gt/kernel/slots/read";
import type { SlotRow } from "@gt/kernel/slots/schema";
import { createSlot } from "@gt/kernel/slots/write";
import type { Store } from "@gt/kernel/store";
import { decodeSchedule, proposeAt, type ScheduleIntent } from "@gt/ui/components/review/schedule.ts";

import { channelReadiness } from "../publish/channels.ts";
import { exportsRoot } from "../publish/exports.ts";
import { snippetProblem } from "../publish/youtube.ts";
import { sha256File } from "../reel/encode.ts";
import type { ReelPublish } from "../reel/store.ts";
import type { FilmFace } from "../reel/types.ts";

// A RELEASED REEL FILM ON THE CALENDAR - the one act a `release` keep performs beyond its verdict
// (lib/reel/decide.ts decideReelStop, which the /reels screen and the Board's apply both call). Spark reel-studio
// moved the landing here from the old `<cut>:cut` keep: a cut keep now records its verdict and lands nothing. Two
// models, both followed to the letter where they apply:
//
//   lib/producers/mvActs.ts sendMvToCalendarAct - the video is COPIED into the exports root, staged `.partial`
//     and renamed, with a sidecar naming its project, so a later re-encode never changes what a slot publishes;
//     the slot names the Library's `video:export:<id>`; the platform's limits and the channel's wiring are
//     checked when the slot is made, not when it fires.
//   lib/decision/v1/sources/articleSlot.ts ensureBlogSlot - the slot's id is DERIVED from what it places, so
//     every delivery of one decision names one slot; a slot of that id holding another item is a conflict, never
//     "already done". The schedule is the kept verdict's `calendar:` note, and a keep that carries none takes the
//     proposal from the verdict's instant (the next day, 08:00 UTC), so a redelivery a day later proposes the same hour.
//
// ONE FILM, TWO SLOTS. Each face is its own export and slot (`reel-<slug>-desktop`, `reel-<slug>-phone`), both on
// youtube: the platform files the phone face (1080x1920, under three minutes) as a Short by its shape and length,
// so it needs no other channel and no other export kind - the publish tick uploads a vertical mp4 exactly as it
// uploads a landscape one.
//
// WHAT IS COPIED IS WHAT WAS JUDGED (hitl-approval / resume-after-decision: "what runs on approval is that
// thing, byte for byte"). The verdict named the copies' shas; the staged copy is hashed and a copy with other bytes
// is thrown away and refused, so a copy encoded again between the keep and its landing is never scheduled under
// the keep of its predecessor. The sidecar records the sha, which is how a redelivery knows the export already
// holds the judged copy and copies nothing.
//
// No `server-only` mark: nothing here is the Board's alone, and the mv acts beside it carry none.

export const REEL_PROJECT_ID = "reel";
/** A reel goes out as a video: one channel, the one this build can publish to. */
export const REEL_CHANNEL: Channel = "youtube";

// lib/publish/exports.ts ID_RE: an export the lister would not list is an export no slot can fire.
const EXPORT_ID_RE = /^[A-Za-z0-9_-]{1,80}$/;

/** Round 1 is the bare name; a release made again and kept again is its own export (lib/reel/store.ts, the round). */
export const reelExportId = (slug: string, face: FilmFace, round = 1): string => `reel-${slug}-${face}${round > 1 ? `-r${round}` : ""}`;
export const reelSlotId = (slug: string, face: FilmFace, round = 1): string => `sl-${reelExportId(slug, face, round)}`;

/** The schedule a released film carries, or the proposal from the decision's instant (articleSlot.ts blogScheduleOf, for youtube). */
export function reelScheduleOf(note: string | undefined, decidedAt: string): Result<ScheduleIntent> {
  const d = decodeSchedule(note);
  if (d.kind === "invalid") return err("invalid", d.error);
  if (d.kind === "none") return ok({ channel: REEL_CHANNEL, publishAt: proposeAt(Date.parse(decidedAt)) });
  if (d.schedule.channel !== REEL_CHANNEL) return err("invalid", `a reel goes out on ${REEL_CHANNEL}, not on ${d.schedule.channel}`);
  return ok(d.schedule);
}

/** What the platform and the exports lister would refuse, said before the decision rather than at the slot's hour. */
export function reelLandingProblem(exportId: string, publish: ReelPublish): string | null {
  if (!EXPORT_ID_RE.test(exportId)) return `${exportId} is not an export name (letters, digits, - and _, at most 80)`;
  return snippetProblem({ title: publish.title, description: publish.description, tags: [...publish.tags] });
}

export type ReelFilmLanding = {
  readonly slug: string;
  readonly face: FilmFace;
  readonly round: number;
  /** The sha256 the verdict named for this face's copy: the bytes the operator kept. */
  readonly sha256: string;
  /** The publish copy in its reel folder, absolute. */
  readonly file: string;
  readonly publish: ReelPublish;
  /** Absent: the proposal from now (the next day, 08:00 UTC). A redelivery finds the slot first, so it never re-proposes. */
  readonly schedule?: ScheduleIntent;
};

/** The export holds the judged copy already: its file is there and its sidecar names the same bytes. */
async function landed(dir: string, exportId: string, sha256: string): Promise<boolean> {
  try {
    const side = JSON.parse(await readFile(path.join(dir, `${exportId}.json`), "utf8")) as { sha256?: unknown };
    return side.sha256 === sha256 && (await stat(path.join(dir, `${exportId}.mp4`))).isFile();
  } catch {
    return false;
  }
}

/** Copy the judged copy into the exports root as `<exportId>.mp4` (+ sidecar). Nothing is left at the name unless the copy is whole and is the judged bytes. */
async function landExport(input: ReelFilmLanding, exportId: string): Promise<Result<void>> {
  const dir = exportsRoot();
  if (await landed(dir, exportId, input.sha256)) return ok(undefined);
  const staged = path.join(dir, `${exportId}.partial.mp4`);
  try {
    await mkdir(dir, { recursive: true });
    await copyFile(input.file, staged);
    if ((await sha256File(staged)) !== input.sha256) {
      await rm(staged, { force: true });
      return err("conflict", `reel ${input.slug}: the ${input.face} copy was encoded again after it was judged; what is in the folder now is not what was kept, so nothing was scheduled`);
    }
    await writeFile(path.join(dir, `${exportId}.json`), `${JSON.stringify({ projectId: REEL_PROJECT_ID, sha256: input.sha256 }, null, 2)}\n`, "utf8");
    await rename(staged, path.join(dir, `${exportId}.mp4`));
    return ok(undefined);
  } catch (e) {
    await rm(staged, { force: true }).catch(() => {});
    return err("unavailable", `the ${input.face} copy could not be copied to the exports: ${errorMessage(e)}`, { cause: e });
  }
}

/** One face's slot: found when a delivery already made it, made otherwise (after its export has landed). */
export async function landReelFilm(store: Store, input: ReelFilmLanding, by: Actor): Promise<Result<SlotRow>> {
  const exportId = reelExportId(input.slug, input.face, input.round);
  const id = reelSlotId(input.slug, input.face, input.round);
  const item = slotItemId.export(exportId);
  const found = (): Result<SlotRow> | undefined => {
    const held = getSlot(store, id);
    if (!held.ok) return held.error.code === "not-found" ? undefined : held;
    const s = held.value.slot;
    return s.libraryItemId === item && s.channel === REEL_CHANNEL ? held : err("conflict", `slot ${id} holds ${s.libraryItemId} on ${s.channel}, not ${item} on ${REEL_CHANNEL}`);
  };
  const before = found();
  if (before !== undefined) return before;
  const schedule = input.schedule ?? { channel: REEL_CHANNEL, publishAt: proposeAt(Date.now()) };
  if (schedule.channel !== REEL_CHANNEL) return err("invalid", `a reel goes out on ${REEL_CHANNEL}, not on ${schedule.channel}`);
  const problem = reelLandingProblem(exportId, input.publish);
  if (problem !== null) return err("invalid", problem);
  const wired = new Set<Channel>(channelReadiness().channels.filter((c) => c.status !== "not_wired").map((c) => c.id));
  if (!wired.has(REEL_CHANNEL)) return err("conflict", `${REEL_CHANNEL} is not wired`, { detail: "channel_not_wired" });
  const copied = await landExport(input, exportId);
  if (!copied.ok) return copied;
  const made = createSlot(store, { id, libraryItemId: item, channel: REEL_CHANNEL, at: schedule.publishAt, title: input.publish.title, description: input.publish.description, tags: input.publish.tags }, by, { wired, itemExists: (x) => x === item });
  if (made.ok || made.error.code !== "conflict") return made;
  // Two deliveries of one decision raced (a reaped lease, a redrive): the slot it lost to is this one.
  return found() ?? made;
}
