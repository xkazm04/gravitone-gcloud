// BASIN LEVEL (screen space) - rivers named at their springs (sticky at the west edge) with their kept / decided and
// reach, one pill per river where its work waits, the song pipeline's stations and each basin's milestone posts.
// Port of the winner's map.js drawBasinLabels.

import { FAMILIES } from "../pipelines.ts";
import { BLOCK_KINDS } from "../tables.ts";
import { clamp, cut, smooth } from "../scene/geo.ts";
import { riverY } from "../scene/geometry.ts";
import type { River, Scope, Town } from "../scene/types.ts";
import { toS, toW } from "./camera.ts";
import { busyUnder, font, isRef, pill, ringR, stageName, text, Z, type Frame } from "./prims.ts";
import { rs } from "./state.ts";

const stationName = (name: string): string => (name.split(" - ")[0] ?? name).split(" (")[0] ?? name;

export function drawBasinLabels(f: Frame): void {
  const { ctx, pal, z, W, H, st } = f;
  const { c } = pal;
  const kRiv = smooth(z, Z.basin * 0.85, Z.basin * 1.05) * (1 - smooth(z, 1.0, 1.3));
  const lbl = rs(st).riverLbl;
  lbl.clear();
  if (kRiv > 0.05) {
    const second: [River, number, number, number][] = [];
    const wxl = toW(st, 14, 0)[0];
    for (const r of f.s.rivers) {
      const xw = clamp(wxl, r.src, Math.max(r.src, r.endX));
      const sticky = wxl > r.src + 4;
      const [px0, py] = toS(st, xw, riverY(r, xw));
      if (py < 40 || py > H + 10) continue;
      const px = Math.max(px0, 14);
      ctx.globalAlpha = kRiv;
      const hov = isRef(f.hover, r);
      const col = hov ? c.cyan : r.reach < 0 && !r.synthetic ? c.muted : r.rank > 0 ? c["ink-bright"] : c.text;
      const w = text(f, cut(r.name, 46) + (r.paused ? "  ‖ paused" : ""), px + 6, py - 6, font(pal, 13, "sans", r.chan !== null || r.rank > 0 ? "600" : ""), col);
      if (w > 0) {
        lbl.set(r, [px, py - 22, w + 12, 36]);
        if (!sticky && r.h * z >= 30) second.push([r, px, py, w]);
      }
      ctx.globalAlpha = 1;
    }
    ctx.globalAlpha = kRiv;
    for (const [r, px, py, w] of second) {
      const t2 = r.synthetic
        ? (FAMILIES.song.engine.split("(")[0] ?? "").trim()
        : r.reach < 0
          ? r.chan !== null
            ? "no episodes yet"
            : `${r.dead} dead · never left the seeds`
          : `${r.kept}/${r.decided} kept · reach ${stageName(r.reach)}`;
      text(f, t2, px + 6, py + 12, font(pal, 12, "mono"), r.reach < 0 && r.chan === null && !r.synthetic ? c.rose : r.rank > 0 ? c.emerald : c.muted);
      if (r.rank > 0) {
        ctx.fillStyle = c.emerald;
        ctx.beginPath();
        ctx.moveTo(px + w + 12, py - 6);
        ctx.lineTo(px + w + 17, py - 15);
        ctx.lineTo(px + w + 22, py - 6);
        ctx.closePath();
        ctx.fill();
      }
    }
    /* one pill per river and kind, at the town where most of it waits */
    for (const r of f.s.rivers) {
      if (r.blocks.n === 0) continue;
      for (const k of BLOCK_KINDS) {
        if (r.blocks[k] === 0) continue;
        const t = r.towns.reduce<Town | null>((m, x) => (x.blocks[k] > (m !== null ? m.blocks[k] : 0) ? x : m), null);
        if (t === null) continue;
        const [px, py] = toS(st, t.x, r.cy);
        if (py < 34 || py > H + 20 || px < -40 || px > W + 40) continue;
        const sc: Scope = r.blocks[k] === t.blocks[k] ? { type: "town", ref: t } : { type: "river", ref: r };
        pill(f, px + ringR(t, z) + 9, py - 13, k, r.blocks[k], sc, { alpha: kRiv, busy: busyUnder(f, sc, k) });
      }
    }
    ctx.globalAlpha = 1;
  }
  if (z >= Z.basin * 0.9) {
    for (const sp of f.s.songRiver.stationPts) {
      const [px, py] = toS(st, sp.x, sp.y);
      if (px < -60 || px > W + 60 || py < -20 || py > H + 40) continue;
      const ex = sp.s.exists;
      const hov = isRef(f.hover, sp);
      ctx.fillStyle = ex ? c["ink-1"] : c.ink;
      ctx.strokeStyle = hov ? c.cyan : ex ? c.text : c.violet;
      ctx.lineWidth = 1.6;
      ctx.setLineDash(ex ? [] : [3, 2]);
      ctx.fillRect(px - 5, py - 5, 10, 10);
      ctx.strokeRect(px - 5, py - 5, 10, 10);
      ctx.setLineDash([]);
      if (z >= 0.55) text(f, stationName(sp.s.name), px, py + 22, font(pal, 12, "sans"), ex ? c.muted : c.violet, { align: "center" });
    }
  }
  if (z >= Z.basin) {
    for (const pt of f.s.posts) {
      const [px, py] = toS(st, pt.x, pt.y);
      if (px < -60 || px > W + 60 || py < 34 || py > H) continue;
      const ex = pt.s.exists;
      const col = ex ? c.muted : c.violet;
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.5;
      ctx.setLineDash(ex ? [] : [3, 2]);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px, py - 9);
      ctx.stroke();
      ctx.setLineDash([]);
      text(f, stationName(pt.s.name) + (ex ? "" : " · planned"), px + 5, py - 2, font(pal, 12, "sans"), col);
    }
  }
}

