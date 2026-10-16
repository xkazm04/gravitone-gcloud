// THE RE-ROUTE LIST (prototype projects.js Inspector `alt`, projects.css `.alts`, `.alt`): every
// other way to make this part, each with what choosing it does to the whole project - the
// project's ETA moved by ±Δ, the cost by ±$, and where the job would queue on its new lane. The
// current route is drawn dashed and cannot be chosen.
//
// The prototype applied a choice at once (studio.js `reroute`). Here choosing opens the
// option's RECEIPT (COMMON decision 3): a re-route moves spend to another vendor, and spend
// moves only through a confirm. The deltas are the server's preview (`rerouteOptions`), never
// recomputed here.
import type { RerouteOption } from "@gt/domain/produce";

import { Chip } from "../chip/Chip.tsx";
import { cx } from "../cx.ts";
import { LaneChip, laneLabel } from "../runs/LaneChip.tsx";
import { costWords, fmtDur, lean, optionCost, relDur, relUsd } from "./produce.ts";
import s from "./Acts.module.css";

export type RerouteListProps = {
  readonly options: readonly RerouteOption[];
  readonly units: number;
  readonly onPick: (key: string) => void;
  /** The option whose receipt is being read; the list is disarmed meanwhile. */
  readonly busy: string | null;
};

export function RerouteList({ options, units, onPick, busy }: RerouteListProps) {
  return (
    <div className={s.alts} data-component="RerouteList">
      {options.map((r) => {
        const o = r.option;
        if (r.current) {
          return (
            <div key={o.key} className={cx(s.alt, s.cur)} data-option={o.key}>
              <LaneChip lane={o.lane} />
              <span className={s.am}>{o.label}</span>
              <Chip label="current" casing="lower" />
            </div>
          );
        }
        const eta = lean(r.dEtaS, 59);
        const usd = lean(r.dUsd, 0.004);
        return (
          <button
            key={o.key}
            type="button"
            className={s.alt}
            data-option={o.key}
            aria-label={`re-route to ${o.label} on ${laneLabel(o.lane)}: eta ${relDur(r.dEtaS)}, ${relUsd(r.dUsd)}, queue ${r.queuePos}`}
            aria-busy={busy === o.key ? true : undefined}
            aria-disabled={busy !== null ? true : undefined}
            onClick={busy !== null ? undefined : () => onPick(o.key)}
          >
            <LaneChip lane={o.lane} />
            <span className={s.am}>{o.label}</span>
            <span className={s.ad}>
              <span className={s.mono}>
                {fmtDur(o.secondsPerUnit * Math.max(1, units))} · {costWords(optionCost(o, units))}
              </span>
              <span className={cx(s.d, s[eta])}>eta {relDur(r.dEtaS)}</span>
              <span className={cx(s.d, s[usd])}>{relUsd(r.dUsd)}</span>
              <span className={s.mono}>q#{r.queuePos}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
