// A night's machine load against the operator's band (spark night-load-band, 2026-10-23; no
// prototype source). One cell per banded resource - cpu, ram, gpu - each a 0-100 track with the
// band shaded, the average as a mark, the p95 as a thin tick, and under it the night itself: one
// bar per five-minute slot, coloured by where that slot sat against the band. Beneath, the commit
// charge against the limit admission holds (a line, not banded: it is the ceiling, not a target)
// and how long work waited, and on what.
//
// A strip slot with no reading is a GAP, drawn as nothing, while a read slot is never shorter than
// a hairline: a GPU idle at 0% and a GPU nobody read must not look alike, and every read slot
// standing on a floor makes the missing ones read as holes in that floor without a second mark.
//
// Each cell is one meter with one spoken name; the readout and the strip are presentational inside
// it (a meter's children are), so the numbers are spoken once, never drawn twice to a reader.
import type { LoadSummary } from "@gt/domain/load";

import { cx } from "../cx.ts";
import { vars } from "../vars.ts";
import { commitLine, rowsOf, spokenRow, waitedLine, type ResourceRow } from "./band.ts";
import s from "./LoadBand.module.css";

export type LoadBandProps = { readonly load: LoadSummary };

function Cell({ row, band }: { readonly row: ResourceRow; readonly band: LoadSummary["band"] }) {
  const span = vars({ "--lo": band.low, "--hi": band.high });
  if (!row.read) {
    return (
      <div className={s.res} role="img" aria-label={spokenRow(row)} data-look="unread">
        <div className={s.head}>
          <span className={s.name}>{row.name}</span>
          <span className={s.read}>unread</span>
        </div>
        <div className={cx(s.track, s.unread)} />
      </div>
    );
  }
  return (
    <div className={s.res} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={row.avg} aria-label={spokenRow(row)} data-look={row.look}>
      <div className={s.head}>
        <span className={s.name}>{row.name}</span>
        <span className={s.read}>
          avg <b>{row.avg}</b> · p95 <b>{row.p95}</b> · <b>{row.inBand}%</b> in band
        </span>
      </div>
      <div className={s.track} style={span}>
        <i className={s.band} />
        <i className={s.p95} style={vars({ "--x": row.p95 / 100 })} />
        <i className={cx(s.avg, s[row.look])} style={vars({ "--x": row.avg / 100 })} />
      </div>
      {row.strip.length > 0 && (
        <div className={s.strip} style={span} aria-hidden="true">
          <i className={s.zone} />
          {row.strip.map((slot, i) => (
            <span key={i} className={s.slot}>
              {slot !== null && <i className={s[slot.look]} style={vars({ "--v": slot.v / 100 })} />}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function LoadBand({ load }: LoadBandProps) {
  const commit = commitLine(load.commit);
  const waited = waitedLine(load.waited);
  return (
    <div className={s.load} data-component="LoadBand" role="group" aria-label="machine load">
      <div className={s.cells}>
        {rowsOf(load).map((row) => (
          <Cell key={row.name} row={row} band={load.band} />
        ))}
      </div>
      {(commit !== null || waited !== null) && (
        <div className={s.lines}>
          {commit !== null && <span>{commit}</span>}
          {waited !== null && <span>waited: {waited}</span>}
        </div>
      )}
    </div>
  );
}
