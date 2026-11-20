// WHAT FLOATS OVER THE MAP (screen space) - the next night's cloud over the highlands with its goal and notes, the
// note flags pinned where they were written, the selection's pin and the pulse that answers W, the stage ruler along
// the top, and the sticky basin › province chips at the west edge with how much waits inside. Port of the winner's
// map.js drawCloud/drawNotes/drawPins/drawRulers/provChips.

import { STANCES } from "../tables.ts";
import { clamp, COAST_X, CAL_DAYS, CAL_X0, cut, DAY_W, FAN_X0, LW, sum, sx } from "../scene/geo.ts";
import { riverY } from "../scene/geometry.ts";
import { anchorPoint } from "../scene/scopes.ts";
import type { Province } from "../scene/types.ts";
import type { CanvasStore } from "../store.ts";
import type { Tone } from "../tables.ts";
import { fitZ, toS, vw } from "./camera.ts";
import { font, rr, TAU, text, Z, type Frame } from "./prims.ts";

/** The stage ruler: world x, its word, its tone (muted when none), its priority when labels collide (higher yields). */
const RULER: readonly (readonly [number, string, Tone | null, number])[] = [
  [sx(0), "Seed", null, 0], [sx(1), "Derived", null, 0], [sx(2), "Idea", null, 0], [sx(3), "Storyboard", null, 0], [sx(4), "Run", null, 0], [sx(5), "Output", null, 0], [sx(5.75), "Deliver", null, 1],
  [COAST_X, "Publish", null, 0], [COAST_X + CAL_X0 + (CAL_DAYS * DAY_W) / 2, "Calendar", "violet", 0], [COAST_X + FAN_X0 + 260, "Views · planned", "illustrative-text", 0],
];

/** The west margin holds the basin titles while it is on screen; the sticky chips take over when it is not. */
export const marginShown = (st: CanvasStore): boolean => toS(st, -215, 0)[0] >= 200 || st.ui.cam.z <= fitZ(st) * 1.12;

export type ProvChip = { readonly p: Province; readonly label: string; readonly n: string; readonly nw: number; readonly x: number; readonly y: number; readonly w: number; readonly h: number };
/** Sticky basin › province chips at the west edge, with how much waits inside. */
export function provChips(f: Frame): ProvChip[] {
  const out: ProvChip[] = [];
  if (f.z < Z.basin * 0.8 && marginShown(f.st)) return out;
  const { ctx } = f;
  ctx.font = font(f.pal, 12, "mono", "600");
  for (const b of f.s.basins) {
    for (const p of b.provs) {
      const [, y0] = toS(f.st, 0, p.y0);
      const [, y1] = toS(f.st, 0, p.y1);
      if (y1 < 40 || y0 > f.H) continue;
      const y = clamp(y0 + 4, 32, y1 - 22);
      const label = `${b.name.toUpperCase()} › ${p.name.toUpperCase()}`;
      const n = p.blocks.n > 0 ? `● ${p.blocks.n}` : "";
      const nw = n !== "" ? ctx.measureText(n).width : 0;
      const prev = out[out.length - 1];
      if (prev !== undefined && y < prev.y + 23) continue;
      out.push({ p, label, n, nw, x: 8, y, w: ctx.measureText(label).width + 16 + (n !== "" ? nw + 10 : 0), h: 20 });
    }
  }
  return out;
}

/** The next night, over the highlands: its goal, its notes. */
export function drawCloud(f: Frame): void {
  const { ctx, pal, st } = f;
  const { c } = pal;
  const video = f.s.basins.find((b) => b.key === "video");
  if (video === undefined) return;
  const [cx, cy] = toS(st, sx(1.45), video.y0 + 40);
  const hov = f.hover !== null && f.hover.type === "night";
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = pal.a("violet", 0.16);
  ctx.strokeStyle = c.violet;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(-10, 2, 9, Math.PI * 0.5, Math.PI * 1.5);
  ctx.arc(0, -5, 11, Math.PI, Math.PI * 1.9);
  ctx.arc(13, 1, 8, Math.PI * 1.5, Math.PI * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  const goal = st.ui.goal;
  const tg = sum(goal.targets, (t) => t.n);
  const w1 = text(f, "Next night", cx + 26, cy - 2, font(pal, 13, "sans", "600"), hov ? c["ink-bright"] : c.violet, { force: true });
  const g = tg > 0 || goal.text !== "" ? `goal${tg > 0 ? ` ×${tg}` : ""}` : "no goal";
  const w2 = text(f, `${g} · ${st.ui.notes.length} notes`, cx + 26, cy + 14, font(pal, 12, "mono"), c.muted, { force: true });
  f.boxes.push([cx - 24, cy - 18, 56 + Math.max(w1, w2), 38]);
  f.hot.push({ x: cx - 24, y: cy - 18, w: 56 + Math.max(w1, w2), h: 38, hit: { type: "night" } });
}

/** Note flag: pinned where it was written; its words appear from Basin level in. */
export function drawNotes(f: Frame): void {
  const { ctx, pal, z, W, H, st } = f;
  const { c } = pal;
  for (const n of st.ui.notes) {
    const pt = anchorPoint(f.s, n);
    if (pt === null) continue;
    const [px, py] = toS(st, pt[0], pt[1]);
    if (px < -20 || px > W + 20 || py < 30 || py > H + 20) continue;
    const hov = f.hover !== null && f.hover.type === "note" && f.hover.ref === n.id;
    ctx.strokeStyle = c.ink;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px, py - 19);
    ctx.stroke();
    ctx.strokeStyle = c.violet;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px, py - 19);
    ctx.stroke();
    ctx.fillStyle = hov ? c["ink-bright"] : c.violet;
    ctx.beginPath();
    ctx.moveTo(px, py - 19);
    ctx.lineTo(px + 12, py - 14.5);
    ctx.lineTo(px, py - 10);
    ctx.fill();
    const sn = STANCES.find((s) => s.key === n.stance);
    const words = (sn !== undefined ? sn.name + (n.text !== "" ? " · " : "") : "") + n.text;
    if (z >= Z.basin || hov) text(f, cut(words, 38), px + 16, py - 10, font(pal, 12, "sans"), c.violet, { force: hov });
    f.hot.push({ x: px - 5, y: py - 22, w: 20, h: 24, hit: { type: "note", ref: n.id } });
  }
}

/** The selection's pin, and the pulse that answers W: here is the next thing waiting. */
export function drawPins(f: Frame): void {
  const { ctx, pal, z, now, st } = f;
  const { c } = pal;
  const s = st.ui.sel;
  let pt: readonly [number, number] | null = null;
  if (s !== null) {
    if (s.type === "item") pt = [s.ref.x + LW / 2, s.ref.y];
    else if (s.type === "town") pt = [s.ref.x, s.ref.y - (z > 1.5 ? s.ref.bh / 2 + 6 : 0)];
    else if (s.type === "port") pt = [s.ref.x, s.ref.y];
    else if (s.type === "ship") pt = [s.ref.x + 12, s.ref.y];
    else if (s.type === "river") pt = [s.ref.src, riverY(s.ref, s.ref.src)];
  }
  if (pt !== null) {
    const [px, py] = toS(st, pt[0], pt[1]);
    ctx.fillStyle = c.cyan;
    ctx.strokeStyle = c.ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, py - 1);
    ctx.bezierCurveTo(px - 8, py - 12, px - 8, py - 22, px, py - 22);
    ctx.bezierCurveTo(px + 8, py - 22, px + 8, py - 12, px, py - 1);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = c.ink;
    ctx.beginPath();
    ctx.arc(px, py - 15, 2.6, 0, TAU);
    ctx.fill();
  }
  const pulse = st.ui.pulse;
  if (pulse !== null) {
    const t = (now - pulse.t0) / 1100;
    if (t >= 1) st.ui.pulse = null;
    // The pulse starts after the flight lands (t0 is in the future until then): nothing to draw yet. The winner drew
    // it anyway, with a negative radius, and the canvas threw every frame of the flight.
    else if (t >= 0) {
      const [px, py] = toS(st, pulse.x, pulse.y);
      ctx.strokeStyle = pal.a("amber", 1 - t);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(px, py, 14 + t * 46, 0, TAU);
      ctx.stroke();
    }
  }
}

export function drawRulers(f: Frame): void {
  const { ctx, pal, W, st } = f;
  const { c } = pal;
  const w = vw(st);
  ctx.fillStyle = pal.a("ink", 0.9);
  ctx.fillRect(0, 0, W, 26);
  ctx.fillStyle = c["hair-2"];
  ctx.fillRect(0, 26, W, 1);
  ctx.font = font(pal, 12, "mono", "600");
  ctx.textBaseline = "middle";
  const occ: [number, number][] = [];
  for (const [wx, n, kind] of RULER.slice().sort((p, q) => p[3] - q[3])) {
    const [px] = toS(st, wx, 0);
    if (px < -80 || px > w + 80) continue;
    const label = n.toUpperCase();
    const col = kind !== null ? c[kind] : c.muted;
    ctx.fillStyle = col;
    const tw = ctx.measureText(label).width;
    const lx = clamp(px - tw / 2, 6, w - tw - 6);
    if (occ.some(([p, q]) => lx < q + 10 && lx + tw > p - 10)) continue;
    occ.push([lx, lx + tw]);
    ctx.fillText(label, lx, 13);
    ctx.fillStyle = kind !== null ? col : pal.a("ink-bright", 0.3);
    ctx.fillRect(px - 0.5, 22, 1, 4);
  }
  ctx.textBaseline = "alphabetic";
  for (const ch of provChips(f)) {
    const hov = f.hover !== null && f.hover.type === "prov" && f.hover.ref === ch.p;
    ctx.fillStyle = pal.a("ink", 0.92);
    rr(ctx, ch.x, ch.y, ch.w, ch.h, 5);
    ctx.fill();
    ctx.strokeStyle = hov ? c.cyan : c["hair-2"];
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.font = font(pal, 12, "mono", "600");
    ctx.fillStyle = ch.p.key === "chan" ? c.emerald : c.text;
    ctx.fillText(ch.label, ch.x + 8, ch.y + 14);
    if (ch.n !== "") {
      ctx.fillStyle = c.amber;
      ctx.fillText(ch.n, ch.x + ch.w - ch.nw - 8, ch.y + 14);
    }
    f.hot.push({ x: ch.x, y: ch.y, w: ch.w, h: ch.h, hit: { type: "prov", ref: ch.p } });
  }
}
