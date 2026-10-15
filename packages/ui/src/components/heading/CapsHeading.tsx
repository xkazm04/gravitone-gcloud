// A heading of one to four words with its count beside it (`after 3`, `provenance`). The
// count is a Tally, never a parenthetical; there is no subtitle - the law's first rule.
import { cx } from "../cx.ts";
import { Tally, type TallyProps } from "../tally/Tally.tsx";
import s from "./CapsHeading.module.css";

export type CapsHeadingProps = {
  readonly text: string;
  readonly tally?: TallyProps;
  /** `side` heads a rail group; `section` heads a block of a detail view. */
  readonly variant?: "side" | "section";
  readonly level?: 2 | 3 | 4;
};

export function CapsHeading({ text, tally, variant = "side", level = 3 }: CapsHeadingProps) {
  const H = level === 2 ? "h2" : level === 4 ? "h4" : "h3";
  return (
    <H className={cx(s.caps, variant === "section" && s.section)}>
      {text}
      {tally !== undefined && <Tally {...tally} />}
    </H>
  );
}
