// Geometry: the viewport's scale, the overview's spiral of medallions and band
// of reams, the carousel's metrics and poses, the stage's boxes, the treemap.
// Pure numbers; derived from counts, never from an id or a name.

import type { Galaxy, GalaxyFamily } from "../types";
import { RNG, TAU, clamp, hash32, lerp } from "./rng";

export interface Geo {
  W: number;
  H: number;
  /** the scale unit every size in the stylesheet reads as --S */
  S: number;
  DPR: number;
  /** raster scale for full-viewport planes */
  RS: number;
  portrait: boolean;
}

export function measure(W: number, H: number, devicePixelRatio: number): Geo {
  const portrait = W / H < 0.8;
  const S = portrait ? Math.min(W * 1.45, H * 0.8) : clamp(Math.min(W * 0.5625, H), 560, 1500);
  const DPR = Math.min(devicePixelRatio || 1, 2);
  const RS = clamp(Math.min(DPR, 1.5, 1920 / Math.max(W, 1280)), 0.75, 1.5);
  return { W, H, S, DPR, RS, portrait };
}

export interface MedPt {
  x: number;
  y: number;
  d: number;
  id: string;
}
export interface ReamBox {
  x: number;
  w: number;
  bottom: number;
  hMax: number;
  th: number;
}
export interface Layout {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  sq: number;
  R: number;
  yMin: number;
  yMax: number;
  med: MedPt[];
  d0: number;
  arms: number;
  reams: ReamBox[];
  rw: number;
  rowTop?: number;
}

/** the overview: types on a spiral inside the galaxy's ellipse, families along the horizon */
export function layout0(g: Geo, types: Galaxy["types"], library: GalaxyFamily[]): Layout {
  const { W, H, S, portrait } = g;
  const N = types.length || 1;
  const o = {} as Layout;
  if (!portrait) {
    o.cx = W * 0.5;
    o.cy = H * 0.435;
    o.ry = H * 0.29;
    o.rx = Math.min(W * 0.4, o.ry / 0.42);
  } else {
    o.cx = W * 0.5;
    o.cy = H * 0.385;
    o.rx = W * 0.47;
    o.ry = Math.min(o.rx, H * 0.27);
  }
  o.sq = o.ry / o.rx;
  o.R = o.rx;
  o.yMin = portrait ? H * 0.2 : H * 0.165;
  o.yMax = portrait ? H * 0.6 : H * 0.665;
  const cov = portrait ? 0.4 : 0.36;
  let d0 = 2 * Math.sqrt((cov * o.rx * o.ry) / N);
  d0 = clamp(d0, portrait ? 46 : 62, portrait ? 150 : Math.min(H * 0.34, 330));
  const arms = N <= 8 ? 2 : N <= 22 ? 3 : 4,
    tw = 1.05;
  const pts: MedPt[] = [];
  for (let i = 0; i < types.length; i++) {
    const arm = i % arms,
      j = Math.floor(i / arms),
      nA = Math.ceil((N - arm) / arms),
      t = (j + 0.5) / nA;
    const rho = 0.36 + 0.62 * Math.pow(t, 0.9),
      th = (arm / arms) * TAU + tw * t * TAU * 0.42 - Math.PI * 0.15 + (hash32(types[i].id) % 7) * 0.002;
    pts.push({ x: o.cx + Math.cos(th) * o.rx * rho * 0.94, y: o.cy + Math.sin(th) * o.ry * rho * 0.94, id: types[i].id, d: 0 });
  }
  const pf = (y: number) => 0.86 + 0.28 * clamp((y - o.yMin) / (o.yMax - o.yMin), 0, 1);
  pts.forEach((p) => {
    p.y = clamp(p.y, o.yMin, o.yMax);
    p.d = d0 * pf(p.y);
  });
  const n = pts.length;
  for (let it = 0; it < 70; it++) {
    for (let a = 0; a < n; a++)
      for (let b = a + 1; b < n; b++) {
        const A = pts[a],
          B = pts[b];
        let dx = B.x - A.x,
          dy = B.y - A.y;
        const dist = Math.hypot(dx, dy) || 0.01;
        const need = ((A.d + B.d) / 2) * 1.1;
        if (dist < need) {
          const push = ((need - dist) / 2) * 0.6;
          dx /= dist;
          dy /= dist;
          A.x -= dx * push;
          A.y -= dy * push;
          B.x += dx * push;
          B.y += dy * push;
        }
      }
    pts.forEach((p) => {
      const m = p.d * 0.62 + (portrait ? 4 : W * 0.035);
      p.x = clamp(p.x, m, W - m);
      p.y = clamp(p.y, o.yMin, o.yMax);
      p.d = d0 * pf(p.y);
      /* stay inside the ellipse */
      const ex = (p.x - o.cx) / o.rx,
        ey = (p.y - o.cy) / o.ry,
        e = Math.hypot(ex, ey);
      if (e > 0.99) {
        p.x = o.cx + (ex / e) * o.rx * 0.99;
        p.y = o.cy + (ey / e) * o.ry * 0.99;
      }
    });
  }
  pts.forEach((p) => {
    p.d = Math.round(d0 * pf(p.y));
  });
  o.med = pts;
  o.d0 = d0;
  o.arms = arms;
  /* library band */
  const F = library.length || 1,
    gap = Math.max(8, W * 0.006),
    th = Math.max(30, S * 0.03);
  if (!portrait) {
    const wMax = W * 0.088,
      w = Math.min(wMax, (W * 0.9 - (F - 1) * gap) / F),
      total = F * w + (F - 1) * gap,
      x0 = (W - total) / 2;
    const hMax = H * 0.165,
      floor = H * 0.962;
    o.reams = library.map((_, i) => ({ x: x0 + i * (w + gap), w, bottom: floor, hMax, th }));
    o.rw = w;
  } else {
    const cols = 3,
      gx = 8,
      gy = 10,
      cw = (W - W * 0.08 - (cols - 1) * gx) / cols,
      ch = Math.max(48, S * 0.085),
      rows = Math.ceil(F / cols);
    const top = H - rows * (ch + gy) - Math.max(14, H * 0.02);
    o.reams = library.map((_, i) => ({ x: W * 0.04 + (i % cols) * (cw + gx), w: cw, bottom: top + Math.floor(i / cols) * (ch + gy) + ch, hMax: ch, th: 0 }));
    o.rw = cw;
    o.rowTop = top;
  }
  return o;
}

/* ---------- carousel ---------- */
export interface CarMetrics {
  n: number;
  flat: boolean;
  cw: number;
  ch: number;
  cy: number;
  gap: number;
  X: number[];
  SC: number[];
}
export function carMetrics(g: Geo, n: number): CarMetrics {
  const { W, H, portrait } = g;
  const gap0 = W * 0.02;
  const m = { n, flat: n <= 3 } as CarMetrics;
  if (portrait) {
    m.cw = Math.round(Math.min(W * (n <= 1 ? 0.8 : 0.74), (H * 0.3) / 0.75));
    m.cy = H * (n <= 3 ? 0.46 : 0.5);
  } else {
    m.cw = Math.round(Math.min(W * 0.32, (H * 0.46) / 0.75));
    m.cy = H * 0.55;
  }
  if (m.flat) {
    if (portrait) {
      m.cw = Math.round(Math.min(W * 0.8, ((H * (n === 1 ? 0.34 : n === 2 ? 0.2 : 0.145)) / 0.75) * 1.0));
      m.gap = H * 0.02;
    } else {
      m.gap = gap0;
      m.cw = Math.round(Math.min(W * (n <= 1 ? 0.44 : n === 2 ? 0.37 : 0.31), (H * 0.5) / 0.75, (W * 0.88 - (n - 1) * gap0) / n));
    }
  }
  m.ch = Math.round(m.cw * 0.75);
  m.gap = m.flat ? (portrait ? H * 0.02 : gap0) : m.cw * 0.03;
  const X = [0],
    SC = [1];
  for (let k = 1; k < 9; k++) SC[k] = Math.max(0.28, 0.66 * Math.pow(0.78, k - 1));
  for (let k = 1; k < 9; k++) X[k] = X[k - 1] + ((m.cw * SC[k - 1] + m.cw * SC[k]) / 2) * (k === 1 ? 1.06 : 0.84) + (k === 1 ? m.gap : 0);
  m.X = X;
  m.SC = SC;
  return m;
}
const itp = (arr: number[], a: number) => {
  const i = Math.min(Math.floor(a), arr.length - 2),
    f = Math.min(a - i, 1);
  return lerp(arr[i], arr[i + 1], f);
};
export interface Pose {
  x: number;
  y: number;
  s: number;
  rot: number;
  o: number;
  z: number;
  dim: number;
}
export function cardPose(m: CarMetrics, portrait: boolean, i: number, pos: number): Pose {
  if (m.flat) {
    if (portrait) {
      const y = (i - (m.n - 1) / 2) * (m.ch + m.gap),
        f = Math.max(0, 1 - Math.abs(i - pos));
      return { x: 0, y, s: 0.96 + 0.04 * f, rot: 0, o: 1, z: 10 + f * 5, dim: 0.16 * (1 - f) };
    }
    const x = (i - (m.n - 1) / 2) * (m.cw + m.gap),
      f = Math.max(0, 1 - Math.abs(i - pos));
    return { x, y: -10 * f, s: 0.95 + 0.05 * f, rot: (i - (m.n - 1) / 2) * 0.6, o: 1, z: 10 + f * 5, dim: 0.18 * (1 - f) };
  }
  const d = i - pos,
    a = Math.abs(d),
    sg = Math.sign(d);
  const x = sg * itp(m.X, Math.min(a, 8)),
    s = itp(m.SC, Math.min(a, 8));
  const o = a > 5.4 ? 0 : a < 3 ? 1 : Math.max(0, 1 - (a - 3) * 0.42);
  return { x, y: Math.pow(Math.min(a, 5), 1.3) * 9 - (a < 1 ? (1 - a) * 16 : 0), s, rot: clamp(d, -3, 3) * 2.4, o, z: 100 - Math.round(a * 10), dim: clamp(a * 0.2, 0, 0.6) };
}

/* ---------- stage: a template or a category at full size ---------- */
export interface StageGeom {
  aw: number;
  ah: number;
  ax: number;
  ay: number;
  sx: number;
  sy: number;
  sw: number;
  sh?: number;
  nav: [number, number, number];
}
export function stageGeom(g: Geo): StageGeom {
  const { W, H, S, portrait } = g;
  const s = {} as StageGeom;
  if (portrait) {
    s.aw = Math.round(W * 0.88);
    s.ah = Math.round(s.aw * 0.75);
    s.ax = Math.round(W * 0.06);
    s.ay = Math.round(H * 0.17);
    s.sx = s.ax;
    s.sy = s.ay + s.ah + Math.round(H * 0.025);
    s.sw = s.aw;
    s.nav = [s.ax, Math.round(H - S * 0.19), s.aw];
  } else {
    s.ah = Math.round(Math.min(H * 0.6, W * 0.5 * 0.75));
    s.aw = Math.round(s.ah / 0.75);
    s.ax = Math.round(W * 0.065);
    s.ay = Math.round(H * 0.205);
    s.sx = s.ax + s.aw + Math.round(W * 0.045);
    s.sy = s.ay;
    s.sw = Math.round(W - s.sx - W * 0.085);
    s.sh = s.ah;
    s.nav = [s.ax, s.ay + s.ah + Math.round(H * 0.035), s.aw];
  }
  return s;
}

/* ---------- treemap ---------- */
export function squarify(areas: number[], x: number, y: number, w: number, h: number): [number, number, number, number][] {
  const out: [number, number, number, number][] = new Array(areas.length);
  let i = 0;
  while (i < areas.length) {
    const short = Math.min(w, h);
    let row = [areas[i]],
      j = i + 1;
    const worst = (r: number[]) => {
      const s = r.reduce((a, b) => a + b, 0),
        mx = Math.max(...r),
        mn = Math.min(...r);
      return Math.max((short * short * mx) / (s * s), (s * s) / (short * short * mn));
    };
    while (j < areas.length) {
      const t = row.concat(areas[j]);
      if (worst(t) <= worst(row)) {
        row = t;
        j++;
      } else break;
    }
    const s = row.reduce((a, b) => a + b, 0);
    if (w >= h) {
      const cw = s / h;
      let yy = y;
      for (let k = 0; k < row.length; k++) {
        const hh = row[k] / cw;
        out[i + k] = [x, yy, cw, hh];
        yy += hh;
      }
      x += cw;
      w -= cw;
    } else {
      const rh = s / w;
      let xx = x;
      for (let k = 0; k < row.length; k++) {
        const ww = row[k] / rh;
        out[i + k] = [xx, y, ww, rh];
        xx += ww;
      }
      y += rh;
      h -= rh;
    }
    i = j;
  }
  return out;
}

/* ---------- torn clip paths (CSS polygon strings) ---------- */
export function tornClip(w: number, h: number, amp: number, seed: number): string {
  const r = RNG(seed),
    pts: [number, number][] = [],
    st = 15;
  for (let x = 0; x <= w; x += st) pts.push([x, r() * amp]);
  for (let y = 0; y <= h; y += st) pts.push([w - r() * amp, y]);
  for (let x = w; x >= 0; x -= st) pts.push([x, h - r() * amp]);
  for (let y = h; y >= 0; y -= st) pts.push([r() * amp, y]);
  return "polygon(" + pts.map((p) => p[0].toFixed(1) + "px " + p[1].toFixed(1) + "px").join(",") + ")";
}
export function tornTop(w: number, h: number, amp: number, seed: number): string {
  const r = RNG(seed),
    pts: [number, number][] = [[0, amp * 2]];
  let o = 0;
  for (let x = 0; x <= w; x += 7) {
    o = o * 0.6 + (r() - 0.5) * amp * 1.5;
    pts.push([x, amp + o + Math.sin(x * 0.011) * amp * 0.6]);
  }
  pts.push([w, h], [0, h]);
  return "polygon(" + pts.map((p) => p[0].toFixed(1) + "px " + p[1].toFixed(1) + "px").join(",") + ")";
}

/* ---------- numbers ---------- */
export const fmtDur = (s: number | null | undefined): string =>
  s == null ? "" : s < 60 ? s + " s" : s % 60 === 0 ? s / 60 + " min" : (s / 60).toFixed(1).replace(".0", "") + " min";
export const fmtN = (n: number): string => n.toLocaleString("en-US");
/** a family's item total, or null when no category's count is known */
export const famItems = (f: GalaxyFamily): number | null => {
  let t = 0,
    known = false;
  for (const c of f.categories) {
    if (typeof c.items === "number" && c.items > 0) {
      t += c.items;
      known = true;
    }
  }
  return known ? t : null;
};
