"use client";

// THE OPEN CONVERSATION'S GRIP (spark studio-to-release, WP6): the edge between the release's step and the open
// conversation, dragged or keyed to share the frame between them. A window separator (WAI-ARIA APG): focusable,
// its value the conversation's share of the frame in percent; arrows move it a step, Page keys a stride, Home and
// End to the ends. The share is the page's state only - a reload opens at the default.
import type { KeyboardEvent, PointerEvent } from "react";

import s from "./dock.module.css";

// The host's own bar, banner and dock take ~a quarter of a 1100px frame; under 45% the answer cards got ~50px
// (measured at 1920 and 1366, fixture night-drive). OPEN_DEFAULT is mirrored by --dock-share in dock.module.css.
export const OPEN_MIN = 45;
export const OPEN_MAX = 88;
export const OPEN_DEFAULT = 64;
const STEP = 4;
const STRIDE = 16;

export const clampOpen = (n: number): number => Math.round(Math.min(OPEN_MAX, Math.max(OPEN_MIN, n)));

const KEYS: Readonly<Record<string, (v: number) => number>> = {
  ArrowUp: (v) => v + STEP,
  ArrowDown: (v) => v - STEP,
  PageUp: (v) => v + STRIDE,
  PageDown: (v) => v - STRIDE,
  Home: () => OPEN_MIN,
  End: () => OPEN_MAX,
};

export function Grip({ value, onChange, controls, frame }: { readonly value: number; readonly onChange: (n: number) => void; readonly controls: string; readonly frame: () => DOMRect | null }) {
  const at = (e: PointerEvent<HTMLDivElement>): void => {
    const r = frame();
    if (r === null || r.height <= 0) return;
    onChange(clampOpen(((r.bottom - e.clientY) / r.height) * 100));
  };
  return (
    <div
      className={s.grip}
      role="separator"
      aria-orientation="horizontal"
      aria-label="conversation height"
      aria-controls={controls}
      aria-valuemin={OPEN_MIN}
      aria-valuemax={OPEN_MAX}
      aria-valuenow={value}
      aria-valuetext={`${value} percent`}
      tabIndex={0}
      onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
        const move = KEYS[e.key];
        if (move === undefined) return;
        e.preventDefault();
        onChange(clampOpen(move(value)));
      }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        e.preventDefault();
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) at(e);
      }}
      onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
    />
  );
}
