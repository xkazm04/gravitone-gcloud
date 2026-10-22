"use client";

// VARIANT "mosaic + band" (prototype 2026-10-22). The packet as a dense mosaic of square runs -
// picture first, label and pips laid over it - the most runs a screen can hold. Opening a run (click
// or Z) does not leave the grid: a BAND unfolds across the grid right under that run's line, the
// reference beside the variants at large size, and the rest of the night stays in view above and
// below it. ↑ ↓ in the band walk to the neighbouring run (the band follows), Z / Esc fold it.
import { Fragment, useEffect, useRef, useState } from "react";

import { tallyOf } from "../../board/cull.ts";
import { columnsOf, groupsOf } from "../../board/runs.ts";
import { useLayer } from "../../layers/useLayer.ts";
import { DeskFrame, OracleStrip } from "../desk/Desk.tsx";
import { CullFoot } from "./CullFoot.tsx";
import type { MatrixCullProps } from "./MatrixCull.tsx";
import { RunCard } from "./RunCard.tsx";
import { RunView } from "./RunView.tsx";
import { SeriesBadge } from "./SeriesBadge.tsx";
import { useRunDesk } from "./useRunDesk.ts";
import s from "./Runs.module.css";

/** The index (within its group) after which a band opened on position `p` sits: the end of p's line. */
export const bandAfter = (p: number, cols: number, len: number): number => Math.min(len - 1, Math.floor(p / cols) * cols + cols - 1);

export function MatrixCullBand({ packet, verdicts, decide, undo, onCommit, busy = false, announce = () => undefined, keys = true }: MatrixCullProps) {
  const { view, present } = packet;
  const grid = useRef<HTMLDivElement | null>(null);
  const band = useRef<HTMLDivElement | null>(null);
  const [cols, setCols] = useState(1);
  const d = useRunDesk({ packet, verdicts, decide, undo, onCommit, announce, keys, columns: () => cols });
  useLayer(keys && d.open, { kind: "zoom", panelRef: band, onClose: () => d.setOpen(false) });

  // The band sits at the end of a LINE of runs, so the line length is measured, and re-measured
  // when the desk is resized.
  useEffect(() => {
    const el = grid.current;
    if (el === null || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setCols(columnsOf(el)));
    ro.observe(el);
    setCols(columnsOf(el));
    return () => ro.disconnect();
  }, []);

  const byId = new Map<string, (typeof view.items)[number]>(view.items.map((it) => [it.id, it]));
  const mediaOf = (id: string) => ({ url: byId.get(id)?.url ?? "", mime: byId.get(id)?.media.mime ?? "image/png" });
  const groups = groupsOf(d.runs);
  return (
    <DeskFrame
      title={view.title ?? view.id}
      {...(present.meta !== undefined ? { meta: present.meta } : {})}
      marks={
        <>
          {present.oracle !== undefined && <OracleStrip oracle={present.oracle} />}
          {present.series !== undefined && <SeriesBadge measured={present.series.measured} graded={present.series.graded} />}
        </>
      }
      foot={<CullFoot tally={tallyOf(d.cells, verdicts)} reasons={view.reasons.list.length} audio={view.lane === "audio"} refusals={d.refusals} busy={busy} onCommit={d.commit} />}
    >
      <div className={s.desk} role="grid" aria-label="runs">
        {groups.map((g, gi) => {
          const openHere = d.open ? g.runs.findIndex(({ at }) => at === d.runIx) : -1;
          const after = openHere < 0 ? -1 : bandAfter(openHere, cols, g.runs.length);
          return (
            <section key={g.group || "runs"} className={s.group} aria-label={g.group || "runs"}>
              {g.group !== "" && <span className={s.eyebrow}>{g.group}</span>}
              <div ref={gi === 0 ? grid : undefined} className={s.gridDense}>
                {g.runs.map(({ run, at }, p) => (
                  <Fragment key={run.row}>
                    <RunCard
                      run={run}
                      at={at}
                      cells={d.cells}
                      verdicts={verdicts}
                      mediaOf={mediaOf}
                      wordsOf={d.wordsOf}
                      face="mosaic"
                      current={at === d.runIx}
                      nudged={run.members.some((i) => d.nudged.has(i))}
                      onPress={(i) => (d.open && i === d.runIx ? d.setOpen(false) : d.openRun(i))}
                    />
                    {p === after && d.run !== undefined && (
                      <div ref={band} className={s.band}>
                        <RunView run={d.run} at={d.runIx} of={d.runs.length} cells={d.cells} verdicts={verdicts} mediaOf={mediaOf} wordsOf={d.wordsOf} cur={d.cur} nudged={d.nudged} onPress={d.setCur} />
                      </div>
                    )}
                  </Fragment>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </DeskFrame>
  );
}
