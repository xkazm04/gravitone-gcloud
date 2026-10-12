"use client";

/**
 * A PRESS ON THE BACKGROUND TAKES FOCUS AND MOVES NOTHING.
 *
 * It used to drag the camera, and the operator's reading was that the whole
 * board wandering under a stray drag is not a feature — the only thing that
 * should travel when you pull on it is a CARD. A board that drifts also loses
 * the one thing the stage and lane heads buy you, which is knowing where you are
 * without looking.
 *
 * Reaching what is off-screen is the wheel's job: the wheel zooms at the
 * pointer, Shift+wheel pans horizontally, Alt+wheel vertically, and a trackpad's
 * sideways swipe pans (./useViewportEvents.ts). What went is the pointer-drag
 * path into the same camera, and with it the grab cursor (2026-10-12).
 *
 * THE FOCUS HALF STAYS, and it is not incidental: the viewport carries
 * `aria-activedescendant`, so a click on the board is how a pointer user hands
 * themselves the keyboard. `pointerFocusRef` records that the focus came from a
 * pointer rather than a Tab, which is what suppresses the focus ring.
 *
 * It is a separate file from ./useCardDrag.ts because it is the other half of a
 * fork — one branch is a gesture, this one is deliberately not — and a reader
 * who comes here asking "why can't I pan?" should find the answer rather than a
 * function at the bottom of the drag.
 */

import type { AnimationPlaybackControls } from "motion/react";

export function pressBackground(
  e: React.PointerEvent<HTMLDivElement>,
  {
    viewportRef,
    camAnimRef,
    swallowRef,
    pointerFocusRef,
  }: {
    viewportRef: React.RefObject<HTMLDivElement | null>;
    camAnimRef: React.RefObject<AnimationPlaybackControls | null>;
    swallowRef: React.RefObject<boolean>;
    pointerFocusRef: React.RefObject<boolean>;
  },
) {
  const el = viewportRef.current;
  if (!el) return;
  void e;
  camAnimRef.current?.stop();
  swallowRef.current = false;
  pointerFocusRef.current = document.activeElement !== el;
  el.focus({ preventScroll: true });
}
