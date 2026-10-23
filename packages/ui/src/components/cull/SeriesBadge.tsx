// A SERIES MISMATCH: the grades on this packet were made by a grader the current calibration
// was not measured on. StaleBadge cannot say it - its contract is a feed's age (freshness
// `Edge`), and this is a different grader, not a quiet one - so the same amber chip carries the
// two series names instead. The chip is the model@digest pair verbatim; the accessible name
// spells out which is which.
import { Chip } from "../chip/Chip.tsx";

export type SeriesBadgeProps = {
  /** The series the current calibration was measured on. */
  readonly measured: string;
  /** The series on this packet's grades that differ from it. */
  readonly graded: readonly string[];
};

export function SeriesBadge({ measured, graded }: SeriesBadgeProps) {
  if (graded.length === 0) return null;
  const list = graded.join(", ");
  return (
    <span role="status">
      <Chip label="series" value={list} tone="amber" dot casing="lower" name={`grades from ${list}; calibration measured on ${measured}`} />
    </span>
  );
}
