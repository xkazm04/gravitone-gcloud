"use client";

// THE NEXT NIGHT, ON THE DESK - the round's goal and per-channel targets, the advisory split and the pauses, the notes
// pinned on the map, and dispatch as the exact `/scout night` line. Port of the winner's brief.js `render()`.
// The goal and the split are held here while they are typed or dragged and saved after a 600 ms rest (acts.setGoal,
// acts.split); a side that refuses rolls the store back and its sentence shows. The command line always reads what is
// on the desk, so a side that cannot save still hands the operator the whole round to run by hand.

import { useEffect, useState } from "react";

import { useKeys } from "@gt/ui/keymap/dispatch";

import type { RoundGoal } from "../../_port/contract.ts";
import { setGoal, split as saveSplit } from "../acts.ts";
import { useCanvas } from "../useCanvas.ts";
import { command, rebalance, type Aud } from "./brief/command.ts";
import { copyCommand, DispatchCol } from "./brief/DispatchCol.tsx";
import { GoalCol } from "./brief/GoalCol.tsx";
import { NotesCol } from "./brief/NotesCol.tsx";
import { SplitCol } from "./brief/SplitCol.tsx";
import { Chip, cx, Gl, kit } from "./kit.tsx";
import d from "./desk.module.css";

const REST_MS = 600;

const sameGoal = (a: RoundGoal, b: RoundGoal): boolean =>
  a.text === b.text && a.targets.length === b.targets.length && a.targets.every((t, i) => t.channel === b.targets[i]?.channel && t.n === b.targets[i]?.n);

const sameSplit = (a: Readonly<Record<string, number>>, b: Readonly<Record<string, number>>): boolean => {
  const ks = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...ks].every((k) => a[k] === b[k]);
};

export function BriefDesk() {
  const st = useCanvas();
  const caps = st.view.caps;
  const [goal, setGoalDraft] = useState<RoundGoal>(() => st.ui.goal);
  const [split, setSplitDraft] = useState<Readonly<Record<string, number>>>(() => ({ ...st.ui.split }));
  const [splitSet, setSplitSet] = useState(() => st.ui.splitSet);

  useEffect(() => {
    if (!caps.notes || sameGoal(goal, st.ui.goal)) return;
    const t = window.setTimeout(() => void setGoal(st, goal), REST_MS);
    return () => window.clearTimeout(t);
  }, [st, caps.notes, goal]);

  useEffect(() => {
    if (!caps.steer || !splitSet || sameSplit(split, st.ui.split)) return;
    const t = window.setTimeout(() => {
      void saveSplit(st, split).then(() => {
        setSplitDraft({ ...st.ui.split });
        setSplitSet(st.ui.splitSet);
      });
    }, REST_MS);
    return () => window.clearTimeout(t);
  }, [st, caps.steer, split, splitSet]);

  const kinds = new Map(st.scene.channels.map((c) => [c.id, c.medium === "reel" ? "reel" : "storyboard"]));
  const groups = new Set(st.view.graph.groups.map((g) => g.key));
  const cmd = command({
    mode: st.ui.mode,
    until: st.ui.until,
    goal,
    kindOf: (c) => kinds.get(c) ?? "storyboard",
    split,
    splitSet,
    pauses: st.scene.rivers.filter((r) => r.paused && (r.group === null || !groups.has(r.group))).map((r) => r.name),
    notes: st.ui.notes,
  });

  useKeys("canvas.desk", {
    run: () => copyCommand(st, cmd),
    close: () => st.closeSurface(),
  });

  return (
    <>
      <div className={d.bar}>
        <h2>Next night</h2>
        <Chip tone={st.ui.mode === "dry" ? undefined : "amber"}>{st.ui.mode === "dry" ? "--dry" : "live"}</Chip>
        <Chip>{`until ${st.ui.until}`}</Chip>
        <Chip tone="violet">{`${st.ui.notes.length} notes`}</Chip>
        <span className={d.grow} />
        <button type="button" className={d.iconbtn} aria-label="Close" onClick={() => st.closeSurface()}>
          <Gl name="x" size={14} />
        </button>
      </div>
      <div className={d.body}>
        <GoalCol goal={goal} onGoal={setGoalDraft} channels={st.scene.channels} can={caps.notes} refusal={st.view.refusals.notes} />
        <SplitCol
          st={st}
          split={split}
          can={caps.steer}
          onSplit={(k: Aud, v: number) => {
            setSplitDraft((s) => rebalance(s, k, v));
            setSplitSet(true);
          }}
        />
        <NotesCol st={st} />
        <DispatchCol st={st} cmd={cmd} />
      </div>
      <div className={d.foot}>
        <span className={d.grow} />
        {/* The canvas's port has no dispatch verb yet (contract.ts CanvasPort): the night runs from the copied line,
            and the key that would dispatch copies it instead. Wire `disabled` to caps.dispatch when the verb lands. */}
        <button type="button" className={cx(kit.btn, kit.primary)} disabled>
          Dispatch
        </button>
      </div>
    </>
  );
}
