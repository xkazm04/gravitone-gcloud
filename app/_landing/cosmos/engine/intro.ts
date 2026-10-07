// BOOT, the intro, the Enter flare and the resize rebuild.
//
// The intro: sheets lay down back to front while the wordmark hangs at centre,
// then the medallions pop in. Any press, wheel or key ends it at once.

import { buildTypeView, syncCarousel } from "./carousel";
import { frameReq } from "./camera";
import { measure } from "./layout";
import { rebuildLib } from "./library";
import { currentPath, setLv } from "./nav";
import { buildScene, buildWorld, layoutTabs } from "./scene";
import { renderStage } from "./stage";
import type { Cx } from "./state";

const showAll = (cx: Cx) => {
  cx.planes.forEach((p) => p.pl.classList.add("in"));
  cx.medEls.forEach((b) => b.classList.add("in"));
  cx.reamEls.forEach((b) => b.classList.add("in"));
};
const unskip = (cx: Cx) => cx.life.raf(() => cx.life.raf(() => cx.root.classList.remove("skip")));

/** reads the viewport into cx.g and the root's --S and portrait class */
export function applyMeasure(cx: Cx): void {
  cx.g = measure(window.innerWidth, window.innerHeight, window.devicePixelRatio);
  cx.root.style.setProperty("--S", cx.g.S.toFixed(1) + "px");
  cx.root.classList.toggle("portrait", cx.g.portrait);
}

export function endIntro(cx: Cx): void {
  if (!cx.introOn) return;
  cx.introOn = false;
  cx.introT.forEach((t) => cx.life.clear(t));
  cx.introT = [];
  cx.root.classList.add("skip");
  showAll(cx);
  const h = cx.els.hero;
  h.classList.remove("on");
  h.classList.add("off");
  cx.root.classList.add("booted");
  unskip(cx);
}

export async function boot(cx: Cx): Promise<void> {
  const { life, RM } = cx;
  applyMeasure(cx);
  cx.introOn = !RM;
  const t0 = performance.now(),
    h = cx.els.hero;
  if (!RM) cx.introT.push(life.timeout(() => h.classList.add("on"), 40));
  let built = false;
  try {
    built = await buildScene(cx);
  } catch (err) {
    console.error(err);
  }
  if (life.dead) return;
  if (built) cx.root.dataset.ready = "";
  setLv(cx, "root");
  if (RM) {
    showAll(cx);
    cx.root.classList.add("booted");
    frameReq(cx);
    return;
  }
  if (!cx.introOn) return;
  const el0 = performance.now() - t0,
    off = Math.max(1700, el0 + 700);
  cx.introT.push(life.timeout(() => cx.medEls.forEach((b) => b.classList.add("in")), Math.max(0, Math.min(el0, 900) - el0 + 250)));
  cx.introT.push(life.timeout(() => cx.reamEls.forEach((b) => b.classList.add("in")), 500));
  cx.introT.push(
    life.timeout(() => {
      h.classList.remove("on");
      h.classList.add("off");
      cx.root.classList.add("booted");
    }, off - el0),
  );
  cx.introT.push(
    life.timeout(() => {
      cx.introOn = false;
    }, off - el0 + 500),
  );
  frameReq(cx);
}

export function wireIntro(cx: Cx): void {
  const { life } = cx;
  life.on(
    window,
    "pointerdown",
    () => {
      if (cx.introOn) endIntro(cx);
    },
    { capture: true },
  );
  life.on(
    window,
    "wheel",
    () => {
      if (cx.introOn) endIntro(cx);
    },
    { passive: true },
  );
  life.on(
    window,
    "pointerdown",
    (e) => {
      cx.lastPtr = e.pointerType || "mouse";
    },
    true,
  );
  if (document.fonts && document.fonts.ready)
    void document.fonts.ready.then(() => {
      if (!life.dead) layoutTabs(cx);
    });
}

/** the Enter pill's flare: a pure visual over whatever the pill itself does */
export function wireFlare(cx: Cx): void {
  const { life, els } = cx;
  life.on(cx.root, "click", (e) => {
    const pill = (e.target as Element | null)?.closest?.(".pc-enter");
    if (!pill || (pill as HTMLButtonElement).disabled) return;
    cx.opts.onEnter?.(currentPath(cx));
    const b = pill.getBoundingClientRect(),
      fl = els.flare;
    fl.style.setProperty("--fx", b.left + b.width / 2 + "px");
    fl.style.setProperty("--fy", b.top + b.height / 2 + "px");
    fl.classList.remove("on");
    void fl.offsetWidth;
    fl.classList.add("on");
    life.timeout(() => fl.classList.remove("on"), cx.RM ? 250 : 1250);
  });
}

/** a real resize rebuilds the scene and whatever level is open */
export function wireResize(cx: Cx): void {
  const { life, ST, root } = cx;
  life.on(window, "resize", () => {
    if (window.innerWidth === cx.g.W && Math.abs(window.innerHeight - cx.g.H) < cx.g.H * 0.12) return;
    life.clear(cx.rzT);
    cx.rzT = life.timeout(async () => {
      const lv = ST.lv,
        keep = { type: ST.type, tpl: ST.tpl, fam: ST.fam, cat: ST.cat };
      root.classList.add("skip");
      applyMeasure(cx);
      cx.els.scene.querySelectorAll(".pl").forEach((n) => n.remove());
      cx.planes.length = 0;
      if (!(await buildScene(cx))) return;
      cx.medEls.forEach((b) => b.classList.add("in"));
      cx.reamEls.forEach((b) => b.classList.add("in"));
      if (keep.type && (lv === "type" || lv === "tpl")) {
        const ti = cx.types.findIndex((t) => t.id === keep.type),
          m = cx.L.med[ti];
        root.style.setProperty("--ox", m.x + "px");
        root.style.setProperty("--oy", m.y + "px");
        buildWorld(cx, keep.type);
        buildTypeView(cx, keep.type);
        if (keep.tpl) {
          const i = (cx.tplByType.get(keep.type) || []).findIndex((x) => x.id === keep.tpl);
          syncCarousel(cx, Math.max(0, i));
          cx.SV.list = cx.CAR.list;
          renderStage(cx, "tpl", Math.max(0, i), null);
        }
      }
      if (keep.fam && (lv === "fam" || lv === "cat")) {
        rebuildLib(cx, keep.fam);
        if (keep.cat) {
          const k = cx.famSorted.findIndex((c) => c.id === keep.cat);
          cx.SV.list = cx.famSorted;
          renderStage(cx, "cat", Math.max(0, k), null);
        }
      }
      setLv(cx, lv);
      cx.cam.px = cx.cam.py = 0;
      frameReq(cx);
      unskip(cx);
    }, 220);
  });
}
