"use client";

// THE TIP ON A CONTROL - the Hint's disclosure without its glyph (spark scout-idea-artboards, WP-I4b:
// a reject reason's meaning on hover). A Hint is a "?" that qualifies a value beside it; a Tip opens on
// the control itself, so the word the operator is about to press (a reason chip, a reason's key cap)
// is what discloses its own meaning. One mechanism for both - Hint is a Tip around its glyph - so the
// WCAG 1.4.13 contract recorded in Hint.tsx holds for each: the open tip is a `tooltip` layer that
// Escape closes through the keymap with the pointer still over it, the gap is bridged so the pointer
// can cross to the tip, blur closes only when focus leaves the wrapper, and the tip stays mounted
// while hidden so the trigger's aria-describedby reads it on focus.
//
// The text is DATA here (a reason's meaning, @gt/domain/source REASON_MEANING), so the type cannot
// count it as it counts a Hint's literal; the twelve-word bound is the domain test's (hintWords).
import { useId, useLayoutEffect, useRef, useState, type FocusEvent, type ReactNode } from "react";
import { useLayer } from "../../layers/useLayer.ts";
import { cx } from "../cx.ts";
import s from "./Hint.module.css";

export type TipProps = {
  /** The disclosure: the work's own words for what the trigger stands for. */
  readonly text: string;
  /** Drawn bold before the text, when the trigger does not say what it is (a key cap: `3` -> craft). */
  readonly term?: string;
  /** Opens above the trigger: a chip at the foot of a card or a bar, where a tip below is clipped. */
  readonly above?: boolean;
  /** Centred on the trigger (the Hint's glyph); otherwise it starts at the trigger's left edge, so a
   *  chip at the start of a row does not push its tip off the screen. */
  readonly centered?: boolean;
  /** Drawn open until the pointer or focus first leaves it: a /kit specimen of the open tip. */
  readonly seededOpen?: boolean;
  /** The trigger, handed the tip's id for its aria-describedby. */
  readonly children: (describedBy: string) => ReactNode;
};

/** The least gap, in px, between an open tip and the edge of the screen. */
const EDGE = 8;

export function Tip({ text, term, above = false, centered = false, seededOpen = false, children }: TipProps) {
  const id = useId();
  const [open, setOpen] = useState(seededOpen);
  const wrap = useRef<HTMLSpanElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  // An open tip is shifted back inside the viewport when its trigger sits near an edge.
  useLayoutEffect(() => {
    const el = tip.current;
    if (el === null) return;
    el.style.removeProperty("--tip-shift");
    if (!open) return;
    const r = el.getBoundingClientRect();
    const room = document.documentElement.clientWidth - EDGE;
    const shift = r.left < EDGE ? EDGE - r.left : r.right > room ? room - r.right : 0;
    if (shift !== 0) el.style.setProperty("--tip-shift", `${shift}px`);
  }, [open]);
  useLayer(open, { kind: "tooltip", panelRef: tip, anchorRef: wrap, onClose: () => setOpen(false) });
  const onBlur = (e: FocusEvent<HTMLSpanElement>): void => {
    if (!(e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget))) setOpen(false);
  };
  return (
    <span
      ref={wrap}
      className={cx(s.hint, above && s.above, !centered && s.start)}
      data-open={open ? "" : undefined}
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={onBlur}
    >
      {children(id)}
      <span ref={tip} role="tooltip" id={id} className={s.tip}>
        {term !== undefined && (
          <>
            <b className={s.term}>{term}</b>{" "}
          </>
        )}
        {text}
      </span>
    </span>
  );
}
