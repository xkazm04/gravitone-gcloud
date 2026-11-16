// RUNS' TOTALS, AND THE FILTER'S DOORS (projects.js `renderTop` totals: the count first, the word
// bold after it). Each state's chip is the door to that state (`?state=`, ./url.ts): pressed, it
// is the filter in force and a second press returns to every state. The figure is the number of
// bars the door leaves (./view.ts filterModel), so a chip never promises what the day-line does
// not draw. The worker chip (../../_plan/WorkerChip.tsx) sits beside the queue it explains; the
// held chip is money, not a state, and is no door.
import { Chip } from "@gt/ui/components/chip/Chip.tsx";

import { WorkerChip, type WorkerRead } from "../../_plan/WorkerChip.tsx";
import { heldLabel, type RunFilter, type Totals as Counts } from "./view.ts";
import s from "./Runs.module.css";

type Props = {
  readonly totals: Counts;
  readonly money: { readonly usd: number; readonly audioS: number; readonly n: number };
  readonly state: RunFilter | null;
  readonly onState: (state: RunFilter | null) => void;
  readonly worker: WorkerRead;
  readonly now: number;
};

export function Totals({ totals, money, state, onState, worker, now }: Props) {
  const door = (f: RunFilter) => ({ pressed: state === f, onPress: () => onState(state === f ? null : f) });
  return (
    <div className={s.totals}>
      <Chip label={String(totals.running)} value="running" tone="cyan" name={`${totals.running} running`} {...door("running")} />
      <Chip label={String(totals.waiting)} value="waiting" name={`${totals.waiting} waiting`} {...door("waiting")} />
      <WorkerChip read={worker} now={now} />
      <Chip label={String(totals.weir)} value="at the weir" tone="amber" name={`${totals.weir} at the weir`} {...door("weir")} />
      <Chip label={String(totals.failed)} value="failed" tone="rose" name={`${totals.failed} failed or interrupted`} {...door("needs")} />
      {money.n > 0 && <Chip label={heldLabel(money)} value="held" tone="violet" name={`${money.n} open spend holds`} />}
    </div>
  );
}
