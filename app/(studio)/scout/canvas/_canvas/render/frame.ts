// THE FRAME - one draw of the whole map, in the winner's order (map.js draw): the ground in world space, the water
// clipped to how far it has run east on first load, the towns as blocks (close in) or rings (far out), the ports and
// the cuts flying to their slots, then every label, note, pin and the ruler in screen space. Answers the frame's hit
// boxes, which ./hit.ts tests before the world.

import { levelOf } from "../tables.ts";
import { smooth, SRC_X } from "../scene/geo.ts";
import type { CanvasStore } from "../store.ts";
import type { Palette } from "../tokens.ts";
import { toW, vh, vw } from "./camera.ts";
import { drawLabels } from "./labels.ts";
import { drawBlocks, drawRings } from "./lots.ts";
import { drawNotes, drawPins, drawRulers } from "./overlays.ts";
import { drawFlyers, drawPort } from "./ports.ts";
import { Z, type Frame } from "./prims.ts";
import { drawEdges, drawGround, drawRivers } from "./rivers.ts";
import { hoverOf, type Hot } from "./state.ts";

export function draw(st: CanvasStore, ctx: CanvasRenderingContext2D, pal: Palette, now: number): Hot[] {
  const { W, H, dpr, cam } = st.ui;
  const z = cam.z;
  const s = st.scene;
  const WORLD = s.world;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = pal.c.ink;
  ctx.fillRect(0, 0, W, H);
  const ox = vw(st) / 2 - cam.x * z;
  const oy = vh(st) / 2 - cam.y * z;
  const world = (): void => ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * ox, dpr * oy);
  const screen = (): void => ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const [vx0, vy0] = toW(st, 0, 0);
  const [vx1, vy1] = toW(st, W, H);
  const kBlock = smooth(z, 1.25, 1.75);
  const f: Frame = {
    st, s, ctx, pal, now, z, L: levelOf(z), W, H,
    vis: (x0, y0, x1, y1) => x1 > vx0 && x0 < vx1 && y1 > vy0 && y0 < vy1,
    view: { x0: vx0, y0: vy0, x1: vx1, y1: vy1 },
    revealX: SRC_X + (WORLD.x1 + 200 - SRC_X) * st.ui.reveal,
    kBlock,
    kCard: smooth(z, 3.4, 4.4),
    kCircle: 1 - kBlock,
    kCont: 1 - smooth(z, Z.basin * 0.8, Z.basin * 1.25),
    hover: hoverOf(st),
    boxes: [],
    hot: [],
  };

  world();
  drawGround(f);
  ctx.save();
  ctx.beginPath();
  ctx.rect(WORLD.x0 - 200, WORLD.y0 - 200, f.revealX - WORLD.x0 + 200, WORLD.y1 - WORLD.y0 + 400);
  ctx.clip();
  drawRivers(f);
  ctx.restore();
  if (f.kBlock > 0) {
    world();
    drawEdges(f);
    drawBlocks(f);
  }
  if (f.kCircle > 0) {
    screen();
    drawRings(f);
  }
  world();
  for (const p of s.ports) drawPort(f, p);
  drawFlyers(f);
  screen();
  drawLabels(f);
  drawNotes(f);
  drawPins(f);
  drawRulers(f);
  return f.hot;
}
