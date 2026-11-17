"use client";

// THE INFO DOOR (kit candidate): a round glyph button that opens its detail in the prototype's one Dialog. Detail is
// discovered on click - the rule behind a problem, the agent's source, a full record - and the button carries the
// accessible name, so a glyph-only door is never a door only a sighted pointer can read.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { Glyph, type GlyphName } from "@gt/ui/components/glyph/Glyph.tsx";

import { Dialog } from "../_kit/Dialog.tsx";
import s from "./parts.module.css";

export interface DoorProps {
  /** The button's accessible name: what it opens. */
  readonly name: string;
  readonly title: string;
  readonly glyph?: GlyphName;
  /** A word beside the glyph, for a door that is also a label (`record`, `stores`). */
  readonly word?: string;
  readonly tone?: "agent" | "plain";
  readonly size?: SheetSize;
  readonly children: ReactNode;
  readonly foot?: ReactNode;
}

/** narrow and wide are the shared Dialog's own widths; xl is this variant's, for an editor reused whole. */
export type SheetSize = "narrow" | "wide" | "xl";
const looks = (size: SheetSize): string => (size === "xl" ? `${s.dialog} ${s.dialogXl}` : s.dialog);

export function Door({ name, title, glyph = "doc", word, tone = "plain", size = "narrow", children, foot }: DoorProps) {
  const [open, setOpen] = useState(false);
  // The Dialog re-runs its focus effect when `onClose` changes identity, so the close is stable: a keystroke in a
  // field inside the dialog re-renders it and must not move focus back to the close button.
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button type="button" className={word === undefined ? s.door : s.doorWord} data-tone={tone} aria-label={name} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <Glyph name={glyph} className={s.doorGlyph} />
        {word !== undefined && <span aria-hidden="true">{word}</span>}
      </button>
      <Dialog open={open} onClose={close} title={title} className={looks(size)} width={size === "narrow" ? "narrow" : "wide"} {...(foot === undefined ? {} : { foot })}>
        {children}
      </Dialog>
    </>
  );
}

/** A Dialog the caller opens itself (a tile, a row): the same look as a door's. */
export function Sheet({ open, onClose, title, size = "narrow", children }: { readonly open: boolean; readonly onClose: () => void; readonly title: string; readonly size?: SheetSize; readonly children: ReactNode }) {
  const latest = useRef(onClose);
  useEffect(() => {
    latest.current = onClose;
  });
  const close = useCallback(() => latest.current(), []);
  return (
    <Dialog open={open} onClose={close} title={title} className={looks(size)} width={size === "narrow" ? "narrow" : "wide"}>
      {children}
    </Dialog>
  );
}
