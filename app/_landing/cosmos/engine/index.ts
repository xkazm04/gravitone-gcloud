// Paper Cosmos engine: entry point.
//
// The contest winner (landing-universe, "Paper Cosmos") ported as typed
// modules. Two halves:
//
//   PAINT (pure; a 2D context in, pixels out, no DOM): rng, palette, inks,
//     paper, motifs, medal, diorama, scenePaint, and rasterJobs, the job format
//     both raster paths run. raster.worker.ts runs them on OffscreenCanvas;
//     raster.ts runs them on the main thread when no worker can.
//   DOM (one mount's state in ./state, every listener/timer/frame through
//     ./life): scene (planes, medallions, reams, a type's world), camera,
//     banner, nav (levels, crumbs, depth, the overview's hover), carousel
//     (type view), stage, library, search, keyboard, intro (boot, the Enter
//     flare, resize).
//
// mountCosmos fills the skeleton Cosmos.tsx rendered inside `root` and returns a
// handle whose destroy() stops every listener, timer, frame and observer it
// started, terminates the raster worker, and empties every node it filled, so
// the root can be mounted again (React strict mode, a return to `/`).
//
// THE TIER (./perf) is decided once the raster worker has said hello (it asks
// WebGL for the renderer, off the main thread) and set as the root's data-tier
// with the reason in data-tier-why; the governor may lower it later, which
// rebuilds the overview in the background and swaps it in.

import type { Galaxy } from "../types";
import { wireCarousel } from "./carousel";
import { wireCamera, wirePause } from "./camera";
import { applyMeasure, boot, endIntro, rebuild, wireFlare, wireIntro, wireResize } from "./intro";
import { wireKeyboard } from "./keyboard";
import { Life } from "./life";
import { back, wireRoot } from "./nav";
import { Governor, decide, lower, reducedMotion, remember, type Tier } from "./perf";
import { Raster } from "./raster";
import { dropPrewarm } from "./scene";
import { wireSearch } from "./search";
import { createCx, type Cx, type Els } from "./state";

/** Quality tiers. `full`: every paper plane, idle sway and parallax (GPU).
 *  `lite`: planes flattened to depth bands, no infinite animation (CPU
 *  compositing). `still`: one flattened scene, no parallax (reduced motion or a
 *  device the governor measured as too slow for lite). */
export type CosmosTier = Tier;

export interface CosmosOptions {
  /** forced tier; omitted = probe + governor decide */
  tier?: CosmosTier;
  /** called with the path of the item under attention when Enter is pressed
   *  inside the scene (keyboard), so the host can route it */
  onEnter?: (path: string[]) => void;
  /** reports tier decisions and measurements, for tests and diagnostics */
  onTier?: (tier: CosmosTier, why: string) => void;
}

export interface CosmosHandle {
  destroy(): void;
  tier(): CosmosTier;
}

const FILLED = ["scene", "world", "typeView", "stageView", "libView", "crumbs", "depth", "res"] as const;
const ROOT_CLASSES = ["lv-type", "lv-tpl", "lv-fam", "lv-cat", "booted", "skip", "quick", "dragging", "portrait", "covered", "paused"];

function findEls(root: HTMLElement): Els {
  const q = <T extends HTMLElement>(id: string): T => {
    const e = root.querySelector<T>("#" + id);
    if (!e) throw new Error(`Paper Cosmos: the skeleton has no #${id}`);
    return e;
  };
  return {
    scene: q("scene"),
    world: q("world"),
    banner: q("banner"),
    typeView: q("typeView"),
    stageView: q("stageView"),
    libView: q("libView"),
    back: q<HTMLButtonElement>("back"),
    crumbs: q("crumbs"),
    searchBtn: q<HTMLButtonElement>("searchBtn"),
    depth: q("depth"),
    search: q("search"),
    q: q<HTMLInputElement>("q"),
    res: q("res"),
    hero: q("hero"),
    flare: q("flare"),
  };
}

function setTier(cx: Cx, tier: CosmosTier, why: string): void {
  cx.tier = tier;
  cx.root.dataset.tierWhy = why;
  if (tier === "still") {
    cx.RM = true;
    endIntro(cx);
  }
  cx.opts.onTier?.(tier, why);
}

export function mountCosmos(root: HTMLElement, galaxy: Galaxy, opts: CosmosOptions = {}): CosmosHandle {
  const life = new Life();
  const els = findEls(root);
  const query = new URLSearchParams(window.location.search);
  const raster = new Raster(query.get("raster") === "main");
  life.own(() => raster.destroy());
  const RM = reducedMotion();
  const cx = createCx(root, galaxy, life, opts, opts.tier ?? (RM ? "still" : "full"), els, raster, RM);
  applyMeasure(cx);
  life.own(() => dropPrewarm(cx));

  wireCamera(cx);
  wirePause(cx);
  wireRoot(cx);
  wireCarousel(cx);
  wireSearch(cx);
  wireKeyboard(cx);
  wireIntro(cx);
  wireFlare(cx);
  wireResize(cx);
  life.on(els.back, "click", () => back(cx));

  void raster.ready.then((hello) => {
    if (life.dead) return;
    root.style.setProperty("--grain", hello.grain);
    let tier: CosmosTier, why: string;
    if (opts.tier) [tier, why] = [opts.tier, "forced"];
    else if (RM) [tier, why] = ["still", "prefers-reduced-motion"];
    else {
      const v = decide(hello.ren);
      [tier, why] = [v.tier, v.why];
      cx.sig = v.sig;
    }
    why += " · raster " + raster.mode;
    setTier(cx, tier, why);
    root.dataset.tier = tier;
    if (!opts.tier && !RM && tier !== "still") {
      cx.gov = new Governor({
        want: (n, step) => life.want(n, step),
        stepDown: (p90, n, win) => {
          const next = lower(cx.tier);
          if (!next || !cx.gov) return;
          const reason = `governor: p90 ${p90.toFixed(1)} ms over ${n} frames (${win}) in ${cx.tier}`;
          cx.gov.off = true;
          remember(cx.sig, { tier: next, why: reason });
          setTier(cx, next, reason + " · raster " + raster.mode);
          void rebuild(cx, false).then((ok) => {
            if (!ok || !cx.gov || life.dead) return;
            cx.gov.reset();
            cx.gov.off = next === "still";
            if (!cx.gov.off) cx.gov.kick("settle", 3000);
          });
        },
      });
    }
    void boot(cx);
  });

  const tier = () => cx.tier;
  return {
    tier,
    destroy() {
      if (life.dead) return;
      life.destroy();
      cx.buildTok++;
      for (const k of FILLED) els[k].innerHTML = "";
      for (const k of ["banner", "typeView", "stageView", "libView", "flare", "world"] as const) els[k].removeAttribute("style");
      for (const k of ["typeView", "stageView", "libView"] as const) els[k].inert = false;
      els.typeView.removeAttribute("aria-label");
      els.banner.classList.remove("on");
      els.banner.querySelectorAll("[style]").forEach((n) => n.removeAttribute("style"));
      for (const n of els.banner.querySelectorAll(".bn-name, .bn-meta")) n.textContent = "";
      els.hero.classList.remove("on", "off");
      els.flare.classList.remove("on");
      els.search.classList.remove("on");
      els.back.disabled = true;
      els.q.value = "";
      root.classList.remove(...ROOT_CLASSES);
      root.removeAttribute("style");
      for (const a of ["data-lv", "data-ready", "data-tier", "data-tier-why"]) root.removeAttribute(a);
    },
  };
}
