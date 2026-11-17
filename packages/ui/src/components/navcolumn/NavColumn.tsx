// A ROUTE'S LEFT COLUMN (design baseline P4, 2026-11-17; owner: "Library has visibly clearer nav sidebar we should
// follow"): the one material every route's own column stands on - beside the spine, full height, glass, a caps
// head with its count (the Library's "LIBRARY 5,000"), an optional toolbar, a body that scrolls. The audio desk's
// rooms (app/(studio)/_shell/ContextColumn.tsx), the Library's vocabulary rail, the Ledger's facets and the
// Projects' compositions all stand in it, so the four read as one app.
//
// The rows a column lists are the caller's: a link is next/link's, which @gt/ui does not import, so the row's
// shape is exported as classes (`navRow`) - the Library rail's kind row (../library/Rail.module.css `.kind`): a
// mark, a capitalised word, a mono count at the end, the current one lit cyan with an inset bar.
import type { ReactNode } from "react";

import { CapsHeading } from "../heading/CapsHeading.tsx";
import { Tally, type TallyProps } from "../tally/Tally.tsx";
import { cx } from "../cx.ts";
import s from "./NavColumn.module.css";

export { s as navRow };

export type NavColumnProps = {
  readonly title: string;
  readonly tally?: TallyProps;
  /** The column's accessible name (its landmark); the title when absent. */
  readonly label?: string;
  /** Controls under the head: a Seg, a search field, a button. */
  readonly toolbar?: ReactNode;
  /** Width and placement are the caller's (a grid cell, or the context column's own width). */
  readonly className?: string;
  /** "nav" for a column of places, "aside" for one of filters or a list. */
  readonly as?: "nav" | "aside";
  readonly id?: string;
  /** `data-component`: the caller's own name for the column (tests and the dev inspector find it by it). */
  readonly component?: string;
  readonly children: ReactNode;
};

export function NavColumn({ title, tally, label, toolbar, className, as = "aside", id, component = "NavColumn", children }: NavColumnProps) {
  const Root = as;
  return (
    <Root className={cx(s.column, className)} aria-label={label ?? title} data-component={component} {...(id !== undefined ? { id } : {})}>
      <h2 className={s.head}>
        {title}
        {tally !== undefined && <Tally {...tally} />}
      </h2>
      {toolbar !== undefined && <div className={s.toolbar}>{toolbar}</div>}
      <div className={s.body}>{children}</div>
    </Root>
  );
}

/** A group of rows under a caps heading (the Library's KIND / STATE); no heading for the column's first rows. */
export function NavGroup({ label, children }: { readonly label?: string; readonly children: ReactNode }) {
  return (
    <div className={s.group}>
      {label !== undefined && (
        <div className={s.groupHead}>
          <CapsHeading text={label} />
        </div>
      )}
      <ul className={s.rows}>{children}</ul>
    </div>
  );
}
