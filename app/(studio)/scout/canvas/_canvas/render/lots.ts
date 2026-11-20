// TOWNS - drawn two ways by zoom. Close in (town and street level, world space) a town is a block of lots: a filled
// bar far out, a card with its picture or its sentence close in, a reel's road to the calendar as five pips. Far out
// (continent and basin level, screen space) a town is a ring split by state, with the weir wall where work waits and
// the dam where failures piled up. Port of the winner's map.js drawBlocks/drawLot/drawRings.

import { CHAIN, CHAIN_DONE, chainIx, ITEM_STATES, STATE } from "../tables.ts";
import { LH, LW } from "../scene/geo.ts";
import type { Item } from "../scene/types.ts";
import { toS } from "./camera.ts";
import { font, isRef, lensOkF, ringR, rr, stateC, TAU, thumb, Z, type Frame } from "./prims.ts";

export function drawBlocks(f: Frame): void {
  const { ctx, pal, z, vis, kBlock, revealX } = f;
  const sel = f.st.ui.sel;
  for (const r of f.s.rivers) {
    for (const t of r.towns) {
      if (t.x > revealX || !vis(t.bx - 8, t.by - 24, t.bx + t.bw + 8, t.by + t.bh + 8)) continue;
      ctx.globalAlpha = kBlock;
      ctx.fillStyle = pal.a("ink-1", 0.92);
      rr(ctx, t.bx - 6, t.by - 6, t.bw + 12, t.bh + 12, 5);
      ctx.fill();
      ctx.strokeStyle = sel !== null && sel.type === "town" && sel.ref === t ? pal.c.cyan : t.blocks.n > 0 ? pal.a("amber", 0.5) : pal.c["hair-2"];
      ctx.lineWidth = 1 / z;
      ctx.stroke();
      for (const it of t.items) drawLot(f, it);
      ctx.globalAlpha = 1;
    }
  }
}

/** Lot: one node. A filled bar far out; a card with its picture or its sentence close in. */
function drawLot(f: Frame, it: Item): void {
  const { ctx, pal, z, kCard, now } = f;
  const { c, a } = pal;
  const still = pal.still;
  const { x, y } = it;
  const col = stateC(pal, it.state);
  const dim = !lensOkF(f, it);
  const hollow = STATE[it.state].hollow;
  const ga = ctx.globalAlpha;
  const base = dim ? ga * 0.14 : ga;
  const sel = f.st.ui.sel;
  const selc = sel !== null && sel.type === "item" && sel.ref === it;
  const hov = isRef(f.hover, it);
  if (kCard < 1) {
    ctx.globalAlpha = base * (1 - kCard * 0.9);
    if (hollow) {
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.4 / z;
      ctx.strokeRect(x + 0.7 / z, y + 0.7 / z, LW - 1.4 / z, LH - 1.4 / z);
    } else {
      ctx.fillStyle = col;
      ctx.globalAlpha *= it.state === "paused" ? 0.5 : 0.85;
      ctx.fillRect(x, y, LW, LH);
    }
  }
  if (kCard > 0) {
    ctx.globalAlpha = base * kCard;
    ctx.fillStyle = c["ink-3"];
    rr(ctx, x, y, LW, LH, 1.2);
    ctx.fill();
    const img = it.media !== null ? thumb(it) : null;
    if (img !== null) {
      const ar = LW / LH;
      const sw = Math.min(img.width, img.height * ar);
      const sh = sw / ar;
      ctx.save();
      rr(ctx, x, y, LW, LH, 1.2);
      ctx.clip();
      ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, LW, LH);
      const vh = Math.min(LH * 0.5, 17 / z);
      ctx.fillStyle = a("ink", 0.86);
      ctx.fillRect(x, y + LH - vh, LW, vh);
      ctx.restore();
    } else {
      ctx.fillStyle = col;
      ctx.globalAlpha *= 0.1;
      ctx.fill();
      ctx.globalAlpha = base * kCard;
    }
    if (hollow) {
      ctx.strokeStyle = col;
      ctx.lineWidth = 1 / z;
      ctx.strokeRect(x + 0.5 / z, y + 0.5 / z, 3 / z, LH - 1 / z);
    } else {
      ctx.fillStyle = col;
      ctx.fillRect(x, y, 3.2 / z, LH);
    }
  }
  ctx.globalAlpha = base;
  /* the weir on a lot: an amber notch while it waits, the five pips of its road to the calendar close in */
  const au = it.audio;
  if (au !== null && it.state === "kept") {
    const run = au.run !== null && now >= au.run.t0 ? au.run : null;
    const done = au.step >= CHAIN_DONE;
    const nc = run !== null ? c.cyan : done ? c.violet : c.amber;
    const k = Math.min(LH * 0.62, 9 / z);
    ctx.fillStyle = c.ink;
    ctx.beginPath();
    ctx.moveTo(x + LW - k - 1.5 / z, y);
    ctx.lineTo(x + LW, y);
    ctx.lineTo(x + LW, y + k + 1.5 / z);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = nc;
    ctx.beginPath();
    ctx.moveTo(x + LW - k, y);
    ctx.lineTo(x + LW, y);
    ctx.lineTo(x + LW, y + k);
    ctx.closePath();
    ctx.fill();
    if (kCard > 0.5) {
      const s = 6 / z;
      const g = 2.5 / z;
      const px0 = x + LW - k - 6 / z - CHAIN.length * (s + g);
      const py = y + 3 / z;
      ctx.fillStyle = a("ink", 0.8);
      rr(ctx, px0 - g, py - g, CHAIN.length * (s + g) + g, s + 2 * g, 2 / z);
      ctx.fill();
      CHAIN.forEach((_step, i) => {
        const on = i < au.step;
        const live = run !== null && chainIx(run.key) === i;
        ctx.fillStyle = live ? c.cyan : on ? (i === CHAIN.length - 1 ? c.violet : c.emerald) : a("ink-bright", 0.28);
        ctx.fillRect(px0 + i * (s + g), py, s, s);
      });
    }
    if (run !== null && !still) {
      const ph = (now / 700) % 1;
      ctx.strokeStyle = c.cyan;
      ctx.globalAlpha = base * (1 - ph);
      ctx.lineWidth = 1.4 / z;
      const g = ph * 3;
      ctx.strokeRect(x - g, y - g, LW + g * 2, LH + g * 2);
      ctx.globalAlpha = base;
    }
  }
  if (selc || hov) {
    ctx.globalAlpha = ga;
    ctx.strokeStyle = selc ? c.cyan : a("text", 0.85);
    ctx.lineWidth = (selc ? 2.2 : 1.4) / z;
    rr(ctx, x - 1.2 / z, y - 1.2 / z, LW + 2.4 / z, LH + 2.4 / z, 1.6);
    ctx.stroke();
  }
  if (it.state === "pending" && !still) {
    const ph = (now / 900) % 1;
    ctx.strokeStyle = c.cyan;
    ctx.globalAlpha = (1 - ph) * 0.8 * (dim ? 0.14 : 1);
    ctx.lineWidth = 1.2 / z;
    const g = ph * 4;
    ctx.strokeRect(x - g, y - g, LW + g * 2, LH + g * 2);
  }
  ctx.globalAlpha = ga;
}

/** Town, drawn as a ring split by state (continent and basin level); the weir wall where work waits. */
export function drawRings(f: Frame): void {
  const { ctx, pal, z, kCircle, revealX, W, H, st } = f;
  const { c, a } = pal;
  const lens = st.ui.lens;
  const sel = st.ui.sel;
  for (const r of f.s.rivers) {
    for (const t of r.towns) {
      if (t.x > revealX) continue;
      const [px, py] = toS(st, t.x, r.cy);
      if (px < -40 || px > W + 40 || py < -40 || py > H + 40) continue;
      const rs = ringR(t, z);
      const tot = t.n;
      let ang = -Math.PI / 2;
      ctx.globalAlpha = kCircle;
      if (t.blocks.n > 0) {
        ctx.fillStyle = a("amber", 0.2);
        ctx.beginPath();
        ctx.arc(px, py, rs + 4.5, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = c["ink-1"];
      ctx.beginPath();
      ctx.arc(px, py, rs, 0, TAU);
      ctx.fill();
      const lw = Math.max(1.6, Math.min(4, rs * 0.32));
      for (const s of ITEM_STATES) {
        const n = t.c[s] ?? 0;
        if (n === 0) continue;
        const da = (n / tot) * TAU;
        ctx.strokeStyle = stateC(pal, s);
        ctx.lineWidth = lw;
        const lensDim = lens !== null && !t.items.some((it) => it.state === s && lensOkF(f, it));
        ctx.globalAlpha = kCircle * (lensDim ? 0.15 : STATE[s].hollow ? 0.55 : 1);
        ctx.beginPath();
        ctx.arc(px, py, rs - lw / 2, ang, ang + da);
        ctx.stroke();
        ang += da;
      }
      ctx.globalAlpha = kCircle;
      /* the weir: a wall across the river just below the town */
      if (t.blocks.n > 0 && rs > 3) {
        ctx.fillStyle = c["wall-hi"];
        ctx.fillRect(px + rs + 2.5, py - Math.max(5, rs * 0.9), 2.5, Math.max(10, rs * 1.8));
      }
      /* the dam: failures piled up */
      const failed = t.c.failed ?? 0;
      const fr = failed / tot;
      if (failed >= 2 && fr >= 0.3 && rs > 4) {
        ctx.fillStyle = c.rose;
        const dx = px - rs - 6;
        ctx.fillRect(dx, py - rs * 0.8, 2, rs * 1.6);
        ctx.fillRect(dx - 4, py - rs * 0.8, 2, rs * 1.6);
      }
      const selc = sel !== null && sel.type === "town" && sel.ref === t;
      const hov = isRef(f.hover, t);
      if (selc || hov) {
        ctx.strokeStyle = selc ? c.cyan : c.text;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(px, py, rs + 3, 0, TAU);
        ctx.stroke();
      }
      if (kCircle > 0.5 && z >= Z.basin * 0.8) f.boxes.push([px - rs - 2, py - rs - 2, rs * 2 + 4, rs * 2 + 4]);
      if (rs >= 10 && z >= Z.basin) {
        ctx.font = font(pal, 12, "mono", "600");
        ctx.fillStyle = c["ink-bright"];
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(tot), px, py + 0.5);
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
      }
      ctx.globalAlpha = 1;
    }
  }
}
