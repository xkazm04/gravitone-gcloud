// THE CALENDAR'S DRAWING ARITHMETIC — pure, beside calendarModel.ts rather than
// inside it. calendarModel decides what a slot IS (its day, its group, its
// move); this file decides where a slot is DRAWN: how three slots in one
// afternoon stack in a column, where a pointer lands on a time axis, what an
// export is called on screen. None of it changes what goes over the wire, so
// none of it belongs in the file the probe pins as the calendar's truth.

import type { ExportRef, ScheduleSlot } from "@/lib/publish/types";

import type { ProjectChoice } from "./useCalendar";

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

/**
 * Items drawn `span` units long from `at(item)`, gathered into the runs that
 * overlap: each run is one STACK on the week grid, earliest first, and an item
 * clear of its neighbours is a stack of one.
 *
 * A stack, not lanes. The round-2 week split an overlapping run into side-by-
 * side lanes, and a day column is ~170px at 1920 — three slots at one evening
 * hour drew as three 50px slivers reading "18 T…". One card at full width with
 * the rest behind it, counted (`+2`), keeps every card legible; the others are
 * a press away. Two that only touch (one ends as the next begins) do not
 * stack.
 */
export function stackClusters<T>(items: readonly T[], at: (t: T) => number, span: number): T[][] {
  const sorted = [...items].sort((a, b) => at(a) - at(b));
  const out: T[][] = [];
  let end = -Infinity;
  for (const item of sorted) {
    const start = at(item);
    if (start >= end) {
      out.push([item]);
      end = start + span;
    } else {
      out[out.length - 1].push(item);
      end = Math.max(end, start + span);
    }
  }
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
