// THE SLOT'S VERBS AND WORDS, pure (v1 app/calendar/calendarModel.ts and SlotSheet.tsx,
// absorbed; prototype index.html `SlotDetail`). `now` is always a parameter: the React
// Compiler refuses a clock read during render, and a test pins the hour without mocking one.
//
// Kept from v1:
//   · needsDecision (./calendar.ts, where the rail sorts by it) - missed, failed, and a
//     DRIFTED scheduled slot. v1 read drift off a magic string in `error`; here it is the
//     slot's own field (@gt/domain/slot SLOT_DRIFTS), worded below, never parsed.
//   · move / cancel from scheduled, missed and failed only (the machine's table: published,
//     publishing and cancelled do not move), and a missed slot's field starting at the next
//     full hour (StatReel moveDefault), because sending it back at its own past hour only
//     has it marked missed again at the next tick.
//   · null is unmeasured, never 0; a partial sum is a lower bound ("≥ N").
// Upgraded:
//   · the next-full-hour start applies to ANY slot whose hour has passed, a failed one too -
//     v1 started a failed slot at its own past time, which the next sweep then called missed.
//   · a move into the past is refused here, before a write, instead of landing and being
//     swept to missed a minute later.
//   · publish-now joins the two verbs (v1's `publishNow` had no UI): it overrides the missed
//     window and is never a claim on its own - the publish takes the claim and releases it.
//   · UTC throughout, as the rest of the calendar (./calendar.ts says why); v1 was local.

import { SLOT_MOVABLE } from "@gt/domain/slot.machine";

import { clock, type RailSlot } from "./calendar.ts";

const HOUR_MS = 3_600_000;
const pad = (n: number): string => String(n).padStart(2, "0");

type Movable = Pick<RailSlot, "status">;

/** The machine's own list (v1 RESCHEDULABLE and CANCELLABLE), the one the engine's verbs check. */
const OPEN = SLOT_MOVABLE;
export const canMove = (s: Movable): boolean => OPEN.includes(s.status);
export const canCancel = (s: Movable): boolean => OPEN.includes(s.status);
/**
 * Publish now: not while drifted (its export is gone or its channel is not wired), and never a
 * blog slot - a post goes out as the article approve's own pull request into ai-registry, an
 * act of the Board, not an upload this verb could start.
 */
export const canPublishNow = (s: Pick<RailSlot, "status" | "drift" | "channel">): boolean => OPEN.includes(s.status) && s.drift === undefined && s.channel !== "blog";

/** The next full UTC hour after `nowMs`. */
export const nextFullHour = (nowMs: number): number => Math.floor(nowMs / HOUR_MS) * HOUR_MS + HOUR_MS;

/** An instant as a `datetime-local` value, read as UTC (minutes). */
export function toUtcInput(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** A `datetime-local` value read as UTC, as an ISO instant; null when it is not one. */
export function fromUtcInput(v: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  const t = Date.parse(`${v}:00.000Z`);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/** Where the move field starts: the slot's own hour while it is still ahead, else the next full hour. */
export function moveDefault(s: Pick<RailSlot, "status" | "publishAt">, nowMs: number): string {
  const at = Date.parse(s.publishAt);
  return toUtcInput(s.status === "missed" || !(at > nowMs) ? nextFullHour(nowMs) : at);
}

/** A move the verb would refuse, in its words; null when it may be sent. */
export function moveProblem(s: Movable, at: string | null, nowMs: number): string | null {
  if (!canMove(s)) return `a ${s.status} slot does not move`;
  if (at === null) return "not a time";
  if (!(Date.parse(at) > nowMs)) return "that hour has passed";
  return null;
}

/* ── words drawn from fields, never from an error string ─────────────────── */

export const DRIFT_WORDS: Readonly<Record<NonNullable<RailSlot["drift"]>, string>> = {
  export_missing: "export missing",
  channel_not_wired: "channel not wired",
};

/** `missed 18:15 UTC` from the slot's own `missedAt`, or null. */
export function missedWords(s: Pick<RailSlot, "missedAt">): string | null {
  if (s.missedAt === undefined) return null;
  const t = Date.parse(s.missedAt);
  return Number.isNaN(t) ? null : `missed ${clock(t)} UTC`;
}

/* ── the publish chain the error broke ───────────────────────────────────── */

export const PUBLISH_CHAIN = ["scheduled", "auth", "upload", "live"] as const;

/**
 * Which node of PUBLISH_CHAIN a channel's sentence broke at (prototype SlotDetail `brkAt`): a
 * credential sentence at auth; quota, insert, upload, an interruption or a refused container
 * at upload; anything else is drawn as failing at the last step, where the platform answered.
 * The adapter's own refusals before any request (lib/publish/youtube.ts snippetProblem, an
 * empty file; lib/producers/publish.ts plan: not an export, an export gone; no adapter) never
 * reached the platform, so they break at upload, not live.
 * The sentence is drawn verbatim beside it; this only places the mark.
 */
export function breakOf(error: string): number {
  if (/token|oauth|access|credential|unauthori[sz]ed|forbidden/i.test(error)) return 1;
  if (/exceed|may not contain|is empty|not an export|no longer exists|no publishing adapter/i.test(error)) return 2;
  if (/quota|insert|upload|interrupted|format|container|codec/i.test(error)) return 2;
  return 3;
}

/* ── metrics: null is unmeasured, a sum over gaps is a floor ─────────────── */

const NUM = new Intl.NumberFormat("en-US");

/** A measured figure: "—" when never measured, "≥ N" when some parts were not, else N. */
export function figure(value: number | null, lowerBound = false): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return lowerBound ? `≥ ${NUM.format(value)}` : NUM.format(value);
}

/** Seconds as m:ss (h:mm:ss past an hour); "—" when unmeasured. */
export function duration(s: number | null): string {
  if (s === null || !Number.isFinite(s)) return "—";
  const t = Math.round(s);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  return h > 0 ? `${h}:${pad(m)}:${pad(t % 60)}` : `${m}:${pad(t % 60)}`;
}

/** A signed change: "+3", "−2", "0"; "—" when unmeasured. */
export function signed(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  return n > 0 ? `+${NUM.format(n)}` : n < 0 ? `−${NUM.format(-n)}` : "0";
}
