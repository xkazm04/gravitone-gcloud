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
