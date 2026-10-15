// Per resource, what it holds (projects.css `.res`, the Plan's ResourceSummary and the Runs
// inspector's "resources" list): the lane, its counts, and a meter of how much of its capacity
// is held now. The prototype's meter was minutes of planned work per lane; Phase 2 has no
// estimates for v1 work (v1 records no ETA), so the meter is occupancy - running over capacity
// - which is a fact, where minutes would be a guess.
import { vars } from "../vars.ts";
import { LaneChip, type LaneChipId } from "./LaneChip.tsx";
import { occupancy } from "./dayline.ts";
import s from "./ResourceSummary.module.css";

export type ResourceLine = {
  readonly lane: LaneChipId;
  readonly cap: number;
  readonly running: number;
  readonly waiting: number;
};

export function resourceWords(l: ResourceLine): string {
  const parts = [`${l.running} running`, ...(l.waiting > 0 ? [`${l.waiting} waiting`] : [])];
  return parts.join(" · ");
}

export function ResourceSummary({ lines, label }: { readonly lines: readonly ResourceLine[]; readonly label: string }) {
  return (
    <ul className={s.list} aria-label={label}>
      {lines.map((l) => {
        const share = occupancy(l.running, l.cap);
        return (
          <li key={l.lane} className={s.res}>
            <span className={s.head}>
              <LaneChip lane={l.lane} />
              <span className={s.n}>{resourceWords(l)}</span>
            </span>
            <span className={s.bar} role="meter" aria-valuemin={0} aria-valuemax={l.cap} aria-valuenow={l.running} aria-label={`${l.running} of ${l.cap} held`}>
              <i style={vars({ "--share": share })} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}
