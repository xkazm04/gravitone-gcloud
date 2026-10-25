"use client";

// Events per day as stacked bars by who acted, and the range a drag selects (ledger.js
// `renderStrip`; INVENTORY.md owed it as `TimeStrip`). The geometry is strip.ts; this file
// draws it and turns a pointer into a range.
//
// The readout beside the bars is the strip's only text: the hovered day's counts by actor,
// else the selected range and how many events it holds, else the span drawn. The resting
// sentence is the live region, so a keyboard user who sets a range through the URL hears the
// same sentence a pointer user reads; the hover line is never announced. The range itself is the caller's state (the URL's from/to), never
// this component's: a drag reports `{from, to}` or null and the caller decides.

import { useState, type PointerEvent } from "react";

import { cx } from "../cx.ts";
import { vars } from "../vars.ts";
import { bars as barsOf, dragRange, nowAt, slotAt, ticks, total, type DayCount, type Range } from "./strip.ts";
import sr from "../a11y/SrOnly.module.css";
import s from "./TimeStrip.module.css";

type Drag = { readonly a: number; readonly b: number };

export type TimeStripProps = {
  readonly days: readonly DayCount[];
  /** `YYYY-MM-DD` (UTC) of NOW: later days are hatched. */
  readonly today: string;
  readonly nowMs: number;
  readonly range: Range | null;
  /** Events the selected range holds under the rest of the filter. */
  readonly inRange?: number;
  readonly onRange: (range: Range | null) => void;
};

export const shortDay = (day: string): string =>
  new Date(`${day}T00:00:00.000Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });

const span = (from: string, to: string): string => `${shortDay(from)}${to === from ? "" : ` → ${shortDay(to)}`}`;
const count = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? "" : "s"}`;

/** The readout's two lines when nothing is hovered: the range and its count, else the span. */
export function restingReadout(days: readonly string[], range: Range | null, inRange: number | undefined): readonly [string, string] {
  if (range !== null) return [span(range.from, range.to), inRange === undefined ? "" : count(inRange, "event")];
  const first = days[0];
  const last = days[days.length - 1];
  return first === undefined || last === undefined ? ["", ""] : [span(first, last), count(days.length, "day")];
}

/** The drag after the pointer reaches slot `i`: the SAME object while the slot is unchanged, so
 *  setState bails out and a drag renders once per slot crossed, not once per pointermove. */
export const stepDrag = (d: Drag, i: number): Drag => (d.b === i ? d : { a: d.a, b: i });

/**
 * The readout column. The live region holds only the resting sentence (the range and its count),
 * so a range set through the URL is announced once; the hovered day's counts are drawn beside it,
 * aria-hidden - they are the bars' own numbers - and the resting line steps out of sight, not out
 * of the region, while they show.
 */
export function Readout({ resting, at }: { readonly resting: readonly [string, string]; readonly at: DayCount | undefined }) {
  return (
    <div className={s.read}>
      <div aria-live="polite" className={at === undefined ? undefined : sr.sr}>
        <b>{resting[0]}</b>
        <br />
        {resting[1]}
      </div>
      {at !== undefined && (
        <div aria-hidden="true">
          <b>{`${shortDay(at.day)} · ${total(at)} ev`}</b>
          <br />
          <span className={s.operator}>{at.operator} op</span> · <span className={s.agent}>{at.agent} ag</span> · <span className={s.machine}>{at.machine} mc</span>
        </div>
      )}
    </div>
  );
}

export function TimeStrip({ days, today, nowMs, range, inRange, onRange }: TimeStripProps) {
  const [hover, setHover] = useState<number | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const keys = days.map((d) => d.day);
  const drawn = barsOf(days, { today, range });
  const now = nowAt(keys, nowMs);
  const n = days.length;

  const slot = (e: PointerEvent<HTMLDivElement>): number => {
    const r = e.currentTarget.getBoundingClientRect();
    return slotAt(r.width > 0 ? (e.clientX - r.left) / r.width : 0, n);
  };
  const down = (e: PointerEvent<HTMLDivElement>): void => {
    if (n === 0) return;
    const i = slot(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ a: i, b: i });
    e.preventDefault();
  };
  const move = (e: PointerEvent<HTMLDivElement>): void => {
    if (n === 0) return;
    const i = slot(e);
    if (drag !== null) setDrag(stepDrag(drag, i));
    setHover(i);
  };
  const up = (): void => {
    if (drag === null) return;
    const next = dragRange(keys, drag.a, drag.b, range);
    setDrag(null);
    onRange(next);
  };

  const first = keys[0];
  const last = keys[keys.length - 1];
  const at = hover === null ? undefined : days[hover];
  const resting = restingReadout(keys, range, inRange);
  const brush = drag === null ? null : { lo: Math.min(drag.a, drag.b), hi: Math.max(drag.a, drag.b) };
  return (
    <div className={s.strip} data-component="TimeStrip">
      <div className={s.side}>
        <span className={s.head}>time · utc</span>
        <Readout resting={resting} at={at} />
      </div>
      <div className={s.main}>
        <div
          className={s.bars}
          role="group"
          aria-label={first === undefined || last === undefined ? "events per day" : `events per day, ${first} to ${last}`}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={() => setDrag(null)}
          onPointerLeave={() => {
            if (drag === null) setHover(null);
          }}
        >
          {drawn.map((b) => (
            <div key={b.day} className={cx(s.day, b.future && s.fut, b.inRange && s.sel, b.dim && s.dim, b.n === 0 && !b.future && s.zero)} data-day={b.day}>
              {b.segments.map((g) => (
                <i key={g.kind} className={s[g.kind]} style={vars({ "--h": `${g.px.toFixed(1)}px` })} />
              ))}
            </div>
          ))}
          {now !== null && (
            <div className={s.now} style={vars({ "--x": now })}>
              <span>NOW</span>
            </div>
          )}
          {brush !== null && n > 0 && <div className={s.brush} style={vars({ "--lo": brush.lo / n, "--w": (brush.hi - brush.lo + 1) / n })} />}
        </div>
        <div className={s.axis} aria-hidden="true">
          {ticks(keys).map((t) => (
            <span key={t.index} className={cx(t.month && s.mo)} style={vars({ "--x": n === 0 ? 0 : t.index / n })}>
              {t.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
