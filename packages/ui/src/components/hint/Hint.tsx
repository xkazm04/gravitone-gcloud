// A real disclosure, not `title=` (tokens.css `.hint`, GT.Hint(text); v1 signal/Hint.tsx).
// A round "?" glyph whose tip opens on hover and focus; the tip is role="tooltip", wired by
// aria-describedby, and stays mounted while hidden so a screen reader hears it on focus.
//
// The glyph's name is REQUIRED (`name`: what the hint qualifies). The prototype named every
// glyph "more", so a list of five hints read as five identical buttons.
//
// Not kept from v1: Escape and outside-press dismissal. v1's Hint held open-state and its
// own listeners; here every key goes through the keymap dispatcher and every dismissal
// through the layer stack, whose popover kind returns focus on close - wrong for a tip
// opened by hover. The design's CSS-only reveal is kept until the stack has a tooltip kind
// (open question to the Director; WCAG 1.4.13 asks for Escape).
import { useId } from "react";
import type { TwelveWords } from "./words.ts";
import s from "./Hint.module.css";

export type HintProps<S extends string> = { readonly text: S; readonly name: string } & TwelveWords<S>;

export function Hint<const S extends string>({ text, name }: HintProps<S>) {
  const id = useId();
  return (
    <span className={s.hint}>
      <button type="button" className={s.glyph} aria-label={name} aria-describedby={id}>
        ?
      </button>
      <span role="tooltip" id={id} className={s.tip}>
        {text}
      </span>
    </span>
  );
}
