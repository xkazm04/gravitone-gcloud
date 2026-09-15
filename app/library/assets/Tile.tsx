"use client";

// ONE PLATE ON THE SHELF — the draggable, selectable, openable tile.

import Image from "next/image";

import type { Asset } from "@/lib/assets";
import type { Activation } from "./shelf";

export default function Tile({
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
      // The gestures the keymap line used to spell out, drawn: zoom-in says a
      // click opens the plate, grabbing says the tile is the thing that drags.
      className={`group cursor-zoom-in overflow-hidden rounded-xl border transition active:cursor-grabbing ${
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

