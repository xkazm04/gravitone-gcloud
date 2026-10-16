// One Library item in the list (library.js `make`, list branch; library.css `.lrow`, `.lcols`):
// thumb, name, kind, up to three facet values, state, date, source. The column head shares the
// row's track list, so a head and its rows cannot disagree about where a column starts. Below
// 1360px the source column goes, below 1100px the facets too (the prototype's two steps).
//
// An option of the results listbox, like the tile (LibraryTile.tsx says why it is not a tab stop).

import type { ReactNode } from "react";

import { cx } from "../cx.ts";
import { Chip } from "../chip/Chip.tsx";
import { SourceTag } from "../source/SourceTag.tsx";
import { StatusPill } from "../status/StatusPill.tsx";
import { FaceView } from "./Face.tsx";
import { LibraryGlyph, kindShort } from "./LibraryGlyph.tsx";
import type { Density } from "./library.ts";
import { ATTENTION_LABEL, cardName, type LibraryCard } from "./LibraryTile.tsx";
import s from "./LibraryRow.module.css";

export type LibraryRowProps = {
  readonly card: LibraryCard;
  readonly selected: boolean;
  readonly domId: string;
  readonly onSelect: () => void;
  readonly onOpen: () => void;
};

export function LibraryRow({ card, selected, domId, onSelect, onOpen }: LibraryRowProps) {
  return (
    <div
      id={domId}
      role="option"
      aria-selected={selected}
      aria-label={cardName(card)}
      data-id={card.id}
      data-kind={card.kind}
      className={cx(s.row, selected && s.on)}
      onClick={onSelect}
      onDoubleClick={onOpen}
    >
      <span className={s.thumb} aria-hidden="true">
        <FaceView face={card.face} size="row" />
      </span>
      <span className={s.name}>
        <span className={s.title}>{card.title}</span>
        {card.attention !== undefined && <Chip label={ATTENTION_LABEL[card.attention]} tone="rose" casing="lower" />}
      </span>
      <span className={s.kind} aria-hidden="true">
        <LibraryGlyph name={card.kind} className={s.kindMark} />
        <span className={s.ell}>{kindShort(card.kind)}</span>
      </span>
      <span className={s.facets} aria-hidden="true">
        {card.chips.slice(0, 3).map((c) => (
          <Chip key={c} label={c} casing="lower" />
        ))}
      </span>
      <span aria-hidden="true">
        <StatusPill machine="library" state={card.state} />
      </span>
      <span className={s.date} aria-hidden="true">
        {card.date ?? "—"}
      </span>
      <span className={s.src} aria-hidden="true">
        <SourceTag kind={card.source} />
      </span>
    </div>
  );
}

/** The list's column head: the row's tracks, in caps. Decorative - each row's name says it all. */
export function LibraryColumns() {
  return (
    <div className={s.cols} aria-hidden="true">
      <span />
      <span>name</span>
      <span>kind</span>
      <span className={s.facets}>facets</span>
      <span>state</span>
      <span>date</span>
      <span className={s.src}>src</span>
    </div>
  );
}

/** The list around the rows the window holds: the density's row height and thumb column. */
export function RowList({ density, padTop, padBottom, children }: { readonly density: Density; readonly padTop: number; readonly padBottom: number; readonly children: ReactNode }) {
  return (
    <div className={s.list} role="presentation" data-density={density} style={{ paddingTop: padTop, paddingBottom: padBottom }}>
      {children}
    </div>
  );
}

/** The column head, carrying the list's density so its thumb column matches the rows. */
export function ColumnsHead({ density }: { readonly density: Density }) {
  return (
    <div className={s.list} data-density={density}>
      <LibraryColumns />
    </div>
  );
}
