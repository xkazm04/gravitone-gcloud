// THE TIME STRIP'S GEOMETRY - pure, so the drawing and its tests read the same numbers
// (ledger.js `renderStrip`, `dayAtX`, `showBrush`).
//
// Kept from the prototype, with the reason each rule exists:
//   · a bar's height is √n of the busiest day's, not n: a ledger's days differ by orders of
//     magnitude (a sweep is hundreds of acts, a quiet day three), and a linear scale draws
//     every quiet day as nothing. √ keeps a day with 3 acts visible beside one with 300;
//   · a day with any act is at least MIN_BAR tall, so "one event" never rounds to zero;
//   · every day is a slot on the axis, empty or not (data-viz: scale-and-axis-design - an
//     empty day is drawn as measured-zero, not skipped), and days after today are hatched,
//     because nothing can have happened there yet;
//   · segments stack machine, agent, operator from the floor up, each at least 1 px when
//     present, so a single operator act on a machine-heavy day still shows its colour.
// Dropped: the prototype's `session` segment (acts in this browser, replayed from local
// storage) - nothing writes from the studio in Phase 2, so there is no session to draw - and
// its `due` marks (scheduled publish slots), which arrive with the publish source.
// Upgraded: days are cut in UTC and say so (the prototype did too, silently); the range is
// a pure function of two indices, so a drag and a test produce the same {from, to}.

import type { ActorKind } from "@gt/domain/event";

export const DAY_MS = 86_400_000;
/** The tallest bar, in px of the bar box (ledger.js `H`). */
export const BAR_MAX = 56;
/** The shortest bar a day with any act gets. */
export const MIN_BAR = 3;

export type DayCount = { readonly day: string; readonly operator: number; readonly agent: number; readonly machine: number };
export type Range = { readonly from: string; readonly to: string };

export type Segment = { readonly kind: ActorKind; readonly px: number };
export type Bar = {
  readonly day: string;
  readonly n: number;
  readonly px: number;
  /** Floor-up: machine, agent, operator. Only the kinds present. */
  readonly segments: readonly Segment[];
  readonly future: boolean;
  readonly inRange: boolean;
  /** A range is set and this day is outside it. */
  readonly dim: boolean;
};

export const STACK: readonly ActorKind[] = ["machine", "agent", "operator"];

/** `YYYY-MM-DD` of an instant, in UTC. */
export const dayKey = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const dayMs = (day: string): number => Date.parse(`${day}T00:00:00.000Z`);

/** Every day from `from` to `to`, inclusive, in order. Empty when `to` is before `from`. */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = dayMs(from), end = dayMs(to); t <= end; t += DAY_MS) out.push(dayKey(t));
  return out;
}

export const total = (d: DayCount): number => d.operator + d.agent + d.machine;

export function bars(days: readonly DayCount[], opts: { readonly today: string; readonly range: Range | null }): Bar[] {
  const max = Math.max(1, ...days.map(total));
  const { range } = opts;
  return days.map((d) => {
    const n = total(d);
    const px = n === 0 ? 0 : Math.max(MIN_BAR, Math.round((BAR_MAX * Math.sqrt(n)) / Math.sqrt(max)));
    // Each present kind gets at least 1 px; what those floors add is taken back from the
    // largest kind, so the stack is exactly `px` tall and a mixed day never outgrows a
    // single-kind day of the same count.
    const present = STACK.filter((k) => d[k] > 0);
    const raw = present.map((k) => Math.max(1, (px * d[k]) / n));
    const over = raw.reduce((a, b) => a + b, 0) - px;
    const big = raw.indexOf(Math.max(...raw));
    const segments = present.map((k, i) => ({ kind: k, px: i === big && over > 0 ? (raw[i] ?? 0) - over : (raw[i] ?? 0) }));
    const inRange = range !== null && d.day >= range.from && d.day <= range.to;
    return { day: d.day, n, px, segments, future: d.day > opts.today, inRange, dim: range !== null && !inRange };
  });
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"] as const;

export type Tick = { readonly index: number; readonly label: string; readonly month: boolean };

/**
 * The axis: a month's name on its first day, the date on each Monday that is not crowding a
 * month label (ledger.js: Mondays from the 4th to the 28th).
 */
export function ticks(days: readonly string[]): Tick[] {
  const out: Tick[] = [];
  days.forEach((d, index) => {
    const t = new Date(`${d}T00:00:00.000Z`);
    const date = t.getUTCDate();
    if (date === 1) out.push({ index, label: MONTHS[t.getUTCMonth()] ?? "", month: true });
    else if (t.getUTCDay() === 1 && date > 3 && date < 29) out.push({ index, label: d.slice(8), month: false });
  });
  return out;
}

/** Where NOW sits across the strip, 0..1 of its width; null when NOW is outside it. */
export function nowAt(days: readonly string[], nowMs: number): number | null {
  const first = days[0];
  if (first === undefined) return null;
  const x = (nowMs - dayMs(first)) / (days.length * DAY_MS);
  return x < 0 || x > 1 ? null : x;
}

/** The day slot under a pointer at `x` (0..1 of the bars' width), clamped to the strip. */
export function slotAt(x: number, n: number): number {
  return Math.max(0, Math.min(n - 1, Math.floor(x * n)));
}

/**
 * The range a drag from slot `a` to slot `b` sets. A click (a === b) on the day that is
 * already the whole range clears it - the prototype's toggle - and returns null.
 */
export function dragRange(days: readonly string[], a: number, b: number, current: Range | null): Range | null {
  const lo = days[Math.min(a, b)];
  const hi = days[Math.max(a, b)];
  if (lo === undefined || hi === undefined) return current;
  if (lo === hi && current !== null && current.from === lo && current.to === lo) return null;
  return { from: lo, to: hi };
}
