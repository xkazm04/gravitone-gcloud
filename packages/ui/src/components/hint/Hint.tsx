"use client";

// A real disclosure, not `title=` (tokens.css `.hint`, GT.Hint(text); v1 signal/Hint.tsx).
// A round "?" glyph whose tip opens on hover and focus; the tip is role="tooltip", wired by
// aria-describedby, and stays mounted while hidden so a screen reader hears it on focus.
//
// The glyph's name is REQUIRED (`name`: what the hint qualifies). The prototype named every
// glyph "more", so a list of five hints read as five identical buttons.
//
// THE TIP IS A LAYER (layers/stack.ts, kind `tooltip`). WCAG 1.4.13 asks a hover
// disclosure to be dismissible without moving the pointer or focus, hoverable, and
// persistent. The design's CSS-only reveal (`.hint:hover>.tip`) could do the last two and
// never the first: a tip held open by :hover cannot be closed by any key. So open-state is
// React state, set by pointer and focus, and the open tip is on the stack, where the keymap
// dispatcher's Escape reaches it like any top layer - and where the policy row says it
// claims no keys and returns no focus. v1's Hint dismissed itself through its own keydown
// and pointerdown listeners; that second Escape path is what the stack replaced.
//
//   · Hoverable: the tip is a child of the wrapper, and its ::before bridges the gap under
//     the glyph, so the pointer travelling from glyph to tip never leaves the wrapper.
//   · Dismissed stays dismissed: Escape closes it with the pointer still over it, and it
//     reopens only on the next enter or focus, never on a stray pointermove.
//   · Blur closes it only when focus leaves the wrapper, not when it moves inside it.
import { useId, useRef, useState, type FocusEvent } from "react";
import { useLayer } from "../../layers/useLayer.ts";
import type { TwelveWords } from "./words.ts";
import s from "./Hint.module.css";

export type HintProps<S extends string> = { readonly text: S; readonly name: string } & TwelveWords<S>;

export function Hint<const S extends string>({ text, name }: HintProps<S>) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const glyph = useRef<HTMLButtonElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  useLayer(open, { kind: "tooltip", panelRef: tip, anchorRef: glyph, onClose: () => setOpen(false) });
  const onBlur = (e: FocusEvent<HTMLSpanElement>): void => {
    if (!(e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget))) setOpen(false);
  };
  return (
    <span
      className={s.hint}
      data-open={open ? "" : undefined}
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={onBlur}
    >
      <button ref={glyph} type="button" className={s.glyph} aria-label={name} aria-describedby={id}>
        ?
      </button>
      <span ref={tip} role="tooltip" id={id} className={s.tip}>
        {text}
      </span>
    </span>
  );
}
