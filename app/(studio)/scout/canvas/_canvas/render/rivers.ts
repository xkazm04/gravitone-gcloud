// THE GROUND AND THE WATER (world space) - the sea's release lane and the projected audience beyond it, the land with
// its contours and stage isolines, the basin borders and the alternate provinces; then every river: its canal to a
// port, its dry stretch, the body of live water (emerald for the five worth following), the particles of recent work;
// then what grew from what, the selected lot's lineage in cyan. Port of the winner's map.js drawGround/drawRivers/
// drawEdges.

import { CAL_DAYS, CAL_X0, COAST_X, coastX, DAY_W, FAN_X0, LH, LW, sx } from "../scene/geo.ts";
import { riverY } from "../scene/geometry.ts";
import type { Hit, Item, River } from "../scene/types.ts";
import { lensOkF, TAU, type Frame } from "./prims.ts";
import { landPaths, riverPaths, rs } from "./state.ts";

export function drawGround(f: Frame): void {
  const { ctx, pal, z } = f;
  const { a, c } = pal;
  const W = f.s.world;
  ctx.fillStyle = a("violet", 0.035);
  ctx.fillRect(COAST_X + CAL_X0 - 30, W.y0, CAL_DAYS * DAY_W + 50, W.y1 - W.y0);
  ctx.fillStyle = a("illustrative-text", 0.02);
  ctx.fillRect(COAST_X + FAN_X0 - 20, W.y0, W.x1 - COAST_X - FAN_X0 + 20, W.y1 - W.y0);
  const L = landPaths(f.s.land);
  ctx.fillStyle = c["ink-2"];
  ctx.fill(L.land);
  ctx.strokeStyle = a("ink-bright", 0.22);
  ctx.lineWidth = 1.4 / z;
  ctx.stroke(L.land);
  ctx.strokeStyle = a("ink-bright", 0.05);
  ctx.lineWidth = 1 / z;
  ctx.stroke(L.contours);
  ctx.setLineDash([2 / z, 6 / z]);
  ctx.strokeStyle = a("ink-bright", 0.09);
  ctx.stroke(L.isolines);
  ctx.setLineDash([]);
  f.s.basins.forEach((b, i) => {
    if (i > 0) {
      ctx.setLineDash([10 / z, 6 / z]);
      ctx.strokeStyle = a("ink-bright", 0.18);
      ctx.lineWidth = 1.5 / z;
      ctx.beginPath();
      const y = b.y0 - 40;
      ctx.moveTo(-160, y);
      for (let x = -160; x < COAST_X - 30; x += 40) ctx.lineTo(x, y + 6 * Math.sin(x / 120 + i));
      ctx.stroke();
      ctx.setLineDash([]);
    }
    b.provs.forEach((p, j) => {
      if (j % 2 === 1) {
        ctx.fillStyle = a("ink-bright", 0.018);
        ctx.fillRect(-150, p.y0, coastX(p.y0) + 90, p.y1 - p.y0);
      }
    });
  });
}

/** The river a selection belongs to. */
export function riverOfHit(h: Hit | null): River | null {
  if (h === null) return null;
  switch (h.type) {
    case "river":
      return h.ref;
    case "item":
    case "town":
    case "port":
      return h.ref.river;
    case "ship":
      return h.ref.it?.river ?? h.ref.chan.port?.river ?? null;
    default:
      return null;
  }
}

export function drawRivers(f: Frame): void {
  const { ctx, pal, z, vis } = f;
  const { a, c } = pal;
  const lens = f.st.ui.lens;
  const selR = riverOfHit(f.st.ui.sel);
  const hovR = f.hover !== null && f.hover.type === "river" ? f.hover.ref : null;
  const { x0: vx0, y0: vy0, x1: vx1, y1: vy1 } = f.view;
  for (const r of f.s.rivers) {
    if (!vis(r.src - 20, r.y0, f.s.world.x1, r.y0 + r.h)) continue;
    const P = riverPaths(r);
    const hi = r === selR || r === hovR;
    const dim = (lens !== null && !r.items.some((it) => lensOkF(f, it))) || r.paused;
    if (P.canal !== null) {
      ctx.setLineDash([3 / z, 5 / z]);
      ctx.strokeStyle = a(r.chan !== null && r.chan.episodes.length > 0 ? "emerald" : "violet", 0.55);
      ctx.lineWidth = 1.6 / z;
      ctx.stroke(P.canal);
      ctx.setLineDash([]);
    }
    if (P.dry !== null) {
      ctx.setLineDash([6 / z, 5 / z]);
      ctx.strokeStyle = a("rose", dim ? 0.2 : 0.62);
      ctx.lineWidth = 1.5 / z;
      ctx.stroke(P.dry);
      ctx.setLineDash([]);
    }
    if (r.reach < 0 && !r.synthetic) {
      if (r.towns.length === 0) continue;
      ctx.setLineDash([6 / z, 5 / z]);
      ctx.strokeStyle = r.paused ? a("faint", 0.7) : a("rose", dim ? 0.2 : 0.62);
      ctx.lineWidth = 1.5 / z;
      ctx.beginPath();
      ctx.moveTo(r.src, riverY(r, r.src));
      for (let x = r.src; x <= sx(Math.max(0, r.extent)); x += 12) ctx.lineTo(x, riverY(r, x));
      ctx.stroke();
      ctx.setLineDash([]);
      continue;
    }
    /* a river worth following (top verdict history) runs emerald */
    const tone = r.rank > 0 ? "emerald" : "muted";
    ctx.fillStyle = hi ? a("cyan", 0.34) : dim ? a("muted", 0.1) : a(tone, r.synthetic ? 0.2 : r.rank > 0 ? 0.26 : 0.3);
    ctx.fill(P.body);
    if (r.paused) ctx.setLineDash([8 / z, 6 / z]);
    ctx.strokeStyle = hi ? c.cyan : dim ? a("muted", 0.3) : r.rank > 0 ? a("emerald", 0.8) : a("text", 0.62);
    ctx.lineWidth = (hi ? 2 : 1.2) / z;
    ctx.stroke(P.line);
    ctx.setLineDash([]);
  }
  if (lens === null || lens === "night" || lens === "pending") {
    ctx.fillStyle = c.cyan;
    for (const p of rs(f.st).particles) {
      const pts = p.r.pts;
      const q = pts[Math.floor(p.u * (pts.length - 1))];
      if (q === undefined || p.r.paused) continue;
      if (q.x < vx0 || q.x > vx1 || q.y < vy0 || q.y > vy1) continue;
      ctx.beginPath();
      ctx.arc(q.x, q.y, Math.max(1.6 / z, Math.min(q.w * 0.28, 3.2 / z)), 0, TAU);
      ctx.fill();
    }
  }
}

/** What grew from what: every edge between lots in view; the selected lot's lineage in cyan. */
export function drawEdges(f: Frame): void {
  const { ctx, pal, z, vis, kBlock } = f;
  const s = f.s;
  const selH = f.st.ui.sel;
  const sel: Item | null = selH !== null && selH.type === "item" ? selH.ref : null;
  const line = new Set<string>();
  if (sel !== null) {
    const up = (i: string): void => {
      for (const u of s.up.get(i) ?? []) {
        const k = `${u}>${i}`;
        if (!line.has(k)) {
          line.add(k);
          up(u);
        }
      }
    };
    up(sel.id);
    for (const d of s.down.get(sel.id) ?? []) line.add(`${sel.id}>${d}`);
  }
  const curve = (A: Item, B: Item): void => {
    const x1 = A.x + LW;
    const y1 = A.y + LH / 2;
    const x2 = B.x;
    const y2 = B.y + LH / 2;
    const k = Math.max(40, (x2 - x1) * 0.4);
    ctx.moveTo(x1, y1);
    ctx.bezierCurveTo(x1 + k, y1, x2 - k, y2, x2, y2);
  };
  ctx.beginPath();
  for (const [A, B] of s.edges) if (vis(Math.min(A.x, B.x), Math.min(A.y, B.y), Math.max(A.x, B.x) + LW, Math.max(A.y, B.y) + LH)) curve(A, B);
  ctx.strokeStyle = pal.a("text", 0.16 * kBlock);
  ctx.lineWidth = 1 / z;
  ctx.stroke();
  if (sel !== null) {
    ctx.beginPath();
    for (const [A, B] of s.edges) if (line.has(`${A.id}>${B.id}`)) curve(A, B);
    ctx.strokeStyle = pal.a("cyan", 0.85);
    ctx.lineWidth = 1.8 / z;
    ctx.stroke();
  }
}
