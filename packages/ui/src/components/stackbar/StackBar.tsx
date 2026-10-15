// Proportional parts of a decided pile (tokens.css `.stackbar`, GT.StackBar(k, x, u)): kept,
// rejected, undecided. The undecided segment is hatched, not a fourth colour - it commits
// as a rejection (v1 StackBar's reason for `hatched`). An untouched pile draws whole-hatched.
//
// The rail is one image with one name (role="img"); the counts are spoken, never drawn twice.
import { cx } from "../cx.ts";
import { vars } from "../vars.ts";
import s from "./StackBar.module.css";

export type StackBarProps = {
  readonly kept: number;
  readonly rejected: number;
  readonly undecided: number;
  /** Prefixes the spoken counts: `Forge sweep-01 kept 6, rejected 4, undecided 10`. */
  readonly label?: string;
};

/** Flex weights: an empty pile still draws a full rail, hatched, as the prototype did. */
export function stackWeights({ kept, rejected, undecided }: StackBarProps): readonly [number, number, number] {
  const total = Math.max(1, kept + rejected + undecided);
  return [kept, rejected, undecided || (kept + rejected ? 0 : total)];
}

export function spokenStack(p: StackBarProps): string {
  return `${p.label === undefined ? "" : `${p.label} `}kept ${p.kept}, rejected ${p.rejected}, undecided ${p.undecided}`;
}

export function StackBar(props: StackBarProps) {
  const [k, x, u] = stackWeights(props);
  return (
    <div className={s.bar} role="img" aria-label={spokenStack(props)}>
      <i className={cx(s.seg, s.keep)} style={vars({ "--n": k })} />
      <i className={cx(s.seg, s.reject)} style={vars({ "--n": x })} />
      <i className={cx(s.seg, s.undecided)} style={vars({ "--n": u })} />
    </div>
  );
}
