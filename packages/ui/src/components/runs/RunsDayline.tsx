"use client";

// THE DAY-LINE (prototype projects.js `renderRuns`, `Bar`, `drawLinks`; projects.css "runs").
// One row per resource, then the Weir and the Calendar; bars packed into sub-tracks up to the
// lane's capacity with the rest behind +N; a NOW line; links for the lit thread.
//
// What is the caller's and what is this component's: the caller says WHAT exists (rows, bars,
// pins, dependencies, the selection, what is lit) and owns the URL and the keys; this draws it
// and reports presses. Positions come from ./dayline.ts and nowhere else, links included
// (shared anchor geometry), and the DOM holds only the bars inside the scrolled window plus a
// viewport either side (./dayline.ts says why that bound is honest).
//
// ACCESSIBILITY (canvas-graph: canvas-accessibility). The scroller is ONE tab stop, a named
// group whose name counts every bar, drawn or not. Bars are buttons for the pointer and for
// assistive technology's own navigation, but out of the tab order: the keymap's J/K walk
// them, and the selected bar is scrolled into view and takes focus, so the cursor is never
// somewhere the operator cannot see. Each bar's name says lane, title, state and time;
// colour is never the only channel (the state is in the name and in the bar's border style).

import { useEffect, useMemo, useRef, useState } from "react";

import type { SlotState } from "@gt/domain/slot.machine";

import { cx } from "../cx.ts";
import type { Look } from "../status/status.ts";
import { vars } from "../vars.ts";
import { anchors, approxLabelWidth, barBox, hm, inWindow, nights, pack, rowHeight, seatLabels, ticks, widthOf, xAt, type Placed, type Span, type Zoom, pphOf } from "./dayline.ts";
import type { RowKind } from "./lanes.ts";
import type { Lit } from "./thread.ts";
import s from "./RunsDayline.module.css";

export type DaylineRow = {
  readonly id: string;
  readonly label: string;
  readonly engines: string;
  readonly cap: number;
  readonly kind: RowKind;
  /** How much of the resource is held now, 0..1, with its spoken form. Absent on Weir and Calendar. */
  readonly held?: { readonly share: number; readonly name: string };
  /** The lane is on HOLD (COMMON decision 6): an interrupted paid job waits on the operator's look. */
  readonly hold?: { readonly name: string };
};

export type DaylineBar = {
  readonly id: string;
  readonly row: string;
  readonly s: number;
  readonly e: number;
  readonly look: Look;
  readonly label: string;
  readonly sub?: string;
  /** A bar outside any project is a Floor run, drawn with the tighter corner. */
  readonly floor?: boolean;
  /** Done share of a running bar, 0..1. */
  readonly progress?: number;
  readonly mark?: "bar" | "gate";
  readonly blocked?: boolean;
  /** The accessible name: lane, title, state, time - every channel the drawing uses. */
  readonly name: string;
};

export type DaylinePin = { readonly id: string; readonly at: number; readonly state: SlotState; readonly name: string; readonly href: string };

export type RunsDaylineProps = {
  /** The region's name; it should count the real totals (canvas-accessibility). */
  readonly name: string;
  readonly rows: readonly DaylineRow[];
  readonly bars: readonly DaylineBar[];
  readonly pins: readonly DaylinePin[];
  readonly span: Span;
  readonly zoom: Zoom;
  readonly now: number;
  readonly selected: string | null;
  readonly lit: Lit | null;
  readonly open: ReadonlySet<string>;
  readonly onSelect: (id: string | null) => void;
  readonly onToggleRow: (row: string) => void;
  readonly onHover?: (id: string | null) => void;
  /** Re-centres the view when it changes: the time to bring to the viewport's centre, or `now`. */
  readonly centre: { readonly key: string; readonly at: number | "now" };
};

/** Half the width drawn before the scroller has been measured: one wide screen either side of NOW. */
const WINDOW_PX = 2560;

type Laid = { readonly row: DaylineRow; readonly top: number; readonly height: number; readonly placed: readonly Placed[]; readonly shown: number; readonly over: number };

export function RunsDayline(p: RunsDaylineProps) {
  const { rows, bars, pins, span, zoom, now, selected, lit, open } = p;
  const pph = pphOf(zoom);
  const x = (t: number): number => xAt(span, pph, t);
  const W = widthOf(span, pph);
  const byId = useMemo(() => new Map(bars.map((b) => [b.id, b])), [bars]);

  // The layout is a function of the data and the selection, never of the scroll position: the
  // scroll listener below re-renders on every frame, and packing every bar of every row each
  // time (~3 ms at the ledger's 1000-run cap) would be paid per frame for an identical answer.
  const { laid, top, placedAt, labelSeat } = useMemo(() => {
    const at = (t: number): number => xAt(span, pph, t);
    const prio = (id: string): number => (id === selected ? 3 : lit?.ids.has(id) === true ? 2 : 0);
    const laid: Laid[] = [];
    let top = 0;
    for (const row of rows) {
      const mine = bars.filter((b) => b.row === row.id);
      const pk = pack(mine, at, { cap: row.cap, open: open.has(row.id), prio });
      const h = rowHeight(pk.shown);
      laid.push({ row, top, height: h, placed: pk.placed.filter((q) => q.track < pk.shown), shown: pk.shown, over: pk.over.length });
      top += h;
    }
    const placedAt = new Map<string, { readonly q: Placed; readonly top: number }>();
    for (const l of laid) for (const q of l.placed) placedAt.set(q.id, { q, top: l.top });
    // Seats are decided per row: track 0 of one lane is not track 0 of the next.
    const labelSeat = new Map<string, "in" | "beside" | "hover">();
    for (const l of laid) for (const [id, seat] of seatLabels(l.placed, (x) => approxLabelWidth(byId.get(x)?.label ?? ""))) labelSeat.set(id, seat);
    return { laid, top, placedAt, labelSeat };
  }, [rows, bars, byId, span, pph, open, selected, lit]);

  const scroller = useRef<HTMLDivElement | null>(null);
  // Before the first measure (and on the server) the window is NOW plus or minus WINDOW_PX,
  // so even the first paint is bounded; the scroller's own width takes over on the next frame.
  const [view, setView] = useState<{ readonly x0: number; readonly x1: number; readonly measured: boolean }>(() => ({ x0: x(now) - WINDOW_PX, x1: x(now) + WINDOW_PX, measured: false }));
  useEffect(() => {
    const el = scroller.current;
    if (el === null) return;
    let frame = 0;
    const read = (): void => {
      frame = 0;
      const vw = el.clientWidth;
      setView({ x0: el.scrollLeft - vw, x1: el.scrollLeft + 2 * vw, measured: true });
    };
    const onScroll = (): void => {
      if (frame === 0) frame = window.requestAnimationFrame(read);
    };
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, []);

  // Re-centre on the caller's say-so only (a zoom, NOW, a key-walk), never on a data refresh:
  // a refresh that moved the view would take the operator's place away (projects.js keepScroll).
  // The target is read through a ref so that only the key and the zoom re-run the effect.
  const target = useRef(0);
  const centreX = x(p.centre.at === "now" ? now : p.centre.at);
  useEffect(() => {
    target.current = centreX;
  });
  const nowAnchor = p.centre.at === "now";
  useEffect(() => {
    const el = scroller.current;
    if (el === null) return;
    const vw = el.clientWidth;
    el.scrollLeft = Math.max(0, target.current - (nowAnchor ? vw * 0.3 : vw / 2));
  }, [p.centre.key, zoom, nowAnchor]);

  useEffect(() => {
    if (selected === null) return;
    const el = scroller.current?.querySelector<HTMLElement>(`[data-bar="${CSS.escape(selected)}"]`);
    el?.focus({ preventScroll: true });
  }, [selected, p.centre.key]);

  // The selection is always drawn, in the window or not: focus never lands on a bar that is not there.
  const drawn = (l: Laid): readonly Placed[] => [...inWindow(l.placed, view.x0, view.x1), ...l.placed.filter((q) => q.id === selected && !(q.l <= view.x1 && q.l + q.w >= view.x0))];

  return (
    // `data-measured`: the drawn set is the client's own window now, not the server's first
    // paint - the point after which a bar in the DOM stays in it until the view moves.
    <div className={s.root} data-component="RunsDayline" data-measured={view.measured ? "" : undefined}>
      <div className={s.scroll} ref={scroller} role="group" aria-label={p.name} tabIndex={0}>
        <div className={s.canvas} data-lit={lit === null ? undefined : "1"} style={vars({ "--w": `${W}px` })}>
          <div className={s.axis}>
            <div className={s.corner}>
              <span>UTC</span>
              <span>{zoom}</span>
            </div>
            <div className={s.ticks}>
              {ticks(span, pph).map((t) => (
                <span key={t.at} className={cx(s.tick, t.day !== undefined && s.day)} style={vars({ "--x": `${t.x.toFixed(1)}px` })}>
                  {t.day !== undefined && <b>{t.day}</b>}
                  {t.label}
                </span>
              ))}
            </div>
          </div>
          <div className={s.rows}>
            <div className={s.track} aria-hidden="true">
              {nights(span, pph).map((n) => (
                <i key={n.x} className={s.night} style={vars({ "--x": `${n.x.toFixed(1)}px`, "--nw": `${n.w.toFixed(1)}px` })} />
              ))}
            </div>
            {laid.map((l) => (
              <div key={l.row.id} className={cx(s.row, s[`r-${l.row.kind}`])} style={vars({ "--h": `${l.height}px` })} data-row={l.row.id}>
                <RowLabel row={l.row} over={l.over} open={open.has(l.row.id)} onToggle={() => p.onToggleRow(l.row.id)} />
                <div className={s.lane}>
                  {l.row.kind === "calendar" &&
                    pins
                      .filter((pin) => pin.at >= span.from && pin.at <= span.to)
                      .map((pin) => (
                        <a key={pin.id} className={cx(s.pin, s[`pin-${pin.state}`])} href={pin.href} aria-label={pin.name} style={vars({ "--x": `${x(pin.at).toFixed(1)}px` })}>
                          <i />
                        </a>
                      ))}
                  {drawn(l).map((q) => {
                    const b = byId.get(q.id);
                    return b === undefined ? null : (
                      <Bar key={q.id} bar={b} q={q} seat={labelSeat.get(q.id) ?? "in"} selected={selected === q.id} thread={lit?.ids.has(q.id) === true} onSelect={p.onSelect} onHover={p.onHover} />
                    );
                  })}
                </div>
              </div>
            ))}
            <svg className={s.links} width={W} height={top} aria-hidden="true">
              {(lit?.links ?? []).map((k) => {
                const a = placedAt.get(k.from);
                const b = placedAt.get(k.to);
                if (a === undefined || b === undefined) return null;
                const from = anchors(barBox(a.q), a.top).out;
                const to = anchors(barBox(b.q), b.top).in;
                const mx = Math.max(24, Math.abs(to.x - from.x) / 2);
                return (
                  <g key={`${k.from}>${k.to}`} className={cx(s.lk, s[k.tone], k.bad && s.bad)}>
                    <path d={`M${from.x},${from.y} C${from.x + mx},${from.y} ${to.x - mx},${to.y} ${to.x},${to.y}`} />
                    <circle cx={to.x} cy={to.y} r={2.6} />
                  </g>
                );
              })}
            </svg>
          </div>
          <div className={s.now} style={vars({ "--x": `${x(now).toFixed(1)}px` })} aria-hidden="true">
            <b>NOW {hm(now)}</b>
          </div>
        </div>
      </div>
    </div>
  );
}

function RowLabel({ row, over, open, onToggle }: { readonly row: DaylineRow; readonly over: number; readonly open: boolean; readonly onToggle: () => void }) {
  return (
    <div className={s.label}>
      <span className={s.ln}>
        <RowMark kind={row.kind} />
        {row.label}
        {row.cap > 1 && <span className={s.cap}>×{row.cap}</span>}
        {row.hold !== undefined && (
          <span className={s.hold} role="img" aria-label={row.hold.name}>
            hold
          </span>
        )}
        {over > 0 && (
          <button type="button" className={cx(s.ovf, open && s.on)} aria-expanded={open} aria-label={`${over} more on ${row.label}, ${open ? "collapse" : "show"}`} onClick={onToggle}>
            {open ? "−" : "+"}
            {over}
          </button>
        )}
      </span>
      <span className={s.en}>{row.engines}</span>
      {row.held !== undefined && (
        <span className={s.util} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(row.held.share * 100)} aria-label={row.held.name}>
          <i style={vars({ "--share": row.held.share })} />
        </span>
      )}
    </div>
  );
}

type BarProps = {
  readonly bar: DaylineBar;
  readonly q: Placed;
  readonly seat: "in" | "beside" | "hover";
  readonly selected: boolean;
  readonly thread: boolean;
  readonly onSelect: (id: string | null) => void;
  readonly onHover: ((id: string | null) => void) | undefined;
};

function Bar({ bar, q, seat, selected, thread, onSelect, onHover }: BarProps) {
  const box = barBox(q);
  const geo = vars({ "--l": `${box.left.toFixed(1)}px`, "--bw": `${box.width.toFixed(1)}px`, "--t": `${box.top}px`, "--bh": `${box.height}px` });
  const sub = seat === "in" && bar.sub !== undefined && box.width > approxLabelWidth(bar.label) + 110 ? bar.sub : null;
  return (
    <>
      <button
        type="button"
        tabIndex={-1}
        data-bar={bar.id}
        className={cx(s.bar, s[`s-${bar.look}`], bar.floor === true && s.floor, bar.mark === "gate" && s.gatebar, bar.blocked === true && s.blocked, selected && s.sel, thread && s.thread, s[`lab-${seat}`])}
        style={geo}
        aria-label={bar.name}
        aria-pressed={selected}
        onClick={() => onSelect(selected ? null : bar.id)}
        onMouseEnter={onHover === undefined ? undefined : () => onHover(bar.id)}
        onMouseLeave={onHover === undefined ? undefined : () => onHover(null)}
      >
        {bar.look === "running" && bar.progress !== undefined && <i className={s.prog} style={vars({ "--share": bar.progress })} />}
        <span className={s.bl}>{bar.label}</span>
        {sub !== null && <span className={s.bs}>{sub}</span>}
      </button>
      {seat === "beside" && (
        <span className={cx(s.bo, s[`bo-${bar.look}`])} aria-hidden="true" style={vars({ "--l": `${(box.left + box.width + 6).toFixed(1)}px`, "--t": `${box.top}px`, "--bh": `${box.height}px` })}>
          {bar.label}
        </span>
      )}
    </>
  );
}

/** The row's mark (shell.js `I.machine`, `I.agent`, `I.route`; projects.css `.wallmark`, `.calmark`). */
function RowMark({ kind }: { readonly kind: RowKind }) {
  if (kind === "weir" || kind === "calendar") return <i className={s[`mark-${kind}`]} aria-hidden="true" />;
  return (
    <svg className={s.lic} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      {kind === "local" ? (
        <>
          <rect x="2" y="2" width="10" height="10" rx="1.5" />
          <path d="M5 5h4v4H5z" fill="currentColor" />
        </>
      ) : kind === "seat" ? (
        <>
          <rect x="2.5" y="4" width="9" height="7.5" rx="2" />
          <path d="M7 1.5V4M5 7.5h.01M9 7.5h.01" />
        </>
      ) : (
        <>
          <path d="M1.5 3.5h6a3 3 0 010 6H4" />
          <path d="M10 7.5l2.5 2-2.5 2" />
          <path d="M4 9.5H12.5" />
        </>
      )}
    </svg>
  );
}
