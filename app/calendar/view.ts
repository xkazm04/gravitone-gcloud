// THE CALENDAR'S DRAWING ARITHMETIC — pure, beside calendarModel.ts rather than
// inside it. calendarModel decides what a slot IS (its day, its group, its
// move); this file decides where a slot is DRAWN: how three slots in one
// afternoon share a column, where a pointer lands on a time axis, what an
// export is called on screen. None of it changes what goes over the wire, so
// none of it belongs in the file the probe pins as the calendar's truth.

import type { ExportRef, ScheduleSlot } from "@/lib/publish/types";

import type { ProjectChoice } from "./useCalendar";

const MIN_MS = 60_000;
const DAY_MS = 86_400_000;

/* ── naming an export ─────────────────────────────────────────────────── */

/** An export's id is a uuid (lib/musicVideoExport.ts runExport), which is a
 *  poor name to read and a good one to paste. The project it was cut from is
 *  the name a person knows it by; the first eight characters of the id stay
 *  beside it, verbatim, as the handle. */
export const shortId = (id: string): string => id.slice(0, 8);

export function projectTitle(projectId: string | null, projects: readonly ProjectChoice[] | null): string | null {
  if (!projectId) return null;
  return projects?.find((p) => p.id === projectId)?.title ?? null;
}

export function exportName(exp: Pick<ExportRef, "id" | "projectId"> | null, projects: readonly ProjectChoice[] | null): string {
  if (!exp) return "—";
  return projectTitle(exp.projectId, projects) ?? `export ${shortId(exp.id)}`;
}

/* ── slots that share time ────────────────────────────────────────────── */

export interface Placed<T> {
  item: T;
  /** column inside its cluster, 0-based */
  lane: number;
  /** how many columns its cluster needs */
  lanes: number;
}

/** Greedy interval packing. Items are drawn `span` units long from `at(item)`;
 *  two that overlap take separate lanes, and every member of an overlapping
 *  cluster learns the cluster's width so the cards split it evenly. Used for
 *  the week grid (minutes) and the runway (pixels). */
export function packLanes<T>(items: readonly T[], at: (t: T) => number, span: number): Placed<T>[] {
  const sorted = [...items].sort((a, b) => at(a) - at(b));
  const out: Placed<T>[] = [];
  let cluster: Placed<T>[] = [];
  let ends: number[] = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    const n = Math.max(1, ends.length);
    for (const p of cluster) p.lanes = n;
    out.push(...cluster);
    cluster = [];
    ends = [];
  };
  for (const item of sorted) {
    const start = at(item);
    if (start >= clusterEnd) flush();
    let lane = ends.findIndex((e) => e <= start);
    if (lane < 0) {
      lane = ends.length;
      ends.push(start + span);
    } else ends[lane] = start + span;
    cluster.push({ item, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, start + span);
  }
  flush();
  return out;
}

/* ── pointer to time ──────────────────────────────────────────────────── */

/** Minutes since local midnight of an ISO instant; null when unparseable. */
export function minuteOfDay(iso: string): number | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.getHours() * 60 + d.getMinutes();
}

/** A local day plus minutes-since-midnight as an ISO instant, minutes snapped
 *  to `step` and held inside the day. */
export function atMinute(day: Date, minutes: number, step = 15): string {
  const m = Math.max(0, Math.min(24 * 60 - step, Math.round(minutes / step) * step));
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, m, 0, 0).toISOString();
}

/** An instant along a window `days` long from `start`, from a 0..1 fraction,
 *  snapped to `stepMin` minutes. */
export function atFraction(start: Date, days: number, f: number, stepMin: number): string {
  const raw = start.getTime() + Math.max(0, Math.min(0.9999, f)) * days * DAY_MS;
  const step = stepMin * MIN_MS;
  // snap in LOCAL wall time: a 60-minute step should land on :00 in the
  // viewer's zone, not on :00 UTC (which is :30 in half-hour zones)
  const off = new Date(raw).getTimezoneOffset() * MIN_MS;
  return new Date(Math.round((raw - off) / step) * step + off).toISOString();
}

/** Keep an instant's local time of day, move it to another local day. */
export function onDay(iso: string, day: Date): string {
  const t = new Date(iso);
  const h = Number.isNaN(t.getTime()) ? 18 : t.getHours();
  const m = Number.isNaN(t.getTime()) ? 0 : t.getMinutes();
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m, 0, 0).toISOString();
}

/** The active slot an export already holds on a channel (lib/publish/schedule.ts
 *  clashOf: one per export per channel), or undefined. */
export function activeSlotOf(
  slots: readonly ScheduleSlot[],
  exportId: string,
  channelId?: ScheduleSlot["channelId"],
): ScheduleSlot | undefined {
  return slots.find(
    (s) =>
      s.exportId === exportId &&
      (channelId === undefined || s.channelId === channelId) &&
      (s.status === "scheduled" || s.status === "publishing" || s.status === "published"),
  );
}
