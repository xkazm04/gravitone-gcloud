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
//
// THE FILE IS A COMPOSITION NOW. It was 872 lines and did four jobs at once;
// the parts live under ./assets/ and this is what holds them together:
//
//   useShelf.ts       every piece of state and every verb that changes it
//   ShelfGallery.tsx  the grid, its toolbar, the drop frame, the empty state
//   ShelfDialogs.tsx  the plate viewer, the move dialog, the right-click menu
//   Tile.tsx          one plate
//   shelf.ts          the folder maths, with no React in it
//
// The split runs along the one seam that cuts no dependency: state on one side,
// markup on the other. Both render halves take the shelf object WHOLE rather
// than a prop list, because a prop list that long is a second copy of the
// hook's return type and the two drift apart within a month.

import FolderTree from "./FolderTree";
import ShelfDialogs from "./assets/ShelfDialogs";
import ShelfGallery from "./assets/ShelfGallery";
import { useShelf, type ShelfProps } from "./assets/useShelf";
import { pathKey } from "@/lib/assets";

export default function AssetsBrowser({ onOpenStyles, onCount }: ShelfProps) {
  const shelf = useShelf({ onOpenStyles, onCount });
  const { loading, rows, tree, selected, expanded, toggle, selectFolder,
    dragging, dropOver, setDropOver, endDrag, refile, refolder } = shelf;

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


      <ShelfGallery shelf={shelf} onOpenStyles={onOpenStyles} />
      <ShelfDialogs shelf={shelf} />
    </div>
  );
}
