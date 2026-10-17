// The Calendar rail at the Floor's right edge (prototype index.html `CalendarColumn`, floor.css
// `[data-component=CalendarColumn]`, `.cal-head`, `.cal-sec`, `.cal-day`, `.now-line`): Next,
// grouped by day with the NOW line where the clock is; what needs a decision (failed, missed,
// drifted) with the errors verbatim; Published. Each row is a door to the slot's record. The
// head's control (and C) opens the month.
//
// Times are UTC (./calendar.ts says why), and the NOW line names it once.

import { Fragment } from "react";

import { capsFor } from "../keycaps/caps.ts";
import keycap from "../keycaps/Keycaps.module.css";
import { cx } from "../cx.ts";
import { Tally } from "../tally/Tally.tsx";
import { FloorGlyph } from "./FloorGlyph.tsx";
import { clock, dayLabel, nextRows, type Rail } from "./calendar.ts";
import { SlotRow } from "./SlotRow.tsx";
import s from "./CalendarColumn.module.css";

export type CalendarColumnProps = {
  readonly rail: Rail;
  readonly nowMs: number;
  readonly open: boolean;
  readonly onOpen: () => void;
  /** Where a slot's own record lives (the Floor's slot level, `/floor?slot=<id>`). */
  readonly slotHref?: (id: string) => string;
  /** Opens a slot's record in place on a plain click (the link stays the link). */
  readonly onOpenSlot?: (id: string) => void;
  /** How many published slots to show; the rest are in the month. */
  readonly publishedShown?: number;
};

export function CalendarColumn({ rail, nowMs, open, onOpen, slotHref, onOpenSlot, publishedShown = 6 }: CalendarColumnProps) {
  const cap = capsFor("floor", "calendar")[0];
  const door = (id: string) => (slotHref === undefined ? {} : { href: slotHref(id), ...(onOpenSlot === undefined ? {} : { onOpen: onOpenSlot }) });
  const nowLine = (
    <div className={s.now} data-now="">
      NOW {clock(nowMs)} UTC
    </div>
  );
  return (
    <aside className={s.col} data-component="CalendarColumn" aria-label="Calendar">
      <div className={s.head}>
        Calendar
        <button type="button" className={s.expand} onClick={onOpen} aria-label="expand calendar to month" aria-expanded={open}>
          <FloorGlyph name="expand" className={s.expandMark} />
          {cap !== undefined && <kbd className={keycap.cap}>{cap}</kbd>}
        </button>
      </div>
      <div className={s.body}>
        <div className={s.sec}>
          Next <Tally value={rail.nextCount} />
        </div>
        {nextRows(rail).map((r) =>
          r.kind === "now" ? (
            <Fragment key="now">{nowLine}</Fragment>
          ) : r.kind === "day" ? (
            <div key={`day:${r.day}`} className={s.day}>
              {dayLabel(r.day)}
            </div>
          ) : (
            <SlotRow key={r.slot.id} slot={r.slot} {...door(r.slot.id)} />
          ),
        )}
        <div className={cx(s.sec, s.bad)}>
          Failed · missed · drift <Tally value={rail.failed.length} />
        </div>
        {rail.failed.map((slot) => (
          <SlotRow key={slot.id} slot={slot} {...door(slot.id)} />
        ))}
        <div className={cx(s.sec, s.good)}>
          Published <Tally value={rail.published.length} />
        </div>
        {rail.published.slice(0, publishedShown).map((slot) => (
          <SlotRow key={slot.id} slot={slot} showError={false} {...door(slot.id)} />
        ))}
      </div>
    </aside>
  );
}
