// THE G ASTERISM — geometry only, shared by <Mark> and by anything that needs
// to draw the same five stars at another scale (the kit route's construction
// sheet, the foundry's header). Five studio steps on a construction circle of
// radius 10; the last star, Cut, is the only red in the mark because the cut is
// the only thing a person decided.
//
// Ported from the Almanac door (contest landing-nextgen-brand-r2, variant 2):
// the coordinates are the design's own and are not to be re-derived by eye.

export interface AsterismStar {
  /** Studio step the star stands for. */
  step: "Research" | "Script" | "Frames" | "Score" | "Cut";
  x: number;
  y: number;
  /** Star radius, in construction units. */
  r: number;
  /** Bearing on the construction circle, degrees; null for the Cut star, which
   *  sits inside the circle on the crossbar rather than on it. */
  bearing: number | null;
}

export const ASTERISM_STARS: readonly AsterismStar[] = [
  { step: "Research", x: 7.071, y: -7.071, r: 0.95, bearing: -45 },
  { step: "Script", x: -9.397, y: -3.42, r: 0.85, bearing: 200 },
  { step: "Frames", x: -5, y: 8.66, r: 1.15, bearing: 120 },
  { step: "Score", x: 9.848, y: 1.736, r: 0.85, bearing: 10 },
  { step: "Cut", x: 3.2, y: 1.736, r: 1.35, bearing: null },
];

/** The G itself: four arcs of the construction circle and the crossbar. */
export const ASTERISM_PATH =
  "M 7.071 -7.071 A 10 10 0 0 0 -9.397 -3.420 A 10 10 0 0 0 -5 8.660 A 10 10 0 0 0 9.848 1.736 L 3.2 1.736";
