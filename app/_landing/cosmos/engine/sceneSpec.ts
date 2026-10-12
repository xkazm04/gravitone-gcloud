// SCENE SPEC: the overview (L0) as one description, sceneSpec(cx). It lists every
// plane back to front: sky, stars, clouds, the ridges, the seven paper sheets of
// the disc, the lamp and core, the medallion and ream layers, and the floor. The
// full tier builds one canvas per item from this list; lite and still fold it
// into bands (planes.ts). Split out so the spec can be read on its own, apart
// from the code that builds the stack from it (scene.ts).

import { RIDGE } from "./scenePaint";
import { sc, tr, type Op } from "./rasterJobs";
import { box, full, lampCols, type Item, type PlaneOpts, type PlaneSpec } from "./planes";
import type { Cx } from "./state";

export function sceneSpec(cx: Cx): PlaneSpec[] {
  const { W, H, portrait } = cx.g,
    L = cx.L,
    b = box(cx);
  const out: PlaneSpec[] = [];
  const P = (name: string, d: number, o: PlaneOpts, items: Item[], host?: PlaneSpec["host"]) => out.push({ name, d, o, items, host });
  /* 1. sky: indigo paper, warm at the horizon */
  P("sky", 0.03, { sk: 1.03, so: 1, pd: 0.25 }, [full(b, [{ p: "sky", b, gx: L.cx, gy: L.cy, gr: Math.max(L.rx, H * 0.6) * 1.25 }])]);
  /* 2. punched stars: light bleeding through holes */
  P("stars", 0.07, { sk: 1.05, so: 0, pd: 0.2 }, [full(b, [{ p: "stars", b }])]);
  /* 3. drifting paper cloud banks */
  {
    const cw = b.pw * 1.4,
      ch = H * 0.42;
    P("clouds", 0.1, { sk: 1.1, so: 0, pd: 0.2 }, [
      { x: -b.M - cw * 0.2, y: H * 0.03, w: cw, h: ch, ops: [{ p: "clouds", cw, ch, H }], cls: "drift", css: { "--dr": W * 0.04 + "px" } },
    ]);
  }
  /* 4. ridges, rim-lit from behind */
  const ridge = (name: keyof typeof RIDGE, base: number, amp: number, seed: number, e: number, glow: number): Op => ({
    p: "ridge",
    b,
    col: RIDGE[name].col,
    base,
    amp,
    seed,
    e,
    glow,
    glowCol: RIDGE[name].glow,
  });
  P("far", 0.14, { sk: 1.12, so: 0, pd: 0.1 }, [full(b, [ridge("far", portrait ? 0.6 : 0.715, 0.035, 31, 10, 34)])]);
  /* 5. the paper disc: stacked swirled sheets, each its own speed */
  const J = 7,
    arms = L.arms < 2 ? 2 : L.arms;
  for (let j = 0; j < J; j++) {
    const Rj = L.R * (1.04 - j * 0.118),
      size = Math.ceil(Rj * 2.5);
    P("disc" + j, 0.17 + j * 0.045, { sk: 1.1 + j * 0.11, so: 0, pd: 0.28 - j * 0.03 }, [
      {
        x: L.cx - size / 2,
        y: L.cy - size / 2,
        w: size,
        h: size,
        ops: [{ p: "disc", j, J, Rj, arms, m: tr(size / 2, size / 2) }],
        bake: sc(1, L.sq),
        cls: "sway",
        css: { "--sq": L.sq.toFixed(3), "--amp": 1.6 + j * 0.55 + "deg", "--sp": 46 + j * 13 + "s", "--sd": -j * 9 + "s" },
      },
    ]);
  }
  /* 6. the lamp behind the sheets: the core glow, and the six-petal heart */
  {
    const sz = L.R * 0.9,
      cs = Math.round(L.R * 0.34),
      cw = cs * 2.4,
      cq = L.sq * 0.55 + 0.45;
    P("core", 0.46, { sk: 1.7, so: 0, pd: 0.05 }, [
      {
        x: L.cx - sz / 2,
        y: L.cy - sz / 2,
        w: sz,
        h: sz,
        lamp: true,
        bake: sc(1, L.sq),
        // the full design's lamp pulses between .82 and 1; at rest it sits between
        ops: [{ p: "lamp", sz, cols: lampCols(cx), m: tr(sz / 2, sz / 2), alpha: 0.91 }],
      },
      {
        x: L.cx - cs * 1.2,
        y: L.cy - cs * 1.2,
        w: cw,
        h: cw,
        ops: [{ p: "core", cs, steps: cx.steps.length, m: tr(cs * 1.2, cs * 1.2) }],
        bake: sc(1, cq),
        css: { transform: `scaleY(${cq.toFixed(3)})` },
        aria: (cx.steps.join(", ") || "studio") + ", stylised illustration",
      },
    ]);
  }
  P("midA", 0.56, { sk: 1.9, so: 0, pd: 0.1 }, [full(b, [ridge("midA", portrait ? 0.655 : 0.775, 0.03, 57, 14, 26)])]);
  P("medals", 0.72, { sk: 1.45, so: 1, pd: 0 }, [], "medals");
  P("front", 0.86, { sk: 2.2, so: 0, pd: 0.1 }, [full(b, [ridge("front", portrait ? 0.78 : 0.885, 0.022, 77, 16, 0)])]);
  P("reams", 0.93, { sk: 2.4, so: 0, pd: 0 }, [], "reams");
  /* floor strip, ink dark, below everything */
  P("floor", 1, { sk: 2.6, so: 0, pd: 0 }, [full(b, [{ p: "floor", b }])]);
  return out;
}
