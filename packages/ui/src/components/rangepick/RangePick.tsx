"use client";

// A SECTION OF A SONG, PICKED OVER ITS WAVE (spark track-mirror-studio). Two handles and the span between them,
// the span dragged as one; each handle is a WAI-ARIA slider on its own (arrows a tenth of a second, shift a
// second), its bounds the ones its partner and the length limits leave it, its value spoken as a time. The
// playhead is a mark, not a control. The span is the caller's: the pick only proposes the next one
// (./rangepick.ts holds every rule, so the limits a key meets and the limits a drag meets are one).
//
// The bars outside the span sit under a veil rather than at the Wave's own dim: they stay readable as the song
// (marks hold 3:1 on the ink ground) while the span reads as the part that is chosen.
import { useRef, type KeyboardEvent, type PointerEvent } from "react";

import { Wave } from "../wave/Wave.tsx";
import { clockTenths, endBounds, keyDelta, moveSpan, setEnd, setStart, share, startBounds, xToS, type Limits, type Span } from "./rangepick.ts";
import s from "./RangePick.module.css";

export type RangePickProps = {
  /** What the span is a section of, for the handles' names ("section start of Tears"). */
  readonly label: string;
  readonly peaks: readonly number[];
  readonly lenS: number;
  readonly minS: number;
  readonly maxS: number;
  readonly value: Span;
  readonly onChange: (span: Span) => void;
  /** Seconds into the song, while something plays it. */
  readonly playheadS?: number;
  readonly tone?: "cyan" | "violet" | "emerald" | "amber";
  readonly disabled?: boolean;
};

type Grip = { readonly kind: "start" | "end" | "span"; readonly x0: number; readonly from: Span };

const W = 1000;
const H = 80;

export function RangePick({ label, peaks, lenS, minS, maxS, value, onChange, playheadS, tone = "cyan", disabled = false }: RangePickProps) {
  const box = useRef<HTMLDivElement | null>(null);
  const grip = useRef<Grip | null>(null);
  const lim: Limits = { lenS, minS, maxS };
  const a = share(value.startS, lenS) * 100;
  const b = share(value.endS, lenS) * 100;
  const sb = startBounds(value, lim);
  const eb = endBounds(value, lim);
  const width = value.endS - value.startS;

  const secondsAt = (clientX: number): number => {
    const r = box.current?.getBoundingClientRect();
    return r === undefined ? 0 : xToS(clientX - r.left, r.width, lenS);
  };

  const down = (e: PointerEvent<HTMLElement>): void => {
    const kind = e.currentTarget.dataset["grip"];
    if (disabled || (kind !== "start" && kind !== "end" && kind !== "span")) return;
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    grip.current = { kind, x0: e.clientX, from: value };
    if (kind !== "span") e.currentTarget.focus();
  };
  const move = (e: PointerEvent<HTMLElement>): void => {
    const g = grip.current;
    if (g === null) return;
    if (g.kind === "start") onChange(setStart(g.from, secondsAt(e.clientX), lim));
    else if (g.kind === "end") onChange(setEnd(g.from, secondsAt(e.clientX), lim));
    else {
      const r = box.current?.getBoundingClientRect();
      const dS = r === undefined || r.width <= 0 ? 0 : ((e.clientX - g.x0) / r.width) * lenS;
      onChange(moveSpan(g.from, dS, lim));
    }
  };
  const up = (): void => {
    grip.current = null;
  };
  const key = (e: KeyboardEvent<HTMLDivElement>): void => {
    const kind = e.currentTarget.dataset["grip"];
    const d = keyDelta(e.key, e.shiftKey);
    if (disabled || d === null) return;
    e.preventDefault();
    onChange(kind === "start" ? setStart(value, value.startS + d, lim) : setEnd(value, value.endS + d, lim));
  };

  const handle = (kind: "start" | "end", at: number, bounds: { readonly min: number; readonly max: number }, now: number) => (
    <div
      className={s.handle}
      data-grip={kind}
      style={{ left: `${at}%` }}
      role="slider"
      tabIndex={0}
      aria-label={`section ${kind} of ${label}`}
      aria-valuemin={bounds.min}
      aria-valuemax={bounds.max}
      aria-valuenow={now}
      aria-valuetext={clockTenths(now)}
      aria-disabled={disabled ? true : undefined}
      onKeyDown={key}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      <span className={s.grip} aria-hidden="true" />
    </div>
  );

  return (
    <div className={s.pick} data-disabled={disabled ? "" : undefined}>
      <div className={s.track} ref={box}>
        <Wave peaks={peaks} width={W} height={H} tone={tone} stretch />
        <span className={s.veil} style={{ left: 0, width: `${a}%` }} aria-hidden="true" />
        <span className={s.veil} style={{ left: `${b}%`, right: 0 }} aria-hidden="true" />
        <span className={s.span} style={{ left: `${a}%`, width: `${b - a}%` }} aria-hidden="true" data-grip="span" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
        {playheadS !== undefined && <span className={s.head} style={{ left: `${share(playheadS, lenS) * 100}%` }} aria-hidden="true" />}
        {handle("start", a, sb, value.startS)}
        {handle("end", b, eb, value.endS)}
      </div>
      <div className={s.read}>
        <span>{clockTenths(value.startS)}</span>
        <span className={s.len}>{`${width.toFixed(1)} s`}</span>
        <span>{clockTenths(value.endS)}</span>
      </div>
    </div>
  );
}
