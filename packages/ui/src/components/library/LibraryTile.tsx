// One Library item in the grid (library.js `make`, grid branch; library.css `.tile`, `.th`,
// `.cap`): its face, its kind's mark in the corner, a reference's REF mark, a locked style's
// lock, its state as a dot, the attention chip when its media cannot show, title and meta.
//
// An OPTION of the results listbox (the prototype's role="option" with aria-selected): the
// listbox owns focus and the arrow keys (the `library` keymap), so a tile is never a tab stop
// of its own - 5,000 tab stops is not a keyboard path. Its accessible name says what the
// sighted reader gets from the face and the dot: title, kind, state, and the trouble if any.
//
// Dropped from the prototype: the play button on an audio tile. A button inside an option is a
// control inside a control (the option cannot be both the selection and a play key), and the
// detail's preview plays the take (L52's AudioPreview) one ⏎ away.

import type { Attention, LibraryKindName } from "@gt/domain/library";

import type { ReactNode } from "react";

import { cx } from "../cx.ts";
import { vars } from "../vars.ts";
import { FloorGlyph } from "../floor/FloorGlyph.tsx";
import { FaceView, type Face } from "./Face.tsx";
import { LibraryGlyph, kindShort } from "./LibraryGlyph.tsx";
import { SIZES, tileBox, type Density, type LibrarySource, type LibraryState } from "./library.ts";
import s from "./LibraryTile.module.css";

/** What the grid and the list draw for an item: the port's row, as presentation. */
export type LibraryCard = {
  readonly id: string;
  readonly kind: LibraryKindName;
  readonly title: string;
  readonly meta: string;
  readonly state: LibraryState;
  readonly source: LibrarySource;
  /** `2026-08-27`, or null when the item carries no date (a registry topic). */
  readonly date: string | null;
  readonly face: Face;
  readonly attention?: Attention;
  /** A locked style: its block can no longer change. */
  readonly locked?: boolean;
  /** Up to three facet values the list row shows beside the kind (library.js `CHIPKEYS`). */
  readonly chips: readonly string[];
};

export const ATTENTION_LABEL: { readonly [A in Attention]: string } = { unreadable: "media unreadable", missing: "media missing" };

/** The option's name: what the face and the dot say, in words. */
export function cardName(c: LibraryCard): string {
  return [c.title, kindShort(c.kind), c.state, ...(c.attention === undefined ? [] : [ATTENTION_LABEL[c.attention]])].join(", ");
}

export type LibraryTileProps = {
  readonly card: LibraryCard;
  readonly selected: boolean;
  /** The DOM id aria-activedescendant points at. */
  readonly domId: string;
  readonly onSelect: () => void;
  readonly onOpen: () => void;
};

export function LibraryTile({ card, selected, domId, onSelect, onOpen }: LibraryTileProps) {
  return (
    <div
      id={domId}
      role="option"
      aria-selected={selected}
      aria-label={cardName(card)}
      data-id={card.id}
      data-kind={card.kind}
      className={cx(s.tile, selected && s.on)}
      onClick={onSelect}
      onDoubleClick={onOpen}
    >
      <div className={s.thumb}>
        <FaceView face={card.face} size="tile" />
        <span className={s.kind} aria-hidden="true">
          <LibraryGlyph name={card.kind} className={s.kindMark} />
        </span>
        {card.kind === "image" && card.state === "reference" && (
          <span className={s.ref} aria-hidden="true">
            ref
          </span>
        )}
        {card.locked === true && <FloorGlyph name="lock" className={s.lock} />}
        <span className={cx(s.dot, s[card.state])} aria-hidden="true" />
        {card.attention !== undefined && (
          <span className={s.trouble} aria-hidden="true">
            {ATTENTION_LABEL[card.attention]}
          </span>
        )}
      </div>
      <div className={s.cap}>
        <span className={s.title}>{card.title}</span>
        <span className={s.meta}>{card.meta}</span>
      </div>
    </div>
  );
}

/** A tile whose row has not arrived yet: the box, so the grid never jumps when it lands. */
export function TileSlot() {
  return <div className={cx(s.tile, s.slot)} aria-hidden="true" />;
}

/**
 * The grid around the tiles the window holds: columns and thumb height from `tileBox` for the
 * measured width, the window's spacers above and below (`padTop`, `padBottom`).
 */
export function TileGrid({ width, density, padTop, padBottom, children }: { readonly width: number; readonly density: Density; readonly padTop: number; readonly padBottom: number; readonly children: ReactNode }) {
  const box = tileBox(width, density);
  const z = SIZES[density];
  return (
    <div
      className={s.grid}
      role="presentation"
      data-density={density}
      style={{ ...vars({ "--cols": box.columns, "--thumb": `${box.thumb}px`, "--tile-h": `${box.height}px`, "--gap": `${z.gap}px` }), paddingTop: padTop, paddingBottom: padBottom }}
    >
      {children}
    </div>
  );
}
