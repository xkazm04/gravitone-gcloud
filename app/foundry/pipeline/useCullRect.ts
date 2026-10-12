"use client";

// RUNG 2 — WHAT THE CAMERA MAKES VISIBLE, as a rectangle that moves as rarely as
// it can get away with.
//
// Cards are a fixed size at a fixed pitch, so what is on screen is a row range
// per cell (./cells.ts) and never a search. The rectangle is QUANTIZED to the
// card pitch and is the only thing here that rides in React state: a pan that
// crosses no grid line produces an EQUAL rectangle, `sameRect` says so, and
// React is never told at all. That is the whole reason a pan step costs one DOM
// write instead of a commit.
//
// COLD START: `view` is null until the viewport has been measured AND the data
// has loaded, and null culls to nothing. A board that guessed its size would
// mount the wrong cards and then throw them away.
//
// THE ONE JUDGEMENT THIS FILE MAKES is jump versus slide, because only it knows
// how far the rectangle moved:
//
//   a SLIDE — a pan, a wheel-zoom step — overlaps the last view almost entirely,
//   so most of what is wanted is already mounted: mount the rest at once.
//
//   a JUMP — the first view, a fit, a big zoom — overlaps it by less than
//   JUMP_OVERLAP or changed zoom by more than e^JUMP_LN, so little or none of
//   what is wanted is mounted: hand it to ./waveRunner.ts.
//
// WAVE_FIRST is the floor under every view but the FIRST: a later view holding
// fewer cards than one slice is never worth waving. The first view always waves,
// from a WAVE_MIN slice, because a cold board is the one moment every card is
// new at once — the commit is spread over frames and the cards arrive staggered.

import { useRef, useState } from "react";

import type { Live } from "./canvasTypes";
import { countRect, overlap, quantize, sameRect, viewRect, type Camera, type Rect } from "./geometry";
import { JUMP_LN, JUMP_OVERLAP, OVERSCAN_PX, quantum, WAVE_FIRST, WAVE_MIN } from "./tunables";
import { beginWaves } from "./waveRunner";

export interface ViewState {
  rect: Rect;
  /** The overscan in WORLD units at this zoom — how much of `rect` is the margin
   *  mounted beyond the viewport rather than on screen. */
  m: number;
}
export interface WaveState {
  keep: ReadonlySet<string>;
  from: number;
  to: number;
}

export interface CullRect {
  view: ViewState | null;
  wave: WaveState | null;
  /** Re-measure on the next animation frame, at most once per frame. */
  scheduleView(): void;
}

export function useCullRect({
  camRef,
  sizeRef,
  framedRef,
  mountedRef,
  freshRef,
  deadRef,
  liveRef,
  viewRafRef,
}: {
  camRef: React.RefObject<Camera>;
  sizeRef: React.RefObject<{ w: number; h: number } | null>;
  framedRef: React.RefObject<boolean>;
  mountedRef: React.RefObject<readonly { id: string }[]>;
  freshRef: React.RefObject<number>;
  deadRef: React.RefObject<boolean>;
  liveRef: React.RefObject<Live | null>;
  viewRafRef: React.RefObject<number>;
}): CullRect {
  const [view, setView] = useState<ViewState | null>(null);
  const [wave, setWave] = useState<WaveState | null>(null);
  // The last rectangle WITH its zoom, which `view` does not carry: the jump test
  // needs to compare zooms, and the state would then change on every wheel step.
  const viewRef = useRef<{ rect: Rect; m: number; k: number } | null>(null);
  const wavingRef = useRef(false);

  const syncView = () => {
    const s = sizeRef.current;
    const L = liveRef.current;
    if (!s || !L || !framedRef.current) return;
    const cam = camRef.current;
    const q = quantize(viewRect(cam, s.w, s.h, OVERSCAN_PX), quantum(cam.k));
    const prev = viewRef.current;
    if (prev && sameRect(prev.rect, q)) return;
    const next = { rect: q, m: OVERSCAN_PX / cam.k, k: cam.k };
    viewRef.current = next;
    const now = countRect(L.layout, q);
    setView(next);
    // THE FIRST VIEW ALWAYS WAVES, however few cards it holds. Below the floor a
    // wave costs one extra frame, and it is what hands the cards their staggered
    // entrance (./useBoardCull.ts `enters`): without it a cold board of twenty
    // cards popped in as one block. Measured 2026-10-12, /foundry audio: 18 cards
    // mounted in one commit with no entrance at all, articles 24 of 29.
    if (wavingRef.current || (prev && now <= WAVE_FIRST) || now === 0) return;
    const jump = !prev || Math.abs(Math.log(cam.k / prev.k)) > JUMP_LN || overlap(prev.rect, q) < JUMP_OVERLAP;
    if (jump) beginWaves(new Set(mountedRef.current.map((p) => p.id)), { setWave, liveRef, freshRef, deadRef, wavingRef }, prev ? WAVE_FIRST : WAVE_MIN);
  };

  const scheduleView = () => {
    if (viewRafRef.current) return;
    viewRafRef.current = requestAnimationFrame(() => {
      viewRafRef.current = 0;
      syncView();
    });
  };

  return { view, wave, scheduleView };
}
