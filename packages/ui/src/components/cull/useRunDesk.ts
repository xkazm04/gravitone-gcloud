"use client";

// THE RUN DESK'S STATE AND KEYS - shared by the run-grid variants of the cull (prototype,
// 2026-10-22). Two layers over one cursor (`cur`, a cell index, as the row desk keeps it):
//
//   grid  the packet as runs. ← → walk the runs, ↑ ↓ a line of them; K / X / a reason judge the
//         WHOLE run as one act and move to the next; Z or a click opens it.
//   run   one run's variants, large. ← → walk its variants, ↑ ↓ the neighbouring run (still
//         open); K / X / a reason judge the variant and move on (into the next run at its end);
//         ⇧K / ⇧X the whole run; Z or Esc back to the grid.
//
// ⌫ and ⏎ are the same in both: the gate's undo, and the commit that refuses while anything is
// open - jumping to the first open variant's run, opened, and flashing what is open.
import { useEffect, useState } from "react";

import type { BoardPacket } from "../../board/port.ts";
import type { BoardVerdict } from "../../board/boardGate.ts";
import { clamp, cullCells, reasonAct, undecidedOf } from "../../board/cull.ts";
import { runAt, runsOf, type Run } from "../../board/runs.ts";
import { useKeys } from "../../keymap/dispatch.ts";

export type RunDeskInput = {
  readonly packet: BoardPacket;
  readonly verdicts: Readonly<Record<string, BoardVerdict>>;
  readonly decide: (ids: readonly string[], v: BoardVerdict | null, label: string) => void;
  readonly undo: () => void;
  readonly onCommit: () => void;
  readonly announce: (message: string) => void;
  readonly keys: boolean;
  /** Runs per grid line now (the variant measures its own grid). */
  readonly columns: () => number;
  /** The runs in the order they are DRAWN around the current one (indices into the packet's runs):
   *  ← → ↑ ↓ walk this. Handed the run the cursor is on, so a desk that draws runs in tabs walks
   *  the cursor's own tab. */
  readonly arrange?: (runs: readonly Run[], current: number) => readonly number[];
};

export function useRunDesk({ packet, verdicts, decide, undo, onCommit, announce, keys, columns, arrange }: RunDeskInput) {
  const { view, present } = packet;
  const cells = cullCells(present.rows, view.items);
  const runs: Run[] = runsOf(cells, present.rows);
  const [cur, setCur] = useState(() => Math.max(0, undecidedOf(cells, verdicts)[0] ?? 0));
  const [open, setOpen] = useState(false);
  const [nudged, setNudged] = useState<ReadonlySet<number>>(new Set());
  const [refusals, setRefusals] = useState(0);
  const runIx = runAt(runs, cur);
  const run = runs[runIx];
  const order = arrange?.(runs, runIx) ?? runs.map((_, i) => i);

  useEffect(() => {
    if (nudged.size === 0) return;
    const t = setTimeout(() => setNudged(new Set()), 950);
    return () => clearTimeout(t);
  }, [nudged]);

  useEffect(() => {
    // A run's card on the mosaic, else the variant itself (inside an opened run, and in the ideas list).
    (document.querySelector(open ? `[data-tile="${cur}"]` : `[data-run="${runIx}"]`) ?? document.querySelector(`[data-tile="${cur}"]`))?.scrollIntoView({ block: "nearest" });
  }, [cur, runIx, open]);

  const wordsOf = (id: string) => present.items[id] ?? { label: id };
  /** Where a run is drawn, and the run drawn at a position (clamped). */
  const posOf = (run: number): number => Math.max(0, order.indexOf(run));
  const toPos = (p: number) => {
    const r = runs[order[Math.max(0, Math.min(order.length - 1, p))] ?? 0];
    if (r !== undefined) setCur(r.members[0] ?? 0);
  };
  const toRun = (i: number) => {
    const r = runs[i];
    if (r !== undefined) setCur(r.members[0] ?? 0);
  };
  const mark = (idx: readonly number[], v: BoardVerdict | null, what?: string) => {
    const ids = idx.flatMap((i) => (cells[i] === undefined ? [] : [cells[i].id]));
    const first = ids[0];
    if (first === undefined) return;
    const label = what ?? (ids.length > 1 ? `${ids.length} items` : wordsOf(first).label);
    decide(ids, v, label);
    announce(`${label} ${v === null ? "undecided" : v.verdict}${v !== null && v.reasons.length > 0 ? `, ${v.reasons.join(", ")}` : ""}`);
  };
  const whole = (v: BoardVerdict) => {
    if (run === undefined) return;
    mark(run.members, v, run.words?.label ?? run.row);
  };
  const nextInRun = () => {
    if (run === undefined) return;
    const pos = run.members.indexOf(cur);
    const after = run.members[pos + 1];
    if (after !== undefined) setCur(after);
    else toPos(posOf(runIx) + 1);
  };
  const commit = () => {
    const pending = undecidedOf(cells, verdicts);
    const first = pending[0];
    if (first === undefined) {
      onCommit();
      return;
    }
    setRefusals((n) => n + 1);
    setNudged(new Set(pending));
    setCur(first);
    setOpen(true);
    announce(`${pending.length} undecided`);
  };
  const judge = (v: BoardVerdict) => {
    if (open) {
      mark([cur], v);
      nextInRun();
    } else {
      whole(v);
      toPos(posOf(runIx) + 1);
    }
  };

  useKeys(
    "board.cull",
    {
      keep: () => judge({ verdict: "keep", reasons: [] }),
      reject: () => judge({ verdict: "reject", reasons: [] }),
      undecide: () => (open ? mark([cur], null) : run !== undefined && mark(run.members, null, run.words?.label ?? run.row)),
      reason: ({ cap }) => {
        const at = cells[cur];
        if (at === undefined) return;
        const act = reasonAct(view.reasons.list, view.reasons.max, cap, verdicts[at.id]);
        if (act.kind === "refuse") return announce(act.why);
        if (open) {
          mark([cur], act.verdict);
          if (act.advance) nextInRun();
        } else {
          whole(act.verdict);
          if (act.advance) toPos(posOf(runIx) + 1);
        }
      },
      prev: () => (open ? setCur(clamp(cells, cur - 1)) : toPos(posOf(runIx) - 1)),
      next: () => (open ? setCur(clamp(cells, cur + 1)) : toPos(posOf(runIx) + 1)),
      "row-up": () => toPos(posOf(runIx) - (open ? 1 : columns())),
      "row-down": () => toPos(posOf(runIx) + (open ? 1 : columns())),
      "keep-row": () => whole({ verdict: "keep", reasons: [] }),
      "reject-row": () => whole({ verdict: "reject", reasons: [] }),
      zoom: () => setOpen((o) => !o),
      undo: () => {
        undo();
        announce("undone");
      },
      commit,
    },
    { enabled: keys },
  );

  const openRun = (i: number) => {
    toRun(i);
    setOpen(true);
  };
  /** A verdict by click on these cells: the same act the keys make, the cursor on the first. */
  const decideCells = (idx: readonly number[], v: BoardVerdict | null, what?: string) => {
    const first = idx[0];
    if (first !== undefined) setCur(first);
    mark(idx, v, what);
  };
  return { cells, runs, run, runIx, cur, setCur, open, setOpen, nudged, refusals, commit, wordsOf, openRun, decideCells };
}
