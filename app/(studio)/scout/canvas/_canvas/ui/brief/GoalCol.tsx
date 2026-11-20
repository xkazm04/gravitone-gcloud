"use client";

// THE ROUND'S GOAL - its words, and how many episodes each channel should get tonight (0-20). Port of the winner's
// brief.js goal column; BriefDesk saves it through acts.setGoal when the side holds a steer.

import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";

import type { RoundGoal } from "../../../_port/contract.ts";
import type { Scene } from "../../scene/types.ts";
import { TextArea } from "@gt/ui/components/field/Field.tsx";
import { Chip, cx, kit } from "../kit.tsx";
import d from "../desk.module.css";

type Chan = Scene["channels"][number];

/** `n` episodes for `channel`: 0 drops the target, at most 20. */
export function withTarget(goal: RoundGoal, channel: string, n: number): RoundGoal {
  const rest = goal.targets.filter((t) => t.channel !== channel);
  if (n <= 0) return { ...goal, targets: rest };
  const had = goal.targets.some((t) => t.channel === channel);
  const next = { channel, n: Math.min(20, n) };
  return { ...goal, targets: had ? goal.targets.map((t) => (t.channel === channel ? next : t)) : [...goal.targets, next] };
}

export function GoalCol({ goal, onGoal, channels, can, refusal }: { readonly goal: RoundGoal; readonly onGoal: (g: RoundGoal) => void; readonly channels: readonly Chan[]; readonly can: boolean; readonly refusal: string | undefined }) {
  return (
    <div className={d.col}>
      <h3>Goal {!can && <Chip tone="planned">planned</Chip>}</h3>
      {!can && refusal !== undefined && <ErrorLine message={refusal} />}
      <TextArea skin={cx(kit.in, d.goalText)} label="Goal for the round" value={goal.text} onChange={(text) => onGoal({ ...goal, text })} />
      <div className={d.targets}>
        {channels.map((c) => {
          const n = goal.targets.find((t) => t.channel === c.id)?.n ?? 0;
          return (
            <div key={c.id} className={d.target}>
              <b>{c.id}</b>
              <span>
                {c.name} <small>{c.medium === "reel" ? "reel" : "storyboard"}</small>
              </span>
              <span className={d.stepper}>
                <button type="button" aria-label={`One fewer for ${c.id}`} onClick={() => onGoal(withTarget(goal, c.id, n - 1))}>
                  −
                </button>
                <b className={cx(n > 0 && d.on)}>{n}</b>
                <button type="button" aria-label={`One more for ${c.id}`} onClick={() => onGoal(withTarget(goal, c.id, n + 1))}>
                  +
                </button>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
