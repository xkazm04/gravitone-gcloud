// The house tag (tokens.css `.chip`): a label, an optional bold value, an optional dot.
// A chip may be a door - a button (`onPress`, with `pressed` when it filters) or a link -
// and stays the same object; v1 Tally's "every count is a door" rule, kept.
import { cx } from "../cx.ts";
import type { Tone } from "./tone.ts";
import s from "./Chip.module.css";

export type ChipProps = {
  readonly label: string;
  /** The figure the label qualifies, drawn bright: `spend 24h $0.00`. */
  readonly value?: string | number;
  readonly tone?: Tone;
  /** Dashed rim: a placeholder or a fixture, not a record. */
  readonly ghost?: boolean;
  readonly casing?: "caps" | "lower";
  /** A lit dot before the label, in the chip's own colour. */
  readonly dot?: boolean;
  /** The accessible name, when label and value read badly aloud. */
  readonly name?: string;
  /** The id of what describes a door chip - its Tip (a reject reason's meaning). */
  readonly describedBy?: string;
  readonly onPress?: () => void;
  readonly pressed?: boolean;
  readonly href?: string;
};

export function Chip({ label, value, tone = "neutral", ghost = false, casing = "caps", dot = false, name, describedBy, onPress, pressed, href }: ChipProps) {
  const door = onPress !== undefined || href !== undefined;
  const cls = cx(s.chip, tone !== "neutral" && s[tone], ghost && s.ghost, casing === "lower" && s.lower, door && s.door);
  const body = (
    <>
      {dot && <span className={s.dot} aria-hidden="true" />}
      {label}
      {value !== undefined && <b className={s.value}>{value}</b>}
    </>
  );
  if (onPress !== undefined) {
    return (
      <button type="button" className={cls} onClick={onPress} aria-pressed={pressed} aria-label={name} aria-describedby={describedBy}>
        {body}
      </button>
    );
  }
  if (href !== undefined) {
    return (
      <a className={cls} href={href} aria-label={name} aria-describedby={describedBy}>
        {body}
      </a>
    );
  }
  return (
    <span className={cls} aria-label={name} role={name === undefined ? undefined : "group"}>
      {body}
    </span>
  );
}
