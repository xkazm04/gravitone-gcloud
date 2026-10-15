// The control (tokens.css `.btn`): a tone, a size, a label, and the key that also runs it.
//
// Variants are a closed set (ui-controls/variant-discipline): `tone` is the signal hue the
// act carries (emerald approves, rose rejects, amber edits the plan, cyan routes, violet
// slots), `size` is md | sm. There is no className or style: a caller places a button, it
// does not restyle it (call-site-ownership).
//
// Disabled is aria-disabled, never `disabled`: the button stays in the tab order with its
// name, reads as unavailable, and ignores the press (primitive-level-a11y, honest
// disablement). The prototype set `disabled`, which removed the control from the keyboard
// path along with any reason it carried.
import { Chip, type ChipProps } from "../chip/Chip.tsx";
import type { Tone } from "../chip/tone.ts";
import { cx } from "../cx.ts";
import { Glyph, type GlyphName } from "../glyph/Glyph.tsx";
import { Keycap } from "../keycaps/Keycaps.tsx";
import s from "./Button.module.css";

export type ButtonProps = {
  readonly label: string;
  readonly tone?: Tone;
  readonly size?: "md" | "sm";
  /** The keymap row that runs the same verb; its caps are drawn after the label. */
  readonly shortcut?: { readonly mode: string; readonly verb: string };
  /** A leading glyph. */
  readonly glyph?: GlyphName;
  /** A chip after the label - the count the act is about (`Commit packet [7 undecided]`). */
  readonly badge?: Pick<ChipProps, "label" | "value" | "tone">;
  readonly disabled?: boolean;
  readonly onPress?: () => void;
  readonly href?: string;
  readonly submit?: boolean;
};

export function Button({ label, tone = "neutral", size = "md", shortcut, glyph, badge, disabled = false, onPress, href, submit = false }: ButtonProps) {
  const cls = cx(s.btn, size === "sm" && s.sm, tone !== "neutral" && s[tone]);
  const body = (
    <>
      {glyph !== undefined && <Glyph name={glyph} className={s.glyph} />}
      {label}
      {badge !== undefined && <Chip {...badge} />}
      {shortcut !== undefined && <Keycap mode={shortcut.mode} verb={shortcut.verb} />}
    </>
  );
  if (href !== undefined && !disabled) {
    return (
      <a className={cls} href={href}>
        {body}
      </a>
    );
  }
  return (
    <button
      type={submit ? "submit" : "button"}
      className={cls}
      aria-disabled={disabled ? true : undefined}
      onClick={disabled ? undefined : onPress}
    >
      {body}
    </button>
  );
}
