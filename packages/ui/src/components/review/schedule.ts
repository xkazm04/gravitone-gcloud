// APPROVE -> CALENDAR, AS A VERDICT CAN CARRY IT (prototype index.html :659, :842-850). The
// prototype's approve took `{channel, publishAt, notes}` and put a slot on the calendar in the
// same act. Here the schedule rides on the KEPT decision's note, and that is the whole design:
//
//   - the note is part of the decision, so it is in the consequence token (@gt/kernel
//     decision/consequence): a schedule changed after the preview makes the commit stale, and
//     what the operator saw scheduled is what the apply schedules (hitl-approval:
//     resume-after-decision, "what runs on approval is what was shown");
//   - the decision is durable and redelivered verbatim with every apply attempt, so the applier
//     needs no second store for the intent and the slot it makes is the same slot every time;
//   - no new verb on the Board port, the action core or the kernel: the gate already writes a
//     verdict's note (./boardGate.ts toChange), and every source declares how long one may be
//     (@gt/domain/source noteMax) - a source whose bound is 0 (mv, suno) cannot be scheduled at
//     the Board, and its videos go to the calendar through their own act instead.
//
// The line is v1's REASONS_LINE spelling (lib/decision/v1/note.ts): a leading `calendar:` line a
// person opening the decision can read, then the operator's words. Pure, client-safe.

import type { Channel } from "@gt/domain/slot";
import type { PacketSource } from "@gt/domain/source";

export type ScheduleIntent = {
  readonly channel: Channel;
  /** ISO instant, UTC. */
  readonly publishAt: string;
  readonly notes?: string;
};

/** The sources whose kept subject goes on the calendar, and on which channels, first the default.
 *  An article's post is published by its approve's pull request (owner ruling 4): blog only. */
export const SCHEDULE_CHANNELS: Readonly<Partial<Record<PacketSource, readonly Channel[]>>> = {
  article: ["blog"],
};

export function scheduleChannels(source: PacketSource): readonly Channel[] {
  return SCHEDULE_CHANNELS[source] ?? [];
}

// The domain's CHANNELS, spelled here because @gt/domain/slot loads zod and this module reaches the
// client (tests/next-gates/client-closure); the check below fails to compile when they part.
const CHANNELS = ["youtube", "tiktok", "instagram", "blog"] as const satisfies readonly Channel[];
type Unspelled = Exclude<Channel, (typeof CHANNELS)[number]>;
const _everyChannel: [Unspelled] extends [never] ? true : never = true;
void _everyChannel;

const LINE = /^calendar:[ \t]*([^\n]*)(?:\n|$)/;
// An INSTANT names its zone. Date.parse reads a zone-less date-time ("2026-10-20T09:30") as the
// host's local time, so the same note would schedule 09:30Z on a UTC box and 07:30Z in Prague.
const INSTANT = /^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:?\d{2})$/i;
const isChannel = (x: string): x is Channel => CHANNELS.some((c) => c === x);

/** The note a kept verdict carries: the calendar line, then the notes (trimmed; absent when empty). */
export function encodeSchedule(s: ScheduleIntent): string {
  const notes = s.notes?.trim() ?? "";
  return `calendar: ${s.channel} ${new Date(Date.parse(s.publishAt)).toISOString()}${notes === "" ? "" : `\n${notes}`}`;
}

export type Decoded =
  | { readonly kind: "none"; readonly note: string | null }
  | { readonly kind: "schedule"; readonly schedule: ScheduleIntent; readonly note: string | null }
  /** A `calendar:` line that does not read: refused where it is read, never taken as "no schedule". */
  | { readonly kind: "invalid"; readonly error: string };

/** The inverse. A note with no calendar line is `none` and keeps its words. */
export function decodeSchedule(note: string | null | undefined): Decoded {
  if (note === undefined || note === null || note === "") return { kind: "none", note: null };
  const m = LINE.exec(note);
  if (m === null) return { kind: "none", note };
  const [channel = "", at = "", ...extra] = (m[1] ?? "").trim().split(/\s+/);
  if (!isChannel(channel)) return { kind: "invalid", error: `calendar: "${channel}" is not a channel (${CHANNELS.join(", ")})` };
  const t = Date.parse(at);
  if (extra.length > 0 || !INSTANT.test(at) || !Number.isFinite(t)) return { kind: "invalid", error: `calendar: "${at}" is not an ISO instant` };
  const rest = note.slice(m[0].length).trim();
  return { kind: "schedule", schedule: { channel, publishAt: new Date(t).toISOString(), ...(rest === "" ? {} : { notes: rest }) }, note: rest === "" ? null : rest };
}

/** The prototype's proposal (index.html :843): the next day, 08:00 UTC. */
export function proposeAt(nowMs: number): string {
  const d = new Date(nowMs + 86_400_000);
  d.setUTCHours(8, 0, 0, 0);
  return d.toISOString();
}

/** `blog · 18 Oct 08:00 UTC` - the words a toast and a consequence row use. */
export function scheduleWords(s: Pick<ScheduleIntent, "channel" | "publishAt">): string {
  const d = new Date(Date.parse(s.publishAt));
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()] ?? "";
  return `${s.channel} · ${d.getUTCDate()} ${mon} ${d.toISOString().slice(11, 16)} UTC`;
}
