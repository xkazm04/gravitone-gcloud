"use client";

// The month, open over the Floor (prototype index.html `setCal`, `renderMonth`, the calendar
// key handler). It is a layer (useLayer, kind `sheet`, mode `calendar`), so while it is open the
// Floor's keys are not live, Escape belongs to it, and focus returns to what opened it.
//
// Keys, by verb (keymap/bindings.ts `calendar`): ←/→ a day, ↑/↓ a week, [ ] a month, ⏎ the
// selected day's first slot, Esc clears the day (then, through the layer, closes the month),
// C back to the rail, B the Board. The month, the selected day and the channels it hides live
// in the Floor's URL (`?cal=1&day=&off=`), so a link carries the view; a slot opens its own
// level over the month (`&slot=`, ./SlotLevel.tsx).

import { useEffect, useRef, useState } from "react";

import { MonthCalendar } from "@gt/ui/components/floor/MonthCalendar.tsx";
import { byDay, dayKey, monthOf, monthOfKey, moveDay, shiftMonth, type RailSlot, type YearMonth } from "@gt/ui/components/floor/calendar.ts";
import type { ChannelReady, PublishTick } from "@gt/ui/components/floor/schedule.ts";
import { useKeys } from "@gt/ui/keymap/dispatch";
import { useLayer } from "@gt/ui/layers/useLayer";

import { slotHref } from "./model.ts";

export type MonthProps = {
  readonly slots: readonly RailSlot[];
  readonly nowMs: number;
  readonly day: string | null;
  readonly onDay: (day: string | null) => void;
  readonly onClose: () => void;
  readonly onBoard: () => void | false;
  /** Channels hidden, from the URL. */
  readonly off: readonly string[];
  readonly onOff: (off: readonly string[]) => void;
  readonly onOpenSlot: (id: string) => void;
  /** Each channel's readiness and the publish mode, when the calendar's side could say. */
  readonly channels?: readonly ChannelReady[];
  readonly mode?: "dry" | "live";
  readonly tick?: PublishTick;
  /** Open the schedule sheet (on the selected day, which the URL already holds). */
  readonly onSchedule?: () => void;
};

export function Month({ slots, nowMs, day, onDay, onClose, onBoard, off: offList, onOff, onOpenSlot, channels, mode, tick, onSchedule }: MonthProps) {
  const panel = useRef<HTMLElement | null>(null);
  // The page turned to with [ ] or the arrows; a selected day carries its own month, so a day
  // walked past the edge turns the page without a second piece of state to keep in step.
  const [turned, setMonth] = useState<YearMonth>(() => (day === null ? monthOf(nowMs) : monthOfKey(day)));
  const month = day === null ? turned : monthOfKey(day);
  const off: ReadonlySet<string> = new Set(offList);
  useLayer(true, { kind: "sheet", mode: "calendar", panelRef: panel, onClose });

  // Focus lands in the month so its keys are the ones that answer.
  useEffect(() => {
    const cell = panel.current?.querySelector<HTMLElement>('[role="gridcell"][tabindex="0"]');
    (cell ?? panel.current)?.focus({ preventScroll: true });
  }, [day, month]);

  const walk = (by: number): void => onDay(moveDay(day ?? dayKey(nowMs), by));
  const turn = (by: number): void => {
    setMonth(shiftMonth(month, by));
    onDay(null);
  };

  useKeys(
    "calendar",
    {
      day: ({ index }) => walk(index === 0 ? -1 : 1),
      week: ({ index }) => walk(index === 0 ? -7 : 7),
      month: ({ index }) => turn(index === 0 ? -1 : 1),
      "open-day": () => {
        const first = day === null ? undefined : byDay(slots.filter((x) => !off.has(x.channel))).get(day)?.[0];
        if (first === undefined) return false;
        onOpenSlot(first.id);
      },
      "clear-day": () => onDay(null),
      rail: () => onClose(),
      board: () => onBoard(),
      schedule: () => (onSchedule === undefined ? false : onSchedule()),
    },
    { facts: day === null ? [] : ["day"] },
  );

  return (
    <MonthCalendar
      slots={slots}
      nowMs={nowMs}
      month={month}
      day={day}
      channelsOff={off}
      onMonth={turn}
      onToday={() => {
        setMonth(monthOf(nowMs));
        onDay(dayKey(nowMs));
      }}
      onDay={onDay}
      onChannel={(c) => onOff(off.has(c) ? offList.filter((x) => x !== c) : [...offList, c])}
      onClose={onClose}
      slotHref={(id) => slotHref(id)}
      onOpenSlot={onOpenSlot}
      panelRef={panel}
      {...(channels === undefined ? {} : { channels })}
      {...(mode === undefined ? {} : { mode })}
      {...(tick === undefined ? {} : { tick })}
      {...(onSchedule === undefined ? {} : { onSchedule: () => onSchedule() })}
    />
  );
}
