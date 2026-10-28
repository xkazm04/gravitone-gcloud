"use client";

// A continuous control (spark audio-agent-studio: a stem's level, its pan, a transport's seek):
// the WAI-ARIA slider pattern on one element, so no raw <input type=range> enters the kit. Arrows
// move one step, Page Up / Page Down ten, Home / End the ends; a press or a drag sets the value
// at the pointer. `valueText` is what a screen reader hears ("-6 dB", "a little left"), never a
// bare number. The value is the caller's: the fader only proposes the next one.
import { useRef, type KeyboardEvent, type PointerEvent } from "react";

import { cx } from "../cx.ts";
import s from "./Fader.module.css";

export type FaderProps = {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly onChange: (value: number) => void;
  readonly valueText: string;
  /** Draw the fill from the middle (a pan), not from the left end. */
  readonly centred?: boolean;
  readonly disabled?: boolean;
};

/** The value a key asks for, or null for a key the fader does not take. */
export function faderKey(key: string, value: number, p: Pick<FaderProps, "min" | "max" | "step">): number | null {
  const at = (v: number): number => Math.max(p.min, Math.min(p.max, Math.round(v / p.step) * p.step));
  if (key === "ArrowRight" || key === "ArrowUp") return at(value + p.step);
  if (key === "ArrowLeft" || key === "ArrowDown") return at(value - p.step);
  if (key === "PageUp") return at(value + p.step * 10);
  if (key === "PageDown") return at(value - p.step * 10);
  if (key === "Home") return p.min;
  if (key === "End") return p.max;
  return null;
}

export function Fader({ label, value, min, max, step, onChange, valueText, centred = false, disabled = false }: FaderProps) {
  const dragging = useRef(false);
  const span = max - min || 1;
  const frac = Math.max(0, Math.min(1, (value - min) / span));
  const set = (e: PointerEvent<HTMLDivElement>): void => {
    const r = e.currentTarget.getBoundingClientRect();
    const f = r.width > 0 ? Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) : 0;
    onChange(Math.round((min + f * span) / step) * step);
  };
  const fill = centred ? { left: `${Math.min(frac, 0.5) * 100}%`, width: `${Math.abs(frac - 0.5) * 100}%` } : { left: "0%", width: `${frac * 100}%` };
  return (
    <div
      className={cx(s.fader, disabled && s.off)}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={valueText}
      aria-disabled={disabled ? true : undefined}
      onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
        if (disabled) return;
        const next = faderKey(e.key, value, { min, max, step });
        if (next === null) return;
        e.preventDefault();
        onChange(next);
      }}
      onPointerDown={(e) => {
        if (disabled) return;
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        set(e);
      }}
      onPointerMove={(e) => {
        if (dragging.current) set(e);
      }}
      onPointerUp={() => {
        dragging.current = false;
      }}
      onPointerCancel={() => {
        dragging.current = false;
      }}
    >
      <span className={s.rail}>
        <span className={s.fill} style={fill} />
      </span>
      <span className={s.knob} style={{ left: `${frac * 100}%` }} />
    </div>
  );
}
