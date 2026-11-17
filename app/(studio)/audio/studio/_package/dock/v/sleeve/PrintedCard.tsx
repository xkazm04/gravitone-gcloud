"use client";

// THE PRINTED CARD (direction "sleeve"): every detail of the liner notes opens as a card pulled from the inner sleeve -
// the prototype's one Dialog (../_kit/Dialog.tsx) owns the behaviour (modal layer, focus, Esc, scrim, reduced motion);
// this owns only the stock it is printed on: a heavy black card with crop marks, the side's catalogue mark over a
// serif title, and the editors set like a printer's form. Kit candidate: `Dialog` with a `stock` of its own.
import type { ReactNode } from "react";

import { Dialog } from "../_kit/Dialog.tsx";
import c from "./card.module.css";

export interface PrintedCardProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** The card's heading and accessible name. */
  readonly title: string;
  /** The catalogue mark printed over the title: the side, the track. */
  readonly mark: string;
  readonly children: ReactNode;
  readonly foot?: ReactNode;
  readonly wide?: boolean;
}

export function PrintedCard({ open, onClose, title, mark, children, foot, wide = false }: PrintedCardProps) {
  return (
    <Dialog open={open} onClose={onClose} title={title} className={c.card} width={wide ? "wide" : "narrow"} {...(foot === undefined ? {} : { foot })}>
      <span className={c.mark} aria-hidden="true">
        {mark}
      </span>
      <div className={c.content}>{children}</div>
    </Dialog>
  );
}

/** One field on the card's form: the printed term over its editor. */
export function FormCell({ term, children, w }: { readonly term?: string; readonly children: ReactNode; readonly w?: "wide" | "full" }) {
  return (
    <div className={c.cell} data-w={w}>
      {term !== undefined && <span className={c.term}>{term}</span>}
      {children}
    </div>
  );
}

/** A group of cells under a rule: the card's section. */
export function FormRule({ title, children, aside }: { readonly title: string; readonly children: ReactNode; readonly aside?: ReactNode }) {
  return (
    <section className={c.rule} aria-label={title}>
      <header className={c.ruleHead}>
        <h3 className={c.ruleTitle}>{title}</h3>
        {aside}
      </header>
      <div className={c.form}>{children}</div>
    </section>
  );
}
