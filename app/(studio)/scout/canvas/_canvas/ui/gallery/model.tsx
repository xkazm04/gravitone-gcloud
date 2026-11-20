// THE GALLERY'S STATE AND ITS PURE READINGS - port of the winner's gallery.js (contest scout-canvas-v2-r2 A/1) minus
// the DOM. Opened from any point that waits on a verdict, the gallery holds everything waiting under that point,
// across nights and packets: point › basin › river › wall of candidates › one candidate › one frame. The list is
// fixed at open (`all`); a verdict moves an item's state and block, never its place in the list.

import type { CanvasFile } from "../../../_port/contract.ts";
import { itemsUnder } from "../../scene/scopes.ts";
import type { Item, River, Scene, Scope } from "../../scene/types.ts";
import type { BlockKind } from "../../tables.ts";

export type Mode = "wall" | "one" | "frame";
export type Kind = "verdict" | "seeds";
export type Narrow = Extract<Scope, { type: "river" }> | Extract<Scope, { type: "basin" }> | null;

export type G = {
  readonly scope: Scope;
  /** Everything waiting under the point when the gallery opened. */
  readonly all: readonly Item[];
  readonly kind: Kind;
  readonly narrow: Narrow;
  readonly list: readonly Item[];
  readonly idx: number;
  readonly mode: Mode;
  readonly frame: number;
  readonly reasons: readonly string[];
  readonly note: string;
  readonly finished: boolean;
};

export const KINDS: readonly (readonly [Kind, string])[] = [
  ["verdict", "Outputs"],
  ["seeds", "Seeds"],
];

export const waiting = (it: Item): boolean => it.block === "verdict" || it.block === "seeds";
export const kindOf = (it: Item): Kind => (it.node !== null && it.node.kind === "seed" ? "seeds" : "verdict");
export const images = (it: Item): readonly CanvasFile[] => (it.media === null ? [] : it.media.files.filter((f) => f.type === "image"));
export const video = (it: Item): CanvasFile | null => (it.media === null ? null : (it.media.files.find((f) => f.type === "video") ?? null));
export const riverName = (r: River): string => (r.chan !== null ? `${r.chan.id} · ${r.chan.name}` : (r.aud !== null ? `${r.aud} · ` : "") + r.name);
export const left = (list: readonly Item[]): number => list.filter(waiting).length;
export const verdictOf = (it: Item): "kept" | "rejected" | "" => (it.state === "kept" ? "kept" : it.state === "rejected" || it.state === "thrown" ? "rejected" : "");

const inNarrow = (n: Narrow, it: Item): boolean => n === null || (n.type === "river" ? it.river === n.ref : it.river.basin === n.ref.key);
const order = (a: Item, b: Item): number => a.river.y0 - b.river.y0 || (a.at < b.at ? 1 : a.at > b.at ? -1 : 0) || a.si - b.si || a.x - b.x;

export const cur = (g: G): Item | undefined => g.list[g.idx];

/** The list for the kind and the narrowing, the cursor on `keep` when given, else on the first that waits. */
export function relist(g: G, keep?: Item): G {
  const list = g.all.filter((it) => kindOf(it) === g.kind && inNarrow(g.narrow, it)).sort(order);
  const idx = Math.max(0, keep !== undefined ? list.indexOf(keep) : list.findIndex(waiting));
  return { ...g, list, idx };
}

/** The gallery as it opens on a point: null when nothing there waits on a verdict. */
export function openG(scene: Scene, scope: Scope, block: BlockKind | null, focus: Item | null): G | null {
  const all = itemsUnder(scene, scope).filter((it) => waiting(it) || (scope.type === "item" && it.media !== null));
  if (all.length === 0) return null;
  const want: Kind | null = block === "verdict" || block === "seeds" ? block : null;
  const kind: Kind = want !== null && all.some((it) => kindOf(it) === want) ? want : all.some((it) => kindOf(it) === "verdict") ? "verdict" : "seeds";
  const base: G = { scope, all, kind, narrow: null, list: [], idx: 0, mode: "wall", frame: 0, reasons: [], note: "", finished: false };
  const keep = focus !== null && all.includes(focus) && kindOf(focus) === kind ? focus : undefined;
  const g = relist(base, keep);
  return { ...g, mode: keep !== undefined ? "one" : g.kind === "seeds" && g.list.length > 1 ? "wall" : "one" };
}

/** The next that waits after the cursor (wrapping), or the finish. */
export function advance(g: G): G {
  let j = g.list.findIndex((x, i) => i > g.idx && waiting(x));
  if (j < 0) j = g.list.findIndex(waiting);
  return j < 0 ? { ...g, finished: true } : { ...g, idx: j };
}

/** One step: a frame inside the frame view, else a candidate. */
export function step(g: G, d: number): G {
  if (g.list.length === 0) return g;
  const it = cur(g);
  if (g.mode === "frame" && it !== undefined && it.media !== null) {
    const n = it.media.files.length;
    return { ...g, finished: false, frame: (g.frame + d + n) % n };
  }
  return { ...g, finished: false, idx: Math.max(0, Math.min(g.list.length - 1, g.idx + d)) };
}

/** Columns of the frame grid: up to three across, four as two by two. */
export const colsOf = (n: number): number => (n <= 3 ? n : n === 4 ? 2 : 3);
