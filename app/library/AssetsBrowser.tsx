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
import { useAuth } from "@/lib/useAuth";
import { useAssets } from "@/lib/useAssets";
import { assetsUnder, buildTree, pathKey, type Asset, type FolderNode } from "@/lib/assets";

import ContextMenu from "./ContextMenu";
import FolderTree from "./FolderTree";

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

export default function AssetsBrowser({ onOpenStyles }: { onOpenStyles?: () => void }) {
  const { user } = useAuth();
  const { assets, error, loading, remove } = useAssets(user?.uid ?? null);

  const [selected, setSelected] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ x: number; y: number; asset: Asset } | null>(null);

  const rows = useMemo(() => assets ?? [], [assets]);
  const tree = useMemo(() => buildTree(rows), [rows]);
  const shown = useMemo(() => assetsUnder(rows, selected), [rows, selected]);

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

  if (loading)
    return (
      <p className="font-jetbrains py-16 text-center text-[12px] tracking-[0.18em] text-white/30 uppercase">
        reading the shelf…
      </p>
    );

  return (
    <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
      <aside>
        <p className="font-jetbrains mb-2 text-[11px] tracking-[0.18em] text-white/40 uppercase">categories</p>
        <FolderTree
          nodes={tree}
          selected={selected}
          expanded={expanded}
          onSelect={setSelected}
          onToggle={toggle}
          total={rows.length}
        />
      </aside>

      <section>
        {error && (
          <p className="mb-4 rounded-xl border border-rose-400/30 bg-rose-400/5 px-4 py-3 text-sm text-rose-200">
            {error} — your shelf lives in this browser&rsquo;s storage, and it did not answer.
          </p>
        )}

        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-jetbrains text-[12px] text-white/50">
            {selected.length ? selected.join(" › ") : "all assets"}
            <span className="text-white/30"> · {shown.length}</span>
          </p>
          {/* Only where there is a tile to right-click. An instruction for an
              action nothing on screen affords is the same small dishonesty as
              a button that does nothing. */}
          {shown.length > 0 && (
            <p className="font-jetbrains text-[10px] text-white/25">right-click a tile to remove it</p>
          )}
        </div>

        {shown.length === 0 ? (
          <EmptyShelf hasAny={rows.length > 0} onOpenStyles={onOpenStyles} />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {shown.map((a) => (
              <Tile
                key={a.id}
                asset={a}
                onMenu={(x, y) => setMenu({ x, y, asset: a })}
                onDelete={() => void remove(a.id)}
              />
            ))}
          </div>
        )}
      </section>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            {
              label: "Remove from shelf",
              destructive: true,
              onSelect: () => void remove(menu.asset.id),
            },
          ]}
        />
      )}
    </div>
  );
}

function Tile({
  asset,
  onMenu,
  onDelete,
}: {
  asset: Asset;
  onMenu: (x: number, y: number) => void;
  onDelete: () => void;
}) {
  const meta = (asset.meta ?? {}) as { styleName?: string; problem?: string; grade?: { hasText?: boolean } };
  return (
    <figure
      tabIndex={0}
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu(e.clientX, e.clientY);
      }}
      onKeyDown={(e) => {
        if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          onDelete();
        }
      }}
      className="group overflow-hidden rounded-xl border border-white/8 transition hover:border-cyan-400/35 focus:border-cyan-400/50 focus:outline-none"
    >
      <span className="relative block aspect-video w-full bg-white/[0.03]">
        <Image src={asset.src} alt={asset.name} fill sizes="(min-width:1280px) 22vw, 45vw" className="object-cover" />
        {/* Text leakage is the one defect that makes a plate unusable, so the
            shelf says so on the tile rather than burying it in a detail view. */}
        {meta.grade?.hasText && (
          <span className="font-jetbrains absolute top-1.5 right-1.5 rounded bg-amber-300/90 px-1.5 py-0.5 text-[9px] font-semibold text-slate-950">
            TEXT
          </span>
        )}
      </span>
      <figcaption className="px-2.5 py-2">
        <span className="font-hanken block truncate text-[13px] text-white/85">{asset.name}</span>
        <span className="font-jetbrains block truncate text-[10px] text-white/35">
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
      <p className="font-hanken mx-auto mt-2 max-w-sm text-sm leading-snug text-slate-400">
        {hasAny
          ? "Pick another category on the left."
          : "Assets are the images a project can reach for again. The shelf fills from Styles: render trials on a style, approve the ones that hold, and keep them here — they file themselves under the style that made them."}
      </p>
      {!hasAny && onOpenStyles && (
        <Button variant="ghost" onClick={onOpenStyles} className="mt-5">
          open Styles
        </Button>
      )}
    </div>
  );
}
