// THE CALENDAR'S ARITHMETIC (prototype index.html CalendarColumn, renderMonth, calMoveDay).
// Pure, and in UTC throughout: the page is drawn on the server and hydrated in a browser, and a
// day boundary that moved with the reader's zone would draw a slot on two different days in the
// two renders. The prototype mixed the two (its day keys were UTC, its times local); here the
// clock the page names is the one it computes with.

export type RailSlot = {
  readonly id: string;
  readonly title: string;
  readonly channel: string;
  readonly publishAt: string;
  readonly status: "scheduled" | "publishing" | "published" | "missed" | "failed" | "cancelled";
  /** The channel's sentence, verbatim: on a failed slot, and kept on one cancelled after failing. */
  readonly error?: string;
  /** Why a waiting slot will not fire (@gt/domain/slot SLOT_DRIFTS); it clears itself. */
  readonly drift?: "export_missing" | "channel_not_wired";
  /** When the window closed on a missed slot. */
  readonly missedAt?: string;
  /** The Library item it publishes: the schedule form warns when that item is already on a channel. */
  readonly item?: string;
  /** A published slot whose publication was a dry run: nothing went out, so it holds nothing
   *  (@gt/kernel/slots/schema.ts `dry`, the holder index's own exception). */
  readonly dry?: true;
};

const DAY_MS = 86_400_000;
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;
/** Monday first, as the prototype's grid. */
export const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export const dayKey = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const atOf = (s: RailSlot): number => Date.parse(s.publishAt);
const pad = (n: number): string => String(n).padStart(2, "0");

/** `09:12` in UTC. */
export function clock(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** `Thu 15 Oct` for a day key. */
export function dayLabel(key: string): string {
  const d = new Date(`${key}T12:00:00Z`);
  return `${DOW[d.getUTCDay()] ?? ""} ${d.getUTCDate()} ${(MONTHS[d.getUTCMonth()] ?? "").slice(0, 3)}`;
}

export const isBad = (s: Pick<RailSlot, "status">): boolean => s.status === "failed" || s.status === "missed";

/** What a person owes a slot (v1 calendarModel needsDecision): failed, missed, or a scheduled
 *  slot that drifted - it will not fire, so it is the operator's, not the tick's. */
export const needsDecision = (s: Pick<RailSlot, "status" | "drift">): boolean => isBad(s) || (s.status === "scheduled" && s.drift !== undefined);

export type DayGroup = { readonly day: string; readonly slots: readonly RailSlot[] };

export type Rail = {
  /** Scheduled and publishing slots that will fire, earliest first, grouped by UTC day, with
   *  the cancelled ones still ahead drawn among them (struck, not counted). */
  readonly next: readonly DayGroup[];
  readonly nextCount: number;
  /** How many of `next`, in order, are already past their hour: NOW is drawn after them. */
  readonly overdue: number;
  /** What needs a decision (failed, missed, drifted), newest first: errors drawn verbatim. */
  readonly failed: readonly RailSlot[];
  /** Published, newest first. */
  readonly published: readonly RailSlot[];
};

/**
 * The rail's three sections (prototype CalendarColumn). The prototype's Next held only slots
 * after NOW; a scheduled slot whose hour has passed without v1 settling it (the publish tick did
 * not run - plan §3.1 "nothing in-app calls tick") would then be in no section at all, so it
 * stays under Next, before the NOW line, until v1 calls it missed. A DRIFTED slot is not
 * next - it will not fire - and sits with the failures, which are what the operator owes.
 */
export function railOf(slots: readonly RailSlot[], nowMs: number): Rail {
  const upcoming = slots.filter((s) => (s.status === "scheduled" || s.status === "publishing") && !needsDecision(s)).sort((a, b) => atOf(a) - atOf(b));
  // A cancelled slot still ahead is drawn in its day, struck, and counted nowhere: the hour
  // it held is visible, and nothing will fire in it.
  const struck = slots.filter((s) => s.status === "cancelled" && atOf(s) >= nowMs);
  const next: { day: string; slots: RailSlot[] }[] = [];
  for (const s of [...upcoming, ...struck].sort((a, b) => atOf(a) - atOf(b))) {
    const day = dayKey(atOf(s));
    const last = next.at(-1);
    if (last !== undefined && last.day === day) last.slots.push(s);
    else next.push({ day, slots: [s] });
  }
  const newest = (a: RailSlot, b: RailSlot): number => atOf(b) - atOf(a);
  return {
    next,
    nextCount: upcoming.length,
    overdue: upcoming.filter((s) => atOf(s) < nowMs).length,
    failed: slots.filter(needsDecision).sort(newest),
    published: slots.filter((s) => s.status === "published").sort(newest),
  };
}

export type NextRow = { readonly kind: "day"; readonly day: string } | { readonly kind: "slot"; readonly slot: RailSlot } | { readonly kind: "now" };

/** Next, as drawn: each day's heading, its slots, and the NOW line once, after the overdue. */
export function nextRows(rail: Pick<Rail, "next" | "overdue">): readonly NextRow[] {
  const out: NextRow[] = [];
  let seen = 0;
  if (rail.overdue === 0) out.push({ kind: "now" });
  for (const g of rail.next) {
    out.push({ kind: "day", day: g.day });
    for (const slot of g.slots) {
      out.push({ kind: "slot", slot });
      seen++;
      if (seen === rail.overdue) out.push({ kind: "now" });
    }
  }
  return out;
}

export type YearMonth ={ readonly y: number; readonly m: number };

export const monthOf = (ms: number): YearMonth => {
  const d = new Date(ms);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
};

export const monthOfKey = (key: string): YearMonth => monthOf(Date.parse(`${key}T12:00:00Z`));

export function shiftMonth({ y, m }: YearMonth, by: number): YearMonth {
  const t = y * 12 + m + by;
  return { y: Math.floor(t / 12), m: ((t % 12) + 12) % 12 };
}

/** The day `by` days from `key` (←/→ one, ↑/↓ seven). */
export function moveDay(key: string, by: number): string {
  return dayKey(Date.parse(`${key}T12:00:00Z`) + by * DAY_MS);
}

export type MonthCell = { readonly key: string; readonly date: number; readonly out: boolean };

/** Whole weeks, Monday first, covering the month: the leading and trailing days are `out`. */
export function monthCells({ y, m }: YearMonth): { readonly weeks: number; readonly cells: readonly MonthCell[] } {
  const first = Date.UTC(y, m, 1);
  const lead = (new Date(first).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const weeks = Math.ceil((lead + days) / 7);
  const cells: MonthCell[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const t = Date.UTC(y, m, 1 - lead + i);
    const d = new Date(t);
    cells.push({ key: dayKey(t), date: d.getUTCDate(), out: d.getUTCMonth() !== m });
  }
  return { weeks, cells };
}

/** Slots by UTC day key, each day earliest first. */
export function byDay(slots: readonly RailSlot[]): ReadonlyMap<string, readonly RailSlot[]> {
  const out = new Map<string, RailSlot[]>();
  for (const s of [...slots].sort((a, b) => atOf(a) - atOf(b))) {
    const k = dayKey(atOf(s));
    const list = out.get(k);
    if (list === undefined) out.set(k, [s]);
    else list.push(s);
  }
  return out;
}
