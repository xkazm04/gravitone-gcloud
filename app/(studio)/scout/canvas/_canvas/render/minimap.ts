// THE MINIMAP - the continent, the viewport, where work waits (port of the winner's chrome.js drawMini). The land,
// the rivers, the ports, the waiting towns and the slots are drawn once into an offscreen base per store revision and
// width; each frame copies the base and strokes the viewport over it.

import { clamp, sx } from "../scene/geo.ts";
import type { CanvasStore } from "../store.ts";
import type { Palette } from "../tokens.ts";
import { calX, clampCam, stopFlight, toW, vh, vw } from "./camera.ts";
import { landPaths, riverPaths } from "./state.ts";

export type Mini = { base: HTMLCanvasElement | null; rev: number; w: number; mk: number };
export const newMini = (): Mini => ({ base: null, rev: -1, w: 0, mk: 1 });

export function drawMini(st: CanvasStore, cv: HTMLCanvasElement, pal: Palette, mini: Mini): void {
  const W = st.scene.world;
  const ww = W.x1 - W.x0;
  const wh = W.y1 - W.y0;
  const d = st.ui.dpr;
  const maxW = st.ui.W < 900 ? 130 : 190;
  const maxH = 160;
  const mk = Math.min(maxW / ww, maxH / wh);
  mini.mk = mk;
  const w = Math.round(ww * mk);
  const h = Math.round(wh * mk);
  const rev = st.snapshot();
  const { c, a } = pal;
  if (mini.base === null || mini.rev !== rev || mini.w !== st.ui.W) {
    mini.rev = rev;
    mini.w = st.ui.W;
    cv.width = w * d;
    cv.height = h * d;
    cv.style.width = `${w}px`;
    cv.style.height = `${h}px`;
    const base = document.createElement("canvas");
    base.width = w * d;
    base.height = h * d;
    mini.base = base;
    const m = base.getContext("2d");
    if (m !== null) {
      m.setTransform(d * mk, 0, 0, d * mk, -W.x0 * mk * d, -W.y0 * mk * d);
      m.fillStyle = c.ink;
      m.fillRect(W.x0, W.y0, ww, wh);
      m.fillStyle = c["ink-3"];
      m.fill(landPaths(st.scene.land).land);
      for (const r of st.scene.rivers) {
        m.strokeStyle = r.reach < 0 ? a("rose", 0.6) : r.rank > 0 ? a("emerald", 0.9) : a("text", 0.7);
        m.lineWidth = r.reach < 0 ? 4 : 3 + Math.sqrt(r.live) * 0.9;
        if (r.reach < 0) {
          m.beginPath();
          m.moveTo(r.src, r.cy);
          m.lineTo(sx(Math.max(r.extent, 0.3)), r.cy);
          m.stroke();
        } else m.stroke(riverPaths(r).line);
      }
      for (const p of st.scene.ports) {
        m.fillStyle = p.song || p.chan === null ? c.muted : p.chan.episodes.length > 0 ? c.emerald : c.violet;
        m.beginPath();
        m.arc(p.x, p.y, 22, 0, 6.283);
        m.fill();
      }
      m.fillStyle = c.amber;
      for (const r of st.scene.rivers) {
        for (const t of r.towns) {
          if (t.blocks.n === 0) continue;
          m.beginPath();
          m.arc(t.x, r.cy, clamp(10 + Math.sqrt(t.blocks.n) * 4, 12, 44), 0, 6.283);
          m.fill();
        }
      }
      m.fillStyle = c.violet;
      for (const s of st.ui.slots) {
        const p = st.scene.chanById.get(s.channel)?.port ?? null;
        if (p !== null) m.fillRect(calX(p, s.day) - 12, p.y - 24, 24, 48);
      }
    }
  }
  const mctx = cv.getContext("2d");
  if (mctx === null) return;
  mctx.setTransform(1, 0, 0, 1, 0, 0);
  mctx.clearRect(0, 0, cv.width, cv.height);
  mctx.drawImage(mini.base, 0, 0);
  const [a0, b0] = toW(st, 0, 0);
  const [a1, b1] = toW(st, vw(st), vh(st));
  mctx.setTransform(d * mk, 0, 0, d * mk, -W.x0 * mk * d, -W.y0 * mk * d);
  mctx.strokeStyle = c.cyan;
  mctx.lineWidth = 1.6 / mk;
  mctx.strokeRect(a0, b0, a1 - a0, b1 - b0);
}

/** Centre the camera on the minimap point under the pointer (client px). */
export function miniGo(st: CanvasStore, cv: HTMLCanvasElement, mini: Mini, clientX: number, clientY: number): void {
  const r = cv.getBoundingClientRect();
  const W = st.scene.world;
  st.ui.cam.x = (clientX - r.left) / mini.mk + W.x0;
  st.ui.cam.y = (clientY - r.top) / mini.mk + W.y0;
  stopFlight(st);
  clampCam(st);
}
