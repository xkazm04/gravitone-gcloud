// PUTTING SOMETHING ON THE CALENDAR, pure (v1 app/calendar/Composer.tsx and ChannelsTab.tsx,
// absorbed; their engine-side twin is @gt/kernel/slots/write.ts createSlot). `now` is a
// parameter throughout, as in ./slot.ts.
//
// Kept from v1:
//   · the engine is the authority. It refuses an unwired channel, an unknown item and an item
//     another slot already holds on that channel, and that refusal is drawn verbatim. The form
//     only BLOCKS what cannot be sent at all (no item, no time, no title, a channel nothing can
//     publish on) and WARNS about what the engine or the tick will decide: a past hour, a
//     same-minute clash on the channel, the item already held there.
//   · tags are split on commas, trimmed, de-duplicated (v1 calendarModel splitTags).
//   · the channel a slot was last scheduled on is the next form's channel while it can still
//     publish; a press still wins.
//   · readiness shows variable NAMES and whether each is present, never a value - and the names
//     arrive from the server as data, so no browser chunk spells one (`npm run check:bundle`).
// Upgraded:
//   · "remembered" is the calendar's own last scheduled channel, read from the store with the
//     page, not a per-browser key: the operator who scheduled from the CLI or another machine
//     gets the same default.
//   · a channel carries its standing (channel-health-tracking): when it last went out, and its
//     last failure with the platform's sentence - "when did this last work?" answered from the
//     slots themselves, not from logs.
//   · `blog` is a channel the form cannot pick: its slot is made by the article approve on the
//     Board and goes out as that approve's pull request (owner ruling 4), never by this form.

import type { RailSlot } from "./calendar.ts";
import { nextFullHour, toUtcInput } from "./slot.ts";

const MIN_MS = 60_000;

/** What a slot can publish: a Library item, drawn by its poster. */
export type ScheduleItem = {
  readonly id: string;
  readonly title: string;
  readonly meta?: string;
  readonly poster?: string;
};

/**
 * A channel's readiness on this deployment (v1 lib/publish/channels.ts):
 *   live       uploads for real (private)
 *   dry        writes the plan it would send, uploads nothing
 *   not_wired  no adapter, or its variables are missing - the engine refuses a slot on it
 *   act        goes out by an act elsewhere (blog: the approve's pull request)
 */
export type ChannelState = "live" | "dry" | "not_wired" | "act";

export type ChannelReady = {
  readonly channel: string;
  readonly state: ChannelState;
  /** Variable names and whether each is set; never a value. */
  readonly env: readonly { readonly name: string; readonly present: boolean }[];
  /** The channel's own note on its state, as the readiness seam words it. */
  readonly note?: string;
  /** The headless command that reports (and, with its variables set, proves) this channel. */
  readonly command: string;
  /** The channel's standing, from the ledger's publish attempts (a failure of this machine's -
   *  a dead claimant, a stop before upload - is not the channel's and is not counted). */
  readonly lastOut?: string;
  /** The newest failure while it still stands (no success since), and how many in a row. */
  readonly lastFailure?: { readonly at: string; readonly error: string; readonly inARow: number };
};

/**
 * The worker's publish timer as the store has it (@gt/producers/publish/timers timerStatusIn):
 * when it last ticked, when it is next due while someone runs it, and a failure still standing.
 * `running` false is said, never hidden: a calendar nobody ticks publishes nothing.
 */
export type PublishTick = {
  readonly running: boolean;
  readonly lastRunAt: string | null;
  readonly nextDueAt: string | null;
  readonly failing?: { readonly since: string; readonly error: string };
};

export const canSchedule = (c: Pick<ChannelReady, "state">): boolean => c.state === "live" || c.state === "dry";

export type ScheduleForm = {
  readonly item: string | null;
  readonly channel: string | null;
  /** The `datetime-local` text, read as UTC. */
  readonly when: string;
  readonly title: string;
  readonly description: string;
  readonly tags: string;
};

/** What the engine is sent: an ISO instant and the split tags. */
export type ScheduleDraft = {
  readonly item: string;
  readonly channel: string;
  readonly at: string;
  readonly title: string;
  readonly description: string;
  readonly tags: readonly string[];
};

export const splitTags = (s: string): string[] => [
  ...new Set(
    s
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t !== ""),
  ),
];

/** The YouTube snippet limits v1's form held its fields to (lib/publish/youtube.ts snippetProblem). */
export const TITLE_MAX = 100;
export const DESCRIPTION_MAX = 5000;
/** Tags, counted as YouTube counts them: every comma, and the quotes a tag with a space carries. */
export const TAGS_MAX = 500;

const UTF8 = new TextEncoder();
const tagChars = (tags: readonly string[]): number => tags.reduce((n, t) => n + t.length + (t.includes(" ") ? 2 : 0), 0) + Math.max(0, tags.length - 1);

/**
 * The rest of snippetProblem, which the upload applies at the slot's HOUR: a description over
 * 5000 BYTES (the field caps characters), a `<` or `>` in title or description, tags past 500.
 * A slot the form let through would be accepted, wait, and fail at its hour with nobody
 * watching - so the form refuses it now. YouTube's alone; no other channel uploads yet.
 * tests/next-server/schedule-snippet-parity.test.ts feeds the same cases to both doors.
 */
function youtubeBlocked(title: string, description: string, tags: readonly string[]): Blocked[] {
  const out: Blocked[] = [];
  if (/[<>]/.test(title)) out.push({ field: "title", words: "title holds < or >" });
  if (/[<>]/.test(description)) out.push({ field: "description", words: "description holds < or >" });
  // Past 5000 characters the length rule below has already said so.
  if (description.length <= DESCRIPTION_MAX && UTF8.encode(description).length > DESCRIPTION_MAX) out.push({ field: "description", words: `description over ${DESCRIPTION_MAX} bytes` });
  if (tagChars(tags) > TAGS_MAX) out.push({ field: "tags", words: `tags over ${TAGS_MAX}` });
  return out;
}

/**
 * Where the time field opens: the next full hour when the day is today (or none was picked),
 * that day at noon UTC when it is a later day, and the next full hour for a day already gone -
 * opening a form on an hour that has passed would warn before the operator typed anything.
 */
export function whenDefault(day: string | null, nowMs: number): string {
  const next = nextFullHour(nowMs);
  if (day === null) return toUtcInput(next);
  const noon = Date.parse(`${day}T12:00:00.000Z`);
  if (Number.isNaN(noon)) return toUtcInput(next);
  return toUtcInput(day > new Date(nowMs).toISOString().slice(0, 10) ? noon : next);
}

/** The channel the form opens on: the last one scheduled while it can still publish, else the first that can. */
export function channelDefault(channels: readonly ChannelReady[], last: string | null): string | null {
  const open = channels.filter(canSchedule);
  return open.find((c) => c.channel === last)?.channel ?? open[0]?.channel ?? null;
}

/** The item the form opens on: the one asked for, else the first no slot holds on the channel, else the first. */
export function itemDefault(items: readonly ScheduleItem[], slots: readonly RailSlot[], asked: string | null, channel: string | null): string | null {
  if (asked !== null && items.some((i) => i.id === asked)) return asked;
  const held = new Set(slots.filter((s) => holds(s) && s.channel === channel).map((s) => s.item));
  return items.find((i) => !held.has(i.id))?.id ?? items[0]?.id ?? null;
}

/**
 * A slot that holds its item on its channel (@gt/domain/slot.machine SLOT_HOLDS), less a slot
 * published DRY: a rehearsal sent nothing, and the engine lets the live slot that follows it be
 * made (@gt/kernel/slots/core.ts clashOf, the `slots_one_holder` index) - so the form neither
 * skips past that item when it picks a default nor warns it is held. (A dry-published slot part
 * still counts as placed on its Plan, @gt/kernel/slots/read.ts slottedIn: that is the part's gate,
 * not the item's channel.)
 */
export const holds = (s: Pick<RailSlot, "status" | "dry">): boolean => s.status === "scheduled" || s.status === "publishing" || (s.status === "published" && s.dry !== true);

/** The UTC instant a `datetime-local` text names, or null. */
function instantOf(when: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(when)) return null;
  const t = Date.parse(`${when}:00.000Z`);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export type Blocked = { readonly field: "item" | "channel" | "when" | "title" | "description" | "tags"; readonly words: string };

/**
 * What stops the form from being sent at all, field by field, in the work's words; empty when
 * it may go. The draft is built here too, so the check and the send read the same fields.
 */
export function checkSchedule(f: ScheduleForm, channels: readonly ChannelReady[]): { readonly blocked: readonly Blocked[]; readonly draft: ScheduleDraft | null } {
  const blocked: Blocked[] = [];
  const at = instantOf(f.when);
  const ch = channels.find((c) => c.channel === f.channel);
  const title = f.title.trim();
  if (f.item === null) blocked.push({ field: "item", words: "no export" });
  if (ch === undefined) blocked.push({ field: "channel", words: "no channel" });
  else if (!canSchedule(ch)) blocked.push({ field: "channel", words: ch.state === "act" ? `${ch.channel} · by approve` : `${ch.channel} · not wired` });
  if (at === null) blocked.push({ field: "when", words: "not a time" });
  if (title === "") blocked.push({ field: "title", words: "no title" });
  else if (title.length > TITLE_MAX) blocked.push({ field: "title", words: `title over ${TITLE_MAX}` });
  if (f.description.length > DESCRIPTION_MAX) blocked.push({ field: "description", words: `description over ${DESCRIPTION_MAX}` });
  const tags = splitTags(f.tags);
  if (f.channel === "youtube") blocked.push(...youtubeBlocked(title, f.description, tags));
  const draft =
    blocked.length === 0 && f.item !== null && f.channel !== null && at !== null
      ? { item: f.item, channel: f.channel, at, title, description: f.description, tags }
      : null;
  return { blocked, draft };
}

export type ScheduleWarning =
  | { readonly kind: "past"; readonly at: string }
  | { readonly kind: "clash"; readonly slot: RailSlot }
  | { readonly kind: "held"; readonly slot: RailSlot };

/**
 * What the engine or the tick will decide about a sendable form (v1 Composer's three warns):
 *   past   the hour has gone - within the missed window the next tick sends it, past it the
 *          slot is marked missed and never published late;
 *   clash  another slot goes out on the same channel in the same minute;
 *   held   the item is already on that channel - the engine refuses a second slot for it.
 */
export function scheduleWarnings(f: Pick<ScheduleForm, "item" | "channel" | "when">, slots: readonly RailSlot[], nowMs: number): ScheduleWarning[] {
  const out: ScheduleWarning[] = [];
  const at = instantOf(f.when);
  if (at !== null && Date.parse(at) < nowMs - MIN_MS) out.push({ kind: "past", at });
  if (at !== null && f.channel !== null) {
    const minute = Math.floor(Date.parse(at) / MIN_MS);
    const clash = slots.find((s) => s.channel === f.channel && (s.status === "scheduled" || s.status === "publishing") && Math.floor(Date.parse(s.publishAt) / MIN_MS) === minute);
    if (clash !== undefined) out.push({ kind: "clash", slot: clash });
  }
  if (f.item !== null && f.channel !== null) {
    const held = slots.find((s) => s.item === f.item && s.channel === f.channel && holds(s));
    if (held !== undefined) out.push({ kind: "held", slot: held });
  }
  return out;
}
