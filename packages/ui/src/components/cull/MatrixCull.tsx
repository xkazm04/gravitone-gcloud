"use client";

// THE MATRIX CULL - a packet of runs, decided (operator, 2026-10-22). The runs are filed by the KIND
// of content into tabs - images, videos, audio, ideas - each drawn in the component its content
// reads best in: a mosaic of square stills, 16:9 clips that play, waveforms, and a dense list of the
// runs that are only words, decided in place, under the night's idea artboards (square tiles, as
// stills are: spark scout-idea-artboards). A picture, clip or take run opens across the whole
// screen (RunModal): its brief, its variants at most three to a row, a verdict by click under each
// and on the whole run, a clip with its own bar. Every act is also a key (bindings.ts `board.cull`):
// K / X / a reason on a run in the mosaic judge it whole, inside a run each variant; ← → ↑ ↓ walk;
// Z or a click opens; ⌫ undoes; ⏎ commits - refusing while anything is open, and taking the cursor
// (and the tab) to the first open variant.
import { useEffect, useRef, useState } from "react";

import { cullCells, tallyOf } from "../../board/cull.ts";
import { categoriesOf, categoryOf, columnsOf, runsOf, runVerdictOf, tabOf, tabsOf, wordsOnly, type Run, type Tab } from "../../board/runs.ts";
import { DeskFrame, OracleStrip } from "../desk/Desk.tsx";
import { Seg } from "../seg/Seg.tsx";
import { CullFoot } from "./CullFoot.tsx";
import { IdeaList } from "./IdeaList.tsx";
import type { MatrixCullProps } from "./props.ts";
import { RunModal } from "./RunModal.tsx";
import { RunMosaic } from "./RunMosaic.tsx";
import { RunView } from "./RunView.tsx";
import { SeriesBadge } from "./SeriesBadge.tsx";
import { useRunDesk } from "./useRunDesk.ts";
import s from "./Runs.module.css";

export type { MatrixCullProps } from "./props.ts";

export function MatrixCull({ packet, verdicts, decide, undo, onCommit, busy = false, announce = () => undefined, keys = true }: MatrixCullProps) {
  const { view, present } = packet;
  const grid = useRef<HTMLDivElement | null>(null);
  const [cols, setCols] = useState(1);
  const byId = new Map<string, (typeof view.items)[number]>(view.items.map((it) => [it.id, it]));
  const mediaOf = (id: string) => ({ url: byId.get(id)?.url ?? "", mime: byId.get(id)?.media.mime ?? "image/png" });
  const cells = cullCells(present.rows, view.items);
  const firstMime = (run: Run) => mediaOf(cells[run.members[0] ?? -1]?.id ?? "").mime;
  const tabs = tabsOf(categoriesOf(runsOf(cells, present.rows), firstMime));
  // The tab shown is the tab of the run under the cursor - there is no second state to keep in step:
  // picking a tab moves the cursor into it, and the commit's refusal, taking the cursor to the first
  // open variant, takes the tab with it. The cursor walks its own tab's runs.
  const tabOfRun = (r: Run | undefined): Tab => (r === undefined ? (tabs[0]?.tab ?? "images") : tabOf(categoryOf(r, firstMime(r))));
  const orderOf = (t: Tab) => (tabs.find((x) => x.tab === t)?.categories ?? []).flatMap((c) => c.runs.map((r) => r.at));
  const wordy = (r: Run) => wordsOnly(firstMime(r));
  // A words-only run is one line of a list: ↑ ↓ move a line, whatever the tiles above it measure.
  const d = useRunDesk({ packet, verdicts, decide, undo, onCommit, announce, keys, columns: () => (d.run !== undefined && wordy(d.run) ? 1 : cols), arrange: (runs, at) => orderOf(tabOfRun(runs[at])) });
  const tab = tabOfRun(d.run);
  const here = tabs.find((t) => t.tab === tab) ?? tabs[0];
  const { setOpen } = d;
  // A words-only run never opens: it is decided where it lies.
  const open = d.open && d.run !== undefined && !wordy(d.run);
  /** The shown tab's categories, only the runs that are (or are not) words. */
  const shown = (words: boolean) => (here?.categories ?? []).map((c) => ({ ...c, runs: c.runs.filter((x) => wordy(x.run) === words) })).filter((c) => c.runs.length > 0);

  useEffect(() => {
    const el = grid.current;
    if (el === null || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setCols(columnsOf(el)));
    ro.observe(el);
    setCols(columnsOf(el));
    return () => ro.disconnect();
  }, [tab]);

  const reasons = view.reasons.list;
  const foot = <CullFoot tally={tallyOf(d.cells, verdicts)} reasons={reasons.length} audio={view.lane === "audio"} refusals={d.refusals} busy={busy} onCommit={d.commit} />;
  const pick = (t: Tab) => {
    const first = tabs.find((x) => x.tab === t)?.categories[0]?.runs[0];
    if (first !== undefined) d.setCur(first.run.members[0] ?? 0);
  };
  const run = d.run;
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
        open && run !== undefined ? (
          <RunModal
            category={categoryOf(run, firstMime(run))}
            label={run.words?.label ?? run.row}
            position={`${d.runIx + 1}/${d.runs.length}`}
            {...(run.words?.use !== undefined ? { use: run.words.use } : {})}
            {...(run.words?.aim !== undefined ? { aim: run.words.aim } : {})}
            {...(run.words?.ref !== undefined ? { reference: run.words.ref } : {})}
            {...(run.words?.checks !== undefined ? { checks: run.words.checks } : {})}
            runVerdict={runVerdictOf(run, d.cells, verdicts)}
            reasons={reasons}
            maxReasons={view.reasons.max}
            onRunVerdict={(v) => d.decideCells(run.members, v, run.words?.label ?? run.row)}
            onClose={() => setOpen(false)}
            live={keys}
            foot={foot}
          >
            <RunView run={run} cells={d.cells} verdicts={verdicts} mediaOf={mediaOf} wordsOf={d.wordsOf} cur={d.cur} nudged={d.nudged} reasons={reasons} maxReasons={view.reasons.max} onFocus={d.setCur} onVerdict={(i, v) => d.decideItem(i, v)} />
          </RunModal>
        ) : undefined
      }
    >
      {tabs.length > 1 && (
        <div className={s.tabs}>
          <Seg label="content" options={tabs.map((t) => ({ value: t.tab, label: t.tab, count: t.categories.reduce((n, c) => n + c.runs.length, 0) }))} value={here?.tab ?? tab} onChange={pick} />
        </div>
      )}
      {here?.tab === "ideas" ? (
        <>
          {shown(false).length > 0 && <RunMosaic tab="ideas" categories={shown(false)} cells={d.cells} verdicts={verdicts} mediaOf={mediaOf} wordsOf={d.wordsOf} runIx={d.runIx} nudged={d.nudged} onOpen={d.openRun} grid={grid} />}
          {shown(true).length > 0 && <IdeaList categories={shown(true)} cells={d.cells} verdicts={verdicts} wordsOf={d.wordsOf} cur={d.cur} nudged={d.nudged} reasons={reasons} maxReasons={view.reasons.max} onFocus={d.setCur} onVerdict={(i, v) => d.decideItem(i, v)} />}
        </>
      ) : here !== undefined ? (
        <RunMosaic tab={here.tab} categories={here.categories} cells={d.cells} verdicts={verdicts} mediaOf={mediaOf} wordsOf={d.wordsOf} runIx={d.runIx} nudged={d.nudged} onOpen={d.openRun} grid={grid} />
      ) : null}
    </DeskFrame>
  );
}
