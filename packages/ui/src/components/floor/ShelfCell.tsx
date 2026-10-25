// A lane's Library/Projects cell (prototype index.html `Shelf`, `ShelfStyle`, `TakeRow`,
// `ProjectRow`; floor.css `[data-component=ShelfCell]`, `.shelf-head`, `.styles-grid`, `.list`,
// `.row-btn`): what the lane has ratified. A head - the shelf's name (a door to where the whole
// shelf lives, when it has one) and its counts - then the shelf's tiles or rows.
//
// An empty shelf is its head alone (the prototype's `.folded`): a count of zero is the fact,
// and a placeholder under it would be a picture of nothing.
//
// The tiles and rows are read-only here: the prototype's play and Spawn MV controls write to
// stores the Floor does not own, so they are not drawn (a dead control is a lie).

import type { ReactNode } from "react";

import { cx } from "../cx.ts";
import { Tally, type TallyProps } from "../tally/Tally.tsx";
import { FloorGlyph } from "./FloorGlyph.tsx";
import s from "./ShelfCell.module.css";

export type ShelfCellProps = {
  readonly title: string;
  readonly href?: string;
  readonly tallies?: readonly TallyProps[];
  /** Chips or links after the counts. */
  readonly extra?: ReactNode;
  readonly children?: ReactNode;
};

export function ShelfCell({ title, href, tallies = [], extra, children }: ShelfCellProps) {
  return (
    <div className={s.cell} data-component="ShelfCell">
      <div className={s.head}>
        {href === undefined ? (
          <span className={s.t}>{title}</span>
        ) : (
          <a className={cx(s.t, s.door)} href={href}>
            {title} <span aria-hidden="true">›</span>
          </a>
        )}
        {tallies.map((t) => (
          <Tally key={`${t.label ?? ""}:${t.value}`} {...t} />
        ))}
        {extra}
      </div>
      {children}
    </div>
  );
}

/** The styles grid: locked or proven style tiles. */
export function ShelfGrid({ children }: { readonly children: ReactNode }) {
  return <div className={s.grid}>{children}</div>;
}

/**
 * One ratified style: its plate (the shelf's row brings one when the style has a kept plate;
 * app/(studio)/floor/_floor/shelf.ts ShelfStyleRow), else a bare ground, its lock, its name.
 */
export function ShelfStyle({ name, href, plate }: { readonly name: string; readonly href?: string; readonly plate?: string }) {
  const body = (
    <>
      {plate === undefined ? (
        <span className={cx(s.hero, s.noHero)} aria-hidden="true" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- a style is shown as its own plate's bytes (desk/Plate.tsx, library/Face.tsx)
        <img className={s.hero} src={plate} alt={name} loading="lazy" />
      )}
      <span className={s.lock} aria-hidden="true">
        <FloorGlyph name="lock" className={s.lockMark} />
      </span>
      <span className={s.nm}>{name}</span>
    </>
  );
  return href === undefined ? (
    <span className={s.style} data-component="ShelfStyle">
      {body}
    </span>
  ) : (
    <a className={cx(s.style, s.door)} data-component="ShelfStyle" href={href}>
      {body}
    </a>
  );
}

/** The rows of a list shelf (posts, kept takes). */
export function ShelfList({ children }: { readonly children: ReactNode }) {
  return <div className={s.list}>{children}</div>;
}

/** One row: a lead mark, the title (with a trailing fact), and a trailing chip. */
export function ShelfRow({ lead, title, fact, trail, href }: { readonly lead: ReactNode; readonly title: string; readonly fact?: string; readonly trail?: ReactNode; readonly href?: string }) {
  const body = (
    <>
      <span className={s.lead}>{lead}</span>
      <span className={s.rowTitle}>
        {title}
        {fact !== undefined && <span className={s.fact}> {fact}</span>}
      </span>
      {trail ?? <span />}
    </>
  );
  return href === undefined ? (
    <div className={s.row}>{body}</div>
  ) : (
    <a className={cx(s.row, s.door)} href={href}>
      {body}
    </a>
  );
}
