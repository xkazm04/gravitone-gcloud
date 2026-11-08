"use client";

// ONE LINE OF THE SHEET: its term in the left gutter, the value beside it, on the same baseline - a session sheet's
// "style: ...", not a label stacked over a box. A line not reached yet is one word: what it waits on.
import type { ReactNode } from "react";

import { Chip } from "@gt/ui/components/chip/Chip.tsx";

import s from "./sheet.module.css";

export function Line({ term, aside, children, tone }: { readonly term: string; readonly aside?: ReactNode; readonly children: ReactNode; readonly tone?: "rule" }) {
  return (
    <div className={tone === "rule" ? `${s.line} ${s.ruled}` : s.line} role="group" aria-label={term}>
      <div className={s.term}>
        <span className={s.termWord}>{term}</span>
        {aside}
      </div>
      <div className={s.val}>{children}</div>
    </div>
  );
}

/** A step not reached: its line says what it waits on, in one word. */
export function Waits({ term, on }: { readonly term: string; readonly on: string }) {
  return (
    <Line term={term}>
      <Chip label="waits" value={on} casing="lower" ghost name={`${term} waits on ${on}`} />
    </Line>
  );
}
