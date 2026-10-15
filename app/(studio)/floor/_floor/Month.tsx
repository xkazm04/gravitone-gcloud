"use client";

// The month, open over the Floor (prototype index.html `setCal`, `renderMonth`, the calendar
// key handler). It is a layer (useLayer, kind `sheet`, mode `calendar`), so while it is open the
// Floor's keys are not live, Escape belongs to it, and focus returns to what opened it.
//
// Keys, by verb (keymap/bindings.ts `calendar`): ←/→ a day, ↑/↓ a week, [ ] a month, ⏎ the
// selected day's first slot, Esc clears the day (then, through the layer, closes the month),
// C back to the rail, B the Board. The month and the selected day live in the Floor's URL
// (`?cal=1&day=`); channel toggles are this view's own state.

import { useEffect, useRef, useState } from "react";

import { MonthCalendar } from "@gt/ui/components/floor/MonthCalendar.tsx";
import { byDay, dayKey, monthOf, monthOfKey, moveDay, shiftMonth, type RailSlot, type YearMonth } from "@gt/ui/components/floor/calendar.ts";
import { useKeys } from "@gt/ui/keymap/dispatch";
import { useLayer } from "@gt/ui/layers/useLayer";

/** Where a slot's record lives until the Calendar is rebuilt (Phase 6): v1's page. */
export const SLOT_HREF = "/calendar";

export type MonthProps = {
  readonly slots: readonly RailSlot[];
  readonly nowMs: number;
  readonly day: string | null;
  readonly onDay: (day: string | null) => void;
  readonly onClose: () => void;
  readonly onBoard: () => void | false;
  readonly onOpenSlot: (href: string) => void;
};

export function Month({ slots, nowMs, day, onDay, onClose, onBoard, onOpenSlot }: MonthProps) {
  const panel = useRef<HTMLElement | null>(null);
  // The page turned to with [ ] or the arrows; a selected day carries its own month, so a day
  // walked past the edge turns the page without a second piece of state to keep in step.
  const [turned, setMonth] = useState<YearMonth>(() => (day === null ? monthOf(nowMs) : monthOfKey(day)));
  const month = day === null ? turned : monthOfKey(day);
  const [off, setOff] = useState<ReadonlySet<string>>(() => new Set());
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
        onOpenSlot(SLOT_HREF);
      },
      "clear-day": () => onDay(null),
      rail: () => onClose(),
      board: () => onBoard(),
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
      onChannel={(c) =>
        setOff((cur) => {
          const nx = new Set(cur);
          if (nx.has(c)) nx.delete(c);
          else nx.add(c);
          return nx;
        })
      }
      onClose={onClose}
      slotHref={SLOT_HREF}
      panelRef={panel}
    />
  );
}
