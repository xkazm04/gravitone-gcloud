// ALBUM LOOKS - the placed light and weather an album's fixed picture gets
// (compositor `SceneFx`), by name. Client-safe: data only.
//
// A look belongs to ONE picture. Its coordinates are fractions of that
// picture (x across, y down; radii against its height), measured once off the
// still, so a look is only as good as the picture beside it: an album that
// reuses its cover for every track (`--still`) reuses the look; a generated
// still per track would need the positions found again.

import type { SceneFx } from "./compositor";

export type MvLookId = "siren-rain" | "garage-red";

/** Misu Vol 2 cover: a siren singing on rain-wet temple steps, two braziers
 *  beside her, ghostly kithara / aulos / frame drum over the sea, moon upper
 *  right. Measured off the 2048x1136 cover on 2026-10-14. */
const SIREN_RAIN: SceneFx = {
  // 2026-10-14: the operator asked for 20% more swing on the beat.
  intensity: 1.2,
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

/** Misu Vol 3 cover: a keyboardist in a dark Tokyo garage beside a black
 *  sports car, taillights in haze and on a wet floor, red light streaming from
 *  the keys into ghostly guitar, bass and violin players. Near-monochrome
 *  crimson; the upper right is black on purpose, for the title. Measured off
 *  the 2048x1136 cover on 2026-10-15. */
const GARAGE_RED: SceneFx = {
  intensity: 1,
  // Three waves of build: the swing runs from 0.85 in the sparse opening to
  // 1.3 where the fullest motif and the heaviest kick land.
  arc: { smoothS: 20, lo: 0.85, hi: 1.3 },
  particleHue: 355,
  // Measured 2026-10-15 on a 15 s clip of this look: crf 30 smooths the
  // floor haze, crf 24 keeps it; 25 is the middle at about 30 MB a track.
  crf: 25,
  lamps: {
    points: [
      { x: 0.038, y: 0.48 },
      { x: 0.059, y: 0.484 },
      { x: 0.172, y: 0.484 },
      { x: 0.198, y: 0.478 },
    ],
    r: 0.045,
    hue: 0,
  },
  reflect: {
    hue: 358,
    streaks: [
      { x: 0.045, y: 0.68, w: 0.05, h: 0.3, band: "low" },
      { x: 0.185, y: 0.7, w: 0.07, h: 0.28, band: "low" },
      { x: 0.62, y: 0.78, w: 0.12, h: 0.2, band: "mid" },
      { x: 0.76, y: 0.78, w: 0.12, h: 0.2, band: "mid" },
      { x: 0.9, y: 0.78, w: 0.12, h: 0.2, band: "high" },
    ],
  },
  threads: {
    from: { x: 0.322, y: 0.458 },
    to: [
      { x: 0.6, y: 0.45 },
      { x: 0.745, y: 0.42 },
      { x: 0.89, y: 0.4 },
    ],
    count: 46,
    hue: 0,
    lift: 0,
    l: 60,
  },
  glows: [
    { x: 0.615, y: 0.4, r: 0.1, hue: 0, lagFrames: 0, l: 56 },
    { x: 0.75, y: 0.38, r: 0.09, hue: 0, lagFrames: 5, l: 56 },
    { x: 0.895, y: 0.38, r: 0.1, hue: 0, lagFrames: 10, l: 56 },
  ],
  smoke: { y0: 0.56, y1: 0.7, count: 38, hue: 350 },
  glints: { rects: [{ x0: 0, y0: 0.7, x1: 1, y1: 0.98 }], count: 40, warmBelowX: 0, hue: 355 },
  beacons: [
    { x: 0.135, y: 0.31, r: 0.03, hue: 28, l: 65, a: 0.22, rate: 0.35 },
    { x: 0.25, y: 0.25, r: 0.035, hue: 0, l: 85, a: 0.12, rate: 0.5 },
    { x: 0.125, y: 0.13, r: 0.05, hue: 0, l: 90, a: 0.1, rate: 0.9 },
  ],
};

export const MV_LOOKS: Record<MvLookId, SceneFx> = { "siren-rain": SIREN_RAIN, "garage-red": GARAGE_RED };

/** What a look draws, in one sentence for the YouTube text turn - the
 *  picture, never the music. Without it the turn describes the generic
 *  visualizer (measured 2026-10-14: "particles and one glowing element" under
 *  a rain-and-braziers video). */
export const MV_LOOK_NOTES: Record<MvLookId, string> = {
  "siren-rain":
    "the album's own cover art: a siren singing on rain-wet marble temple steps beside a night sea, with falling rain, flickering braziers and pale blue light carried from her voice to ghostly ancient instruments; the light swells with the track",
  "garage-red":
    "the album's own cover art: a keyboardist in a dark Tokyo garage beside a black sports car, red taillight glow in the haze and on the wet floor, red light trails shaping ghostly guitar, bass and violin players; the light builds with the track",
};
export const MV_LOOK_IDS = Object.keys(MV_LOOKS) as MvLookId[];
export const isLookId = (v: unknown): v is MvLookId => typeof v === "string" && v in MV_LOOKS;
