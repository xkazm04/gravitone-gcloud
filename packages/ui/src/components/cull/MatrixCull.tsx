"use client";

// THE MATRIX CULL - a packet of runs, decided (operator, 2026-10-22). The runs are filed by the KIND
// of content into tabs - images, videos, audio, ideas, storyboards - each drawn in the component its content
// reads best in: a mosaic of square stills, 16:9 clips that play, waveforms, and a dense list of the
// runs that are only words, decided in place, under the night's idea artboards (square tiles, as
// stills are: spark scout-idea-artboards). Any tab draws its words-only runs as that list under its mosaic:
// a dry night's storyboard is its words alone (spark scout-storyboards). A picture, clip or take run opens across the whole
// screen (RunModal): its brief, its variants at most three to a row, a verdict by click under each
// and on the whole run, a clip with its own bar. Every act is also a key (bindings.ts `board.cull`):
// 1 / 2-4 / 5 on a run judge it whole, ⇧1 / ⇧2 inside a run each variant; ← → ↑ ↓ walk;
// Z or a click opens; ⌫ undoes; ⏎ commits - refusing while anything is open, and taking the cursor
// (and the tab) to the first open variant. Where the source keeps a note, E writes one on the decision
// under the cursor: in place on a words row, in the opened run's head on a picture run.
//
// ONE VERDICT PASS (operator, 2026-11-20: "one button to enter verdict mode for all items in the run, now user need to
// go through separate sections"): V or the KindsBar's button opens the first open run and walks EVERY run of the
// packet in one order - the tabs' orders end to end, words-only runs opened like any other - so the keys' advance and
// up / down cross the tabs without a stop; a keep by click moves on too. Closing the run ends the pass. Every output
// kind is named above the desk with its tally (./KindsBar.tsx), and a reject always offers its note (./RejectNote.tsx).
import { useEffect, useRef, useState } from "react";

import { cullCells, noteCellOf, noteOfRun, tallyOf } from "../../board/cull.ts";
import { categoriesOf, categoryOf, columnsOf, inWordsCard, runsOf, runState, runVerdictOf, tabOf, tabsOf, wordsOnly, type Run, type Tab } from "../../board/runs.ts";
import { DeskFrame, OracleStrip } from "../desk/Desk.tsx";
import { CullFoot } from "./CullFoot.tsx";
import { IdeaList } from "./IdeaList.tsx";
import { KindsBar } from "./KindsBar.tsx";
import { NoteField, NoteText } from "./NoteField.tsx";
import type { MatrixCullProps } from "./props.ts";
import { RunModal } from "./RunModal.tsx";
import { RunMosaic } from "./RunMosaic.tsx";
import { RunView } from "./RunView.tsx";
import { SeriesBadge } from "./SeriesBadge.tsx";
import { useRunDesk } from "./useRunDesk.ts";
import s from "./Runs.module.css";

export type { MatrixCullProps } from "./props.ts";

export function MatrixCull({ packet, verdicts, decide, undo, onCommit, busy = false, announce = () => undefined, refuse, keys = true }: MatrixCullProps) {
  const { view, present } = packet;
  const grid = useRef<HTMLDivElement | null>(null);
  const [cols, setCols] = useState(1);
  const byId = new Map<string, (typeof view.items)[number]>(view.items.map((it) => [it.id, it]));
  const mediaOf = (id: string) => ({ url: byId.get(id)?.url ?? "", mime: byId.get(id)?.media.mime ?? "image/png" });
  const cells = cullCells(present.rows, view.items);
  const firstMime = (run: Run) => mediaOf(cells[run.members[0] ?? -1]?.id ?? "").mime;
  const cats = categoriesOf(runsOf(cells, present.rows), firstMime);
  const tabs = tabsOf(cats);
  /** The verdict pass is on: every run, in one order, opened in turn. */
  const [sweep, setSweep] = useState(false);
  // The tab shown is the tab of the run under the cursor - there is no second state to keep in step:
  // picking a tab moves the cursor into it, and the commit's refusal, taking the cursor to the first
  // open variant, takes the tab with it. The cursor walks its own tab's runs.
  const tabOfRun = (r: Run | undefined): Tab => (r === undefined ? (tabs[0]?.tab ?? "images") : tabOf(categoryOf(r, firstMime(r))));
  const orderOf = (t: Tab) => (tabs.find((x) => x.tab === t)?.categories ?? []).flatMap((c) => c.runs.map((r) => r.at));
  const words = (r: Run) => wordsOnly(firstMime(r));
  // In the pass nothing is decided in place: every run opens.
  const wordy = (r: Run) => !sweep && words(r);
  /** Every run, tab after tab: the pass's one order. */
  const everyRun = tabs.flatMap((t) => orderOf(t.tab));
  // A words-only run is one line of a list: ↑ ↓ move a line, whatever the tiles above it measure.
  const d = useRunDesk({ packet, verdicts, decide, undo, onCommit, announce, ...(refuse === undefined ? {} : { refuse }), keys, columns: () => (sweep || (d.run !== undefined && wordy(d.run)) ? 1 : cols), arrange: (runs, at) => (sweep ? everyRun : orderOf(tabOfRun(runs[at]))), wordy, lanes: tabs.map((t) => ({ tab: t.tab, order: orderOf(t.tab) })), sweep: () => startSweep() });
  const openRuns = (except?: number) => everyRun.filter((i) => i !== except && d.runs[i] !== undefined && runState(d.runs[i], d.cells, verdicts) === "open");
  const startSweep = () => {
    const first = openRuns()[0] ?? everyRun[0];
    if (first === undefined) return;
    setSweep(true);
    d.openRun(first);
    announce(`verdict mode · ${openRuns().length} open`);
  };
  /** The pass's previous or next run, whatever its state. */
  const stepRun = (dir: -1 | 1) => {
    const to = everyRun[everyRun.indexOf(d.runIx) + dir];
    if (to !== undefined) d.openRun(to);
  };
  /** After a keep by click in the pass: the next open run after this one, else the first still open. */
  const onward = () => {
    const left = openRuns(d.runIx);
    const here = everyRun.indexOf(d.runIx);
    const to = left.find((i) => everyRun.indexOf(i) > here) ?? left[0];
    if (to !== undefined) d.openRun(to);
  };
  const tab = tabOfRun(d.run);
  const here = tabs.find((t) => t.tab === tab) ?? tabs[0];
  const { setOpen } = d;
  // The run closed (Z, Esc, the cap): the pass is over.
  useEffect(() => {
    if (sweep && !d.open) setSweep(false);
  }, [sweep, d.open]);
  // A words-only run never opens outside the pass: it is decided where it lies.
  const open = d.open && d.run !== undefined && !wordy(d.run);
  /** The shown tab's categories, only the runs that are (or are not) words. */
  const shown = (w: boolean) => (here?.categories ?? []).map((c) => ({ ...c, runs: c.runs.filter((x) => words(x.run) === w) })).filter((c) => c.runs.length > 0);

  useEffect(() => {
    const el = grid.current;
    if (el === null || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setCols(columnsOf(el)));
    ro.observe(el);
    setCols(columnsOf(el));
    return () => ro.disconnect();
  }, [tab]);

  const reasons = view.reasons;
  const foot = <CullFoot tabs={tabs.length} tally={tallyOf(d.cells, verdicts)} reasonless={d.reasonless} later={d.later} reasons={reasons} {...(d.run === undefined ? {} : { group: d.run.group })} refusals={d.refusals} busy={busy} onCommit={d.commit} />;
  const note = d.note;
  const noteField =
    note === undefined ? undefined : <NoteField key={note.cell} label={d.wordsOf(d.cells[note.cell]?.id ?? "").label} value={note.draft} max={note.max} onChange={note.setDraft} onSave={note.save} />;
  const curNote = d.run === undefined ? undefined : noteOfRun(d.run.members, d.cells, verdicts);
  const run = d.run;
  const runV = run === undefined ? undefined : runVerdictOf(run, d.cells, verdicts);
  /** The whole run's reject note: on the run's note cell, where the source keeps one. */
  const rejectNote = run === undefined || d.noteMax <= 0 ? undefined : { max: d.noteMax, onSave: (t: string) => d.writeNote(noteCellOf(run), t) };
  return (
    <DeskFrame
      title={view.title ?? view.id}
      {...(present.meta !== undefined ? { meta: present.meta } : {})}
      {...(present.load !== undefined ? { load: present.load } : {})}
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
            position={sweep ? `${everyRun.indexOf(d.runIx) + 1}/${everyRun.length}` : `${d.runIx + 1}/${d.runs.length}`}
            {...(run.words?.use !== undefined ? { use: run.words.use } : {})}
            {...(run.words?.aim !== undefined ? { aim: run.words.aim } : {})}
            {...(run.words?.channel !== undefined ? { channel: run.words.channel } : {})}
            {...(run.words?.logline !== undefined ? { logline: run.words.logline } : {})}
            {...(run.words?.beats !== undefined ? { beats: run.words.beats } : {})}
            {...(run.words?.prompt !== undefined && !inWordsCard(run, d.cells, (id) => mediaOf(id).mime, d.wordsOf, run.words.prompt) ? { prompt: run.words.prompt } : {})}
            {...(run.words?.ref !== undefined ? { reference: run.words.ref } : {})}
            {...(run.words?.checks !== undefined ? { checks: run.words.checks } : {})}
            runVerdict={runV}
            reasons={d.reasonsFor(run)}
            ask={d.ask}
            onRunVerdict={(v) => {
              d.decideCells(run.members, v, run.words?.label ?? run.row);
              if (sweep && v?.verdict === "keep") onward();
            }}
            {...(rejectNote === undefined ? {} : { rejectNote })}
            {...(sweep ? { onStep: stepRun } : {})}
            {...(note !== undefined && run.members.includes(note.cell) ? { note: noteField } : curNote !== undefined && (runV?.verdict !== "reject" || rejectNote === undefined) ? { note: <NoteText text={curNote} /> } : {})}
            onClose={() => {
              d.cancelNote();
              setOpen(false);
            }}
            live={keys}
            foot={foot}
          >
            <RunView run={run} cells={d.cells} verdicts={verdicts} mediaOf={mediaOf} wordsOf={d.wordsOf} cur={d.cur} nudged={d.nudged} reasons={d.reasonsFor(run)} onFocus={d.setCur} onVerdict={(i, v) => d.decideItem(i, v)} />
          </RunModal>
        ) : undefined
      }
    >
      {cats.length > 0 && <KindsBar categories={cats} cells={d.cells} verdicts={verdicts} current={run === undefined ? undefined : categoryOf(run, firstMime(run))} onKind={(at) => d.setCur(d.runs[at]?.members[0] ?? 0)} open={openRuns().length} onSweep={startSweep} />}
      {here !== undefined && (
        <>
          {shown(false).length > 0 && <RunMosaic tab={here.tab} categories={shown(false)} cells={d.cells} verdicts={verdicts} mediaOf={mediaOf} wordsOf={d.wordsOf} runIx={d.runIx} nudged={d.nudged} onOpen={d.openRun} grid={grid} />}
          {shown(true).length > 0 && (
            <IdeaList
              categories={shown(true)}
              cells={d.cells}
              verdicts={verdicts}
              wordsOf={d.wordsOf}
              cur={d.cur}
              nudged={d.nudged}
              reasons={reasons}
              label={here.tab}
              {...(d.ask && run !== undefined ? { asked: run.members[0] ?? -1 } : {})}
              onFocus={d.setCur}
              onVerdict={(i, v) => d.decideItem(i, v)}
              {...(d.noteMax > 0 ? { onNote: (i: number, t: string) => d.writeNote(i, t), noteMax: d.noteMax } : {})}
              {...(note === undefined ? {} : { noting: { cell: note.cell, field: noteField } })}
            />
          )}
        </>
      )}
    </DeskFrame>
  );
}
