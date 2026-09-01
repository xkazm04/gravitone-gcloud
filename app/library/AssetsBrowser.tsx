"use client";

// ASSETS — folders on the left, the gallery on the right.
//
// The shelf opens seeded with the trial grid: the thirty Nano Banana plates
// from the Bitcoin script, filed styles › presets › <preset>. They are the
// first genuinely reusable images this project has made, and an empty shelf
// would teach nothing about what a shelf is for.
//
// Removal is a right-click, as asked — and also the Delete key on a focused
// tile, because a destructive action reachable only by mouse is one a keyboard
// user cannot perform at all. It removes the SHELF ENTRY, not the file: assets
// are pointers, and the plate stays on disk for the trial report to keep
// reading. That distinction is stated in the UI, since "remove" is a word
// people reasonably read as "delete".

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";

import { Button } from "@/components/ui/Primitives";
import { useAnnounce } from "@/lib/announcer";
import { DISCIPLINES, type Discipline } from "@/lib/projects";
import { useAuth } from "@/lib/useAuth";
import { useAssets } from "@/lib/useAssets";
import { useThemes } from "@/lib/useThemes";
import { assetsUnder, buildTree, pathKey, type Asset, type FolderNode } from "@/lib/assets";

import { readAssetFacts } from "./assetMeta";

import AssetLightbox from "./AssetLightbox";
import ContextMenu from "./ContextMenu";
import FolderTree from "./FolderTree";
import MoveDialog from "./MoveDialog";

/** How many same-style plates the viewer offers at a glance. A style with a
 *  full proof sheet plus a trial run runs to dozens, and a strip that long is a
 *  second gallery rather than a sideways look at one. */
const SIBLING_CAP = 24;

/** Where an upload lands when the user is looking at "All assets" rather than a
 *  folder. Under the `shared` root beside the disciplines, because a file the
 *  user handed us is not educational or a trailer until they say so — and they
 *  can say so by dragging it somewhere else. */
const DEFAULT_UPLOAD_PATH = ["shared", "uploads"];

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
function foldersWithChildren(nodes: FolderNode[], into: string[] = []): string[] {
  for (const n of nodes)
    if (n.children.length) {
      into.push(pathKey(n.path));
      foldersWithChildren(n.children, into);
    }
  return into;
}

export default function AssetsBrowser({
  onOpenStyles,
}: {
  /** Switch the library to Styles, optionally landing on one. */
  onOpenStyles?: (themeId?: string) => void;
}) {
  const { user } = useAuth();
  const { assets, error, loading, remove, move, rename, renameFolder, addUploads } = useAssets(
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

  if (loading)
    return (
      <p className="font-jetbrains py-16 text-center text-content tracking-[0.18em] text-white/30 uppercase">
        reading the shelf…
      </p>
    );

  return (
    <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
      <aside>
        <p className="font-jetbrains mb-2 text-content tracking-[0.18em] text-white/40 uppercase">categories</p>
        <FolderTree
          nodes={tree}
          selected={selected}
          expanded={expanded}
          onSelect={selectFolder}
          onToggle={toggle}
          total={rows.length}
          dragActive={Boolean(dragging)}
          over={dropOver}
          onOver={setDropOver}
          onRenameFolder={(path, name) => void refolder(path, name)}
          onDropAsset={(path) => {
            const asset = dragging;
            endDrag();
            // Dropping a plate where it already lives is a gesture the user can
            // make by accident on the folder they are looking at, and it should
            // cost nothing and announce nothing.
            if (!asset || pathKey(asset.path) === pathKey(path)) return;
            void refile([asset.id], path, asset.name);
          }}
        />
      </aside>

      <section
        onDragOver={(e) => {
          if (!isFileDrag(e)) return;
          // Both halves matter: without preventDefault the drop never fires,
          // and the browser's default for a dropped image is to NAVIGATE to it,
          // throwing the user out of the app and losing nothing gracefully.
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          if (!fileOver) setFileOver(true);
        }}
        onDragLeave={(e) => {
          // Only when the pointer has actually left the section, not on the way
          // between two tiles inside it.
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFileOver(false);
        }}
        onDrop={(e) => {
          if (!isFileDrag(e)) return;
          e.preventDefault();
          setFileOver(false);
          void takeFiles(e.dataTransfer.files);
        }}
        className={
          fileOver ? "rounded-2xl outline-2 outline-offset-4 outline-dashed outline-cyan-400/60" : ""
        }
      >
        {error && (
          <p className="mb-4 rounded-xl border border-rose-400/30 bg-rose-400/5 px-4 py-3 text-content text-rose-200">
            {error} — your shelf lives in this browser&rsquo;s storage, and it did not answer.
          </p>
        )}

        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-jetbrains text-content text-white/50">
            {selected.length ? selected.join(" › ") : "all assets"}
            <span className="text-white/30"> · {shown.length}</span>
          </p>
          {/* Only where there is a tile to right-click. An instruction for an
              action nothing on screen affords is the same small dishonesty as
              a button that does nothing. */}
          <div className="flex items-center gap-3">
            {shown.length > 0 && (
              <p className="font-jetbrains text-label text-white/25">
                click to open · drag onto a folder to refile · ctrl-click or X to select ·
                right-click, or Delete on a focused tile, to remove
              </p>
            )}
            {/* A real control beside the drop zone. Dropping is the fast way and
                needs a mouse; this is the one a keyboard reaches, and it is the
                only way to discover the shelf takes files at all. */}
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="font-jetbrains shrink-0 cursor-pointer rounded-full border border-white/15 px-3.5 py-1.5 text-label text-white/80 transition hover:bg-white/5"
            >
              Add reference…
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                void takeFiles(e.target.files);
                // Cleared so choosing the SAME file twice fires change twice —
                // otherwise a user who removed a plate and re-added it would
                // press the button and watch nothing happen.
                e.target.value = "";
              }}
            />
          </div>
        </div>

        {uploadNote && (
          <p className="mb-3 rounded-xl border border-amber-400/25 bg-amber-400/5 px-3 py-2 text-label text-amber-200/90">
            {uploadNote}
          </p>
        )}

        {chosen.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-cyan-400/25 bg-cyan-400/[0.06] px-3 py-2">
            <p className="font-jetbrains text-label text-cyan-100">
              {chosen.length} selected
            </p>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMoving(chosen)}
                className="font-jetbrains cursor-pointer rounded-full border border-white/15 px-3.5 py-1.5 text-label text-white/80 transition hover:bg-white/5"
              >
                Move to folder…
              </button>
              <button
                type="button"
                onClick={() => void removeChosen()}
                className="font-jetbrains cursor-pointer rounded-full border border-rose-400/40 bg-rose-400/10 px-3.5 py-1.5 text-label text-rose-200 transition hover:bg-rose-400/20"
              >
                Remove
              </button>
              <button
                type="button"
                onClick={clearPicks}
                className="font-jetbrains cursor-pointer rounded-full px-3 py-1.5 text-label text-white/45 transition hover:text-white/80"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {shown.length === 0 ? (
          <EmptyShelf hasAny={rows.length > 0} onOpenStyles={onOpenStyles} />
        ) : (
          <div ref={gridRef} tabIndex={-1} className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {shown.map((a) => (
              <Tile
                key={a.id}
                asset={a}
                selected={picked.has(a.id)}
                onActivate={(mod) => {
                  if (mod === "toggle") togglePick(a.id);
                  else if (mod === "range") pickRange(a.id);
                  else setOpenId(a.id);
                }}
                onMenu={(x, y) => setMenu({ x, y, asset: a })}
                onDelete={() => removeTile(a)}
                onDragStart={() => setDragging(a)}
                onDragEnd={endDrag}
              />
            ))}
          </div>
        )}
      </section>

      {openAsset && (
        <AssetLightbox
          asset={openAsset}
          index={openIndex + 1}
          total={shown.length}
          onClose={() => setOpenId(null)}
          onStep={step}
          onRemove={() => removeFromViewer(openAsset)}
          siblings={siblings}
          // Jumping to a sibling takes its FOLDER with it. The viewer addresses
          // plates through `shown`, so landing on one filed elsewhere would put
          // it outside that list and close the dialog; following the plate into
          // its folder keeps the rail, the count and the arrow keys all
          // describing the same thing the user is looking at.
          onPickSibling={(s) => {
            setSelected(s.path);
            clearPicks();
            setOpenId(s.id);
          }}
          onStartStyle={
            readAssetFacts(openAsset).block ? () => void startStyleFrom(openAsset) : undefined
          }
          onRename={(name) => {
            void rename(openAsset.id, name).then((ok) => {
              if (ok)
                announce({
                  key: `asset-renamed:${openAsset.id}:${name}`,
                  text: `Renamed to ${name.trim()}.`,
                });
            });
          }}
        />
      )}

      {moving && moving.length > 0 && (
        <MoveDialog
          count={moving.length}
          subject={moving[0].name}
          // A common origin only when they genuinely share one. For a selection
          // spanning folders there is no "here" to refuse to move to, and
          // claiming one would disable the destination the user actually wants.
          from={commonPath(moving)}
          tree={tree}
          onClose={() => setMoving(null)}
          onMove={(path) => {
            const batch = moving;
            setMoving(null);
            clearPicks();
            void refile(
              batch.map((a) => a.id),
              path,
              batch.length === 1 ? batch[0].name : `${batch.length} plates`,
            );
          }}
        />
      )}

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            // Above the destructive one, and not only for the usual reason that
            // the safe act goes first: ContextMenu focuses its FIRST item on
            // open, so putting the removal there would put a keyboard user one
            // Enter away from deleting the plate they right-clicked.
            {
              label:
                picked.has(menu.asset.id) && chosen.length > 1
                  ? `Move ${chosen.length} to folder…`
                  : "Move to folder…",
              // Right-clicking INSIDE a selection acts on the selection;
              // right-clicking outside one acts on the tile under the pointer,
              // which is what every file manager does and what the user means.
              onSelect: () => setMoving(picked.has(menu.asset.id) ? chosen : [menu.asset]),
            },
            {
              label: "Remove from shelf",
              destructive: true,
              // Through removeTile, not remove: ContextMenu restores focus to its
              // opener only while that node is still in the document, and the
              // opener here is the tile being deleted. Both removal paths owe
              // the same focus move and the same announcement.
              onSelect: () => removeTile(menu.asset),
            },
          ]}
        />
      )}
    </div>
  );
}

/** The folder every one of them sits in, or none. Used to decide what "already
 *  here" means for a batch: a selection spanning folders has no single origin,
 *  and pretending otherwise disables a legitimate destination. */
function commonPath(assets: Asset[]): string[] {
  if (!assets.length) return [];
  const first = pathKey(assets[0].path);
  return assets.every((a) => pathKey(a.path) === first) ? assets[0].path : [];
}

/** What a press on a tile meant. The tile reports the gesture; the shelf owns
 *  what each one does, because only it knows the selection. */
type Activation = "open" | "toggle" | "range";

function Tile({
  asset,
  selected,
  onActivate,
  onMenu,
  onDelete,
  onDragStart,
  onDragEnd,
}: {
  asset: Asset;
  selected: boolean;
  onActivate: (mod: Activation) => void;
  onMenu: (x: number, y: number) => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const meta = (asset.meta ?? {}) as { styleName?: string; problem?: string; grade?: { hasText?: boolean } };
  return (
    <figure
      // role="button" over the <figure>: the element is now primarily something
      // you PRESS, and a focus stop that opens a dialog while announcing itself
      // as a figure tells a screen-reader user the one thing that is not true
      // about it. The tag stays a <figure> because removeTile finds its
      // successor with `figure[tabindex]` and because the caption is a real
      // figcaption — the role corrects the affordance, not the structure.
      role="button"
      tabIndex={0}
      data-asset-id={asset.id}
      // A focus stop that opens on one key and destroys on another has to say
      // so, or both bindings are discoverable only by pressing them and finding
      // out. The on-screen hint names them for sighted users; this is the same
      // sentence for everyone else.
      aria-label={`${asset.name}.${selected ? " Selected." : ""} Press Enter to open it, X to select it, Delete to remove it from the shelf.`}
      draggable
      onDragStart={(e) => {
        // A text payload so the drag is legible to anything outside this rail;
        // the rail itself works off React state, since a drop target may not
        // read the DataTransfer before the drop.
        e.dataTransfer.setData("text/plain", asset.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      // Modifier-click selects, plain click opens. The gesture is reported and
      // not interpreted here: whether a range is even possible depends on the
      // selection, which lives one level up.
      onClick={(e) => onActivate(e.ctrlKey || e.metaKey ? "toggle" : e.shiftKey ? "range" : "open")}
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu(e.clientX, e.clientY);
      }}
      onKeyDown={(e) => {
        // Delete ONLY. Backspace used to remove the tile too, and it is the
        // wrong key for an irreversible act: it is the browser's back key by
        // muscle memory and the correction key by reflex, so a stray press on a
        // focused tile destroyed a shelf entry permanently - re-seeding is gated
        // by a localStorage mark that survives deletion on purpose
        // (useAssets.ts), so nothing brings a removed seed back.
        if (e.key === "Delete") {
          e.preventDefault();
          onDelete();
        }
        // What role="button" now promises. Space is preventDefault-ed for the
        // reason every hand-rolled button is: on a scrollable page it pages
        // down, and a tile that opens AND scrolls the gallery out from under
        // the dialog is two things happening for one keypress.
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate("open");
        }
        // Ctrl-click has no keyboard equivalent, so selecting gets a key of its
        // own — the single-letter grammar the foundry lightbox already uses. A
        // selection reachable only by mouse would make every bulk action on
        // this shelf mouse-only.
        if (e.key === "x" || e.key === "X") {
          e.preventDefault();
          onActivate(e.shiftKey ? "range" : "toggle");
        }
      }}
      className={`group cursor-pointer overflow-hidden rounded-xl border transition ${
        selected
          ? "border-cyan-400/70 ring-1 ring-cyan-300/40"
          : "border-white/8 hover:border-cyan-400/35 focus:border-cyan-400/50"
      }`}
    >
      <span className="relative block aspect-video w-full bg-white/[0.03]">
        {/* draggable={false} so the FIGURE is what gets dragged. An <img> is
            natively draggable, and left alone it wins the gesture and hands the
            drop target an image URL instead of letting the tile above it
            declare an asset id. */}
        <Image
          src={asset.src}
          alt={asset.name}
          fill
          draggable={false}
          sizes="(min-width:1280px) 22vw, 45vw"
          className="object-cover"
        />
        {/* Text leakage is the one defect that makes a plate unusable, so the
            shelf says so on the tile rather than burying it in a detail view. */}
        {meta.grade?.hasText && (
          <span className="font-jetbrains absolute top-1.5 right-1.5 rounded bg-amber-300/90 px-1.5 py-0.5 text-label font-semibold text-slate-950">
            TEXT
          </span>
        )}
      </span>
      <figcaption className="px-2.5 py-2">
        <span className="font-hanken block truncate text-content text-white/85">{asset.name}</span>
        <span className="font-jetbrains block truncate text-label text-white/35">
          {meta.styleName ?? asset.path.at(-1)}
          {meta.problem && ` · ${meta.problem}`}
        </span>
      </figcaption>
    </figure>
  );
}

/**
 * The empty shelf used to read "Run pipeline/build-style-trials.mts, then
 * reload" — a terminal instruction given to somebody standing in a browser, for
 * a script most people looking at this screen cannot run and none of them asked
 * about. It named the mechanism that happens to fill the shelf instead of the
 * act that fills it, which is the one thing an empty state exists to say.
 *
 * What actually puts an asset here is approving a plate on a style's proof
 * sheet and keeping it on the shelf. That is a thing the user can do, from one
 * tab away, so the state says so and offers the tab.
 */
function EmptyShelf({ hasAny, onOpenStyles }: { hasAny: boolean; onOpenStyles?: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 px-6 py-14 text-center">
      <p className="font-instrument text-2xl text-white">
        {hasAny ? "Nothing in this folder" : "The shelf is empty"}
      </p>
      <p className="font-hanken mx-auto mt-2 max-w-sm text-content leading-snug text-slate-400">
        {hasAny
          ? "Pick another category on the left, or drop a file here to add one."
          : "Assets are the images a project can reach for again. The shelf fills two ways: render trials on a style and keep the ones that hold — they file themselves under the style that made them — or drop your own reference here."}
      </p>
      {!hasAny && onOpenStyles && (
        <Button variant="ghost" onClick={onOpenStyles} className="mt-5">
          open Styles
        </Button>
      )}
    </div>
  );
}
