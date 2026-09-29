// A GRADE ON A CANDIDATE: the magnitude star, what was graded, the percentage.
// A reading aid, not a verdict: the registry is explicit that an automatic grade
// points at where to look.

import { Magnitude, gradeOf } from "./Magnitude";

export const pct = (x: number | null | undefined): string => (typeof x === "number" ? `${Math.round(100 * x)}%` : "—");

const SPOKEN = { held: "held", partial: "partly held", missed: "did not hold", ungraded: "not graded" } as const;

export function ScoreChip({ label, value }: { label: string; value: number | null | undefined }) {
  const g = gradeOf(value);
  return (
    <span className={`k-sch${g === "missed" ? " k-sch--lo" : ""}`}>
      <Magnitude value={value} />
      <span>
        {label} {pct(value)}
      </span>
      <span className="sr-only">{SPOKEN[g]}</span>
    </span>
  );
}

/** The two flags a grade can carry beside its scores. */
export function FlagChip({ kind }: { kind: "text" | "unmeasured" }) {
  return kind === "text" ? (
    <span className="k-sch k-sch--veto">TEXT</span>
  ) : (
    <span className="k-sch k-sch--unm">unmeasured</span>
  );
}
