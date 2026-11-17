// THE ORDER THE VIEWER SEES. Ported from StatReel (stat-reel packages/compositions/src/timing/plan.ts, itself
// a port of the box prototype timing.mjs). Pure, deterministic, no dependencies.
//
// A raw sort flips two near-equal entities back and forth every period, and each flip costs the viewer a read.
// The order is sticky instead: an entity overtakes its neighbour only when it leads by `rel` of the value plus
// `abs` (hysteresis). The continuity measure and the timing plan both count changes on this order, because it
// is the one drawn.

export interface Hysteresis {
  readonly rel: number;
  readonly abs: number;
}

/** Centred moving average of half-width `w` (the window shrinks at the edges). */
export function movingAverage(series: readonly number[], w: number): number[] {
  if (!w) return series.slice();
  return series.map((_, i) => {
    let s = 0;
    let n = 0;
    for (let j = i - w; j <= i + w; j++) {
      if (j >= 0 && j < series.length) {
        s += series[j] ?? 0;
        n++;
      }
    }
    return s / n;
  });
}

/** Indices sorted by value, best first (ties keep input order). */
export function rankOrder(values: readonly number[], among: readonly number[]): number[] {
  return [...among].sort((a, b) => (values[b] ?? 0) - (values[a] ?? 0));
}

/**
 * The full order per period, as entity indices. `series[e][i]` is entity e's ordering value at period i.
 * With `h` null the order is the raw sort.
 */
export function stickyOrders(series: readonly (readonly number[])[], periods: number, h: Hysteresis | null): number[][] {
  const all = series.map((_, e) => e);
  const at = (i: number): number[] => series.map((s) => s[i] ?? 0);
  if (h === null) return Array.from({ length: periods }, (_, i) => rankOrder(at(i), all));
  let order = rankOrder(at(0), all);
  const out: number[][] = [order.slice()];
  for (let i = 1; i < periods; i++) {
    order = order.slice();
    const v = at(i);
    for (let pass = 0; pass < all.length; pass++) {
      let swapped = false;
      for (let r = order.length - 1; r > 0; r--) {
        const a = order[r - 1] as number;
        const b = order[r] as number;
        if ((v[b] ?? 0) > (v[a] ?? 0) * (1 + h.rel) + h.abs) {
          order[r - 1] = b;
          order[r] = a;
          swapped = true;
        }
      }
      if (!swapped) break;
    }
    out.push(order.slice());
  }
  return out;
}

/** The default hysteresis: 6% of the value plus a sliver of the axis, as StatReel's plan used. */
export const defaultHysteresis = (axisMax: number): Hysteresis => ({ rel: 0.06, abs: 0.0017 * axisMax });

/**
 * THE RACE ENDS ON THE TRUTH. Hysteresis can hold an entity on top while another has the larger final value
 * (a title decided in the last period by less than the margin). The last period's first place is the largest
 * raw final value; a tie keeps the order already seen, and the rest is untouched.
 */
export function endOnTruth(orders: number[][], finalValues: readonly number[]): void {
  const last = orders[orders.length - 1];
  if (last === undefined) return;
  const champion = rankOrder(finalValues, last)[0];
  if (champion !== undefined && champion !== last[0]) orders[orders.length - 1] = [champion, ...last.filter((e) => e !== champion)];
}
