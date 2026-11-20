// THE CANVAS'S CLIENT STORE - the scene the server's view became, the UI state around it (camera, hover, selection,
// lens, the open surface, the menu), and every act. React reads it through useCanvas (./useCanvas.ts: one revision
// counter, useSyncExternalStore); the canvas reads it every frame. An act changes the scene optimistically, asks the
// port, and rolls back with the port's own sentence when the port refuses (./acts.ts). The camera's motion lives in
// ../render/camera.ts over `ui.cam`.

import type { CoreRef, Production, SwapPreview } from "@gt/domain/productionGraph";

import type { CanvasPort, CanvasSlot, CanvasView, RoundGoal, ScoutNote } from "../_port/contract.ts";
import { buildScene } from "./scene/index.ts";
import type { Anchor } from "./scene/scopes.ts";
import type { Hit, Item, Port, Scene, Scope } from "./scene/types.ts";
import type { BlockKind, ItemState, Lens, Stance, Verdict } from "./tables.ts";

export type Cam = { x: number; y: number; z: number };

/** The surface over the map: the fullscreen gallery, or a desk docked under it. */
export type Surface =
  | { readonly kind: "gallery"; readonly scope: Scope; readonly block: BlockKind | null; readonly focus: Item | null }
  | { readonly kind: "audio"; readonly scope: Scope }
  | { readonly kind: "brief" }
  | { readonly kind: "street"; readonly production: string }
  | null;

/** The productions the side holds and the cores a production can cast (the production basin, spark character-cores). */
export type Prods = { productions: Production[]; readonly cores: readonly CoreRef[] };

/** The production street's state: the cores tray, a swap's preview, the stale ripple, a refusal. */
export type StreetUi = {
  tray: boolean;
  /** The core being previewed while its preview is asked for. */
  asking: string | null;
  preview: SwapPreview | null;
  /** The ids that went stale on the last accept, and when (the ripple plays once, then the stale state holds). */
  ripple: { readonly ids: readonly string[]; readonly t0: number } | null;
  error: string | null;
  /** The node whose own words show under the drawing. */
  focus: string | null;
};

/** The right-click menu: where it opened, what it is about, the note being written. */
export type MenuState = { readonly x: number; readonly y: number; readonly anchor: Anchor | null; readonly target: Hit | null; stance: Stance; text: string } | null;

export type LogEntry = {
  readonly it: Item;
  readonly prev: ItemState;
  readonly prevEp: Item["ep"];
  readonly verdict: Verdict;
  readonly reasons: readonly string[];
  readonly note: string;
  readonly packet: string | null;
  committed: boolean;
};

/** A slot flying from a reel to its port's lane (motion only). */
export type Flyer = { readonly it: Item; readonly port: Port; readonly slot: CanvasSlot; readonly t0: number; readonly dur: number };

export type Ui = {
  cam: Cam;
  W: number;
  H: number;
  dpr: number;
  /** What the sheet (right) and the desk (bottom) cover of the map, in px. */
  inset: { r: number; b: number };
  hover: Hit | null;
  sel: Hit | null;
  lens: Lens;
  /** 0 → 1 on first load: the water runs east. */
  reveal: number;
  /** A ring pulsing where `W` just landed (world point, start time in rAF ms). */
  pulse: { readonly x: number; readonly y: number; readonly t0: number } | null;
  sheetOpen: boolean;
  surface: Surface;
  menu: MenuState;
  keysOpen: boolean;
  notes: ScoutNote[];
  goal: RoundGoal;
  mode: "dry" | "live";
  until: string;
  split: Record<string, number>;
  splitSet: boolean;
  /** The projected views and revenue per published episode (illustrative, editable). */
  assume: { views: number; rpm: number };
  projOpen: boolean;
  log: LogEntry[];
  slots: CanvasSlot[];
  flyers: Flyer[];
  cadence: number;
  autoSlot: boolean;
  /** The last act's words (a toast), and the last refusal in the side's own words. */
  toast: { readonly text: string; readonly at: number } | null;
  error: string | null;
  busy: number;
  street: StreetUi;
};

export type Change = "verdict" | "commit" | "note" | "steer" | "audio" | "surface" | "camera" | "ui";

const audShare = (view: CanvasView, k: string): number => {
  const all = view.graph.nodes.filter((x) => x.audience !== undefined).length;
  const n = view.graph.nodes.filter((x) => x.audience === k).length;
  return all > 0 ? Math.round((n / all) * 100) : 0;
};

export class CanvasStore {
  readonly scene: Scene;
  readonly ui: Ui;
  private readonly subs = new Set<() => void>();
  private rev = 0;

  readonly prod: Prods;

  constructor(
    readonly view: CanvasView,
    readonly port: CanvasPort,
    prod: { readonly productions: readonly Production[]; readonly cores: readonly CoreRef[] } = { productions: [], cores: [] },
  ) {
    this.prod = { productions: [...prod.productions], cores: prod.cores };
    this.scene = buildScene(view, prod.productions);
    const split = view.split ?? { adult: audShare(view, "adult"), family: audShare(view, "family"), kids: audShare(view, "kids") };
    this.ui = {
      cam: { x: 0, y: 0, z: 1 }, W: 0, H: 0, dpr: 1, inset: { r: 0, b: 0 }, hover: null, sel: null, lens: null, reveal: 0, pulse: null,
      sheetOpen: false, surface: null, menu: null, keysOpen: false, notes: [...view.notes], goal: view.goal, mode: "dry", until: "06:00",
      split: { ...split }, splitSet: view.split !== undefined, assume: { views: 1500, rpm: 0.05 }, projOpen: false,
      log: [], slots: view.slots.filter((s) => s.state !== "cancelled"), flyers: [], cadence: 2, autoSlot: true, toast: null, error: null, busy: 0,
      street: { tray: false, asking: null, preview: null, ripple: null, error: null, focus: null },
    };
  }

  subscribe = (f: () => void): (() => void) => {
    this.subs.add(f);
    return () => this.subs.delete(f);
  };

  /** The revision React re-renders on; the canvas reads the scene directly every frame. */
  snapshot = (): number => this.rev;

  changed(_what: Change): void {
    this.rev++;
    for (const f of this.subs) f();
  }

  say(text: string): void {
    this.ui.toast = { text, at: Date.now() };
    this.changed("ui");
  }

  refuse(message: string): void {
    this.ui.error = message;
    this.ui.toast = { text: message, at: Date.now() };
    this.changed("ui");
  }

  /* ---------- surfaces ---------- */

  openSurface(s: Surface): void {
    this.ui.surface = s;
    this.ui.menu = null;
    this.changed("surface");
  }

  closeSurface(): void {
    if (this.ui.surface === null) return;
    this.ui.surface = null;
    this.ui.inset.b = 0;
    this.changed("surface");
  }

  openSheet(h: Hit): void {
    // A production's river, or a station on it, opens the production's street instead of a sheet.
    const prod = h.type === "river" ? h.ref.prod : h.type === "station" && h.ref.fam === "production" ? (this.scene.rivers.find((r) => r.prod !== null && r.cy === h.ref.y)?.prod ?? null) : null;
    if (prod !== null) return this.openSurface({ kind: "street", production: prod.id });
    this.ui.sel = h;
    this.ui.sheetOpen = true;
    this.changed("surface");
  }

  closeSheet(): void {
    this.ui.sel = null;
    this.ui.sheetOpen = false;
    this.ui.inset.r = 0;
    this.changed("surface");
  }

  openMenu(x: number, y: number, target: Hit | null, anchor: Anchor | null): void {
    this.ui.menu = { x, y, anchor, target, stance: "", text: "" };
    this.changed("ui");
  }

  closeMenu(): void {
    if (this.ui.menu === null) return;
    this.ui.menu = null;
    this.changed("ui");
  }

  /** One UI field, then a redraw of what reads it (React components write through here, never into `ui`). */
  set<K extends keyof Ui>(k: K, v: Ui[K], what: Change = "ui"): void {
    this.ui[k] = v;
    this.changed(what);
  }

  /** The canvas's size in CSS px and its pixel ratio (no redraw: the frame loop reads them). */
  size(W: number, H: number, dpr: number): void {
    this.ui.W = W;
    this.ui.H = H;
    this.ui.dpr = dpr;
  }

  setLens(l: Lens): void {
    this.ui.lens = this.ui.lens === l ? null : l;
    this.changed("ui");
  }
}
