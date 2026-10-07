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
  settled(cx);
}

export async function boot(cx: Cx): Promise<void> {
  const { life, RM } = cx;
  cx.introOn = !RM;
  const t0 = performance.now(),
    h = cx.els.hero;
  // the hero is already up from first paint (the stylesheet shows it until the
  // root has a tier); keep it up without a fade
  if (!RM) h.classList.add("on");
  let built = false;
  try {
    built = await buildScene(cx, "boot");
  } catch (err) {
    console.error(err);
  }
  if (life.dead) return;
  if (built) ready(cx);
  setLv(cx, "root");
  if (RM) {
    showAll(cx);
    cx.root.classList.add("booted");
    frameReq(cx);
    settled(cx);
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
      settled(cx);
    }, off - el0 + 500),
  );
  frameReq(cx);
}

/** the scene is placed */
function ready(cx: Cx): void {
  if (cx.root.dataset.ready == null) cx.root.dataset.ready = "";
}

/** the intro is over: the governor watches the first seconds of the page at
 *  rest (the intro's one-off reveal, with every layer arriving, is not what a
 *  tier is chosen for; the idle motion and the first interactions are) */
function settled(cx: Cx): void {
  cx.gov?.kick("boot", 3000);
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

/** rebuilds the overview in the current tier and swaps it in; with `views`,
 *  also whatever level is open (a resize moved everything), else only the
 *  world (a tier change re-folds its planes) */
export async function rebuild(cx: Cx, views: boolean): Promise<boolean> {
  const { ST, root } = cx;
  const lv = ST.lv,
    keep = { type: ST.type, tpl: ST.tpl, fam: ST.fam, cat: ST.cat };
  const focused = document.activeElement as HTMLElement | null,
    refocus = focused && cx.stack?.contains(focused) ? focused.dataset.id : null;
  if (!(await buildScene(cx, "swap"))) return false;
  ready(cx);
  if (cx.introOn) showAll(cx);
  const worldOpen = !!((keep.type && (lv === "type" || lv === "tpl")) || (keep.fam && lv === "cat"));
  if (keep.type && (lv === "type" || lv === "tpl")) {
    const ti = cx.types.findIndex((t) => t.id === keep.type),
      m = cx.L.med[ti];
    cx.medEls[ti]?.classList.add("chosen");
    if (views) {
      root.classList.add("skip");
      root.style.setProperty("--ox", m.x + "px");
      root.style.setProperty("--oy", m.y + "px");
      buildTypeView(cx, keep.type);
      if (keep.tpl) {
        const i = (cx.tplByType.get(keep.type) || []).findIndex((x) => x.id === keep.tpl);
        syncCarousel(cx, Math.max(0, i));
        cx.SV.list = cx.CAR.list;
        renderStage(cx, "tpl", Math.max(0, i), null);
      }
    }
  }
  if (views && keep.fam && (lv === "fam" || lv === "cat")) {
    root.classList.add("skip");
    rebuildLib(cx, keep.fam);
    if (keep.cat) {
      const k = cx.famSorted.findIndex((c) => c.id === keep.cat);
      cx.SV.list = cx.famSorted;
      renderStage(cx, "cat", Math.max(0, k), null);
    }
  }
  if (worldOpen) buildWorld(cx, (keep.type || keep.fam)!, true);
  setLv(cx, lv);
  if (refocus) [...cx.medEls, ...cx.reamEls].find((b) => b.dataset.id === refocus)?.focus({ preventScroll: true });
  frameReq(cx);
  unskip(cx);
  return true;
}

/** a real resize: the layers already up are scaled to cover the new viewport at
 *  once, and repainted for it once the size has held still for 250 ms. A change
 *  inside the same size class (a mobile URL bar: same width, under 12% of the
 *  height) is not a resize for the paper. */
export function wireResize(cx: Cx): void {
  const { life } = cx;
  life.on(window, "resize", () => {
    if (window.innerWidth === cx.g.W && Math.abs(window.innerHeight - cx.g.H) < cx.g.H * 0.12) return;
    cover(cx, window.innerWidth, window.innerHeight);
    life.clear(cx.rzT);
    cx.rzT = life.timeout(async () => {
      applyMeasure(cx);
      if (await rebuild(cx, true)) uncover(cx);
    }, 250);
  });
}

/** CSS-scales the current overview and world stacks so they cover W x H */
function cover(cx: Cx, W: number, H: number): void {
  for (const st of [cx.stack, cx.els.world.querySelector<HTMLElement>(":scope > .stack")]) {
    if (!st) continue;
    const w0 = Number(st.dataset.w) || cx.g.W,
      h0 = Number(st.dataset.h) || cx.g.H,
      s = Math.max(W / w0, H / h0);
    st.style.transformOrigin = "0 0";
    st.style.transform = `translate(${((W - w0 * s) / 2).toFixed(1)}px,${((H - h0 * s) / 2).toFixed(1)}px) scale(${s.toFixed(4)})`;
  }
}
function uncover(cx: Cx): void {
  cx.els.world.querySelectorAll<HTMLElement>(":scope > .stack").forEach((st) => (st.style.transform = ""));
}
