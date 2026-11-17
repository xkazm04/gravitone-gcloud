"use client";

// THE CONSOLE'S INSTRUMENTS (prototype dock-package, direction "console"): the four marks every strip is drawn from -
// a lamp (one signal hue, lit or dark, with its count), an LED meter (a ladder of segments that fills on a change),
// a counter that ticks to a new figure, and a readout (a mono label over a mono value, pressed to edit). Kit
// candidates: each is one shape with one look, used by every strip and the master the same way.
import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import type { Level } from "./strips.ts";
import s from "./instruments.module.css";

export type LampTone = "rose" | "amber" | "violet" | "emerald" | "cyan";
export const LEVEL_TONE: Readonly<Record<Level, LampTone>> = { block: "rose", warn: "amber", clear: "emerald" };

/** A figure that ticks from the old value to the new one when it changes; drawn still on mount and under reduced motion. */
export function TickCounter({ value }: { readonly value: number }) {
  const reduce = useReducedMotion() === true;
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (from.current === value) return;
    const start = from.current;
    from.current = value;
    if (reduce) return;
    const run = animate(start, value, { duration: 0.45, ease: [0.22, 1, 0.36, 1], onUpdate: (v) => setShown(Math.round(v)) });
    return () => run.stop();
  }, [value, reduce]);
  return <span className={s.counter}>{reduce ? value : shown}</span>;
}

/** One LED: lit in its hue or dark, a label under it and, lit, its count. Decorative - the strip speaks the counts. */
export function Lamp({ tone, on, label, count }: { readonly tone: LampTone; readonly on: boolean; readonly label?: string; readonly count?: number }) {
  return (
    <span className={s.lamp} data-tone={tone} data-on={on} aria-hidden="true">
      <span className={s.led} />
      {label !== undefined && <span className={s.lampLabel}>{label}</span>}
      {count !== undefined && <span className={s.lampCount}>{on ? <TickCounter value={count} /> : "·"}</span>}
    </span>
  );
}

/** A vertical ladder of segments filling bottom-up to `value`. The fill runs in once on mount, then only on a change. */
export function LedMeter({ value, level, label, text, segments = 12 }: { readonly value: number; readonly level: Level; readonly label: string; readonly text: string; readonly segments?: number }) {
  const reduce = useReducedMotion() === true;
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setArmed(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const lit = armed || reduce ? Math.round(Math.max(0, Math.min(1, value)) * segments) : 0;
  return (
    <span className={s.meter} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} aria-valuetext={text} data-tone={LEVEL_TONE[level]}>
      {Array.from({ length: segments }, (_, i) => segments - 1 - i).map((i) => (
        <span key={i} className={s.seg} data-lit={i < lit} style={{ transitionDelay: reduce ? "0s" : `${(i < lit ? i : segments - i) * 0.025}s` }} />
      ))}
    </span>
  );
}

/** A mono readout: what it measures over its value. A press opens the field's editor. */
export function Readout({ label, value, level, onPress, name }: { readonly label: string; readonly value: ReactNode; readonly level?: Level | undefined; readonly onPress: () => void; readonly name: string }) {
  return (
    <button type="button" className={s.readout} data-level={level} onClick={onPress} aria-label={name}>
      <span className={s.roLabel}>{label}</span>
      <span className={s.roValue}>{value}</span>
    </button>
  );
}

/** One lamp per track, in release order: the step's state on each. */
export function TrackLamps({ levels }: { readonly levels: readonly Level[] }) {
  if (levels.length === 0) return null;
  return (
    <span className={s.trackLamps} aria-hidden="true">
      {levels.map((l, i) => (
        <span key={i} className={s.trackLamp} data-tone={LEVEL_TONE[l]}>
          {i + 1}
        </span>
      ))}
    </span>
  );
}
