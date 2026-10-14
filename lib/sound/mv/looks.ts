// ALBUM LOOKS - the placed light and weather an album's fixed picture gets
// (compositor `SceneFx`), by name. Client-safe: data only.
//
// A look belongs to ONE picture. Its coordinates are fractions of that
// picture (x across, y down; radii against its height), measured once off the
// still, so a look is only as good as the picture beside it: an album that
// reuses its cover for every track (`--still`) reuses the look; a generated
// still per track would need the positions found again.

import type { SceneFx } from "@/app/_phases/frames/music-video/compositor";

export type MvLookId = "siren-rain";

/** Misu Vol 2 cover: a siren singing on rain-wet temple steps, two braziers
 *  beside her, ghostly kithara / aulos / frame drum over the sea, moon upper
 *  right. Measured off the 2048x1136 cover on 2026-10-14. */
const SIREN_RAIN: SceneFx = {
  rain: {
    count: 320,
    angleDeg: 8,
    lengthPx: 38,
    hue: 212,
    warmZones: [
      { x: 0.185, y: 0.28, r: 0.16 },
      { x: 0.358, y: 0.38, r: 0.14 },
    ],
  },
  fires: [
    { x: 0.185, y: 0.27, r: 0.1, sparks: 26 },
    { x: 0.358, y: 0.374, r: 0.09, sparks: 22 },
  ],
  threads: {
    from: { x: 0.315, y: 0.149 },
    to: [
      { x: 0.575, y: 0.207 },
      { x: 0.675, y: 0.225 },
      { x: 0.818, y: 0.266 },
    ],
    count: 42,
    hue: 208,
  },
  glows: [
    { x: 0.575, y: 0.207, r: 0.13, hue: 212, lagFrames: 0 },
    { x: 0.675, y: 0.225, r: 0.1, hue: 206, lagFrames: 5 },
    { x: 0.818, y: 0.266, r: 0.14, hue: 214, lagFrames: 10 },
  ],
  moon: { x: 0.8975, y: 0.113, r: 0.05 },
  glints: {
    rects: [
      { x0: 0.05, y0: 0.66, x1: 0.45, y1: 0.98 },
      { x0: 0.45, y0: 0.62, x1: 0.9, y1: 0.98 },
      { x0: 0.7, y0: 0.6, x1: 1, y1: 0.88 },
    ],
    count: 90,
    warmBelowX: 0.42,
  },
};

export const MV_LOOKS: Record<MvLookId, SceneFx> = { "siren-rain": SIREN_RAIN };
export const MV_LOOK_IDS = Object.keys(MV_LOOKS) as MvLookId[];
export const isLookId = (v: unknown): v is MvLookId => typeof v === "string" && v in MV_LOOKS;
