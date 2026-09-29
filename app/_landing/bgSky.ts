// THE FIELD OF FAINT STARS — one canvas, drawn only when something moved.
//
// The design ran a permanent rAF loop with a 720 s drift and a twinkle on 5% of
// the stars. Animation austerity for this app is entrance-only: nothing keeps
// running once you have looked, so the drift and the twinkle are gone and the
// canvas is painted on demand: during the arrival's ignition, during a camera
// flight, and on resize. At rest the page does no work at all.
//
// Colours are the world's tokens read once from the root element; the canvas
// cannot take a var(), so it takes the resolved value.

import { mulberry } from "./sky";

export interface Cam { cx: number; cy: number; S: number; ax: number; ay: number }

interface Bg { a: number; r: number; s: number; al: number; col: 0 | 1 | 2; ig: number }

export interface Sky {
  draw(cam: Cam, ignite: number): void;
}

export function createSky(
  canvas: HTMLCanvasElement,
  root: HTMLElement,
  g: { W: number; H: number; s0: number; vw: number; vh: number },
): Sky {
  const { W, H, s0, vw, vh } = g;
  const ctx = canvas.getContext("2d")!;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(vw * dpr);
  canvas.height = Math.round(vh * dpr);

  const cs = getComputedStyle(root);
  // Solid token colours; per-star alpha rides on globalAlpha, so no colour
  // literal is ever spelled here (canvas cannot take var(), but it can take
  // the resolved token).
  const tok = (n: string): string => cs.getPropertyValue(n).trim() || cs.color;
  const COLS = [tok("--al-white"), tok("--al-gold"), tok("--al-ash")];

  // The stars live on a sphere seen from an off-chart pole: angle and radius
  // about it, so the graticule's arcs and the star field agree.
  const pole = { x: W / 2, y: -W };
  const hw = (vw / (2 * s0)) * 1.35, hh = (vh / (2 * s0)) * 1.35;
  const corners = [[W / 2 - hw, H / 2 - hh], [W / 2 + hw, H / 2 - hh], [W / 2 - hw, H / 2 + hh], [W / 2 + hw, H / 2 + hh]];
  const rmin = Math.max(10, H / 2 - hh - pole.y);
  let amin = 1e9, amax = -1e9, rmax = 0;
  for (const c of corners) {
    const a = Math.atan2(c[1] - pole.y, c[0] - pole.x);
    amin = Math.min(amin, a); amax = Math.max(amax, a);
    rmax = Math.max(rmax, Math.hypot(c[0] - pole.x, c[1] - pole.y));
  }
  amin -= 0.06; amax += 0.06;
  const view = 4 * hw * hh, sector = 0.5 * (amax - amin) * (rmax * rmax - rmin * rmin);
  const nVis = Math.max(420, Math.min(1500, (vw * vh) / 1500));
  const N = Math.min(5200, Math.round((nVis * sector) / view));
  const rnd = mulberry(11);
  const BG: Bg[] = [];
  for (let i = 0; i < N; i++) {
    const u = rnd(), m = Math.pow(rnd(), 5.5);
    const a = amin + rnd() * (amax - amin);
    const r = Math.sqrt(rnd() * (rmax * rmax - rmin * rmin) + rmin * rmin);
    const al = 0.18 + rnd() * 0.35 + m * 0.5;
    // The design drew two more numbers per star for its twinkle; they are drawn
    // and dropped so the field lays out exactly as the design's did.
    if (rnd() < 0.05) rnd();
    rnd();
    BG.push({ a, r, s: 0.35 + m * 1.9, al, col: u < 0.12 ? 1 : u < 0.2 ? 2 : 0, ig: rnd() });
  }

  return {
    draw(cam, ig) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, vw, vh);
      ctx.globalAlpha = 1;
      // The field moves at a third of the chart's zoom: parallax, so a flight
      // into a constellation has depth.
      const f = 0.35;
      const Sb = s0 * Math.pow(cam.S / s0, f);
      const cbx = W / 2 + (cam.cx - W / 2) * f, cby = H / 2 + (cam.cy - H / 2) * f;
      for (const s of BG) {
        const x = (pole.x + s.r * Math.cos(s.a) - cbx) * Sb + cam.ax;
        const y = (pole.y + s.r * Math.sin(s.a) - cby) * Sb + cam.ay;
        if (x < -4 || y < -4 || x > vw + 4 || y > vh + 4) continue;
        let al = s.al;
        if (ig < 1) {
          const k = Math.max(0, Math.min(1, (ig - s.ig * 0.7) / 0.3));
          if (!k) continue;
          al *= k;
        }
        const col = COLS[s.col];
        ctx.fillStyle = col;
        ctx.globalAlpha = al;
        if (s.s < 0.9) ctx.fillRect(x - s.s / 2, y - s.s / 2, s.s, s.s);
        else {
          ctx.beginPath();
          ctx.arc(x, y, s.s, 0, 6.283);
          ctx.fill();
          if (s.s > 1.75) {
            ctx.globalAlpha = al * 0.35;
            ctx.fillRect(x - s.s * 4, y - 0.25, s.s * 8, 0.5);
            ctx.fillRect(x - 0.25, y - s.s * 4, 0.5, s.s * 8);
          }
        }
      }
    },
  };
}
