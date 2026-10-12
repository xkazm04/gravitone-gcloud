// Small drawn compositions: the 4:3 diorama a template or a category gets when
// it has no real picture, a library family's ream, and the empty tray. Pure
// paint.

import type { GalaxyFamily } from "../types";
import { DIORAMA_INK, LOCK_INK, REAM_INK } from "./inks";
import { MOT, SIL_COUNT } from "./motifs";
import { drawMedal, specOf } from "./medal";
import { palette, type Palette } from "./palette";
import { circ, gp, paper, ridge, rrect, tornEdge, vgrad, xf, type Ctx2D } from "./paper";
import { RNG, TAU, hash32, pick } from "./rng";

export interface DioramaOpts {
  spread?: number;
  noEmblem?: boolean;
  sparse?: boolean;
}

/** a 4:3 paper landscape for item `id` under `parentId`, in its parent's colours */
export function drawDiorama(ctx: Ctx2D, w: number, h: number, id: string, parentId: string, opts?: DioramaOpts | null): void {
  const o = opts || {};
  const P = palette(parentId, id, o.spread == null ? 22 : o.spread),
    r = RNG(hash32("tpl|" + id + "|" + parentId)),
    k = P.k;
  const mode = Math.floor(r() * 3),
    u = h / 300;
  let s0: string, s1: string, sun: string, rc: string[];
  if (mode === 0) {
    s0 = P.t("soft", -2);
    s1 = P.t("pale", 2);
    sun = k.acc;
    rc = [P.t("soft", -12), k.mid, k.dark, k.deep];
  } else if (mode === 1) {
    s0 = P.t("mid", 2);
    s1 = P.t("acc2", -2);
    sun = k.paper;
    rc = [P.t("mid", -8), P.t("dark", 2), k.deep, P.t("deep", -4)];
  } else {
    s0 = P.t("deep", -2);
    s1 = P.t("dark", 2);
    sun = k.pale;
    rc = [P.t("dark", 6), P.t("mid", -6), P.t("dark", -6), P.t("deep", -6)];
  }
  ctx.save();
  ctx.fillStyle = vgrad(ctx, 0, h, s0, s1);
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = gp(ctx);
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
  /* stars / dust for night */
  if (mode === 2) {
    ctx.fillStyle = DIORAMA_INK.star;
    for (let i = 0; i < 24; i++) {
      ctx.beginPath();
      ctx.arc(r() * w, r() * h * 0.5, (0.6 + r() * 1.2) * u, 0, TAU);
      ctx.fill();
    }
  }
  const sx = w * (0.2 + r() * 0.6),
    sy = h * (0.2 + r() * 0.2),
    sr = h * (0.09 + r() * 0.07);
  ctx.save();
  ctx.globalAlpha = 0.4;
  paper(ctx, circ(sx, sy, sr * 1.6), P.t("acc2"), { g: 0.3, hl: 0, sh: 0 });
  ctx.restore();
  paper(ctx, circ(sx, sy, sr), sun, { e: 4 * u });
  if (r() < 0.5) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    paper(ctx, circ(sx + sr * 0.45, sy - sr * 0.15, sr * 0.85), s0, { g: 0.3, hl: 0, sh: 0, e: 0 });
    ctx.restore();
  }
  const n = 2 + Math.floor(r() * 2),
    flip = r() < 0.5;
  for (let i = 0; i < n; i++) {
    const base = h * (0.48 + i * 0.15 + r() * 0.04);
    // the original chose between ridge and ridge here; the draw stays so the
    // ridges that follow match it
    r();
    paper(ctx, ridge(0, w, base, h * (0.075 - i * 0.012), r, h + 10, 4), rc[i], { e: (5 + i * 3) * u });
  }
  if (r() < 0.55) {
    // a few small paper-cut birds
    ctx.fillStyle = mode === 2 ? k.pale : k.deep;
    const nb = 2 + Math.floor(r() * 3);
    for (let i = 0; i < nb; i++) {
      const bx = w * (0.12 + r() * 0.5),
        by = h * (0.12 + r() * 0.24),
        bs = h * (0.016 + r() * 0.012);
      ctx.beginPath();
      ctx.moveTo(bx - bs * 2, by);
      ctx.quadraticCurveTo(bx - bs, by - bs * 1.5, bx, by);
      ctx.quadraticCurveTo(bx + bs, by - bs * 1.5, bx + bs * 2, by);
      ctx.quadraticCurveTo(bx + bs, by - bs * 0.3, bx, by + bs * 0.4);
      ctx.quadraticCurveTo(bx - bs, by - bs * 0.3, bx - bs * 2, by);
      ctx.fill();
    }
  }
  const fy = h * (0.86 + r() * 0.03);
  paper(ctx, tornEdge(-6, w + 6, fy, 2 * u, r, h + 10, 5), rc[3], { e: 7 * u, rim: P.t("paper"), rimw: 2.2 * u });
  if (!o.noEmblem && (!o.sparse || r() < 0.4) && MOT[specOf(parentId).motif]) {
    const sp = specOf(parentId),
      er = h * 0.15,
      ex = flip ? w * 0.8 : w * 0.2,
      ey = h * (0.7 + r() * 0.04);
    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate((r() - 0.5) * 0.3);
    drawMedal(ctx, er, sp, { sil: (sp.sil + 1) % SIL_COUNT });
    ctx.restore();
  }
}

/** the ream's paper tone (its first seeded draw), also the colour of its tab */
export const reamTone = (id: string): string => pick(RNG(hash32("ream|" + id)), REAM_INK.tones);

/** paints a library family as a ream of paper strata at (0,0), w by h; the
 *  caller has already offset the context by the shadow pad */
export function paintReam(c: Ctx2D, f: GalaxyFamily, w: number, h: number, compact: boolean): void {
  const r = RNG(hash32("ream|" + f.id)),
    tone = pick(r, REAM_INK.tones);
  const locked = f.status === "locked";
  /* loose sheets behind */
  for (let k = 0; k < 2; k++) {
    const sh = xf(tornEdge(-3, w + 3, 3 + k * 2 + r() * 3, 2.6, r, h + 4, 4), { rot: (r() - 0.5) * 5.2, tx: (r() - 0.5) * 8, ty: 0 });
    paper(c, sh, REAM_INK.loose[k], { e: 5, rim: REAM_INK.looseRim, rimw: 2 });
  }
  const top = compact ? 4 : 11;
  const body = tornEdge(0, w, top, 2.6, r, h, 4);
  paper(c, body, tone, { e: 9, rim: REAM_INK.bodyRim, rimw: 2.4, g: 1, hl: 0.4 });
  /* strata: category thicknesses stacked, torn lines between */
  const cats = f.categories || [];
  c.save();
  c.clip(body);
  if (cats.length) {
    const vals = cats.map((x) => (typeof x.items === "number" && x.items > 0 ? x.items : 0)),
      nz = vals.filter((v) => v > 0),
      avg = nz.length ? nz.reduce((a, b) => a + b, 0) / nz.length : 1;
    const wts = vals.map((v) => Math.max(v || avg, avg * 0.22)),
      sum = wts.reduce((a, b) => a + b, 0),
      H0 = h - top - 6;
    let y = top + 7;
    for (let i = 0; i < cats.length; i++) {
      const th = (wts[i] / sum) * H0;
      if (i % 2) {
        c.fillStyle = REAM_INK.band;
        c.fillRect(0, y, w, th);
      }
      y += th;
      if (i < cats.length - 1) {
        c.strokeStyle = REAM_INK.seam;
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(0, y);
        for (let x = 0; x <= w; x += 5) c.lineTo(x, y + (r() - 0.5) * 1.4);
        c.stroke();
        c.strokeStyle = REAM_INK.seamLit;
        c.beginPath();
        c.moveTo(0, y + 1.3);
        c.lineTo(w, y + 1.3);
        c.stroke();
      }
    }
  } else {
    c.strokeStyle = REAM_INK.blankSeam;
    c.lineWidth = 1;
    for (let i = 1; i < 3; i++) {
      const y = top + ((h - top) * i) / 3;
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(w, y);
      c.stroke();
    }
  }
  /* shade side edge */
  const sg = c.createLinearGradient(0, 0, w, 0);
  sg.addColorStop(0, REAM_INK.edge[0]);
  sg.addColorStop(0.12, REAM_INK.edge[1]);
  sg.addColorStop(0.88, REAM_INK.edge[2]);
  sg.addColorStop(1, REAM_INK.edge[3]);
  c.fillStyle = sg;
  c.fillRect(0, 0, w, h);
  c.restore();
  if (locked) {
    /* a strap and a latch */
    const sy = h * 0.5,
      sh = Math.max(14, h * 0.16);
    paper(c, rrect(-4, sy, w + 8, sh, 3), LOCK_INK.strap, { e: 5, hl: 0.2 });
    c.fillStyle = LOCK_INK.stitch;
    for (let x = 8; x < w; x += 14) c.fillRect(x, sy + sh / 2 - 1, 6, 2);
    const lw = Math.min(w * 0.3, compact ? 24 : 34),
      lh = lw * 0.86,
      mx = compact ? w - lw * 0.9 - 8 : w / 2,
      lx = mx - lw / 2,
      ly = sy + sh / 2 - lh / 2 + 2;
    c.save();
    c.strokeStyle = LOCK_INK.shackle;
    c.lineWidth = lw * 0.14;
    c.beginPath();
    c.arc(mx, ly + 1, lw * 0.3, Math.PI, 0);
    c.stroke();
    c.restore();
    paper(c, rrect(lx, ly, lw, lh, lw * 0.16), LOCK_INK.latch, { e: 3, hl: 0.5 });
    c.fillStyle = LOCK_INK.keyhole;
    c.beginPath();
    c.arc(mx, ly + lh * 0.42, lw * 0.09, 0, TAU);
    c.fill();
    c.fillRect(mx - lw * 0.03, ly + lh * 0.42, lw * 0.06, lh * 0.28);
  }
}

/** an empty family: a paper tray, strapped shut when locked */
export function drawTray(c: Ctx2D, w: number, h: number, P: Palette, locked: boolean): void {
  c.translate(w / 2, h / 2);
  c.scale(0.86, 0.86);
  const u = Math.min(w, h) / 300,
    k = P.k;
  paper(c, rrect(-w * 0.46, -h * 0.34, w * 0.92, h * 0.62, 16 * u), P.t("pale", -4), { e: 10 * u, g: 0.8 });
  (
    [
      [-6, -1.4, k.paper],
      [3, 0.8, P.t("soft", 10)],
      [10, -0.4, k.pale],
    ] as [number, number, string][]
  ).forEach(([dy, rot, col]) => {
    paper(c, xf(rrect(-w * 0.36, -h * 0.3 + dy * u * 3, w * 0.72, h * 0.5, 6 * u), { rot }), col, {
      e: 6 * u,
      g: 0.9,
      rim: REAM_INK.trayRim,
      rimw: 2 * u,
    });
  });
  const fr = new Path2D();
  fr.moveTo(-w * 0.46, h * 0.02);
  fr.lineTo(-w * 0.1, h * 0.02);
  fr.arc(0, h * 0.02, w * 0.1, Math.PI, 0, true);
  fr.lineTo(w * 0.46, h * 0.02);
  fr.lineTo(w * 0.46, h * 0.3);
  fr.quadraticCurveTo(w * 0.46, h * 0.34, w * 0.42, h * 0.34);
  fr.lineTo(-w * 0.42, h * 0.34);
  fr.quadraticCurveTo(-w * 0.46, h * 0.34, -w * 0.46, h * 0.3);
  fr.closePath();
  paper(c, fr, P.t("mid", 4), { e: 12 * u, g: 1, hl: 0.3 });
  if (locked) {
    paper(c, rrect(-w * 0.5, h * 0.1, w, h * 0.1, 3 * u), LOCK_INK.strap, { e: 6 * u, hl: 0.2 });
    c.save();
    c.strokeStyle = LOCK_INK.shackle;
    c.lineWidth = w * 0.022;
    c.beginPath();
    c.arc(0, h * 0.1, w * 0.07, Math.PI, 0);
    c.stroke();
    c.restore();
    paper(c, rrect(-w * 0.09, h * 0.08, w * 0.18, h * 0.16, w * 0.03), LOCK_INK.latch, { e: 5 * u, hl: 0.5 });
    c.fillStyle = LOCK_INK.keyhole;
    c.beginPath();
    c.arc(0, h * 0.15, w * 0.014, 0, TAU);
    c.fill();
    c.fillRect(-w * 0.005, h * 0.15, w * 0.01, h * 0.05);
  }
}
