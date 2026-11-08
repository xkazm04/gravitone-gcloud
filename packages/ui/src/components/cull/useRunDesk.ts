"use client";

// THE RUN DESK'S STATE AND KEYS - shared by the run-grid variants of the cull (prototype,
// 2026-10-22). Two layers over one cursor (`cur`, a cell index, as the row desk keeps it):
//
//   grid  the packet as runs. ← → walk the runs, ↑ ↓ a line of them; Z or a click opens one.
//   run   one run's variants, large. ← → walk its variants, ↑ ↓ the neighbouring run (still
//         open); Z or Esc back to the grid.
//
// TWO TRIAGE LEVELS (operator, 2026-10-23): the verdict keys judge the WHOLE run, in both layers, and
// move to the next run. An item differs from its run by click, or ⇧1 / ⇧2 on the variant under the
// cursor of an opened run - the subject may not fit.
//
// THE NUMBER ROW (spark scout-storyboards, the operator: "1 keep, 2-4 reject with reason 1-3 in order,
// 5 reject without reason, the reason will be clicked"): 1 keeps, 2 / 3 / 4 reject with the first three
// of the run's GROUP order (@gt/domain/source `reasonsOf`: a 3D run's keys name a mesh's defects, an
// idea's an idea's), 5 rejects bare and STAYS with the run's reason chips drawn and focused. The chip
// clicked sets the reason; where the source requires one, that click moves on to the next open run. The run's verdict is read
// off its items (runs.ts `runState`, `itemAct`): keeping an item keeps the run (its open items with
// it), and a run whose every item is rejected is rejected.
//
// ⌫ and ⏎ are the same in both: the gate's undo, and the commit that refuses while anything is
// open - jumping to the first open variant's run, opened, and flashing what is open. A packet whose source
// commits in PARTS (`present.partial`, spark scout-storyboards) commits what is decided and leaves the rest
// for the remainder packet (cull.ts `commitGate`); it still refuses a reasonless reject, and an empty commit.
//
// EVERY REJECT NEEDS A REASON where the source says so (spark scout-decision-graph, the vocabulary's
// `required`): a reasonless reject is OPEN to the commit as an undecided tile is (flashed, jumped to,
// announced `<n> need a reason`).
//
// A NOTE (E, a source with `noteMax`) BELONGS TO THE RUN and is written on the run's first cell. The run it
// is for is the one the verdict keys just judged - the cursor has already moved on - until the cursor is
// deliberately moved, unless the cursor's own run holds a verdict (cull.ts `noteRunOf`). The field opens in
// place on a words-only row and in the opened run's head on a picture run; ⏎ saves and Esc leaves, and
// neither moves the cursor: it returns to where E found it. A refusal is shown (`refuse`), not only said.
// A note rides its verdict: every verdict key carries the note the tile holds; U clears both.
import { reasonsOf } from "@gt/domain/source";
import { useEffect, useState } from "react";

import type { BoardPacket } from "../../board/port.ts";
import type { BoardVerdict } from "../../board/boardGate.ts";
import { chipThen, clamp, commitGate, cullCells, keepingNote, nextOpen, noteAct, noteCellOf, noteOfRun, noteRunOf, notDoneOf, notDoneWords, runKeyAct, undecidedOf } from "../../board/cull.ts";
import { itemAct, runAt, runsOf, runVerdictOf, type Run } from "../../board/runs.ts";
import { useKeys } from "../../keymap/dispatch.ts";
import { cullFacts } from "./CullFoot.tsx";

export type RunDeskInput = {
  readonly packet: BoardPacket;
  readonly verdicts: Readonly<Record<string, BoardVerdict>>;
  readonly decide: (ids: readonly string[], v: BoardVerdict | null, label: string) => void;
  readonly undo: () => void;
  readonly onCommit: () => void;
  readonly announce: (message: string) => void;
  /** A refusal the operator must SEE (a toast), beside the polite region. */
  readonly refuse?: (message: string) => void;
  readonly keys: boolean;
  /** Runs per grid line now (the variant measures its own grid). */
  readonly columns: () => number;
  /** The runs in the order they are DRAWN around the current one (indices into the packet's runs):
   *  ← → ↑ ↓ walk this. Handed the run the cursor is on, so a desk that draws runs in tabs walks
   *  the cursor's own tab. */
  readonly arrange?: (runs: readonly Run[], current: number) => readonly number[];
  /** A run that is only words: decided, and noted, where it lies - never opened. */
  readonly wordy?: (run: Run) => boolean;
};

export function useRunDesk({ packet, verdicts, decide, undo, onCommit, announce, refuse: showRefusal, keys, columns, arrange, wordy }: RunDeskInput) {
  const { view, present } = packet;
  const required = view.reasons.required === true;
  /** The source commits in parts: undecided runs go on to the remainder packet instead of blocking the commit. */
  const partial = present.partial === true;
  const noteMax = view.reasons.noteMax;
  const cells = cullCells(present.rows, view.items);
  const runs: Run[] = runsOf(cells, present.rows);
  const [cur, setCurRaw] = useState(() => Math.max(0, undecidedOf(cells, verdicts)[0] ?? 0));
  const [open, setOpen] = useState(false);
  const [nudged, setNudged] = useState<ReadonlySet<number>>(new Set());
  const [refusals, setRefusals] = useState(0);
  /** The tile whose note is being written, and its draft. */
  const [noting, setNoting] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  /** The run 5 left rejected without a reason, its chips asked for. */
  const [asking, setAsking] = useState<number | null>(null);
  /** The run the verdict keys last judged, until the cursor is deliberately moved: E notes it. */
  const [judged, setJudged] = useState<number | null>(null);
  /** Where the cursor (and the opened run) were when a note took it to the judged run: a note moves nothing. */
  const [back, setBack] = useState<{ readonly cur: number; readonly open: boolean } | null>(null);
  const runIx = runAt(runs, cur);
  const run = runs[runIx];
  const order = arrange?.(runs, runIx) ?? runs.map((_, i) => i);
  /** A run's reasons in its group's order: the chips draw it, keys 2-4 name its first three. */
  const reasonsFor = (r: Run | undefined) => ({ ...view.reasons, list: reasonsOf(view.reasons, r?.group) });
  const runVerdict = run === undefined ? undefined : runVerdictOf(run, cells, verdicts);
  /** The chips are asked for while the run 5 rejected still names no reason. */
  const ask = asking === runIx && runVerdict?.verdict === "reject" && runVerdict.reasons.length === 0;

  useEffect(() => {
    if (nudged.size === 0) return;
    const t = setTimeout(() => setNudged(new Set()), 950);
    return () => clearTimeout(t);
  }, [nudged]);

  useEffect(() => {
    // A run's card on the mosaic, else the variant itself (inside an opened run, and in the ideas list).
    (document.querySelector(open ? `[data-tile="${cur}"]` : `[data-run="${runIx}"]`) ?? document.querySelector(`[data-tile="${cur}"]`))?.scrollIntoView({ block: "nearest" });
  }, [cur, runIx, open]);

  /** The cursor, moved on purpose: the judged run is let go. The keys' own advance moves it raw. */
  const setCur = (i: number) => {
    setJudged(null);
    setCurRaw(i);
  };
  const refuse = (message: string) => {
    announce(message);
    showRefusal?.(message);
  };
  const wordsOf = (id: string) => present.items[id] ?? { label: id };
  /** Where a run is drawn, and the run drawn at a position (clamped). */
  const posOf = (run: number): number => Math.max(0, order.indexOf(run));
  const toPos = (p: number, keepJudged = false) => {
    const r = runs[order[Math.max(0, Math.min(order.length - 1, p))] ?? 0];
    if (r === undefined) return;
    if (keepJudged) setCurRaw(r.members[0] ?? 0);
    else setCur(r.members[0] ?? 0);
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
    // Each tile keeps the note it holds: tiles holding the same one are one write (in a run with no note,
    // the whole act is one write, as before).
    const groups = new Map<string, string[]>();
    for (const id of ids) {
      const key = keepingNote(verdicts[id], v)?.note ?? "";
      groups.set(key, [...(groups.get(key) ?? []), id]);
    }
    for (const group of groups.values()) decide(group, keepingNote(verdicts[group[0] ?? ""], v), label);
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
    const gate = commitGate(cells, verdicts, required, partial);
    if (gate.kind === "go") {
      if (gate.later > 0) announce(`commit ${cells.length - gate.later} · ${gate.later} later`);
      onCommit();
      return;
    }
    const left = gate.left;
    const first = left.all[0];
    if (first === undefined) return;
    setRefusals((n) => n + 1);
    setNudged(new Set(left.all));
    setCur(first);
    setOpen(true);
    announce(notDoneWords(left));
  };
  /** Leave the note field: the cursor and the opened run go back to where E found them. */
  const finishNote = () => {
    setNoting(null);
    if (back === null) return;
    setCurRaw(back.cur);
    setOpen(back.open);
    setBack(null);
  };
  /** E: the run just judged while the cursor's own run has no verdict, else the cursor's run; written on its first cell. */
  const startNote = () => {
    if (noteMax <= 0 || run === undefined) return;
    const at = noteRunOf(runs, cells, verdicts, runIx, judged);
    const target = runs[at];
    if (target === undefined) return;
    const cell = noteCellOf(target);
    const id = cells[cell]?.id ?? "";
    if (verdicts[id] === undefined) return refuse(`${wordsOf(id).label}: a note rides a verdict, keep or reject it first`);
    setDraft(noteOfRun(target.members, cells, verdicts) ?? "");
    setNoting(cell);
    if (at !== runIx) {
      setBack({ cur, open });
      setCurRaw(cell);
    }
    // A words-only row holds its field in place; a picture run is opened to hold it.
    if (wordy?.(target) !== true) setOpen(true);
  };
  const saveNote = () => {
    if (noting === null) return;
    const id = cells[noting]?.id ?? "";
    const act = noteAct(verdicts[id], draft, noteMax);
    const members = runs[runAt(runs, noting)]?.members ?? [noting];
    finishNote();
    if (act.kind === "refuse") return refuse(act.why);
    const label = wordsOf(id).label;
    decide([id], act.verdict, label);
    // A cleared note is cleared everywhere the run carried one, or it would show again from another variant.
    if (act.cleared) {
      for (const m of members) {
        const other = cells[m]?.id ?? "";
        const held = verdicts[other];
        if (m === noting || held?.note === undefined) continue;
        const { note: _was, ...bare } = held;
        decide([other], bare, label);
      }
    }
    announce(act.cleared ? `${label}: note cleared` : `${label}: note saved`);
  };
  /** The keys' verdict: always the whole run, then the next run (opened, when one is). */
  const judge = (v: BoardVerdict) => {
    whole(v);
    setJudged(runIx);
    toPos(posOf(runIx) + 1, true);
  };
  /** 1, 2-4 and 5 on the run (cull.ts `runKeyAct`), and where the cursor goes after. */
  const verdictKey = (verb: string, cap: string) => {
    if (run === undefined) return;
    setAsking(null);
    const act = runKeyAct(verb, cap, reasonsFor(run).list, view.reasons.max, runVerdict, required);
    if (act === null) return;
    if (act.kind === "refuse") return announce(act.why);
    whole(act.verdict);
    setJudged(runIx);
    if (act.then === "advance") return toPos(posOf(runIx) + 1, true);
    if (act.then !== "ask") return;
    setAsking(runIx);
    // A picture run's chips are in its opened head; a words row holds its own.
    if (wordy?.(run) !== true) setOpen(true);
  };
  /** A chip's click on the run 5 asked about: where a reason is required, the reason given moves on. */
  const answered = (runOf: number, v: BoardVerdict | null) => {
    if (chipThen(required, asking === runOf, v) !== "advance") return;
    setJudged(runOf);
    toPos(nextOpen(order, posOf(runOf), runs, cells, verdicts, required), true);
  };
  /** One item's verdict, with what it moves in its run (`itemAct`). */
  const item = (i: number, v: BoardVerdict | null) => {
    const r = runs[runAt(runs, i)];
    if (r === undefined) return;
    const moved = itemAct(r, cells, verdicts, i, v);
    mark(moved, v, moved.length > 1 ? `${wordsOf(cells[i]?.id ?? "").label} and the run` : undefined);
  };

  useKeys(
    "board.cull",
    {
      keep: ({ cap }) => verdictKey("keep", cap),
      reason: ({ cap }) => verdictKey("reason", cap),
      reject: ({ cap }) => verdictKey("reject", cap),
      undecide: () => run !== undefined && mark(run.members, null, run.words?.label ?? run.row),
      prev: () => (open ? setCur(clamp(cells, cur - 1)) : toPos(posOf(runIx) - 1)),
      next: () => (open ? setCur(clamp(cells, cur + 1)) : toPos(posOf(runIx) + 1)),
      "row-up": () => toPos(posOf(runIx) - (open ? 1 : columns())),
      "row-down": () => toPos(posOf(runIx) + (open ? 1 : columns())),
      // An item only inside an opened run; on the grid no item is under the cursor, so the run.
      "keep-item": () => {
        if (!open) return judge({ verdict: "keep", reasons: [] });
        item(cur, { verdict: "keep", reasons: [] });
        nextInRun();
      },
      "reject-item": () => {
        if (!open) return judge({ verdict: "reject", reasons: [] });
        item(cur, { verdict: "reject", reasons: [] });
        nextInRun();
      },
      zoom: () => setOpen((o) => !o),
      note: startNote,
      "save-note": saveNote,
      "cancel-note": finishNote,
      undo: () => {
        undo();
        announce("undone");
      },
      commit,
    },
    { enabled: keys, facts: cullFacts(view.reasons) },
  );

  const openRun = (i: number) => {
    toRun(i);
    setOpen(true);
  };
  /** A verdict by click on these cells: the same act the keys make, the cursor on the first. */
  const decideCells = (idx: readonly number[], v: BoardVerdict | null, what?: string) => {
    const first = idx[0];
    if (first === undefined) return;
    setCur(first);
    mark(idx, v, what);
    answered(runAt(runs, first), v);
  };
  /** An item's verdict by click: it moves what `itemAct` says, the cursor on the item. A words row's one
   *  item is its run, so its chip answers what 5 asked; one variant of a picture run does not. */
  const decideItem = (i: number, v: BoardVerdict | null) => {
    setCur(i);
    item(i, v);
    const at = runAt(runs, i);
    if (runs[at]?.members.length === 1) answered(at, v);
  };
  /** The note being written, while it is: the tile, its draft and the field's acts. */
  const note = noting === null ? undefined : { cell: noting, draft, setDraft, save: saveNote, max: noteMax };
  const cancelNote = finishNote;
  const gate = commitGate(cells, verdicts, required, partial);
  return { cells, runs, run, runIx, cur, setCur, open, setOpen, nudged, refusals, commit, wordsOf, openRun, decideCells, decideItem, note, cancelNote, reasonless: notDoneOf(cells, verdicts, required).reasonless.length, later: gate.kind === "go" ? gate.later : 0, reasonsFor, ask };
}
