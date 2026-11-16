// One labelled cell of the desk's forms: a caps label over its control, and an edge in the
// severity of the worst problem the field owns (rose blocks, amber warns).
import type { ReactNode } from "react";

import { Glyph } from "@gt/ui/components/glyph/Glyph.tsx";

import s from "./desk.module.css";

export type CellProps = {
  readonly label: string;
  readonly mark?: "block" | "warn" | undefined;
  /** Columns the cell spans in its grid. */
  readonly span?: 1 | 2 | 3 | 4;
  readonly children: ReactNode;
};

export function Cell({ label, mark, span = 1, children }: CellProps) {
  return (
    <div className={s.cell} data-mark={mark} data-span={span}>
      <span className={s.cellLabel} aria-hidden="true">
        {label}
      </span>
      {children}
    </div>
  );
}

/** A glyph-only row control (move up, move down, remove): its name says the verb and the object. */
export function Mini({ glyph, name, off = false, onPress }: { readonly glyph: "up" | "down" | "x"; readonly name: string; readonly off?: boolean; readonly onPress: () => void }) {
  return (
    <button type="button" className={s.mini} aria-label={name} aria-disabled={off ? true : undefined} onClick={off ? undefined : onPress}>
      {glyph === "x" ? <span aria-hidden="true">×</span> : <Glyph name={glyph} className={s.miniGlyph} />}
    </button>
  );
}
