// FRAME -> PERIOD. Ported from StatReel (stat-reel packages/compositions/src/timing/plan.ts `makeTimeMap`).
// A monotone cubic (Fritsch-Carlson) through the plan's knots: the data clock never jumps and never runs
// backwards. The page a session writes re-implements `at` from the knots in its data block; this copy is the
// one the plan uses to place event cards, and the one the tests hold.

export type Knots = readonly (readonly [number, number])[];

export interface TimeMap {
  /** Fractional period at a frame (clamped to the first and last knot). */
  readonly at: (frame: number) => number;
  /** Frame at which a (fractional) period is reached. */
  readonly frameOf: (period: number) => number;
}

export function makeTimeMap(knots: Knots): TimeMap {
  const n = knots.length;
  const fr = (i: number): number => (knots[i] as readonly [number, number])[0];
  const pe = (i: number): number => (knots[i] as readonly [number, number])[1];
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((pe(i + 1) - pe(i)) / (fr(i + 1) - fr(i)));
  const dAt = (i: number): number => d[i] ?? 0;
  const m: number[] = [dAt(0)];
  for (let i = 1; i < n - 1; i++) m.push(dAt(i - 1) * dAt(i) <= 0 ? 0 : (dAt(i - 1) + dAt(i)) / 2);
  m.push(dAt(n - 2));
  for (let i = 0; i < n - 1; i++) {
    const di = dAt(i);
    if (di === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = (m[i] ?? 0) / di;
    const b = (m[i + 1] ?? 0) / di;
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * di;
      m[i + 1] = t * b * di;
    }
  }
  const at = (x: number): number => {
    if (x <= fr(0)) return pe(0);
    if (x >= fr(n - 1)) return pe(n - 1);
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (fr(mid) <= x) lo = mid;
      else hi = mid;
    }
    const h = fr(lo + 1) - fr(lo);
    const t = (x - fr(lo)) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * pe(lo) + (t3 - 2 * t2 + t) * h * (m[lo] ?? 0) + (-2 * t3 + 3 * t2) * pe(lo + 1) + (t3 - t2) * h * (m[lo + 1] ?? 0);
  };
  const frameOf = (period: number): number => {
    let lo = fr(0);
    let hi = fr(n - 1);
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2;
      if (at(mid) < period) lo = mid;
      else hi = mid;
    }
    return hi;
  };
  return { at, frameOf };
}
