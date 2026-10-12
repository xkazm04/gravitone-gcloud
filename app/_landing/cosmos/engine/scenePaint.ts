// The raster of each depth plane: the overview's dusk sky, punched stars,
// cloud banks, ridges, the seven galaxy sheets, the lamp's six-petal heart and
// the floor; and a type's own world. Pure paint: each function takes a context
// already scaled to CSS pixels and the numbers it needs, and nothing else, so a
// plane can be rasterised off the main thread later.

import { drawMedal, type TypeSpec } from "./medal";
import { DISC, HZ, SKY_INK } from "./inks";
import type { Palette } from "./palette";
import { circ, ell, gp, merge, paper, poly, ridge, tornEdge, type Ctx2D, type Pt } from "./paper";
import { RNG, TAU, type Rand } from "./rng";

/** a plane canvas covers the viewport plus a margin M on every side */
export interface PlaneBox {
  W: number;
  H: number;
  M: number;
  pw: number;
  ph: number;
  portrait: boolean;
}

/* ---------- the overview ---------- */

/** indigo paper, warm at the horizon, a bloom behind the galaxy at (gx,gy) */
export function paintSky(c: Ctx2D, b: PlaneBox, gx: number, gy: number, gr: number): void {
  const { pw, ph, H, M } = b;
  const hz = (b.portrait ? 0.62 : 0.745) * H + M;
  const g = c.createLinearGradient(0, 0, 0, hz + H * 0.04);
  [0, 0.2, 0.38, 0.52, 0.66, 0.8, 0.92, 1].forEach((s, i) => g.addColorStop(s, HZ.sky[i]));
  c.fillStyle = g;
  c.fillRect(0, 0, pw, ph);
  const rg = c.createRadialGradient(gx + M, gy + M, 0, gx + M, gy + M, gr);
  rg.addColorStop(0, SKY_INK.bloom[0]);
  rg.addColorStop(0.5, SKY_INK.bloom[1]);
  rg.addColorStop(1, SKY_INK.bloom[2]);
  c.fillStyle = rg;
  c.fillRect(0, 0, pw, ph);
  c.fillStyle = gp(c);
  c.fillRect(0, 0, pw, ph);
  c.fillStyle = SKY_INK.ground;
  c.fillRect(0, hz + H * 0.05, pw, ph);
}

/** light bleeding through punched holes */
export function paintStars(c: Ctx2D, b: PlaneBox): void {
  const { pw, W, H, M } = b;
  const r = RNG(4242),
    n = Math.round((W * H) / 5200);
  for (let i = 0; i < n; i++) {
    const y = Math.pow(r(), 1.5) * (H * 0.72) + M * 0.5,
      x = r() * pw,
      big = r() < 0.08,
      rad = big ? 1.5 + r() * 1.4 : 0.6 + r() * 0.9;
    c.save();
    c.shadowColor = SKY_INK.starGlow;
    c.shadowBlur = big ? 10 : 5;
    c.fillStyle = SKY_INK.star;
    c.globalAlpha = 0.55 + r() * 0.45;
    c.beginPath();
    c.arc(x, y, rad, 0, TAU);
    c.fill();
    c.restore();
  }
}

/** drifting paper cloud banks on a cw by ch canvas; returns the drift period (s) */
export function paintClouds(c: Ctx2D, cw: number, ch: number, H: number): number {
  const r = RNG(99);
  SKY_INK.clouds.forEach(([col, yy, al]) => {
    const y = ch * yy * 2.1,
      pa = new Path2D();
    let x = r() * 120 - 60;
    while (x < cw) {
      const rr = H * (0.02 + r() * 0.032);
      pa.moveTo(x + rr, y);
      pa.arc(x, y, rr, 0, TAU);
      x += rr * 1.35;
    }
    pa.rect(0, y, cw, H * 0.025);
    paper(c, pa, col, { e: 6, u: 1, g: 0.8, a: al });
  });
  return 140 + r() * 40;
}

/** a ridge across the plane at base (fraction of H), rim-lit from behind when glow > 0 */
export function paintRidge(c: Ctx2D, b: PlaneBox, col: string, base: number, amp: number, seed: number | Rand, e: number, glow: number, glowCol: string): void {
  const r = typeof seed === "number" ? RNG(seed) : seed;
  const path = ridge(0, b.pw, base * b.H + b.M, amp * b.H, r, b.ph + 20, 5);
  if (glow) {
    c.save();
    c.shadowColor = glowCol;
    c.shadowBlur = glow;
    c.fillStyle = col;
    c.fill(path);
    c.restore();
  }
  paper(c, path, col, { e, hl: 0.2 });
}

/** one of the J swirled galaxy sheets, centred in its canvas (context already translated) */
export function paintDiscSheet(c: Ctx2D, j: number, J: number, Rj: number, arms: number): void {
  const n = 720,
    m = arms,
    tw = 2.2,
    ph0 = j * 0.62,
    A = 0.13 - j * 0.006,
    sc = 48 + j * 4;
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const t0 = (i / n) * TAU;
    const rad = Rj * (1 + A * Math.cos(m * t0 + ph0)) * (1 + 0.0055 * Math.cos(sc * t0));
    const th = t0 + tw * (rad / Rj - 0.6);
    pts.push([Math.cos(th) * rad, Math.sin(th) * rad]);
  }
  const path = poly(pts),
    col = DISC[j + 1 > 8 ? 8 : j + 1];
  c.save();
  c.shadowColor = SKY_INK.discGlow(0.28 + (0.4 * j) / (J - 1));
  c.shadowBlur = 26 * (Rj / 700);
  c.fillStyle = col;
  c.fill(path);
  c.restore();
  paper(c, path, col, { e: Math.max(5, Rj * 0.014), hl: 0.24, g: 0.9 });
}

/** the six-petal heart: one petal per studio step (context already translated) */
export function paintCore(c: Ctx2D, cs: number, steps: number): void {
  const rr = cs * 0.5;
  for (let ring = 0; ring < 3; ring++) {
    const nn = Math.max(6, steps || 6),
      pd = rr * (1 - ring * 0.2),
      pet = merge(
        Array.from({ length: nn }, (_, i) => {
          const a = (i / nn) * TAU + ring * 0.26;
          return ell(Math.cos(a) * pd * 0.9, Math.sin(a) * pd * 0.9, pd * 0.78, pd * 0.34, a);
        }),
      );
    paper(c, pet, SKY_INK.petals[ring], { e: rr * 0.07, hl: 0.35 });
  }
  paper(c, circ(0, 0, rr * 0.3), SKY_INK.heart, { e: rr * 0.05 });
}

/** the ink-dark floor strip below everything */
export function paintFloor(c: Ctx2D, b: PlaneBox): void {
  const r = RNG(5);
  const y = (b.portrait ? b.H * 0.985 : b.H * 0.972) + b.M;
  paper(c, tornEdge(0, b.pw, y, 3, r, b.ph + 30, 5), HZ.floor, { e: 12, rim: SKY_INK.floorRim, rimw: 3 });
}

export const RIDGE = {
  far: { col: HZ.far, glow: HZ.rim },
  midA: { col: HZ.midA, glow: HZ.rim },
  front: { col: HZ.front, glow: HZ.rim },
};

/* ---------- a type's own world (r is the world's one seeded stream) ---------- */

export function paintWorldSky(c: Ctx2D, b: PlaneBox, P: Palette, gx: number, gy: number, r: Rand): void {
  const { pw, ph, W, H, M } = b;
  const g = c.createLinearGradient(0, 0, 0, ph);
  g.addColorStop(0, P.t("deep", 3));
  g.addColorStop(0.34, P.t("dark", 1));
  g.addColorStop(0.6, P.t("mid", -1));
  g.addColorStop(0.74, P.t("soft", -8));
  g.addColorStop(0.8, P.t("mid", -8));
  g.addColorStop(1, P.t("dark", -6));
  c.fillStyle = g;
  c.fillRect(0, 0, pw, ph);
  const rg = c.createRadialGradient(gx + M, gy + M, 0, gx + M, gy + M, H * 0.95);
  rg.addColorStop(0, P.t("acc", 0, 0, 0.55));
  rg.addColorStop(0.45, P.t("acc2", 0, 0, 0.14));
  rg.addColorStop(1, P.t("acc", 0, 0, 0));
  c.fillStyle = rg;
  c.fillRect(0, 0, pw, ph);
  c.fillStyle = gp(c);
  c.fillRect(0, 0, pw, ph);
  c.fillStyle = P.t("pale", 0, 0, 0.5);
  for (let i = 0, n = (W * H) / 8000; i < n; i++) {
    c.beginPath();
    c.arc(r() * pw, Math.pow(r(), 1.3) * ph * 0.8, 0.7 + r() * 1.5, 0, TAU);
    c.fill();
  }
}

/** the type's emblem, large, as the place's landmark (context translated to its centre) */
export function paintWorldMotif(c: Ctx2D, Rm: number, P: Palette, spec: TypeSpec, r: Rand): void {
  paper(c, circ(0, 0, Rm * 1.24), P.t("soft", -8, -4), { e: Rm * 0.05, a: 0.5, g: 0.6 });
  paper(c, circ(0, 0, Rm * 1.12), P.t("mid", 4), { e: Rm * 0.04, a: 0.65 });
  c.rotate(((spec.tilt + (r() - 0.5) * 10) * Math.PI) / 180);
  drawMedal(c, Rm, spec);
}

export function paintWorldFloor(c: Ctx2D, b: PlaneBox, P: Palette, r: Rand): void {
  paper(c, tornEdge(0, b.pw, (b.portrait ? 0.86 : 0.865) * b.H + b.M, 3, r, b.ph + 30, 5), P.t("deep", -3), {
    e: 18,
    rim: P.t("soft", -6),
    rimw: 3,
  });
}
