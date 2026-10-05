// THE CALENDAR'S ARITHMETIC — pure, no React, no DOM, no clock of its own.
//
// Every function here takes `now` (or a week start) as an argument rather than
// reading the clock, for two reasons: the React Compiler's purity rule refuses
// `Date.now()` during render, and tests/golden-path/calendar.probe.spec.ts has
// to pin a week without mocking the global clock.
//
// Derived from StatReel's studio (apps/studio/src/calendar.ts — week bounds,
// day bucketing, datetime-local <-> ISO, the slot groups; metricsGroup.ts — the
// lower-bound wording), re-cut to this repo's wire types (lib/publish/types.ts)
// and its absent-value convention: `null` is unmeasured, never 0.
//
// The metrics SEMANTICS (latest non-null total, per-day deltas, group sums with
// a lower bound) are not here: they are lib/publish/metrics.ts, pure and
// client-safe, written once beside the engine that stores the snapshots. This
// file only SPELLS their results.
//
// Local time throughout for what a person reads (days, hours), ISO instants for
// what goes over the wire.

import type { ChannelId, ScheduleSlot, SlotStatus } from "@/lib/publish/types";

const p2 = (n: number): string => String(n).padStart(2, "0");
const DAY_MS = 86_400_000;

export const CHANNEL_IDS: readonly ChannelId[] = ["youtube", "tiktok", "instagram"];
export const CHANNEL_NAME: Record<ChannelId, string> = { youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram" };

/* ── weeks and days ─────────────────────────────────────────────────────── */

/** Local midnight of the Monday of the week containing `d`, shifted by `offset` weeks. */
export function weekStart(d: Date, offset = 0): Date {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (s.getDay() + 6) % 7; // Monday = 0
  s.setDate(s.getDate() - dow + offset * 7);
  return s;
}

/** `n` consecutive local days starting at `start` (7 for a week, 28 for the lanes). */
export function daysFrom(start: Date, n = 7): Date[] {
  return Array.from({ length: n }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

/** "YYYY-MM-DD" in local time. */
export const dayKey = (d: Date): string => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

/** "YYYY-MM-DD|HH" — a week-grid cell. */
export const cellKey = (d: Date, hour: number): string => `${dayKey(d)}|${p2(hour)}`;

/** Slots of the `n` days from `start`, bucketed by local day, time-ordered. A slot
 *  outside the window, or with an unparseable time, is in no bucket. */
export function bucketByDay<T extends Pick<ScheduleSlot, "id" | "publishAt">>(
  slots: readonly T[],
  start: Date,
  n = 7,
): Map<string, T[]> {
  const out = new Map<string, T[]>(daysFrom(start, n).map((d) => [dayKey(d), []]));
  for (const s of slots) {
    const t = new Date(s.publishAt);
    if (Number.isNaN(t.getTime())) continue;
    out.get(dayKey(t))?.push(s);
  }
  for (const list of out.values()) list.sort(byTime);
  return out;
}

/** The week grid's cells: day x hour, keyed by `cellKey`. Only cells that hold a
 *  slot are present. */
export function bucketByCell<T extends Pick<ScheduleSlot, "id" | "publishAt">>(
  slots: readonly T[],
  start: Date,
): Map<string, T[]> {
  const days = new Set(daysFrom(start, 7).map(dayKey));
  const out = new Map<string, T[]>();
  for (const s of slots) {
    const t = new Date(s.publishAt);
    if (Number.isNaN(t.getTime()) || !days.has(dayKey(t))) continue;
    const k = cellKey(t, t.getHours());
    const list = out.get(k);
    if (list) list.push(s);
    else out.set(k, [s]);
  }
  for (const list of out.values()) list.sort(byTime);
  return out;
}

/** Time order, id as the tiebreak so equal instants never shuffle. */
function byTime(a: Pick<ScheduleSlot, "id" | "publishAt">, b: Pick<ScheduleSlot, "id" | "publishAt">): number {
  return a.publishAt.localeCompare(b.publishAt) || a.id.localeCompare(b.id);
}

/** Where an instant falls along `days` days from `start`, as 0..1; null outside. */
export function laneFraction(iso: string, start: Date, days = 28): number | null {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const f = (t - start.getTime()) / (days * DAY_MS);
  return f >= 0 && f < 1 ? f : null;
}

/** The instant a slot dropped on (day, hour) moves to: that local hour, keeping
 *  the slot's own minutes so a 14:30 slot dragged one day later is still :30. */
export function dropTarget(slot: Pick<ScheduleSlot, "publishAt">, day: Date, hour: number): string {
  const was = new Date(slot.publishAt);
  const minutes = Number.isNaN(was.getTime()) ? 0 : was.getMinutes();
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minutes, 0, 0).toISOString();
}

/* ── slot vocabulary ────────────────────────────────────────────────────── */

/** What the person owes a slot: a missed or failed one waits on a decision, and
 *  so does a DRIFTED one — still `scheduled`, but with the reason it will not
 *  fire in `error` (lib/publish/schedule.ts DRIFT: its export is gone, or its
 *  channel stopped being wired). StatReel's needsDecision counted drift too. */
export const needsDecision = (s: Pick<ScheduleSlot, "status" | "error">): boolean =>
  s.status === "missed" || s.status === "failed" || (s.status === "scheduled" && s.error !== null);
export const isUpcoming = (s: Pick<ScheduleSlot, "status">): boolean =>
  s.status === "scheduled" || s.status === "publishing";
/** PATCH accepts a new time on a scheduled slot, and on a missed one with the
 *  status reset (the HTTP contract: "reschedule a missed slot = status scheduled
 *  + new publishAt"). A failed slot is offered the same retry; the engine may
 *  refuse it, and its refusal is shown verbatim. Published, publishing and
 *  cancelled do not move. */
export const canMove = (s: Pick<ScheduleSlot, "status">): boolean =>
  s.status === "scheduled" || s.status === "missed" || s.status === "failed";
export const canCancel = (s: Pick<ScheduleSlot, "status">): boolean =>
  s.status === "scheduled" || s.status === "missed" || s.status === "failed";

/** The PATCH body that moves `s` to `publishAt`. */
export function movePatch(
  s: Pick<ScheduleSlot, "status">,
  publishAt: string,
): { publishAt: string; status?: "scheduled" } {
  return s.status === "scheduled" ? { publishAt } : { publishAt, status: "scheduled" };
}

export type SlotGroupKey = "decide" | "upcoming" | "history";
export interface SlotGroup<T> {
  key: SlotGroupKey;
  label: string;
  slots: T[];
}
const GROUP_LABEL: Record<SlotGroupKey, string> = {
  decide: "Needs decision",
  upcoming: "Upcoming",
  history: "History",
};

/** The agenda's three groups. Needs-decision and Upcoming read soonest first;
 *  History newest first. Every group is returned, empty or not, so a variant can
 *  draw an honest empty group rather than a missing one. */
export function slotGroups<T extends Pick<ScheduleSlot, "id" | "publishAt" | "status" | "error">>(
  slots: readonly T[],
): SlotGroup<T>[] {
  const asc = [...slots].sort(byTime);
  return [
    { key: "decide", label: GROUP_LABEL.decide, slots: asc.filter(needsDecision) },
    { key: "upcoming", label: GROUP_LABEL.upcoming, slots: asc.filter((s) => isUpcoming(s) && !needsDecision(s)) },
    {
      key: "history",
      label: GROUP_LABEL.history,
      slots: asc.filter((s) => !needsDecision(s) && !isUpcoming(s)).reverse(),
    },
  ];
}

/** One word per status, for the slot's own label (never colour alone). */
export const STATUS_WORD: Record<SlotStatus, string> = {
  scheduled: "scheduled",
  publishing: "publishing",
  published: "published",
  failed: "failed",
  missed: "missed",
  cancelled: "cancelled",
};

/* ── the form's time field ──────────────────────────────────────────────── */

/** A Date as an <input type="datetime-local"> value (local, minutes). */
export const toLocalInput = (d: Date): string =>
  `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;

/** A datetime-local value as an ISO instant; null when empty or not a date. */
export function fromLocalInput(v: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** The next full local hour after `now`. */
export function nextFullHour(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1, 0, 0, 0);
}

/** The reschedule field's starting value. A missed slot starts at the next full
 *  hour (StatReel calendar.ts moveDefault): its own time has passed, so sending
 *  it back unchanged would only be marked missed again at the next tick. */
export function moveDefault(s: Pick<ScheduleSlot, "status" | "publishAt">, now: Date): string {
  return toLocalInput(s.status === "missed" ? nextFullHour(now) : new Date(s.publishAt));
}

/** Comma-separated tags -> trimmed, non-empty, de-duplicated. */
export const splitTags = (s: string): string[] => [
  ...new Set(
    s
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  ),
];

/* ── labels ─────────────────────────────────────────────────────────────── */

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const dayLabel = (d: Date): { dow: string; date: string } => ({
  dow: DOW[d.getDay()] ?? "",
  date: `${d.getDate()} ${MON[d.getMonth()] ?? ""}`,
});
export function rangeLabel(start: Date, days = 7): string {
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + days - 1);
  return `${dayLabel(start).date} – ${dayLabel(end).date} ${end.getFullYear()}`;
}
export const timeLabel = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${p2(d.getHours())}:${p2(d.getMinutes())}`;
};
export const dateTimeLabel = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const l = dayLabel(d);
  return `${l.dow} ${l.date}, ${timeLabel(iso)}`;
};

/** Relative time either side of `now`: "in 3 h", "12 min ago", "now". */
export function relWhen(iso: string, now: number): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const d = (t - now) / 1000;
  const a = Math.abs(d);
  if (a < 45) return "now";
  // each unit is chosen AFTER rounding (StatReel logic.ts relTime), so 3599 s reads "1 h", never "60 min"
  const m = Math.round(a / 60);
  const h = Math.round(a / 3600);
  const v = m < 60 ? `${m} min` : h < 24 ? `${h} h` : `${Math.round(a / 86400)} d`;
  return d > 0 ? `in ${v}` : `${v} ago`;
}

export function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

/* ── metrics: null is unmeasured, a partial sum is a lower bound ─────────── */

const NUM = new Intl.NumberFormat("en-US");

/** A count, or "—" when it was never measured. Never "0" for null. */
export const fmtNum = (n: number | null | undefined): string =>
  n === null || n === undefined || !Number.isFinite(n) ? "—" : NUM.format(n);

/** Seconds as m:ss (or h:mm:ss); "—" when unmeasured. */
export function fmtDuration(s: number | null | undefined): string {
  if (s === null || s === undefined || !Number.isFinite(s)) return "—";
  const t = Math.round(s);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  return h > 0 ? `${h}:${p2(m)}:${p2(sec)}` : `${m}:${p2(sec)}`;
}

/** Watch time in minutes (the platform's own unit for it); "—" when unmeasured. */
export const fmtWatch = (s: number | null | undefined): string =>
  s === null || s === undefined || !Number.isFinite(s) ? "—" : `${NUM.format(Math.round(s / 60))} min`;

/** A signed change: "+3", "−2", "0"; "—" when unmeasured. */
export function fmtSigned(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  if (n > 0) return `+${NUM.format(n)}`;
  if (n < 0) return `−${NUM.format(-n)}`;
  return "0";
}

/** A summed figure: exact, a lower bound ("≥ N"), or unmeasured ("—"). */
export interface Figure {
  value: number | null;
  lowerBound: boolean;
}
export const fmtFigure = (f: Figure): string =>
  f.value === null ? "—" : f.lowerBound ? `≥ ${NUM.format(f.value)}` : NUM.format(f.value);
/** The same claim, spoken: "at least 1,200". */
export const speakFigure = (f: Figure): string =>
  f.value === null ? "not measured" : f.lowerBound ? `at least ${NUM.format(f.value)}` : NUM.format(f.value);
