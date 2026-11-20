// THE CANVAS'S CLIENT STORE - the scene the server's view became, the UI state around it (camera, hover, selection,
// lens, the open surface, the menu), and every act. React reads it through useCanvas (./useCanvas.ts: one revision
// counter, useSyncExternalStore); the canvas reads it every frame. An act changes the scene optimistically, asks the
// port, and rolls back with the port's own sentence when the port refuses (./acts.ts). The camera's motion lives in
// ../render/camera.ts over `ui.cam`.

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
  | null;

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

  constructor(
    readonly view: CanvasView,
    readonly port: CanvasPort,
  ) {
    this.scene = buildScene(view);
    const split = view.split ?? { adult: audShare(view, "adult"), family: audShare(view, "family"), kids: audShare(view, "kids") };
    this.ui = {
      cam: { x: 0, y: 0, z: 1 }, W: 0, H: 0, dpr: 1, inset: { r: 0, b: 0 }, hover: null, sel: null, lens: null, reveal: 0,
      sheetOpen: false, surface: null, menu: null, keysOpen: false, notes: [...view.notes], goal: view.goal, mode: "dry", until: "06:00",
      split: { ...split }, splitSet: view.split !== undefined, assume: { views: 1500, rpm: 0.05 }, projOpen: false,
      log: [], slots: view.slots.filter((s) => s.state !== "cancelled"), flyers: [], cadence: 2, autoSlot: true, toast: null, error: null, busy: 0,
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

  setLens(l: Lens): void {
    this.ui.lens = this.ui.lens === l ? null : l;
    this.changed("ui");
  }
}
