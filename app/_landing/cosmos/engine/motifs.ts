// The silhouettes a medallion is cut from, and the motif grammar: fifteen
// builders, each three to six stacked sheets of paper. Pure paint.

import type { Palette } from "./palette";
import { bg, circ, ell, merge, paper, poly, polar, ridge, rrect, wave, xf, type Ctx2D } from "./paper";
import { TAU, clamp, lerp, type Rand } from "./rng";

/* ---------- silhouettes: the plate each medallion is cut from ---------- */
/** disc, scallop, flower, arch, squircle, hexagon, stamp, burst */
export const SIL_COUNT = 8;

export function silhouette(kind: number, R: number, r: Rand): Path2D {
  const N = 300;
  switch (kind) {
    case 0:
      return polar(() => R, N, 0.006, r);
    case 1: {
      const n = 14 + Math.floor(r() * 8);
      return polar((t) => R * (0.965 + 0.035 * Math.pow(Math.abs(Math.cos((t * n) / 2)), 0.6)), N * 2, 0.003, r);
    }
    case 2: {
      const n = 5 + Math.floor(r() * 4);
      return polar((t) => R * (0.8 + 0.2 * Math.pow(Math.abs(Math.cos((t * n) / 2)), 0.7)), N * 2, 0.003, r);
    }
    case 3: {
      const w = R * 0.84,
        h0 = -R * 0.12;
      const p = new Path2D();
      p.moveTo(-w, R * 0.97);
      p.lineTo(-w, h0);
      p.arc(0, h0, w, Math.PI, 0);
      p.lineTo(w, R * 0.97);
      p.closePath();
      return p;
    }
    case 4:
      return polar(
        (t) => {
          const c = Math.abs(Math.cos(t)),
            s = Math.abs(Math.sin(t));
          return R / Math.pow(Math.pow(c, 4.2) + Math.pow(s, 4.2), 1 / 4.2);
        },
        N,
        0.004,
        r,
      );
    case 5:
      return polar(
        (t) => {
          const a = (((t % (TAU / 6)) + TAU / 6) % (TAU / 6)) - TAU / 12;
          return lerp((R * 0.9) / Math.cos(a), R, 0.28) * 0.97;
        },
        N,
        0.004,
        r,
      );
    case 6: {
      const n = 22 + Math.floor(r() * 8);
      return polar(
        (t) => {
          const c = Math.abs(Math.cos(t)),
            s = Math.abs(Math.sin(t));
          const q = (R * 0.96) / Math.pow(Math.pow(c, 5) + Math.pow(s, 5), 1 / 5);
          return q * (0.955 + 0.045 * Math.pow(Math.abs(Math.cos(t * n)), 0.4));
        },
        N * 2,
        0.002,
        r,
      );
    }
    default: {
      const n = 14 + Math.floor(r() * 6);
      return polar(
        (t) => {
          const u = ((((t * n) / TAU) % 1) + 1) % 1;
          return R * (0.84 + 0.16 * (1 - Math.abs(u * 2 - 1)));
        },
        N * 2,
        0.003,
        r,
      );
    }
  }
}

/* ---------- the motif grammar ---------- */
export type Motif = (c: Ctx2D, R: number, P: Palette, r: Rand) => void;
export const MOT: Record<string, Motif> = {};
export const MOTIF_NAMES: string[] = [];
function def(n: string, fn: Motif): void {
  MOT[n] = fn;
  MOTIF_NAMES.push(n);
}

def("ridgeSun", (c, R, P, r) => {
  const k = P.k;
  bg(c, R, P.t("soft", -6), P.t("pale"));
  const sx = (r() - 0.5) * R * 0.8,
    sy = -R * (0.12 + r() * 0.34),
    sr = R * (0.2 + r() * 0.12);
  c.save();
  c.globalAlpha = 0.55;
  paper(c, circ(sx, sy, sr * 1.55), k.acc2, { g: 0.4, hl: 0, sh: 0 });
  c.restore();
  paper(c, circ(sx, sy, sr), k.acc, { e: R * 0.035 });
  const n = 3 + Math.floor(r() * 2),
    cols = [k.mid, k.dark, k.deep, P.t("deep", -5)];
  for (let i = 0; i < n; i++)
    paper(c, ridge(-R, R, -R * 0.02 + i * R * 0.3 + r() * R * 0.08, R * (0.14 - i * 0.02), r, R * 1.2), cols[i], { e: R * (0.04 + 0.02 * i) });
});
def("waves", (c, R, P, r) => {
  const k = P.k;
  bg(c, R, k.dark, k.deep);
  const mx = (r() - 0.5) * R * 0.7;
  paper(c, circ(mx, -R * 0.5, R * 0.2), k.pale, { e: R * 0.03 });
  const n = 5 + Math.floor(r() * 2),
    cols = [k.mid, P.t("mid", -8), k.soft, k.mid, k.dark, k.deep, k.acc];
  const per = R * (0.9 + r() * 0.8);
  for (let i = 0; i < n; i++)
    paper(
      c,
      wave(-R * 1.2, R * 1.2, -R * 0.35 + i * R * 0.24, R * (0.07 + r() * 0.05), per * (0.8 + r() * 0.5), r() * TAU, R * 1.2),
      i === n - 1 && r() < 0.6 ? k.acc : cols[i % cols.length],
      { e: R * (0.03 + 0.012 * i) },
    );
});
def("sunburst", (c, R, P, r) => {
  const k = P.k;
  bg(c, R, k.mid, k.dark);
  const n = 14 + Math.floor(r() * 10),
    ph = r() * TAU,
    rays = (L: number, w: number, off: number) =>
      merge(
        Array.from({ length: n }, (_, i) => {
          const a = (i / n) * TAU + off;
          return poly([
            [0, 0],
            [Math.cos(a - w) * L, Math.sin(a - w) * L],
            [Math.cos(a + w) * L, Math.sin(a + w) * L],
          ]);
        }),
      );
  paper(c, rays(R * 1.5, (TAU / n) * 0.33, ph), k.acc2, { e: R * 0.02, u: 1 });
  paper(c, rays(R * 0.95, (TAU / n) * 0.26, ph + TAU / n / 2), k.pale, { e: R * 0.03, u: 1 });
  paper(c, circ(0, 0, R * 0.5), k.acc, { e: R * 0.05 });
  paper(c, circ(0, 0, R * 0.34), k.paper, { e: R * 0.04 });
  paper(c, circ(0, 0, R * 0.17), k.deep, { e: R * 0.03 });
});
def("petals", (c, R, P, r) => {
  const k = P.k;
  bg(c, R, k.dark, k.deep);
  const n = 6 + Math.floor(r() * 5),
    ph = r() * TAU,
    ring = (d: number, pr: number, ph2: number, col: string, e: number) =>
      paper(
        c,
        merge(
          Array.from({ length: n }, (_, i) => {
            const a = (i / n) * TAU + ph2;
            return ell(Math.cos(a) * d, Math.sin(a) * d, pr, pr * 0.46, a);
          }),
        ),
        col,
        { e, u: 1 },
      );
  ring(R * 0.52, R * 0.42, ph, k.soft, R * 0.03);
  ring(R * 0.36, R * 0.32, ph + TAU / n / 2, k.acc2, R * 0.04);
  ring(R * 0.2, R * 0.22, ph, k.acc, R * 0.05);
  paper(c, circ(0, 0, R * 0.15), k.paper, { e: R * 0.04 });
  paper(c, circ(0, 0, R * 0.06), k.deep, { e: R * 0.02 });
});
def("arches", (c, R, P, r) => {
  const k = P.k;
  bg(c, R, P.t("mid", 6), k.dark);
  const n = 4 + Math.floor(r() * 2),
    cols = [k.pale, k.acc2, k.soft, k.acc, k.paper],
    o = Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const w = R * (0.92 - i * 0.15),
      p = new Path2D();
    p.moveTo(-w, R * 1.1);
    p.lineTo(-w, -R * 0.55 + i * R * 0.14);
    p.arc(0, -R * 0.55 + i * R * 0.14, w, Math.PI, 0);
    p.lineTo(w, R * 1.1);
    p.closePath();
    paper(c, p, cols[(i + o) % cols.length], { e: R * (0.03 + 0.02 * i) });
  }
  paper(c, circ((r() - 0.5) * R * 0.16, R * 0.05, R * 0.1), k.deep, { e: R * 0.02 });
});
def("pyramid", (c, R, P, r) => {
  const k = P.k;
  bg(c, R, k.soft, k.pale);
  const sx = (r() - 0.5) * R * 0.9;
  paper(c, circ(sx, -R * 0.38, R * 0.3), k.acc, { e: R * 0.04 });
  paper(c, ridge(-R, R, R * 0.52, R * 0.05, r, R * 1.2), k.dark, { e: R * 0.04 });
  const n = 5 + Math.floor(r() * 3),
    cols = [k.mid, k.deep, k.dark, P.t("mid", -10)];
  for (let i = 0; i < n; i++) {
    const w = R * (1.0 - i * (0.82 / n)),
      h = R * (1.0 / n) * 1.02,
      y = R * 0.52 - (i + 1) * h;
    paper(c, rrect(-w / 2 + (r() - 0.5) * R * 0.02, y, w, h * 1.02, R * 0.01), cols[i % cols.length], { e: R * (0.03 + 0.012 * i) });
  }
});
def("cog", (c, R, P, r) => {
  const k = P.k;
  bg(c, R, k.mid, k.dark);
  const n = 9 + Math.floor(r() * 6),
    g = (Rr: number, tooth: number) => polar((t) => Rr * (1 + tooth * clamp(Math.cos(t * n) * 2.4, -1, 1)), 400, 0, r);
  paper(c, xf(g(R * 0.84, 0.1), {}), k.pale, { e: R * 0.05 });
  paper(c, circ(0, 0, R * 0.6), k.acc2, { e: R * 0.04 });
  paper(c, circ(0, 0, R * 0.42), k.dark, { e: R * 0.04 });
  paper(c, circ(0, 0, R * 0.26), k.acc, { e: R * 0.05 });
  paper(c, circ(0, 0, R * 0.1), k.deep, { e: R * 0.02 });
  // the original drew a small gear's position here and never used it; the three
  // draws stay so the gear's phase below matches it
  r();
  r();
  r();
  const m = 6;
  paper(c, polar((t) => R * 0.22 * (1 + 0.1 * clamp(Math.cos(t * m) * 2.4, -1, 1)), 240, 0, r), k.soft, { e: R * 0.04 });
});
def("eye", (c, R, P, r) => {
  const k = P.k;
  bg(c, R, k.deep, k.dark);
  const al = (w: number, h: number) => {
    const p = new Path2D();
    p.moveTo(-w, 0);
    p.quadraticCurveTo(0, -h * 2, w, 0);
    p.quadraticCurveTo(0, h * 2, -w, 0);
    return p;
  };
  paper(c, al(R * 1.02, R * 0.62), k.mid, { e: R * 0.05 });
  paper(c, al(R * 0.92, R * 0.52), k.pale, { e: R * 0.03 });
  paper(c, al(R * 0.82, R * 0.42), k.paper, { e: R * 0.02 });
  const ox = (r() - 0.5) * R * 0.2;
  c.save();
  c.clip(al(R * 0.82, R * 0.42));
  paper(c, circ(ox, 0, R * 0.38), k.acc, { e: R * 0.04 });
  paper(c, circ(ox, 0, R * 0.22), k.deep, { e: R * 0.03 });
  paper(c, circ(ox - R * 0.08, -R * 0.08, R * 0.06), k.paper, { e: 0, hl: 0 });
  c.restore();
  const n = 7;
  paper(
    c,
    merge(
      Array.from({ length: n }, (_, i) => {
        const t = (i + 0.5) / n,
          x = lerp(-R * 0.7, R * 0.7, t),
          y = -R * 0.55 * Math.sin(t * Math.PI) - R * 0.2;
        return poly([
          [x - R * 0.045, y],
          [x + R * 0.045, y],
          [x, y - R * 0.2],
        ]);
      }),
    ),
    k.soft,
    { e: R * 0.02 },
  );
});
def("bars", (c, R, P, r) => {
  const k = P.k;
  bg(c, R, P.t("dark", 4), k.deep);
  paper(c, circ((r() - 0.5) * R * 0.3, -R * 0.1, R * 0.62), k.mid, { e: R * 0.03 });
  const n = 9 + Math.floor(r() * 8),
    w = (R * 1.7) / n,
    ph = r() * TAU;
  const mk = (sc: number, col: string, e: number) =>
    paper(
      c,
      merge(
        Array.from({ length: n }, (_, i) => {
          const t = i / (n - 1),
            env = Math.sin(t * Math.PI) * 0.78 + 0.22,
            h = R * (0.15 + 0.78 * env * (0.45 + 0.55 * Math.abs(Math.sin(i * 1.7 + ph + r() * 0.4)))) * sc;
          return rrect(-R * 0.85 + i * w + w * 0.14, -h / 2, w * 0.72, h, w * 0.34);
        }),
      ),
      col,
      { e },
    );
  mk(1, k.pale, R * 0.04);
  mk(0.55, k.acc, R * 0.03);
  paper(c, rrect(-R, -R * 0.012, R * 2, R * 0.024, R * 0.012), k.paper, { e: R * 0.015 });
});
def("clouds", (c, R, P, r) => {
  const k = P.k;
  bg(c, R, P.t("soft", -4), P.t("pale", 2));
  paper(c, circ((r() - 0.5) * R * 0.6, -R * 0.35, R * 0.28), k.acc, { e: R * 0.04 });
  const band = (y: number, sc: number, col: string, e: number) => {
    const p = new Path2D();
    p.rect(-R * 1.2, y, R * 2.4, R * 2);
    let x = -R * 1.2 + r() * R * 0.2;
    while (x < R * 1.2) {
      const rr = R * (0.13 + r() * 0.12) * sc;
      p.moveTo(x + rr, y);
      p.arc(x, y, rr, 0, TAU);
      x += rr * 1.25;
    }
    paper(c, p, col, { e, u: 1 });
  };
  band(-R * 0.12, 1, k.paper, R * 0.04);
  band(R * 0.12, 1.1, k.acc2, R * 0.05);
  band(R * 0.36, 1.2, k.mid, R * 0.05);
  band(R * 0.62, 1.3, k.dark, R * 0.06);
});
def("moons", (c, R, P, r) => {
  const k = P.k;
  bg(c, R, k.deep, k.dark);
  const cres = (x: number, y: number, rr: number, off: number, rot: number) => {
    const p = new Path2D();
    p.arc(0, 0, rr, 0, TAU);
    p.moveTo(off + rr * 0.82, 0);
    p.arc(off, 0, rr * 0.82, 0, TAU, true);
    return xf(p, { tx: x, ty: y, rot });
  };
  paper(c, circ(0, -R * 0.1, R * 0.62), k.mid, { e: R * 0.04 });
  paper(c, cres(0, -R * 0.1, R * 0.62, R * 0.26, r() * 360), k.pale, { e: R * 0.05 });
  const n = 5;
  for (let i = 0; i < n; i++) {
    const a = lerp(0.2, Math.PI - 0.2, i / (n - 1)),
      x = -Math.cos(a) * R * 0.6,
      y = R * 0.52 + Math.sin(a) * R * 0.16 - R * 0.1;
    paper(c, i % 2 ? cres(x, y, R * 0.1, R * 0.04, i * 40) : circ(x, y, R * 0.1), k.acc2, { e: R * 0.02 });
  }
});
def("fan", (c, R, P, r) => {
  const k = P.k;
  bg(c, R, k.soft, k.pale);
  const n = 7 + Math.floor(r() * 5),
    cy = R * 0.62,
    span = Math.PI * (0.82 + r() * 0.1),
    a0 = -Math.PI / 2 - span / 2;
  const blades = (r0: number, r1: number, ph: number, col: string, e: number) =>
    paper(
      c,
      merge(
        Array.from({ length: n }, (_, i) => {
          const a = a0 + ((i + 0.5) / n) * span + ph,
            w = (span / n) * 0.43,
            p = new Path2D();
          p.arc(0, cy, r1, a - w, a + w);
          p.arc(0, cy, r0, a + w, a - w, true);
          p.closePath();
          return p;
        }),
      ),
      col,
      { e },
    );
  blades(R * 0.18, R * 1.25, 0, k.dark, R * 0.04);
  blades(R * 0.18, R * 1.0, 0.02, k.mid, R * 0.04);
  blades(R * 0.18, R * 0.74, 0, k.acc2, R * 0.04);
  blades(R * 0.18, R * 0.48, 0, k.acc, R * 0.03);
  paper(c, circ(0, cy, R * 0.2), k.paper, { e: R * 0.04 });
});
def("squares", (c, R, P, r) => {
  const k = P.k;
  bg(c, R, k.dark, k.deep);
  const n = 5 + Math.floor(r() * 2),
    rot = 8 + r() * 10,
    cols = [k.pale, k.acc, k.mid, k.acc2, k.soft, k.paper];
  for (let i = 0; i < n; i++) {
    const s = R * (1.45 - i * (1.1 / n));
    paper(c, xf(rrect(-s / 2, -s / 2, s, s, s * 0.14), { rot: i * rot }), cols[i % cols.length], { e: R * (0.03 + 0.01 * i) });
  }
});
def("shell", (c, R, P, r) => {
  const k = P.k;
  bg(c, R, k.soft, k.pale);
  const n = 6,
    cols = [k.dark, k.mid, k.acc, k.acc2, k.paper, k.deep],
    o = r() * TAU;
  for (let i = 0; i < n; i++) {
    const rr = R * (1.0 - i * 0.15),
      th = R * 0.17,
      p = new Path2D();
    p.arc(0, 0, rr, o + i * 1.05, o + i * 1.05 + Math.PI * 1.45);
    p.arc(0, 0, rr - th, o + i * 1.05 + Math.PI * 1.45, o + i * 1.05, true);
    p.closePath();
    paper(c, p, cols[i], { e: R * 0.04 });
  }
  paper(c, circ(0, 0, R * 0.1), k.acc, { e: R * 0.03 });
});
def("pines", (c, R, P, r) => {
  const k = P.k;
  bg(c, R, P.t("dark", -2), P.t("mid", 4));
  const mx = (r() - 0.5) * R * 0.9;
  paper(c, circ(mx, -R * 0.45, R * 0.2), k.pale, { e: R * 0.03 });
  const row = (y: number, sc: number, col: string, n: number, e: number) => {
    const p = new Path2D();
    for (let i = 0; i < n; i++) {
      const x = lerp(-R * 1.1, R * 1.1, (i + 0.2 + r() * 0.6) / n),
        h = R * (0.5 + r() * 0.35) * sc,
        w = h * 0.5;
      for (let t = 0; t < 3; t++) {
        const yy = y - h * t * 0.28,
          ww = w * (1 - t * 0.22);
        p.addPath(
          poly([
            [x - ww / 2, yy],
            [x + ww / 2, yy],
            [x, yy - h * 0.42],
          ]),
        );
      }
    }
    p.addPath(rrect(-R * 1.4, y, R * 2.8, R * 1.5, 0));
    paper(c, p, col, { e, u: 1 });
  };
  paper(c, ridge(-R, R, R * 0.28, R * 0.1, r, R * 1.2), P.t("dark", -6), { e: R * 0.04 });
  row(R * 0.42, 0.8, k.dark, 8, R * 0.04);
  row(R * 0.82, 1.1, k.deep, 6, R * 0.06);
});
