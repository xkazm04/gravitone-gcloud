// A RIVER'S WATER AS WORLD-SPACE POINTS - pure; rebuilt when a verdict moves a river's reach. The water's width at a
// stage is the live work from that stage on (sqrt, so a big river does not drown the map); it narrows in the
// highlands, eases between stage columns, and stops where the furthest live lot is. Past that, a DRY stretch (only
// rejected or failed work went there), and for a channel the untravelled CANAL to its port. The renderer turns these
// into Path2D once per build. Port of the winner's model.js buildRiver and the land.

import { coastX, SRC_X, SW, X0, smooth, sx } from "./geo.ts";
import { isLive } from "./build.ts";
import type { Land, Pt, River, RiverPt, World } from "./types.ts";

export const riverY = (r: River, x: number): number => {
  const t = (x - X0) / SW;
  return r.cy + r.amp * Math.sin(Math.PI * t) * (0.55 + 0.45 * Math.sin(r.ph + t * 1.7));
};

export function buildRiver(r: River): void {
  const liveAt = new Map<number, number>();
  for (const t of r.towns) liveAt.set(t.si, t.items.filter(isLive).length);
  const wd = (i: number): number => {
    let s = 0;
    for (const [k, v] of liveAt) if (k >= i) s += v;
    return s > 0 ? 2.2 + Math.sqrt(s) * 1.5 : 0;
  };
  const endX = r.synthetic ? coastX(r.cy) : r.reach >= 0 ? sx(r.reach) : sx(0) - 60;
  const pts: RiverPt[] = [];
  const s0 = r.src;
  const firstSi = r.towns[0]?.si ?? 0;
  for (let x = s0; x <= endX + 0.1; x += 10) {
    let w: number;
    if (r.synthetic) w = 5;
    else if (r.reach < 0) w = 0;
    else if (x <= X0) w = wd(0) * (0.35 + (0.65 * (x - s0)) / (X0 - s0));
    else if (s0 > SRC_X && x < s0 + 230) w = wd(firstSi) * (0.35 + (0.65 * (x - s0)) / 230);
    else {
      const f = (x - X0) / SW;
      const i = Math.floor(f);
      const fr = f - i;
      const a = wd(i);
      const c = wd(i + 1) || a * 0.7;
      w = a + (c - a) * smooth(fr, 0.45, 1);
    }
    pts.push({ x, y: riverY(r, x), w: Math.max(w, 0) });
  }
  r.pts = pts;
  r.endX = endX;
  const dryFrom = r.reach >= 0 ? sx(r.reach) : s0;
  const dryTo = r.synthetic ? 0 : sx(r.extent);
  r.dryPts = null;
  if (dryTo > dryFrom + 5) {
    const d: Pt[] = [[dryFrom, riverY(r, dryFrom)]];
    for (let x = dryFrom; x <= dryTo; x += 12) d.push([x, riverY(r, x)]);
    r.dryPts = d;
  }
  r.canal = null;
  const port = r.chan?.port ?? null;
  if (port !== null) {
    const from = r.reach >= 0 ? sx(r.reach) : s0 + 60;
    r.canal = { from: [from, riverY(r, from)], c1: [from + 120, r.cy], c2: [port.x - 120, r.cy], to: [port.x, r.cy] };
  }
}

/** The land: the coast, five contour lines in the highlands, and dashed isolines between the stage columns. */
export function buildLand(world: World, bottom: number): Land {
  const top = world.y0 + 20;
  const bot = bottom - 60;
  const outline: Pt[] = [[-170, top]];
  for (let y = top; y <= bot; y += 16) outline.push([coastX(y), y]);
  for (let y = bot; y >= top; y -= 24) outline.push([-170 + 14 * Math.sin(y / 90), y]);
  const contours: Pt[][] = [-120, -60, 0, 60, 120].map((x0, k) => {
    const line: Pt[] = [];
    for (let y = top + 10; y < bottom - 70; y += 20) line.push([x0 + 9 * Math.sin(y / (60 + k * 13) + k), y]);
    return line;
  });
  const isolines: Pt[][] = [0.5, 1.5, 2.5, 3.5, 4.5, 5.4, 6.1].map((i) => {
    const x0 = sx(i);
    const line: Pt[] = [];
    for (let y = top + 10; y < bottom - 70; y += 24) line.push([x0 + 6 * Math.sin(y / 140 + i), y]);
    return line;
  });
  return { outline, contours, isolines };
}
