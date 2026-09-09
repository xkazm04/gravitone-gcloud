"use client";

// THE SHELF'S STATE AND ITS VERBS — everything AssetsBrowser knows, minus the
// markup.
//
// Split out when AssetsBrowser.tsx passed 870 lines and stopped being readable
// as one thing. The split is along the only seam that does not cut through a
// dependency: state and the handlers that own it on this side, markup on the
// other. Nothing here renders; nothing that renders holds state.
//
// It returns one object rather than a tuple of forty. The two render halves
// take that object whole and destructure what they need, which keeps their
// prop lists from becoming a second, drifting copy of this list.

import { useEffect, useMemo, useRef, useState } from "react";

import { useAnnounce } from "@/lib/announcer";
import { DISCIPLINES, type Discipline } from "@/lib/projects";
import { useAuth } from "@/lib/useAuth";
import { useAssets } from "@/lib/useAssets";
import { useThemes } from "@/lib/useThemes";
import { assetsUnder, buildTree, pathKey, type Asset } from "@/lib/assets";

import { readAssetFacts } from "../assetMeta";
import { DEFAULT_UPLOAD_PATH, SIBLING_CAP, foldersWithChildren } from "./shelf";

export interface ShelfProps {
  /** Switch the library to Styles, optionally landing on one. */
  onOpenStyles?: (themeId?: string) => void;
  /** How many plates are on the shelf, for the tab rail. This instance is the
   *  SEEDING one, so it is the first to know the real number. */
  onCount?: (n: number) => void;
}

export function useShelf({ onOpenStyles, onCount }: ShelfProps) {
  const { user } = useAuth();
  const { assets, error, loading, reload, remove, move, rename, renameFolder, addUploads } = useAssets(
    user?.uid ?? null,
  );
  /** Only to WRITE a forked style. The atelier owns reading and working them;
   *  this shelf needs `create` and nothing else. */
  const { create: createTheme } = useThemes(user?.uid ?? null);
  const announce = useAnnounce();
  const gridRef = useRef<HTMLDivElement>(null);

  const [selected, setSelected] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ x: number; y: number; asset: Asset } | null>(null);
  // The OPEN PLATE, held by id rather than by index. `shown` is recomputed from
  // the store on every removal and every folder change, so an index would keep
  // pointing at a position while the row under it changed identity — and would
  // survive its own asset being deleted, addressing whatever slid into the gap.
  // An id that is no longer in `shown` resolves to null below, which closes the
  // viewer: the one place it can be wrong is the one that self-corrects.
  const [openId, setOpenId] = useState<string | null>(null);
  /** The plates the move dialog is refiling. Held whole rather than by id: the
   *  dialog names them and reports where they came from, and it stays open
   *  across the move that changes both. */
  const [moving, setMoving] = useState<Asset[] | null>(null);
  /**
   * The multi-selection, and the tile a shift-range measures from.
   *
   * Scoped to the folder on screen and cleared when that changes. A selection
   * that survived navigation would let "Remove" delete plates the user cannot
   * see, which is the one thing a bulk destructive control must never be able
   * to do.
   */
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  /** The plate under the pointer during a drag. Kept in React state rather than
   *  read back off the DataTransfer, because `getData` is deliberately blocked
   *  during dragover — a drop target is not allowed to inspect the payload
   *  before the drop — and the rail needs to know a plate is in flight in order
   *  to offer itself at all. */
  const [dragging, setDragging] = useState<Asset | null>(null);
  /** The folder row under the pointer, owned here beside `dragging` so both end
   *  when the drag does — including the drag abandoned over the gallery, whose
   *  `dragend` the rail never sees. */
  const [dropOver, setDropOver] = useState<string | null>(null);
  /** A file drag from OUTSIDE the page is hovering the gallery. Distinct from
   *  `dragging`, which is a tile of ours in flight — the two must never light
   *  up at once, or the shelf offers to both refile and import one gesture. */
  const [fileOver, setFileOver] = useState(false);
  /** What an upload refused to take, named. Cleared by the next attempt. */
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  /** Every drag ends here, dropped or abandoned. */
  const endDrag = () => {
    setDragging(null);
    setDropOver(null);
  };

  const rows = useMemo(() => assets ?? [], [assets]);
  const tree = useMemo(() => buildTree(rows), [rows]);
  const shown = useMemo(() => assetsUnder(rows, selected), [rows, selected]);

  useEffect(() => {
    if (assets === null) return; // still reading — an unknown count is not 0
    onCount?.(rows.length);
  }, [onCount, assets, rows]);

  const openIndex = openId ? shown.findIndex((a) => a.id === openId) : -1;
  const openAsset = openIndex === -1 ? null : shown[openIndex];
  /** The selection intersected with what is actually on screen — the only form
   *  any action is allowed to read, so a row removed underneath cannot linger
   *  in a count or a delete. */
  const chosen = useMemo(() => shown.filter((a) => picked.has(a.id)), [shown, picked]);

  /**
   * Other plates from the open plate's style, drawn from the WHOLE shelf rather
   * than the folder on screen.
   *
   * That crossing is the point. The seed files a style's trials under
   * `presets/<style>` and its promoted proofs under `proofs/<style>`, so a
   * style is scattered across the tree by construction and no folder click can
   * gather it. The arrow keys stay bound to the folder; this is the other axis.
   *
   * Capped, because a style with a full sheet plus a trial run is dozens of
   * plates and this is a glance, not a second gallery.
   */
  const siblings = useMemo(() => {
    if (!openAsset) return [];
    const key = readAssetFacts(openAsset).styleKey;
    if (!key) return [];
    return rows
      .filter((a) => a.id !== openAsset.id && readAssetFacts(a).styleKey === key)
      .slice(0, SIBLING_CAP);
  }, [openAsset, rows]);

  const clearPicks = () => {
    setPicked(new Set());
    setAnchor(null);
  };

  /** Selecting a folder is navigation, and navigation drops the selection. */
  const selectFolder = (path: string[]) => {
    setSelected(path);
    clearPicks();
  };

  const togglePick = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setAnchor(id);
  };

  /** Shift-click: everything between the last tile touched and this one. Adds
   *  to the selection rather than replacing it, which is what makes two ranges
   *  in different parts of a long folder possible. */
  const pickRange = (id: string) => {
    const to = shown.findIndex((a) => a.id === id);
    const from = anchor ? shown.findIndex((a) => a.id === anchor) : -1;
    if (to === -1) return;
    if (from === -1) {
      togglePick(id);
      return;
    }
    const [lo, hi] = from <= to ? [from, to] : [to, from];
    setPicked((prev) => {
      const next = new Set(prev);
      for (let i = lo; i <= hi; i++) next.add(shown[i].id);
      return next;
    });
  };

  // Once, when the shelf first has a shape. The tree is empty on the first
  // render — assets load async — and re-seeding on every rebuild would reopen
  // a folder the moment after the user closed it.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || !tree.length) return;
    opened.current = true;
    setExpanded(new Set(foldersWithChildren(tree)));
  }, [tree]);

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  /**
   * Remove a tile, and do the two things a removal from a FOCUSED element owes.
   *
   * ContextMenu.tsx states the rule this file was breaking: "a dismissed menu
   * that leaves focus on <body> strands a keyboard user at the top of the
   * document". It applies just as hard here and harder — the menu's opener still
   * exists after it closes, whereas the tile a keyboard user just deleted does
   * not, so React unmounts the focused node and focus falls to <body> with no
   * way back into the grid. Same rule, two implementations, only one of which
   * had it.
   *
   * So: focus the next tile (the previous one when the last was removed, the
   * grid itself when the folder is now empty) and SAY what happened. The tile
   * vanishing is the only feedback a sighted user needs and the only feedback a
   * screen-reader user does not get.
   */
  const removeTile = (asset: Asset) => {
    const grid = gridRef.current;
    const tiles = grid ? [...grid.querySelectorAll<HTMLElement>("figure[tabindex]")] : [];
    const i = tiles.findIndex((t) => t.dataset.assetId === asset.id);
    // Resolve the successor BEFORE the removal: after it, the node is gone and
    // its position in the list with it.
    const next = i === -1 ? null : (tiles[i + 1] ?? tiles[i - 1] ?? null);
    void remove(asset.id);
    announce({ key: `asset-removed:${asset.id}`, text: `Removed ${asset.name} from the shelf.` });
    // After the commit that unmounts the tile, not before it.
    requestAnimationFrame(() => (next ?? grid)?.focus());
  };

  /**
   * Remove the plate the viewer is showing.
   *
   * Not `removeTile`: that resolves a successor tile to focus, and the tiles it
   * measures are behind an open dialog the user is not looking at. Closing
   * first means Modal tears down and hands focus back to its opener — the tile
   * being deleted, which is about to unmount — so the grid is focused after the
   * paint instead. The rAF is what makes that ordering true rather than lucky:
   * Modal restores focus synchronously during the unmount commit, and this runs
   * after it.
   */
  const removeFromViewer = (asset: Asset) => {
    setOpenId(null);
    void remove(asset.id);
    announce({ key: `asset-removed:${asset.id}`, text: `Removed ${asset.name} from the shelf.` });
    requestAnimationFrame(() => gridRef.current?.focus());
  };

  /**
   * Refile plates, and say where they went.
   *
   * The announcement is not decoration here the way it is beside a removal: the
   * only visible consequence of a move is that a tile leaves the folder on
   * screen, which from the shelf's own point of view is indistinguishable from
   * a deletion. Naming the destination is the difference between "it moved" and
   * "it is gone".
   */
  const refile = async (ids: string[], path: string[], label: string) => {
    const n = await move(ids, path);
    if (!n) return;
    announce({
      key: `assets-moved:${ids.join(",")}:${pathKey(path)}`,
      text: `Moved ${label} to ${path.join(" › ")}.`,
    });
  };

  /**
   * Remove every selected plate.
   *
   * One announcement for the lot, not one per row: the announcer keys off
   * transitions and a burst of thirty would be shed by its own queue bound
   * (lib/announcer.tsx), so the user would hear an arbitrary tail of what
   * happened instead of the fact that it happened.
   */
  const removeChosen = async () => {
    const doomed = chosen;
    if (!doomed.length) return;
    clearPicks();
    for (const a of doomed) await remove(a.id);
    announce({
      key: `assets-removed:${doomed.map((a) => a.id).join(",")}`,
      text:
        doomed.length === 1
          ? `Removed ${doomed[0].name} from the shelf.`
          : `Removed ${doomed.length} plates from the shelf.`,
    });
    requestAnimationFrame(() => gridRef.current?.focus());
  };

  /**
   * Rename a folder, which for a derived tree means refiling everything under
   * it. The announcement carries the COUNT, because that is the part a user
   * cannot see: the rail shows one row changing while up to thirty stored rows
   * were rewritten, and a rename that silently touched a subtree should say so.
   */
  const refolder = async (path: string[], name: string) => {
    const was = path[path.length - 1];
    const n = await renameFolder(path, name);
    if (!n) return;
    // The selection is addressed BY PATH, so a rename of the folder being
    // viewed would leave `selected` pointing at a name that no longer exists
    // and empty the gallery. Follow the rename instead.
    const renamed = path.map((seg, i) => (i === path.length - 1 ? name.trim() : seg));
    if (pathKey(selected).startsWith(pathKey(path))) {
      setSelected([...renamed, ...selected.slice(path.length)]);
    }
    announce({
      key: `folder-renamed:${pathKey(path)}:${name}`,
      text: `Renamed ${was} to ${name.trim()} — ${n} ${n === 1 ? "plate" : "plates"} refiled.`,
    });
  };

  /**
   * Fork a style off a plate.
   *
   * The block on a promoted plate is a COPY, taken at promotion time precisely
   * so it still describes what those pixels were made from after the style has
   * moved on (lib/assets.ts#assetFromProof). That is what makes this honest: the
   * fork starts from a recipe the user has already seen the output of, rather
   * than from a description they have to imagine.
   *
   * It starts as a draft with an empty proof sheet. Copying the source style's
   * proofs would be claiming this style has rendered things it has not.
   */
  const startStyleFrom = async (asset: Asset) => {
    const facts = readAssetFacts(asset);
    if (!facts.block) return;
    const root = asset.path[0];
    const made = await createTheme({
      name: facts.styleName ? `${facts.styleName} — from a plate` : asset.name,
      origin: "plate",
      // The shelf files a promoted plate under its style's discipline, so the
      // fork inherits it from where the plate actually sits. "shared" is not a
      // discipline and stays absent rather than being guessed at.
      discipline: DISCIPLINES.includes(root as Discipline) ? (root as Discipline) : undefined,
      block: facts.block,
      elements: [],
    });
    if (!made) return;
    setOpenId(null);
    announce({
      key: `style-from-plate:${asset.id}`,
      text: `Started ${made.name} from ${asset.name}. Opening Styles.`,
    });
    onOpenStyles?.(made.id);
  };

  /** Where an upload goes: the folder being looked at, or the shared default
   *  when the view is "all assets" and there is no folder to mean. */
  const uploadPath = selected.length ? selected : DEFAULT_UPLOAD_PATH;

  /**
   * Take files from the picker or from a drop.
   *
   * The rejected list is rendered rather than counted. "3 files were not added"
   * is not something a user can act on; the names and the reason are, and
   * dropping a folder where some entries are PDFs is the ordinary case rather
   * than the exceptional one.
   */
  const takeFiles = async (files: FileList | File[] | null) => {
    const list = files ? Array.from(files) : [];
    if (!list.length) return;
    const { added, rejected } = await addUploads(list, uploadPath);
    setUploadNote(rejected.length ? `Not added — ${rejected.join(" · ")}` : null);
    if (added)
      announce({
        key: `assets-added:${Date.now()}`,
        text: `Added ${added} ${added === 1 ? "reference" : "references"} to ${uploadPath.join(" › ")}.`,
      });
  };

  /** True only for a drag carrying FILES from outside the page — a tile of ours
   *  in flight is a refile, and the gallery must not offer to import it. */
  const isFileDrag = (e: React.DragEvent) =>
    !dragging && Array.from(e.dataTransfer.types).includes("Files");

  /** Walk the folder currently on screen. Wraps, because a gallery is a ring —
   *  and the alternative is an arrow key that silently does nothing at the ends
   *  with no edge on screen to explain why. */
  const step = (delta: 1 | -1) => {
    if (openIndex === -1 || shown.length < 2) return;
    setOpenId(shown[(openIndex + delta + shown.length) % shown.length].id);
  };

  return {
    user,
    assets,
    error,
    loading,
    reload,
    remove,
    move,
    rename,
    renameFolder,
    addUploads,
    createTheme,
    announce,
    gridRef,
    selected,
    setSelected,
    expanded,
    setExpanded,
    menu,
    setMenu,
    openId,
    setOpenId,
    moving,
    setMoving,
    picked,
    setPicked,
    anchor,
    setAnchor,
    dragging,
    setDragging,
    dropOver,
    setDropOver,
    fileOver,
    setFileOver,
    uploadNote,
    setUploadNote,
    fileInput,
    endDrag,
    rows,
    tree,
    shown,
    openIndex,
    openAsset,
    chosen,
    siblings,
    clearPicks,
    selectFolder,
    togglePick,
    pickRange,
    opened,
    toggle,
    removeTile,
    removeFromViewer,
    refile,
    removeChosen,
    refolder,
    startStyleFrom,
    uploadPath,
    takeFiles,
    isFileDrag,
    step,
  };
}

export type Shelf = ReturnType<typeof useShelf>;
