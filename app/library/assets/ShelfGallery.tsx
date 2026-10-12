"use client";

// THE GALLERY HALF — the grid, its toolbar, the drop frame and the empty state.
//
// Takes the shelf whole (useShelf.ts) rather than forty props. A prop list that
// long is a second copy of the hook's return type, and the two drift.

import { RotateCw, Search } from "lucide-react";

import { Pager } from "@/components/kit";
import { Keycaps } from "@/components/ui/signal";

import EmptyShelf from "./EmptyShelf";
import { PAGE, galleryState } from "./shelf";
import Tile from "./Tile";
import type { Shelf } from "./useShelf";

export default function ShelfGallery({
  shelf,
  onOpenStyles,
}: {
  shelf: Shelf;
  onOpenStyles?: (themeId?: string) => void;
}) {
  const {
    rows, shown, chosen, picked, selected, fileOver, uploadNote,
    gridRef, fileInput, error, reload, endDrag, setDragging, setFileOver,
    setMenu, setMoving, setOpenId, clearPicks, togglePick, pickRange,
    removeChosen, removeTile, takeFiles, isFileDrag,
    query, search, searchRef, win, draw, pickVisible,
  } = shelf;

  return (
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
        {/* THE ERROR, AND A WAY OUT OF IT. What used to follow `{error}` was a
            clause explaining that the shelf lives in this browser's storage —
            the app describing its own mechanism, on the one line where the user
            wants the machine's own words and a retry. The retry is the part that
            was missing. */}
        {error && (
          <div
            role="alert"
            className="mb-4 flex items-center gap-3 rounded-xl border border-rose-400/30 bg-rose-400/5 px-4 py-3"
          >
            <p className="min-w-0 flex-1 text-content text-rose-200">{error}</p>
            <button
              type="button"
              onClick={() => void reload()}
              aria-label="Read the shelf again"
              className="shrink-0 cursor-pointer rounded-full border border-rose-400/30 p-1.5 text-rose-200/80 transition hover:bg-rose-400/10 hover:text-rose-100"
            >
              <RotateCw className="h-4 w-4" aria-hidden />
            </button>
          </div>
        )}

        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-jetbrains text-content text-white/50">
            {selected.length ? selected.join(" › ") : "all assets"}
            <span className="text-white/30"> · {shown.length}</span>
          </p>
          {/* Only where there is a tile to bind. A keymap is reference material
              — wanted once, by the person looking for it, and furniture for
              everyone else — so it rides behind a glyph rather than across the
              top of the grid on every visit. The gestures it used to spell out
              are drawn instead: `cursor-zoom-in` on the tile says click-to-open,
              `cursor-grab` says draggable, and the tile's own aria-label says
              all three to a screen reader. */}
          <div className="flex items-center gap-3">
            {rows.length > 0 && (
              <label className="flex items-center gap-1.5 rounded-full border border-white/12 px-3 py-1 focus-within:border-cyan-400/50">
                <Search className="h-3.5 w-3.5 text-white/40" aria-hidden />
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  onChange={(e) => search(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape" && query) {
                      e.preventDefault();
                      search("");
                    }
                  }}
                  placeholder="name, style, brief"
                  aria-label="Search the shelf"
                  data-testid="assets-search"
                  className="font-jetbrains w-44 rounded-sm bg-transparent text-label text-white/85 outline-none placeholder:text-white/30 focus-visible:ring-1 focus-visible:ring-cyan-300/50"
                />
              </label>
            )}
            {shown.length > 0 && (
              <Keycaps
                label="Shelf shortcuts"
                map={[
                  { keys: ["/"], does: "search" },
                  { keys: ["Enter"], does: "open" },
                  { keys: ["X"], does: "select" },
                  { keys: ["Shift", "X"], does: "select a range" },
                  { keys: ["Delete"], does: "remove" },
                ]}
              />
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
              {chosen.length < win.visible.length && (
                <button
                  type="button"
                  onClick={pickVisible}
                  className="font-jetbrains cursor-pointer rounded-full px-3 py-1.5 text-label text-cyan-100/70 transition hover:text-cyan-50"
                >
                  Select all {win.visible.length}
                </button>
              )}
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

        {galleryState({ error, total: rows.length, shown: shown.length }) === "failed" ? null : shown.length === 0 ? (
          <EmptyShelf hasAny={rows.length > 0} query={query} onClearQuery={() => search("")} onOpenStyles={onOpenStyles} />
        ) : (
          <>
          <div ref={gridRef} tabIndex={-1} className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {/* THE WINDOW, NOT THE FOLDER. A folder of two hundred plates drew
                two hundred tiles, and every uploaded one had its bytes read
                and an object URL minted on arrival; now a page is drawn and
                only its uploads are read (useShelf#draw). The pager widens it,
                and on scroll by itself. */}
            {win.visible.map((a) => (
              <Tile
                key={a.id}
                asset={draw(a)}
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
          {win.total > PAGE && (
            <Pager shown={win.shown} total={win.total} onMore={win.more} onAll={win.all} step={PAGE} noun="plates" auto />
          )}
          </>
        )}
      </section>
  );
}
