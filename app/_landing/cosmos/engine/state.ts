// One mount's state. Every interactive module takes this object; nothing in the
// engine keeps per-mount state at module level, so a second mount (React's
// strict-mode remount, a return to `/`) starts clean.

import type { Galaxy, GalaxyCategory, GalaxyFamily, GalaxyTemplate, GalaxyType } from "../types";
import type { CosmosOptions, CosmosTier } from "./index";
import type { CarMetrics, Geo, Layout } from "./layout";
import type { Life } from "./life";

export interface Plane {
  name: string;
  /** depth: how far parallax moves it */
  d: number;
  pl: HTMLDivElement;
  pp: HTMLDivElement;
}

export type Level = "root" | "type" | "tpl" | "fam" | "cat";

export type Card = HTMLButtonElement & { _vis?: boolean; _art?: boolean; _q?: boolean };

export interface SearchEntry {
  k: "type" | "fam" | "tpl" | "cat";
  id: string;
  type?: string;
  fam?: string;
  label: string;
  sub: string;
  col: string;
  l: string;
}

/** the skeleton Cosmos.tsx renders, found by id inside the root */
export interface Els {
  scene: HTMLElement;
  world: HTMLElement;
  banner: HTMLElement;
  typeView: HTMLElement;
  stageView: HTMLElement;
  libView: HTMLElement;
  back: HTMLButtonElement;
  crumbs: HTMLElement;
  searchBtn: HTMLButtonElement;
  depth: HTMLElement;
  search: HTMLElement;
  q: HTMLInputElement;
  res: HTMLElement;
  hero: HTMLElement;
  flare: HTMLElement;
}

export interface Cx {
  root: HTMLElement;
  els: Els;
  life: Life;
  opts: CosmosOptions;
  tier: CosmosTier;
  /** reduced motion, read once at mount */
  RM: boolean;

  types: GalaxyType[];
  templates: GalaxyTemplate[];
  library: GalaxyFamily[];
  steps: string[];
  tplByType: Map<string, GalaxyTemplate[]>;
  typeById: Map<string, GalaxyType>;
  famById: Map<string, GalaxyFamily>;
  reamTone: Map<string, string>;

  g: Geo;
  L: Layout;
  planes: Plane[];
  wplanes: Plane[];
  medEls: HTMLButtonElement[];
  reamEls: HTMLButtonElement[];
  medalsEl: HTMLElement | null;
  reamsEl: HTMLElement | null;
  buildTok: number;

  cam: { px: number; py: number; tx: number; ty: number; dx: number; dy: number; dolly: number; wheelT: number; drag: { x: number; y: number; ox: number; oy: number } | null; lastT: number };

  ST: { lv: Level; type: string | null; tpl: string | null; fam: string | null; cat: string | null; opener: HTMLElement | null };
  navTok: number;
  famSorted: GalaxyCategory[];

  CAR: CarMetrics & {
    pos: number;
    target: number;
    cards: Card[];
    list: GalaxyTemplate[];
    drag: { x: number; p: number; id: number } | null;
    hov: number | null;
    idx: number;
    snap: ReturnType<typeof setTimeout> | 0;
    moved: boolean;
    t: number;
  };
  artQ: number[];
  artRun: boolean;
  SV: { kind: "tpl" | "cat" | null; idx: number; list: (GalaxyTemplate | GalaxyCategory)[] };
  catQ: (() => void)[];
  catRun: boolean;
  strips: { ro: ResizeObserver; el: HTMLElement }[];

  hotEl: HTMLElement | null;
  lastPtr: string;
  searchOpen: boolean;
  SIDX: SearchEntry[] | null;
  sel: number;
  sres: SearchEntry[];
  introOn: boolean;
  introT: ReturnType<typeof setTimeout>[];
  rzT: ReturnType<typeof setTimeout> | 0;
}

export function createCx(root: HTMLElement, galaxy: Galaxy, life: Life, opts: CosmosOptions, tier: CosmosTier, els: Els): Cx {
  const types = galaxy.types || [],
    templates = galaxy.templates || [],
    library = galaxy.library || [],
    steps = galaxy.studioSteps || [];
  const tplByType = new Map<string, GalaxyTemplate[]>(types.map((t) => [t.id, []]));
  templates.forEach((t) => {
    if (!tplByType.has(t.type)) tplByType.set(t.type, []);
    tplByType.get(t.type)!.push(t);
  });
  return {
    root,
    els,
    life,
    opts,
    tier,
    RM: typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches,
    types,
    templates,
    library,
    steps,
    tplByType,
    typeById: new Map(types.map((t) => [t.id, t])),
    famById: new Map(library.map((f) => [f.id, f])),
    reamTone: new Map(),
    g: { W: 0, H: 0, S: 1080, DPR: 1, RS: 1, portrait: false },
    L: {} as Layout,
    planes: [],
    wplanes: [],
    medEls: [],
    reamEls: [],
    medalsEl: null,
    reamsEl: null,
    buildTok: 0,
    cam: { px: 0, py: 0, tx: 0, ty: 0, dx: 0, dy: 0, dolly: 0, wheelT: 0, drag: null, lastT: 0 },
    ST: { lv: "root", type: null, tpl: null, fam: null, cat: null, opener: null },
    navTok: 0,
    famSorted: [],
    CAR: { n: 0, flat: false, cw: 0, ch: 0, cy: 0, gap: 0, X: [], SC: [], pos: 0, target: 0, cards: [], list: [], drag: null, hov: null, idx: -1, snap: 0, moved: false, t: 0 },
    artQ: [],
    artRun: false,
    SV: { kind: null, idx: 0, list: [] },
    catQ: [],
    catRun: false,
    strips: [],
    hotEl: null,
    lastPtr: "mouse",
    searchOpen: false,
    SIDX: null,
    sel: 0,
    sres: [],
    introOn: false,
    introT: [],
    rzT: 0,
  };
}

/** finds within the root, never globally */
export const $ = <T extends Element = HTMLElement>(cx: Cx, sel: string, from?: Element | null): T | null =>
  (from || cx.root).querySelector<T>(sel);
