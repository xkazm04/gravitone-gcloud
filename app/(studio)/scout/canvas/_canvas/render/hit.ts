// HIT TESTING - what is under a screen point (port of the winner's map.js hit). The frame's own hit boxes first, top
// drawn first (pills, titles, chips, the cloud, note flags); then the ruler band answers nothing; then ports, slots
// and ships, the song stations and the milestone posts, lots and towns (as blocks close in, as rings far out), the
// rivers and their name boxes, and last the basin or province the point lies in, as a SOFT hit (it opens a sheet far
// out but is never a hover).

import { coastX, clamp, LH, LW, sx } from "../scene/geo.ts";
import { riverY } from "../scene/geometry.ts";
import type { Hit } from "../scene/types.ts";
import type { CanvasStore } from "../store.ts";
import { calX, toS, toW } from "./camera.ts";
import { ringR, Z } from "./prims.ts";
import { rs, type Hot, type MapHit } from "./state.ts";

export type Pick = { readonly hit: MapHit; readonly soft: boolean };

const P = (hit: MapHit): Pick => ({ hit, soft: false });

export function pickAt(st: CanvasStore, hot: readonly Hot[], sxp: number, syp: number): Pick | null {
  const s = st.scene;
  const z = st.ui.cam.z;
  const [wx, wy] = toW(st, sxp, syp);
  for (let i = hot.length - 1; i >= 0; i--) {
    const h = hot[i];
    if (h !== undefined && sxp >= h.x && sxp <= h.x + h.w && syp >= h.y && syp <= h.y + h.h) return P(h.hit);
  }
  if (syp < 27) return null;
  for (const p of s.ports) {
    const [px, py] = toS(st, p.x, p.y);
    if (Math.hypot(sxp - px, syp - py) < 11) return P({ type: "port", ref: p });
    if (p.chan === null) continue;
    for (const sl of st.ui.slots) {
      if (sl.channel !== p.chan.id) continue;
      const [qx, qy] = toS(st, calX(p, sl.day), p.y - 7);
      if (Math.abs(sxp - qx) < Math.max(7, 7 * z) && Math.abs(syp - qy) < Math.max(7, 6 * z)) return P({ type: "slot", ref: sl });
    }
    if (z >= 0.3) for (const sh of p.ships) if (wx >= sh.x && wx <= sh.x + 28 && wy >= sh.y && wy <= sh.y + LH) return P({ type: "ship", ref: sh });
  }
  if (z >= 0.45) {
    for (const sp of s.rivers.flatMap((r) => r.stationPts)) {
      const [px, py] = toS(st, sp.x, sp.y);
      if (Math.abs(sxp - px) < 9 && Math.abs(syp - py) < 9) return P({ type: "station", ref: sp });
    }
  }
  if (z >= Z.basin) {
    for (const pt of s.posts) {
      const [px, py] = toS(st, pt.x, pt.y);
      if (sxp > px - 4 && sxp < px + 120 && syp > py - 16 && syp < py + 3) return P({ type: "station", ref: pt });
    }
  }
  if (z >= 1.25) {
    for (const r of s.rivers) {
      if (wy < r.y0 || wy > r.y0 + r.h) continue;
      for (const t of r.towns) {
        if (wx < t.bx - 6 || wx > t.bx + t.bw + 6 || wy < t.by - 6 || wy > t.by + t.bh + 6) continue;
        for (const it of t.items) if (wx >= it.x && wx <= it.x + LW && wy >= it.y && wy <= it.y + LH) return P({ type: "item", ref: it });
        return P({ type: "town", ref: t });
      }
    }
  } else {
    for (const r of s.rivers) {
      if (wy < r.y0 - 10 || wy > r.y0 + r.h + 10) continue;
      for (const t of r.towns) {
        const [px, py] = toS(st, t.x, r.cy);
        if (Math.hypot(sxp - px, syp - py) <= Math.max(4, ringR(t, z)) + 3) return P({ type: "town", ref: t });
      }
    }
  }
  const lbl = rs(st).riverLbl;
  for (const r of s.rivers) {
    if (wy < r.y0 || wy > r.y0 + r.h) continue;
    if (wx > r.src - 20 / z && wx < Math.max(r.endX, sx(Math.max(0, r.extent))) + 20) {
      const ry = riverY(r, clamp(wx, r.src, Math.max(r.src, r.endX)));
      if (Math.abs(wy - ry) < Math.max(12 / z, 8) || (wx < r.src + 160 / z && Math.abs(syp - toS(st, 0, ry)[1]) < 16)) return P({ type: "river", ref: r });
    }
    const b = lbl.get(r);
    if (b !== undefined && sxp >= b[0] && sxp <= b[0] + b[2] && syp >= b[1] && syp <= b[1] + b[3]) return P({ type: "river", ref: r });
  }
  for (const b of s.basins) {
    if (wy >= b.y0 - 30 && wy <= b.y1 && wx > -170 && wx < coastX(wy)) {
      const p = b.provs.find((x) => wy >= x.y0 && wy <= x.y1);
      return { hit: p !== undefined ? { type: "prov", ref: p } : { type: "basin", ref: b }, soft: true };
    }
  }
  return null;
}

/** A canvas hit as the store names it: the cloud is no place; a slot stands for its port's scheduling weir. */
export function toHit(st: CanvasStore, h: MapHit | null): Hit | null {
  if (h === null || h.type === "night") return null;
  if (h.type === "slot") {
    const port = st.scene.chanById.get(h.ref.channel)?.port ?? null;
    return port === null ? null : { type: "block", kind: "slot", scope: { type: "port", ref: port } };
  }
  return h;
}

/** What is under a screen point (canvas px), as the store names it. */
export function hitAt(st: CanvasStore, hot: readonly Hot[], px: number, py: number): Hit | null {
  const p = pickAt(st, hot, px, py);
  return p === null ? null : toHit(st, p.hit);
}
