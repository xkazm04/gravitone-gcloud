"use client";

// THE THREE THINGS THAT OPEN OVER THE SHELF — the plate viewer, the move
// dialog, and the right-click menu. None of them is the shelf; all of them are
// addressed by it.

import AssetLightbox from "../AssetLightbox";
import ContextMenu from "../ContextMenu";
import MoveDialog from "../MoveDialog";
import { readAssetFacts } from "../assetMeta";
import { commonPath } from "./shelf";
import type { Shelf } from "./useShelf";

export default function ShelfDialogs({ shelf }: { shelf: Shelf }) {
  const {
    openAsset, openIndex, shown, moving, menu, tree, picked, chosen, announce,
    setOpenId, setSelected, setMoving, setMenu, clearPicks, step, refile,
    removeFromViewer, startStyleFrom, siblings, rename, removeTile,
  } = shelf;

  return (
    <>
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
                  ? `Move ${chosen.length} to folderâ€¦`
                  : "Move to folderâ€¦",
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
    </>
  );
}
