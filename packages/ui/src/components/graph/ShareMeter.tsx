// A group's share of the nights' runs against the operator's advisory target (spark scout-decision-graph WP-S2):
// a rail filled to the share it TOOK, a tick where the split SETS it, both numbers beside it. Not a StackBar:
// StackBar's three segments are kept / rejected / undecided and say so to a screen reader - a share against a
// target is one quantity and a mark, and drawn as StackBar it would be spoken as verdicts it is not.
//
// One image with one name (role="img"); the numbers are drawn once, beside it, and hidden from the spoken channel.
import { cx } from "../cx.ts";
import { vars } from "../vars.ts";
import s from "./ShareMeter.module.css";

export type ShareMeterProps = {
  /** Percent of the window's runs the group took. */
  readonly actual: number;
  /** Percent the steer's split sets for it; absent when the split names none. */
  readonly target?: number;
  /** The group (`kids/comedy`): the image's name, before its numbers. */
  readonly label: string;
};

const pct = (x: number): string => `${Math.round(x)}%`;
const clamp = (x: number): number => Math.max(0, Math.min(100, x));

export function spokenShare({ actual, target, label }: ShareMeterProps): string {
  return `${label}: took ${pct(actual)} of runs${target === undefined ? ", no split set" : `, split ${pct(target)}`}`;
}

export function ShareMeter(props: ShareMeterProps) {
  const { actual, target } = props;
  const over = target !== undefined && actual > target;
  return (
    <span className={s.meter}>
      <span className={s.rail} role="img" aria-label={spokenShare(props)}>
        <i className={cx(s.fill, over && s.over)} style={vars({ "--share": clamp(actual) / 100 })} />
        {target !== undefined && <i className={s.tick} style={vars({ "--at": clamp(target) / 100 })} />}
      </span>
      <span className={s.nums} aria-hidden="true">
        {pct(actual)}
        {target !== undefined && <span className={s.target}> / {pct(target)}</span>}
      </span>
    </span>
  );
}
