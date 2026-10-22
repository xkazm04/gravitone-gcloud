"use client";

// THE MOSAIC (the run-grid prototype's winner, 2026-10-22): the packet as runs, filed in category
// rows - art styles, videos, music, 3D, notes, sources - each run one square card (its picture, its
// label, a pip per variant), as many to a screen as it holds. A run is judged whole from here (K / X
// / a reason) or opened - click or Z - into the RunModal across the whole screen, where its variants
// are judged one by one at large size. Both layers share one cursor, one keymap and one bottom bar.
import { useEffect, useRef, useState } from "react";

import { cullCells, tallyOf } from "../../board/cull.ts";
import { categoriesOf, categoryOf, columnsOf, runsOf, type Run } from "../../board/runs.ts";
import { DeskFrame, OracleStrip } from "../desk/Desk.tsx";
import { CullFoot } from "./CullFoot.tsx";
import type { MatrixCullProps } from "./props.ts";
import { RunCard } from "./RunCard.tsx";
import { RunModal } from "./RunModal.tsx";
import { RunView } from "./RunView.tsx";
import { SeriesBadge } from "./SeriesBadge.tsx";
import { useRunDesk } from "./useRunDesk.ts";
import s from "./Runs.module.css";

export function MatrixCullMosaic({ packet, verdicts, decide, undo, onCommit, busy = false, announce = () => undefined, keys = true }: MatrixCullProps) {
  const { view, present } = packet;
  const grid = useRef<HTMLDivElement | null>(null);
  const [cols, setCols] = useState(1);
  const byId = new Map<string, (typeof view.items)[number]>(view.items.map((it) => [it.id, it]));
  const mediaOf = (id: string) => ({ url: byId.get(id)?.url ?? "", mime: byId.get(id)?.media.mime ?? "image/png" });
  // The first variant's media files a run its source did not name; the rows are drawn in category
  // order, and the cursor walks them in that order.
  const cells = cullCells(present.rows, view.items);
  const firstMime = (run: Run) => mediaOf(cells[run.members[0] ?? -1]?.id ?? "").mime;
  const arranged = categoriesOf(runsOf(cells, present.rows), firstMime);
  const order = arranged.flatMap((c) => c.runs.map((r) => r.at));
  const d = useRunDesk({
    packet,
    verdicts,
    decide,
    undo,
    onCommit,
    announce,
    keys,
    columns: () => cols,
    arrange: () => order,
  });

  // ↑ ↓ move a whole line of runs, so the line is measured, and re-measured on resize.
  useEffect(() => {
    const el = grid.current;
    if (el === null || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setCols(columnsOf(el)));
    ro.observe(el);
    setCols(columnsOf(el));
    return () => ro.disconnect();
  }, []);

  const foot = <CullFoot tally={tallyOf(d.cells, verdicts)} reasons={view.reasons.list.length} audio={view.lane === "audio"} refusals={d.refusals} busy={busy} onCommit={d.commit} />;
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
      foot={foot}
      over={
        d.open && d.run !== undefined ? (
          <RunModal category={categoryOf(d.run, firstMime(d.run))} label={d.run.words?.label ?? d.run.row} position={`${d.runIx + 1}/${d.runs.length}`} onClose={() => d.setOpen(false)} live={keys} foot={foot}>
            <RunView run={d.run} cells={d.cells} verdicts={verdicts} mediaOf={mediaOf} wordsOf={d.wordsOf} cur={d.cur} nudged={d.nudged} onPress={d.setCur} />
          </RunModal>
        ) : undefined
      }
    >
      <div className={s.desk} role="grid" aria-label="runs">
        {arranged.map((c, ci) => (
          <section key={c.category} className={s.category} aria-label={`${c.category}, ${c.runs.length} run${c.runs.length === 1 ? "" : "s"}`}>
            <header className={s.categoryHead}>
              <span className={s.eyebrow}>{c.category}</span>
              <span className={s.count}>{c.runs.length}</span>
            </header>
            <div ref={ci === 0 ? grid : undefined} className={s.mosaic}>
              {c.runs.map(({ run, at }) => (
                <RunCard
                  key={run.row}
                  run={run}
                  at={at}
                  cells={d.cells}
                  verdicts={verdicts}
                  mediaOf={mediaOf}
                  wordsOf={d.wordsOf}
                  current={at === d.runIx}
                  nudged={run.members.some((i) => d.nudged.has(i))}
                  onPress={d.openRun}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </DeskFrame>
  );
}
