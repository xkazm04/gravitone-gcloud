// A section that opens on demand (library.js facet group; v1 signal/Fold.tsx).
//
// Kept from v1: the button sits in a heading with aria-expanded and aria-controls; the body
// is not rendered until the first open, then stays mounted and `hidden`, so a closed fold
// over a long list costs its head and a half-typed field survives a close. A title of one
// to four words, its counts as numbers beside it - no `sub`, no `description`: a Fold is not
// where narration goes to hide.
// Changed: open-state is the caller's (controlled). v1 remembered it through useRemembered;
// here the caller holds it in the storage adapter (`@gt/ui/storage`) when it should persist.
import { useId, useState, type ReactNode } from "react";
import { SrOnly } from "../a11y/SrOnly.tsx";
import { Glyph } from "../glyph/Glyph.tsx";
import s from "./Fold.module.css";

export type FoldProps = {
  readonly title: string;
  readonly open: boolean;
  readonly onToggle: (next: boolean) => void;
  /** Values selected in this group: the cyan count. */
  readonly active?: number;
  /** Values the group holds. */
  readonly total?: number;
  readonly level?: 2 | 3 | 4;
  readonly children: ReactNode;
};

export function Fold({ title, open, onToggle, active, total, level = 3, children }: FoldProps) {
  const id = useId();
  const [seen, setSeen] = useState(open);
  if (open && !seen) setSeen(true);
  const H = level === 2 ? "h2" : level === 4 ? "h4" : "h3";
  return (
    <div className={s.fold}>
      <H>
        <button type="button" className={s.head} aria-expanded={open} aria-controls={id} onClick={() => onToggle(!open)}>
          <Glyph name="down" className={s.chev} />
          {title}
          {active !== undefined && active > 0 && (
            <>
              <span className={s.active} aria-hidden="true">
                {active}
              </span>
              <SrOnly text={`, ${active} selected`} />
            </>
          )}
          {total !== undefined && (
            <>
              <span className={s.total} aria-hidden="true">
                {total}
              </span>
              <SrOnly text={`, ${total} values`} />
            </>
          )}
        </button>
      </H>
      <div id={id} hidden={!open}>
        {seen ? children : null}
      </div>
    </div>
  );
}
