// THE ENGINE'S TUNABLES — every number the canvas behaves by, with the reason it
// is that number and not another.
//
// They lived at the top of PipelineCanvas.tsx, which is the file this split is
// about: a reader looking for "how far beyond the viewport do we mount" had to
// scroll past them to reach any code, and a reader looking for the code had to
// scroll past them every time. They are also the file's most STABLE part — the
// measurements behind them were taken once and have not moved — sitting in its
// most volatile one.
//
// Everything here is a module-level constant or a pure function. Nothing in this
// file may import a component, a hook or React: that is what keeps it the thing
// you can read first.

import { EASE } from "@/components/ui/tokens";

import { PITCH } from "./geometry";

/** Screen px of cards mounted beyond the viewport on every side. One pitch is
 *  the minimum for a card to be in the DOM before it is on screen; this is a
 *  few, so a flick of the wheel does not outrun the mount. It must stay larger
 *  than QUANT_PX, which eats into it. */
export const OVERSCAN_PX = 320;
/** The culling rectangle snaps outward to a grid of about this many SCREEN px
 *  (a whole number of card pitches in world units): a pan step shorter than the
 *  grid usually crosses no line and re-renders nothing at all. Snapping to one
 *  pitch in WORLD units — the first version — crossed a line on every wheel
 *  step once the board was zoomed out, because a pitch is nine screen pixels at
 *  a tenth of the zoom. */
export const QUANT_PX = 96;
export const quantum = (k: number): number => Math.max(PITCH, Math.round(QUANT_PX / k / PITCH) * PITCH);
export const WAVE_FIRST = 24;
export const WAVE_MIN = 8;
export const WAVE_MAX = 160;
/** One frame and a little: a slice that fits runs the next one bigger. */
export const WAVE_BUDGET_MS = 20;
/** A view that overlaps the last by less than this, or whose zoom moved by more
 *  than e^JUMP_LN, is a JUMP (a fit, a big zoom): its new cards mount in waves.
 *  A pan or a wheel-zoom step overlaps almost entirely and mounts at once. */
export const JUMP_OVERLAP = 0.4;
export const JUMP_LN = 0.3;
export const NODRAG =
  "[data-nodrag],button,a,input,textarea,select,summary,[contenteditable],[role=slider],[role=menuitem],[role=textbox]";
export const EDGE_PX = 70;
export const EDGE_SPEED = 18;
export const EASE4 = [...EASE] as [number, number, number, number];
export const NONE: ReadonlySet<string> = new Set();
export const NO_NAMES: Partial<Record<string, string>> = {};
