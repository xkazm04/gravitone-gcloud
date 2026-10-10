"use client";

// WHERE THE OVERLAYS SIT — the registry that moves them, and the two parts every
// head is built from.
//
// The heads follow the camera but do NOT scale with it, so a stage's word stays
// 16px when the board is a thumbnail and a lane's name stays readable while its
// 500-card column scrolls past. That means they cannot ride the world's one
// transform, and it means their position cannot go through React either: a pan
// writes a `translate3d` per head straight to the DOM, through `apply` below,
// exactly as the world layer does. Registering is how a head gets into that
// list; `data-narrow` is how one that has run out of room says so.

import { useCallback, useLayoutEffect, useRef } from "react";

import { animate } from "motion/react";

import { EASE } from "@/components/ui/tokens";

import { FRAME, type Camera } from "./geometry";

const EASE4 = [...EASE] as [number, number, number, number];

/* ── head registry: DOM writes, no React ───────────────────────────────── */

interface HeadSpec {
  axis: "x" | "y";
  at: number;
  size: number;
}

export interface HeadRegistry {
  add(el: HTMLElement, spec: HeadSpec): () => void;
  apply(cam: Camera): void;
}

export function createHeadRegistry(initial: Camera): HeadRegistry {
  const heads = new Map<HTMLElement, HeadSpec>();
  let cam: Camera = initial;

  const place = (el: HTMLElement, s: HeadSpec) => {
    const label = el.firstElementChild as HTMLElement | null;
    if (s.axis === "x") {
      const left = s.at * cam.k + cam.x - FRAME.left;
      const w = s.size * cam.k;
      el.style.transform = `translate3d(${left}px,0,0)`;
      el.style.width = `${w}px`;
      // A span too narrow for its word and count drops the count and the tracking
      // (the markup reads `group-data-[narrow]`), so the word is still a word.
      el.dataset.narrow = w < 170 ? "1" : "0";
      // The label stays in view while its span is wider than the viewport.
      if (label) label.style.transform = `translate3d(${Math.max(0, Math.min(w - 96, 8 - left))}px,0,0)`;
    } else {
      const top = s.at * cam.k + cam.y - FRAME.top;
      const h = s.size * cam.k;
      el.style.transform = `translate3d(0,${top}px,0)`;
      el.style.height = `${h}px`;
      if (label) label.style.transform = `translate3d(0,${Math.max(0, Math.min(h - 64, 8 - top))}px,0)`;
    }
  };

  return {
    add(el, spec) {
      heads.set(el, spec);
      place(el, spec);
      return () => {
        heads.delete(el);
      };
    },
    apply(next) {
      cam = next;
      heads.forEach((s, el) => place(el, s));
    },
  };
}

/** The glass a head is drawn on: shared so the two axes cannot drift apart. */
export const HEAD_GLASS = "overflow-hidden rounded-lg border border-white/10 bg-[var(--gt-ink)]/70 backdrop-blur-md";

export function HeadSlot({
  reg,
  axis,
  at,
  size,
  className,
  children,
}: {
  reg: HeadRegistry;
  axis: "x" | "y";
  at: number;
  size: number;
  className: string;
  children: React.ReactNode;
}) {
  const ref = useCallback((el: HTMLDivElement | null) => (el ? reg.add(el, { axis, at, size }) : undefined), [reg, axis, at, size]);
  return (
    <div ref={ref} className={`group/head absolute top-0 left-0 ${className}`}>
      {children}
    </div>
  );
}

/* ── a count that rolls ────────────────────────────────────────────────── */

/** The number rolls from where it was to where it is. First paint rolls up from
 *  zero — which is "cards settling into lanes on load". `calm` sets it plainly. */
export function Roll({ value, calm }: { value: number; calm: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (calm || shown.current === value) {
      shown.current = value;
      el.textContent = String(value);
      return;
    }
    const a = animate(shown.current, value, {
      duration: 0.6,
      ease: EASE4,
      onUpdate: (v) => {
        shown.current = v;
        el.textContent = String(Math.round(v));
      },
    });
    return () => a.stop();
  }, [value, calm]);
  return (
    <span className="tabular-nums">
      <span ref={ref} aria-hidden />
      <span className="sr-only">{value}</span>
    </span>
  );
}

/* ── the heads ─────────────────────────────────────────────────────────── */
