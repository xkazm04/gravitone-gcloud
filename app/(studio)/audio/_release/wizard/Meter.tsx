"use client";

// One loudness figure on its scale: the target (a band for integrated loudness, a ceiling for true
// peak), where the take sat before the master and where the master landed. Spoken as one sentence.
import { db } from "./fmt.ts";
import s from "./master.module.css";

export interface MeterProps {
  readonly name: string;
  readonly unit: string;
  readonly min: number;
  readonly max: number;
  readonly target: number;
  /** Half the width of the on-target band; 0 draws a ceiling line instead. */
  readonly slack: number;
  readonly before: number | null;
  readonly after: number | null;
  readonly ticks: readonly number[];
}

const pct = (v: number, min: number, max: number): string => `${Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100))}%`;

export function Meter({ name, unit, min, max, target, slack, before, after, ticks }: MeterProps) {
  const said = [`target ${target} ${unit}`, before === null ? "before not measured" : `before ${before} ${unit}`, after === null ? "no master yet" : `master ${after} ${unit}`].join(", ");
  return (
    <div className={s.meter}>
      <div className={s.meterHead}>
        <span className={s.meterName}>{name}</span>
        <span className={s.meterValues} aria-hidden="true">
          <span className={s.vBefore}>{before === null ? "—" : db(before)}</span>
          <span className={s.arrow}>→</span>
          <span className={s.vAfter}>{after === null ? "—" : db(after)}</span>
          <span className={s.unit}>{unit}</span>
        </span>
      </div>
      <div className={s.scale} role="img" aria-label={`${name}: ${said}`}>
        {slack > 0 ? (
          <span className={s.band} style={{ left: pct(target - slack, min, max), width: `calc(${pct(target + slack, min, max)} - ${pct(target - slack, min, max)})` }} />
        ) : (
          <span className={s.over} style={{ left: pct(target, min, max) }} />
        )}
        <span className={s.target} style={{ left: pct(target, min, max) }} />
        {before !== null && <span className={s.markBefore} style={{ left: pct(before, min, max) }} />}
        {after !== null && <span className={s.markAfter} style={{ left: pct(after, min, max) }} />}
      </div>
      <div className={s.ticks} aria-hidden="true">
        {ticks.map((t) => (
          <span key={t} className={t === target ? s.tickTarget : s.tick} style={{ left: pct(t, min, max) }}>
            {db(t)}
          </span>
        ))}
      </div>
    </div>
  );
}
