// THE SHELF'S PURE PARTS — no React, no JSX, no state.
//
// Split out of AssetsBrowser.tsx when that file passed 870 lines. These are the
// pieces with no opinion about rendering: two folder calculations, the two
// constants they serve, and the vocabulary a tile uses to report what a press
// meant.

import { pathKey, type Asset, type FolderNode } from "@/lib/assets";

/** How many same-style plates the viewer offers at a glance. A style with a
 *  full proof sheet plus a trial run runs to dozens, and a strip that long is a
 *  second gallery rather than a sideways look at one. */
export const SIBLING_CAP = 24;

/** Where an upload lands when the user is looking at "All assets" rather than a
 *  folder. Under the `shared` root beside the disciplines, because a file the
 *  user handed us is not educational or a trailer until they say so — and they
 *  can say so by dragging it somewhere else. */
export const DEFAULT_UPLOAD_PATH = ["shared", "uploads"];

/**
 * Which folders open on arrival: every one that CONTAINS folders.
 *
 * Derived from the tree rather than named, and that is the fix rather than an
 * elegance. The set used to be the literal `{styles, styles/presets}`, which
 * meant promoted plates — the ones the user paid a vendor for and approved —
 * landed in `styles › proofs › <style>` and were one click out of sight, with
 * nothing on the screen saying a click was needed. A hardcoded set is wrong
 * again for every folder invented after it. Leaves stay closed because there is
 * nothing behind them to hide.
 */
export function foldersWithChildren(nodes: FolderNode[], into: string[] = []): string[] {
  for (const n of nodes)
    if (n.children.length) {
      into.push(pathKey(n.path));
      foldersWithChildren(n.children, into);
    }
  return into;
}

/** The folder every one of them sits in, or none. Used to decide what "already
 *  here" means for a batch: a selection spanning folders has no single origin,
 *  and pretending otherwise disables a legitimate destination. */
export function commonPath(assets: Asset[]): string[] {
  if (!assets.length) return [];
  const first = pathKey(assets[0].path);
  return assets.every((a) => pathKey(a.path) === first) ? assets[0].path : [];
}

/** What a press on a tile meant. The tile reports the gesture; the shelf owns
 *  what each one does, because only it knows the selection. */
export type Activation = "open" | "toggle" | "range";

/**
 * What the gallery body is. useAssets answers a failed read with `assets = []`
 * beside `error`, so zero rows alone cannot tell "nothing here" from "could not
 * look": a failure with nothing loaded is its own state, drawn by the alert and
 * its retry and by nothing that claims the shelf is empty.
 */
export function galleryState(a: {
  error: string | null;
  total: number;
  shown: number;
}): "failed" | "empty" | "grid" {
  if (a.error && a.total === 0) return "failed";
  return a.shown === 0 ? "empty" : "grid";
}

/** The Assets tally for the tab rail. Unknown while reading, and unknown after
 *  a failed read with nothing loaded — an unknown count is not 0. */
export function shelfCount(a: { loaded: boolean; error: string | null; total: number }): number | undefined {
  if (!a.loaded) return undefined;
  if (a.error && a.total === 0) return undefined;
  return a.total;
}

/** How many tiles the gallery draws before the pager. Two dozen fills a wide
 *  screen twice over, and every tile past it was an image decoded (and, for an
 *  upload, a blob read) for a plate nobody had scrolled to. */
export const PAGE = 24;

/** Does a plate answer the search box? Every word must appear somewhere the
 *  user can see it named: the plate, its folder chain, its style, its brief, the
 *  file it was uploaded as. */
export function matchesQuery(a: Asset, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const m = (a.meta ?? {}) as { styleName?: unknown; problem?: unknown; fileName?: unknown };
  const hay = [a.name, ...a.path, m.styleName, m.problem, m.fileName]
    .filter((x): x is string => typeof x === "string")
    .join(" ")
    .toLowerCase();
  return words.every((w) => hay.includes(w));
}

/** A remembered folder, read back. Stored as JSON rather than a `/`-joined key
 *  because a folder the user renamed may itself contain a slash. Anything that
 *  does not parse as a list of strings is "all assets". */
export function readFolder(raw: string): string[] {
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) && v.every((x) => typeof x === "string") ? v : [];
  } catch {
    return [];
  }
}
