// PORTS - the pier, the moored episodes, the release lane with its slots, the projected audience fan (hatched), and a
// cut leaving for its slot: down the river, out of the port, onto its day. World space, then the port's words in
// screen space. Port of the winner's map.js drawPort/drawFlyers/drawPortLabels.

import { CAL_DAYS, clamp, cut, FAN_X0, fmt, LH, LW } from "../scene/geo.ts";
import type { Port } from "../scene/types.ts";
import { STATE } from "../tables.ts";
import { calX, toS } from "./camera.ts";
import { dayLabel, fanR, font, isRef, lensOkF, projOf, stateC, TAU, text, Z, type Frame } from "./prims.ts";

export function drawPort(f: Frame, p: Port): void {
  const { ctx, pal, z, kCard, vis, st } = f;
  const { a, c } = pal;
  const { x, y } = p;
  const ch = p.chan;
  if (!vis(x - 60, y - 320, f.s.world.x1, y + 320)) return;
  const pr = projOf(st, p);
  if (pr.views > 0) {
    const R = fanR(pr.views);
    const fx = x + FAN_X0;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(fx, y);
    ctx.arc(fx, y, R, -0.26, 0.26);
    ctx.closePath();
    ctx.fillStyle = a("illustrative-text", 0.06);
    ctx.fill();
    ctx.clip();
    ctx.strokeStyle = a("illustrative-text", 0.16);
    ctx.lineWidth = 1 / z;
    ctx.beginPath();
    for (let k = -R; k < R * 2; k += 9 / clamp(z, 0.4, 1)) {
      ctx.moveTo(fx + k, y - R);
      ctx.lineTo(fx + k + R, y + R);
    }
    ctx.stroke();
    ctx.restore();
    ctx.setLineDash([4 / z, 4 / z]);
    ctx.strokeStyle = a("illustrative-text", 0.7);
    ctx.lineWidth = 1.2 / z;
    ctx.beginPath();
    ctx.moveTo(fx, y);
    ctx.arc(fx, y, R, -0.26, 0.26);
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.fillStyle = c["ink-4"];
  ctx.fillRect(x - 8, y - 2.5, 50, 5);
  ctx.strokeStyle = a("ink-bright", 0.3);
  ctx.lineWidth = 1 / z;
  ctx.strokeRect(x - 8, y - 2.5, 50, 5);
  if (ch === null) return;
  /* the release lane: one tick a day, a longer one each week */
  const x0 = calX(p, 0);
  const x1 = calX(p, CAL_DAYS);
  ctx.strokeStyle = a("violet", 0.5);
  ctx.lineWidth = 1.3 / z;
  ctx.beginPath();
  ctx.moveTo(x0 - 30, y);
  ctx.lineTo(x1, y);
  ctx.stroke();
  if (z >= 0.4) {
    ctx.beginPath();
    for (let d = 1; d <= CAL_DAYS; d++) {
      const tx = calX(p, d);
      const th = d % 7 === 0 ? 5 : 2.2;
      ctx.moveTo(tx, y - th);
      ctx.lineTo(tx, y + th);
    }
    ctx.strokeStyle = a("violet", 0.55);
    ctx.lineWidth = 1 / z;
    ctx.stroke();
  }
  for (const s of st.ui.slots) {
    if (s.channel !== ch.id || st.ui.flyers.some((fl) => fl.slot === s)) continue;
    const sxp = calX(p, s.day);
    const w = 12;
    const h = 8;
    ctx.fillStyle = s.state === "published" ? c.emerald : c.violet;
    ctx.beginPath();
    ctx.moveTo(sxp - w / 2, y - h - 3);
    ctx.lineTo(sxp + w / 2 - 3, y - h - 3);
    ctx.lineTo(sxp + w / 2, y - h / 2 - 3);
    ctx.lineTo(sxp + w / 2 - 3, y - 3);
    ctx.lineTo(sxp - w / 2, y - 3);
    ctx.closePath();
    ctx.fill();
    if (isRef(f.hover, s)) {
      ctx.strokeStyle = c["ink-bright"];
      ctx.lineWidth = 1.5 / z;
      ctx.stroke();
    }
  }
  if (st.ui.goal.targets.some((t) => t.channel === ch.id)) {
    ctx.setLineDash([4 / z, 3 / z]);
    ctx.strokeStyle = c.violet;
    ctx.lineWidth = 1.6 / z;
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (z < 0.3) return;
  const sel = st.ui.sel;
  for (const s of p.ships) {
    const state = s.ep.state;
    const col = stateC(pal, state);
    const hollow = STATE[state].hollow;
    const dim = st.ui.lens !== null && !lensOkF(f, s.it ?? { state, at: "" });
    const ga = ctx.globalAlpha;
    if (dim) ctx.globalAlpha = 0.15;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x + 24, s.y);
    ctx.lineTo(s.x + 28, s.y + LH / 2);
    ctx.lineTo(s.x + 24, s.y + LH);
    ctx.lineTo(s.x, s.y + LH);
    ctx.closePath();
    if (kCard > 0.5) {
      ctx.fillStyle = c["ink-3"];
      ctx.fill();
      ctx.fillStyle = col;
      ctx.fillRect(s.x, s.y, 3.2 / z, LH);
      if (hollow) {
        ctx.strokeStyle = col;
        ctx.lineWidth = 1 / z;
        ctx.stroke();
      }
    } else if (hollow) {
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.3 / z;
      ctx.stroke();
    } else {
      ctx.fillStyle = col;
      ctx.globalAlpha *= 0.85;
      ctx.fill();
    }
    const selc = sel !== null && sel.type === "ship" && sel.ref === s;
    const hov = isRef(f.hover, s);
    if (selc || hov) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = selc ? c.cyan : c.text;
      ctx.lineWidth = 1.8 / z;
      ctx.stroke();
    }
    ctx.globalAlpha = ga;
  }
}

/** A cut leaving for its slot: down the river, out of the port, onto its day. */
export function drawFlyers(f: Frame): void {
  const { ctx, pal, z, now } = f;
  for (const fl of f.st.ui.flyers) {
    const t = clamp((now - fl.t0) / fl.dur, 0, 1);
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const x0 = fl.it.x + LW / 2;
    const y0 = fl.it.y + LH / 2;
    const x1 = calX(fl.port, fl.slot.day);
    const y1 = fl.port.y - 7;
    const x = x0 + (x1 - x0) * e;
    const k = clamp((x - x0) / 200, 0, 1);
    const ry = x < fl.port.x ? fl.port.river.cy : y1;
    const y = y0 + (ry - y0) * k;
    ctx.fillStyle = pal.a("violet", 0.25);
    ctx.beginPath();
    ctx.arc(x, y, 11 / z, 0, TAU);
    ctx.fill();
    ctx.fillStyle = pal.c.violet;
    ctx.beginPath();
    ctx.arc(x, y, 5 / z, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = pal.a("violet", 0.5);
    ctx.lineWidth = 2 / z;
    ctx.beginPath();
    ctx.moveTo(x - 60 * (1 - t), y);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
}

export function drawPortLabels(f: Frame): void {
  const { ctx, pal, z, kCard, W, H, st } = f;
  const { c } = pal;
  const today = st.view.today;
  const sel = st.ui.sel;
  for (const p of f.s.ports) {
    const [px, py] = toS(st, p.x, p.y);
    if (px < -900 || px > W + 300 || py < -60 || py > H + 60) continue;
    const ch = p.chan;
    const eps = ch !== null ? ch.episodes : [];
    const col = p.song ? c.muted : eps.length === 0 ? c.violet : eps.some((e) => e.state === "made") ? c.amber : c.emerald;
    ctx.fillStyle = c.ink;
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(px, py, 2.4, 0, TAU);
    ctx.fill();
    const hov = f.hover !== null && f.hover.type === "port" && f.hover.ref === p;
    const selc = sel !== null && sel.type === "port" && sel.ref === p;
    if (hov || selc) {
      ctx.strokeStyle = selc ? c.cyan : c.text;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px, py, 10, 0, TAU);
      ctx.stroke();
    }
    const lx = px - 12;
    const slots = ch !== null ? st.ui.slots.filter((s) => s.channel === ch.id) : [];
    if (p.song || ch === null) {
      if (z >= Z.basin * 0.7) text(f, "Publish tick · YouTube", lx, py - 12, font(pal, 12, "mono"), c.muted, { align: "right" });
    } else if (z < Z.basin) text(f, ch.id, lx, py + 4, font(pal, 12, "mono", "600"), c.text, { align: "right" });
    else {
      text(f, `${ch.id}  ${ch.name}`, lx, py - 10, font(pal, 13, "sans", "600"), c["ink-bright"], { align: "right" });
      const n = (k: string): number => eps.filter((e) => e.state === k).length;
      text(f, eps.length > 0 ? `${n("kept")} kept · ${n("made")} made · ${n("outline-kept")} outlined` : "no episodes yet", lx, py + 18, font(pal, 12, "mono"), eps.length > 0 ? c.muted : c.violet, { align: "right" });
    }
    /* the lane: how many are slotted; each slot's day close in */
    if (ch !== null && slots.length > 0) {
      if (z < 1.2) {
        const [ex] = toS(st, calX(p, CAL_DAYS), p.y);
        text(f, `${slots.length} slotted`, ex - 4, py - 9, font(pal, 12, "mono", "600"), c.violet, { align: "right" });
      } else {
        for (const s of slots) {
          const [sxp, syp] = toS(st, calX(p, s.day), p.y - 12);
          const pub = s.state === "published";
          text(f, pub ? "published" : dayLabel(today, s.day), sxp, syp - 4, font(pal, 12, "mono", "600"), pub ? c.emerald : c.violet, { align: "center" });
          if (kCard > 0.3) text(f, cut(s.title, 26), sxp, syp - 19, font(pal, 12, "sans"), c.text, { align: "center" });
        }
      }
    }
    if (ch !== null && z >= 1.2) {
      for (let d = 7; d <= CAL_DAYS; d += 7) {
        const [tx, ty] = toS(st, calX(p, d), p.y + 6);
        text(f, dayLabel(today, d), tx, ty + 14, font(pal, 12, "mono"), c.muted, { align: "center" });
      }
    }
    const pr = projOf(st, p);
    if (pr.views > 0 && z >= 0.28) {
      const [fx, fy] = toS(st, p.x + FAN_X0 + fanR(pr.views) * 0.55, p.y);
      text(f, `proj. ≈ ${fmt(pr.views)} views`, fx, fy - 2, font(pal, 12, "mono", "600"), c["illustrative-text"], { align: "center" });
      if (z >= Z.basin) text(f, `≈ $${pr.rev.toFixed(2)} · illustrative`, fx, fy + 14, font(pal, 12, "mono"), c["illustrative-text"], { align: "center" });
    }
  }
}
