// LABELS, BY LEVEL (screen space) - one vocabulary per zoom: the street's words inside lots and ships, the town's sign
// with its pills and its night streets, the continent's basin titles in the west margin, every long river named with
// its verdict history and the headwaters bundled. Collision-placed: a label goes only where nothing else sits. Port of
// the winner's map.js drawLabels/drawBasinTitles/drawContinentLabels.

import { FAMILIES } from "../pipelines.ts";
import { BLOCK_KINDS, STATE, type BlockKind, type ItemState } from "../tables.ts";
import { clamp, cut, LH, LW, shortNight, smooth, sum, sx } from "../scene/geo.ts";
import { riverY } from "../scene/geometry.ts";
import type { CanvasMedia } from "../../_port/contract.ts";
import { toS } from "./camera.ts";
import { drawBasinLabels } from "./basinLabels.ts";
import { drawCloud, marginShown, provChips } from "./overlays.ts";
import { drawPortLabels } from "./ports.ts";
import { busyUnder, font, lensOkF, pill, place, rr, stackbar, stageName, text, wrap, type Frame } from "./prims.ts";

type LotWords = { readonly label: string; readonly short?: string | null; readonly media?: CanvasMedia | null; readonly state: ItemState; readonly at: string; readonly block?: BlockKind | null };

export function drawLabels(f: Frame): void {
  const { ctx, pal, z, vis, kBlock, kCard, kCont, W, H, st } = f;
  const { c } = pal;
  ctx.textBaseline = "alphabetic";
  for (const ch of provChips(f)) f.boxes.push([ch.x, ch.y, ch.w, ch.h]);
  f.boxes.push([0, 0, W, 30]);
  drawCloud(f);
  if (kCont > 0 && marginShown(st)) drawBasinTitles(f);

  /* street: words inside lots and ships */
  if (kCard > 0) {
    const fnt = font(pal, 12, "sans");
    const doLot = (it: LotWords, x: number, y: number, w: number, h: number): void => {
      const [px, py] = toS(st, x, y);
      const pw = w * z;
      const ph = h * z;
      if (px > W || py > H || px + pw < 0 || py + ph < 0) return;
      ctx.globalAlpha = kCard * (lensOkF(f, it) ? 1 : 0.2);
      ctx.font = fnt;
      if (it.media !== undefined && it.media !== null) {
        const l = wrap(ctx, it.short || it.label || "", pw - 14, 1, fnt)[0] ?? "";
        ctx.fillStyle = c["ink-bright"];
        ctx.fillText(l, px + 8, py + ph - Math.min(ph * 0.5, 17) / 2 + 4);
      } else {
        const maxL = Math.floor((ph - 6) / 15);
        if (maxL < 1) {
          ctx.globalAlpha = 1;
          return;
        }
        const lines = wrap(ctx, it.label || "", pw - 15, maxL, fnt);
        ctx.fillStyle = STATE[it.state].hollow || it.state === "paused" ? c.muted : c.text;
        const top = py + Math.max(4, (ph - lines.length * 15) / 2) + 11;
        lines.forEach((l, i) => ctx.fillText(l, px + 9, top + i * 15));
      }
      ctx.globalAlpha = 1;
      f.boxes.push([px, py, pw, ph]);
    };
    for (const r of f.s.rivers) for (const t of r.towns) if (vis(t.bx, t.by, t.bx + t.bw, t.by + t.bh)) for (const it of t.items) doLot(it, it.x, it.y, LW, LH);
    for (const p of f.s.ports) for (const s of p.ships) doLot({ label: s.label, state: s.ep.state, at: s.it !== null ? s.it.at : "" }, s.x, s.y, 24, LH);
  }
  /* town: the sign with its pills, the night streets */
  if (kBlock > 0.3) {
    for (const r of f.s.rivers) {
      for (const t of r.towns) {
        if (!vis(t.bx, t.by - 30, t.bx + t.bw, t.by + t.bh)) continue;
        const [px, py] = toS(st, t.bx - 6, t.by - 6);
        const nm = `${r.chan !== null ? r.chan.id : (r.name.split(" · ")[0] ?? r.name)} · ${t.si === 2 && r.chan !== null ? "Outline" : stageName(t.si)} · ${t.n}`;
        ctx.globalAlpha = kBlock;
        const w = text(f, nm, px, py - 7, font(pal, 12, "mono", "600"), c.text, { force: z > 2.4 });
        let bx = px + w + 10;
        if (w > 0) {
          for (const k of BLOCK_KINDS) {
            if (t.blocks[k] === 0) continue;
            const sc = { type: "town", ref: t } as const;
            bx += pill(f, bx, py - 11, k, t.blocks[k], sc, { alpha: kBlock, busy: busyUnder(f, sc, k) }) + 6;
          }
        }
        ctx.globalAlpha = 1;
      }
    }
    if (z >= 2.1) {
      const al = smooth(z, 2.1, 2.6);
      for (const r of f.s.rivers) {
        for (const t of r.towns) {
          if (!vis(t.bx, t.by, t.bx + t.bw, t.by + t.bh)) continue;
          for (const g of t.nights) {
            const [px, py] = toS(st, t.bx, t.by + g.ry + LH / 2);
            ctx.globalAlpha = al;
            ctx.font = font(pal, 12, "mono");
            ctx.fillStyle = c.muted;
            ctx.textBaseline = "middle";
            ctx.fillText(`${shortNight(g.at)} · ${g.items.length}`, px + 2, py);
            ctx.textBaseline = "alphabetic";
            ctx.globalAlpha = 1;
          }
        }
      }
    }
  }
  drawPortLabels(f);
  if (kCont > 0.2) drawContinentLabels(f);
  drawBasinLabels(f);
}

/** Continent: the basin's name, its facts, and what waits in it, in the margin west of the land. */
function drawBasinTitles(f: Frame): void {
  const { ctx, pal, kCont, W, H, st } = f;
  const { c } = pal;
  let prevEnd = 30;
  const size = W < 1100 ? 20 : W < 1500 ? 24 : 30;
  for (const b of f.s.basins) {
    const kinds = BLOCK_KINDS.filter((k) => b.blocks[k] > 0);
    const facts = b.key === "song" ? FAMILIES.song.volume.split(" · ").map((t) => t.trim()) : [`${b.live} live · ${b.failed} failed · ${b.outputs} kept outputs`];
    ctx.font = font(pal, size, "serif");
    let bw = ctx.measureText(b.name).width;
    ctx.font = font(pal, 12, "mono");
    for (const t of facts) bw = Math.max(bw, ctx.measureText(t).width);
    bw = Math.max(bw, 150);
    const bh = size + 8 + facts.length * 17 + kinds.length * 26;
    const [px0, py0] = toS(st, -215, b.y0 + 30);
    const px = Math.max(px0, bw + 16);
    const py = Math.max(Math.min(py0, H - bh - 66), prevEnd + 14);
    prevEnd = py + bh;
    ctx.globalAlpha = kCont;
    ctx.fillStyle = pal.a("ink", 0.86);
    rr(ctx, px - bw - 10, py - 4, bw + 20, bh + 10, 8);
    ctx.fill();
    const hov = f.hover !== null && f.hover.type === "basin" && f.hover.ref === b;
    text(f, b.name, px, py + size - 4, font(pal, size, "serif"), hov ? c.cyan : c["ink-bright"], { h: size, align: "right", force: true });
    f.hot.push({ x: px - bw, y: py, w: bw, h: size + 2, hit: { type: "basin", ref: b } });
    let y = py + size + 14;
    for (const t of facts) {
      text(f, t, px, y, font(pal, 12, "mono"), c.muted, { align: "right", force: true });
      y += 17;
    }
    y += 4;
    for (const k of kinds) {
      const sc = { type: "basin", ref: b } as const;
      pill(f, px, y + 4, k, b.blocks[k], sc, { align: "right", word: true, alpha: kCont, busy: busyUnder(f, sc, k) });
      y += 26;
    }
    ctx.globalAlpha = 1;
    f.boxes.push([px - bw - 10, py - 4, bw + 20, bh + 10]);
  }
}

/** Continent: where the work pools in each province, every long river named with its verdict history, the
 *  headwaters bundled, the dry beds named. */
function drawContinentLabels(f: Frame): void {
  const { ctx, pal, kCont, st } = f;
  const { c } = pal;
  ctx.globalAlpha = kCont;
  for (const b of f.s.basins) {
    for (const p of b.provs) {
      for (const k of BLOCK_KINDS) {
        if (p.blocks[k] === 0) continue;
        let sxw = 0;
        let syw = 0;
        let n = 0;
        for (const r of p.rivers) {
          for (const t of r.towns) {
            if (t.blocks[k] > 0) {
              sxw += t.x * t.blocks[k];
              syw += r.cy * t.blocks[k];
              n += t.blocks[k];
            }
          }
        }
        const [px, py] = toS(st, sxw / n, syw / n);
        const sc = { type: "prov", ref: p } as const;
        pill(f, px + 14, clamp(py, toS(st, 0, p.y0)[1] + 10, toS(st, 0, p.y1)[1] - 10), k, p.blocks[k], sc, { alpha: kCont, busy: busyUnder(f, sc, k) });
      }
    }
  }
  const sorted = f.s.rivers.slice().sort((x, y) => (y.blocks.n > 0 ? 1 : 0) - (x.blocks.n > 0 ? 1 : 0) || y.reach - x.reach || y.live - x.live);
  for (const r of sorted) {
    if (r.synthetic || r.chan !== null) continue;
    if (r.reach < 2 && !r.dry) continue;
    const ex = r.reach < 0 ? sx(Math.max(0, r.extent)) : r.endX;
    const [px, py] = toS(st, ex, riverY(r, ex));
    const nm = r.dry ? `dry · ${cut(r.genres.join(", "), 40)}` : r.name + (r.paused ? " ‖" : "");
    const rk = r.rank > 0 ? 14 : 0;
    const w = text(f, nm, px + 9 + rk, py + 4, font(pal, 12, "sans", r.rank > 0 ? "600" : ""), r.dry ? c.rose : r.rank > 0 ? c["ink-bright"] : r.reach >= 4 ? c.text : c.muted, { pad: 46 });
    if (w === 0) continue;
    if (r.rank > 0) {
      ctx.fillStyle = c.emerald;
      ctx.beginPath();
      ctx.moveTo(px + 9, py + 4);
      ctx.lineTo(px + 14, py - 5);
      ctx.lineTo(px + 19, py + 4);
      ctx.closePath();
      ctx.fill();
    }
    if (!r.dry) stackbar(f, px + 15 + rk + w, py - 4, 34, [[r.kept, c.emerald], [r.open + r.pending, c.amber], [r.failed + r.rejected, c.rose, 0.85]]);
  }
  for (const b of f.s.basins) {
    for (const p of b.provs) {
      const bd = p.bundle;
      if (bd === null) continue;
      const [bx, y0] = toS(st, bd.x, bd.y0 + 8);
      const [, y1] = toS(st, bd.x, bd.y1 - 8);
      const x = bx + 26;
      const my = (y0 + y1) / 2;
      if (y1 - y0 < 18) continue;
      ctx.strokeStyle = pal.a("muted", 0.8);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x - 6, y0);
      ctx.lineTo(x, y0 + 5);
      ctx.lineTo(x, y1 - 5);
      ctx.lineTo(x - 6, y1);
      ctx.moveTo(x, my);
      ctx.lineTo(x + 7, my);
      ctx.stroke();
      const und = sum(bd.rivers, (r) => r.open);
      const hov = f.hover !== null && f.hover.type === "bundle" && f.hover.ref === bd;
      ctx.font = font(pal, 12, "sans");
      const lbl = `${bd.rivers.length} genres · seeds only`;
      const lw = ctx.measureText(lbl).width;
      if (!place(f, x + 8, my - 17, lw + 12, 36)) continue;
      ctx.fillStyle = pal.a("ink-2", 0.9);
      rr(ctx, x + 8, my - 17, lw + 12, 36, 5);
      ctx.fill();
      const w = text(f, lbl, x + 12, my - 2, font(pal, 12, "sans"), hov ? c.cyan : c.text, { force: true });
      if (w > 0) {
        text(f, `${und} undecided`, x + 12, my + 13, font(pal, 12, "mono"), c.amber, { force: true });
        f.hot.push({ x: x + 8, y: my - 16, w: w + 10, h: 34, hit: { type: "bundle", ref: bd } });
      }
    }
  }
  ctx.globalAlpha = 1;
}
