// THE TIMING PLAN. Ported from StatReel (stat-reel packages/compositions/src/timing/plan.ts `computeTimingPlan`,
// itself a port of the box prototype timing.mjs + make-plan-v3.mjs), re-cut for two lengths from one table.
// Registry: media-generation data-video-art-direction / timing-plan-first.
//
// A constant "periods per second" clock makes busy stretches flicker and quiet ones drag. The plan keeps the
// on-screen CHANGE RATE roughly constant instead:
//   1. score every transition i-1 -> i: weighted rank inversions inside the visible top N, entries, visible
//      |delta value| / axis max, plus a base so a quiet period still moves;
//   2. frames_i proportional to score_i, clamped per period;
//   3. Gaussian-smooth the frame counts (no speed jerks) and renormalise to the budget;
//   4. add dwell around each event (a Gaussian bump) so its card can be read;
//   5. emit knots [frame, period] for the monotone frame -> period map.
// The plan is computed BEFORE a page is written and issued inside the page's data block: the page reads its
// clock, it does not invent one.

import { viewerOrders } from "./continuity";
import { valueAt } from "./table";
import { makeTimeMap } from "./timeMap";
import { CUTS, REEL_FPS, ReelError, type ReelCut, type ReelTable, type TimingPlan } from "./types";

const WEIGHTS = { rank: 1, value: 1, base: 0.1, entry: 1.5 } as const;
const SIGMA = 1.5;
/** Frames held around an event, and the share of the timeline all dwell may take together. */
const DWELL: Readonly<Record<ReelCut, number>> = { short: 40, long: 75 };
const DWELL_SHARE = 0.4;
const EVENT_SPREAD = 1.5;

const round = (x: number, d: number): number => {
  const m = 10 ** d;
  return Math.round(x * m) / m;
};
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);
const cv = (a: readonly number[]): number => {
  if (a.length === 0) return 0;
  const mean = sum(a) / a.length;
  return mean === 0 ? 0 : Math.sqrt(sum(a.map((y) => (y - mean) ** 2)) / a.length) / mean;
};
const groupOf = (label: string): string => /\d{4}/.exec(label)?.[0] ?? label;

/** How much changes on screen at each transition, on the order the viewer sees. `raw[0]` is 0. */
function changeScores(table: ReelTable, orders: readonly (readonly number[])[], topN: number): number[] {
  const P = table.periods.length;
  const value = (e: number, i: number): number => valueAt(table.entities[e] as ReelTable["entities"][number], i);
  let axisMax = 0;
  for (let e = 0; e < table.entities.length; e++) for (let i = 0; i < P; i++) axisMax = Math.max(axisMax, value(e, i));
  if (axisMax <= 0) axisMax = 1;
  const rowWeight = (r: number): number => 1 / (1 + 0.18 * r);
  const raw: number[] = [0];
  let prev = (orders[0] as readonly number[]).slice(0, topN);
  for (let i = 1; i < P; i++) {
    const cur = (orders[i] as readonly number[]).slice(0, topN);
    const was = new Map(prev.map((e, r) => [e, r]));
    let rank = 0;
    for (let a = 0; a < cur.length; a++) {
      for (let b = a + 1; b < cur.length; b++) {
        const pa = was.get(cur[a] as number);
        const pb = was.get(cur[b] as number);
        if (pa !== undefined && pb !== undefined && pa > pb) rank += rowWeight(a);
      }
    }
    const entries = cur.filter((e) => !was.has(e)).length;
    let val = 0;
    for (const e of cur) val += Math.abs(value(e, i) - value(e, i - 1)) / axisMax;
    raw.push(WEIGHTS.rank * rank + WEIGHTS.entry * entries + WEIGHTS.value * val + WEIGHTS.base);
    prev = cur;
  }
  return raw;
}

/** Frames per period: proportional to the score, clamped, smoothed, renormalised to `budget`. `f[0]` is 0. */
function spreadFrames(raw: readonly number[], budget: number): number[] {
  const P = raw.length;
  const avg = budget / (P - 1);
  const minFrames = Math.max(0.5, avg * 0.25);
  const maxFrames = Math.max(minFrames * 2, avg * 2.6);
  const total = sum(raw);
  let f = raw.map((r, i) => (i === 0 ? 0 : (r / total) * budget));
  const R = Math.ceil(SIGMA * 3);
  const K: number[] = [];
  for (let k = -R; k <= R; k++) K.push(Math.exp(-(k * k) / (2 * SIGMA * SIGMA)));
  for (let it = 0; it < 6; it++) {
    const src = f.map((x, i) => (i === 0 ? 0 : clamp(x, minFrames, maxFrames)));
    f = src.map((_, i) => {
      if (i === 0) return 0;
      let s = 0;
      let w = 0;
      K.forEach((k, j) => {
        const ii = i + j - R;
        if (ii >= 1 && ii < P) {
          s += (src[ii] ?? 0) * k;
          w += k;
        }
      });
      return s / w;
    });
    const s = sum(f);
    f = f.map((x) => (x / s) * budget);
  }
  return f;
}

/**
 * The plan for one cut of one table. Deterministic and timestamp-free, so the data block that carries it has a
 * stable hash. `totalFrames` is the length of the track the cut is planned to; absent, the table sets the length
 * inside the cut's clamp. Throws ReelError on a table too short to plan.
 */
export function computeTimingPlan(table: ReelTable, cut: ReelCut, topN: number = 10, totalFrames?: number): TimingPlan {
  const spec = CUTS[cut];
  const P = table.periods.length;
  if (P < 2) throw new ReelError("a timing plan needs at least 2 periods");
  const orders = viewerOrders(table);
  const raw = changeScores(table, orders, topN);

  // A cut planned to a track is exactly as long as the track: the whole bed plays, nothing is trimmed or looped.
  const timeline = totalFrames === undefined ? clamp(P * spec.framesPerPeriod, spec.minTimeline, spec.maxTimeline) : totalFrames - spec.hookFrames - spec.endFrames;
  if (timeline < 300) throw new ReelError(`a ${cut} cut of ${totalFrames} frames leaves ${timeline} for the data; it needs at least 300`);
  const events = table.events;
  // Dwell is a hold the viewer reads a card in; together it may not eat the motion it annotates.
  const dwell = events.length === 0 ? 0 : Math.min(DWELL[cut], Math.floor((timeline * DWELL_SHARE) / events.length));
  const budget = timeline - dwell * events.length;

  const base = spreadFrames(raw, budget);
  let f = base.slice();
  for (const ev of events) {
    const bump = f.map((_, i) => (i === 0 ? 0 : Math.exp(-((i - ev.period) ** 2) / (2 * EVENT_SPREAD * EVENT_SPREAD))));
    // Period 0 carries no frames, so a narrow bump around it can underflow to all zeros; the dwell then lands
    // whole on the first period that has frames.
    if (!(sum(bump) > 0)) bump[Math.max(1, ev.period)] = 1;
    const bs = sum(bump);
    f = f.map((x, i) => x + ((bump[i] ?? 0) / bs) * dwell);
  }

  const start = spec.hookFrames;
  const knots: [number, number][] = [[start, 0]];
  let acc = start;
  for (let i = 1; i < P; i++) {
    acc += f[i] ?? 0;
    knots.push([round(acc, 3), i]);
  }
  const timelineEnd = start + timeline;
  // Rounding leaves the last knot a hair off the section boundary; the clock ends exactly where the section does.
  (knots[P - 1] as [number, number])[0] = timelineEnd;
  const map = makeTimeMap(knots);

  // Evenness: change per second by calendar group, on a uniform clock and on this plan (dwell excluded - it is
  // an intentional hold).
  const uniform = timeline / (P - 1);
  const groups = new Map<string, { change: number; warped: number; uniform: number }>();
  for (let i = 1; i < P; i++) {
    const g = groupOf(table.periods[i] as string);
    const v = groups.get(g) ?? { change: 0, warped: 0, uniform: 0 };
    v.change += (raw[i] ?? 0) - WEIGHTS.base;
    v.warped += base[i] ?? 0;
    v.uniform += uniform;
    groups.set(g, v);
  }
  const per = (c: number, frames: number): number => (frames > 0 ? c / (frames / REEL_FPS) : 0);
  const rows = [...groups.values()];

  return {
    v: 1,
    fps: REEL_FPS,
    cut,
    sections: { hookEnd: start, timelineEnd, total: timelineEnd + spec.endFrames },
    topN,
    knots,
    orders: orders.map((o) => o.slice(0, topN)),
    events: events.map((e) => ({ id: e.id, period: e.period, frame: Math.round(map.frameOf(e.period)), dwell })),
    evenness: { cvUniform: round(cv(rows.map((g) => per(g.change, g.uniform))), 3), cvWarped: round(cv(rows.map((g) => per(g.change, g.warped))), 3) },
  };
}
