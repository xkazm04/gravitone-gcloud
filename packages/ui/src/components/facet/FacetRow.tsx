// One value of a facet with its live count: a pressed toggle that filters (library.js `frow`,
// ledger.js `fr`). OR within a group, AND across groups is the route's logic; the row only
// says whether it is in the filter and how many match.
//
// The design drew this row twice. The Library's carries a checkbox mark; the Ledger's a
// left rule and a share bar under the label. Both are kept as `mark` because extraction
// does not change pixels; which one survives is the owner's call (open question).
import { cx } from "../cx.ts";
import { SrOnly } from "../a11y/SrOnly.tsx";
import { vars } from "../vars.ts";
import s from "./FacetRow.module.css";

export type FacetRowProps = {
  readonly label: string;
  readonly count: number;
  readonly pressed: boolean;
  readonly onToggle: (next: boolean) => void;
  readonly mark: "check" | "rail";
  /** The rail's share bar, 0..1 of the largest value in the group. */
  readonly share?: number;
};

export function FacetRow({ label, count, pressed, onToggle, mark, share }: FacetRowProps) {
  return (
    <button
      type="button"
      className={cx(s.row, s[mark], count === 0 && s.zero)}
      aria-pressed={pressed}
      onClick={() => onToggle(!pressed)}
    >
      {mark === "check" && <span className={s.box} aria-hidden="true" />}
      <span className={s.label}>{label}</span>
      <span className={s.count} aria-hidden="true">
        {count}
      </span>
      <SrOnly text={`, ${count}`} />
      {mark === "rail" && share !== undefined && (
        <span className={s.share} aria-hidden="true">
          <i className={s.fill} style={vars({ "--share": Math.min(1, Math.max(0, share)) })} />
        </span>
      )}
    </button>
  );
}
