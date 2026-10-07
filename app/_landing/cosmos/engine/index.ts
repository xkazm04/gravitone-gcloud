// Paper Cosmos engine: entry point.
//
// The contest winner (landing-universe, "Paper Cosmos") ported as typed
// modules. Two halves:
//
//   PAINT (pure; a 2D context in, pixels out, no DOM): rng, palette, inks,
//     paper, motifs, medal, diorama, scenePaint. These can move onto an
//     OffscreenCanvas in a worker without edits.
//   DOM (one mount's state in ./state, every listener/timer/frame through
//     ./life): scene (planes, medallions, reams, a type's world), camera,
//     banner, nav (levels, crumbs, depth, the overview's hover), carousel
//     (type view), stage, library, search, keyboard, intro (boot, the Enter
//     flare, resize).
//
// mountCosmos fills the skeleton Cosmos.tsx rendered inside `root` and returns a
// handle whose destroy() stops every listener, timer, frame and observer it
// started and empties every node it filled, so the root can be mounted again
// (React strict mode, a return to `/`).

import type { Galaxy } from "../types";
import { wireCamera } from "./camera";
import { wireCarousel } from "./carousel";
import { boot, wireFlare, wireIntro, wireResize } from "./intro";
import { wireKeyboard } from "./keyboard";
import { Life } from "./life";
import { back, wireRoot } from "./nav";
import { GRAIN_N, paintGrain, setGrainSource } from "./paper";
import { wireSearch } from "./search";
import { createCx, type Els } from "./state";

/** Quality tiers. `full`: every paper plane, idle sway and parallax (GPU).
 *  `lite`: planes flattened to depth bands, no infinite animation (CPU
 *  compositing). `still`: one flattened scene, no parallax (reduced motion or a
 *  device the governor measured as too slow for lite). */
export type CosmosTier = "full" | "lite" | "still";

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

/** the grain tile as a CSS url, made once per page (it is the same pixels every time) */
let grainUrl = "";
function grain(): string {
  if (grainUrl) return grainUrl;
  const c = document.createElement("canvas");
  c.width = c.height = GRAIN_N;
  paintGrain(c.getContext("2d") as CanvasRenderingContext2D, GRAIN_N);
  setGrainSource(c);
  grainUrl = "url(" + c.toDataURL("image/png") + ")";
  return grainUrl;
}

const FILLED = ["scene", "world", "typeView", "stageView", "libView", "crumbs", "depth", "res"] as const;
const ROOT_CLASSES = ["lv-type", "lv-tpl", "lv-fam", "lv-cat", "booted", "skip", "quick", "dragging", "portrait"];

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

export function mountCosmos(root: HTMLElement, galaxy: Galaxy, opts: CosmosOptions = {}): CosmosHandle {
  // WP1 renders every tier as `full`; the forced tier is recorded on the root
  // so the performance layer and its instrument can read what was asked for.
  const tier: CosmosTier = opts.tier ?? "full";
  root.dataset.tier = tier;
  opts.onTier?.(tier, opts.tier ? "forced" : "default");

  const life = new Life();
  const els = findEls(root);
  const cx = createCx(root, galaxy, life, opts, tier, els);
  root.style.setProperty("--grain", grain());

  wireCamera(cx);
  wireRoot(cx);
  wireCarousel(cx);
  wireSearch(cx);
  wireKeyboard(cx);
  wireIntro(cx);
  wireFlare(cx);
  wireResize(cx);
  life.on(els.back, "click", () => back(cx));
  void boot(cx);

  return {
    tier: () => tier,
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
      for (const a of ["data-lv", "data-ready", "data-tier"]) root.removeAttribute(a);
    },
  };
}
