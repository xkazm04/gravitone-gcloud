// A count, or a ratio, as a stamp (tokens.css `.tally`, the prototype's GT.Tally(v, label, of)).
//
// Kept from v1 components/ui/signal/Tally.tsx: the numerals are aria-hidden and a spoken
// sentence sits beside them, because "12/36" is announced "twelve slash thirty six".
// The prototype put that sentence in an aria-label on a role-less span, where most screen
// readers never read it; the sr-only channel is what v1 learned and what this keeps.
// Dropped from v1: tone, the zero rule and the door (select/href). The design draws every
// tally the same ink stamp; a tally that filters is a Chip with a value.
import { SrOnly } from "../a11y/SrOnly.tsx";
import s from "./Tally.module.css";

export type TallyProps = {
  readonly value: number | string;
  /** The denominator, when this is a ratio. */
  readonly of?: number;
  /** One or two lowercase words after the numerals: `14 waiting`. */
  readonly label?: string;
};

export function spokenTally({ value, of, label }: TallyProps): string {
  return `${label === undefined ? "" : `${label} `}${value}${of === undefined ? "" : ` of ${of}`}`;
}

export function Tally(props: TallyProps) {
  const { value, of, label } = props;
  return (
    <span className={s.tally}>
      <span aria-hidden="true">{of === undefined ? value : `${value}/${of}`}</span>
      {label !== undefined && (
        <small className={s.label} aria-hidden="true">
          {label}
        </small>
      )}
      <SrOnly text={spokenTally(props)} />
    </span>
  );
}
