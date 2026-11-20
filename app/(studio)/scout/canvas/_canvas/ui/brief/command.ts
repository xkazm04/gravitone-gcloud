// THE NEXT NIGHT AS ONE COMMAND LINE - what `/scout night` is handed: dry or live, until when, the round's goal and
// per-channel targets, the advisory split once it is set, the branches paused here, and every note as the brief carries
// it (scopes.ts briefLine). Port of the winner's brief.js `command()`; pure.

import type { RoundGoal, ScoutNote } from "../../../_port/contract.ts";
import { briefLine } from "../../scene/scopes.ts";

export const AUD = ["adult", "family", "kids"] as const;
export type Aud = (typeof AUD)[number];
const OTHERS: Readonly<Record<Aud, readonly [Aud, Aud]>> = { adult: ["family", "kids"], family: ["adult", "kids"], kids: ["adult", "family"] };

/** Moving one audience's share rescales the other two; the three always sum to 100. */
export function rebalance(split: Readonly<Record<string, number>>, k: Aud, raw: number): Record<string, number> {
  const v = Math.max(0, Math.min(100, Math.round(raw)));
  const [o0, o1] = OTHERS[k];
  const rest = 100 - v;
  const sum = (split[o0] ?? 0) + (split[o1] ?? 0) || 1;
  const first = Math.round(((split[o0] ?? 0) / sum) * rest);
  return { ...split, [k]: v, [o0]: first, [o1]: rest - first };
}

export type NightCommand = {
  readonly mode: "dry" | "live";
  readonly until: string;
  readonly goal: RoundGoal;
  /** A target's kind by channel id: `reel` or `storyboard`. */
  readonly kindOf: (channel: string) => string;
  readonly split: Readonly<Record<string, number>>;
  readonly splitSet: boolean;
  readonly pauses: readonly string[];
  readonly notes: readonly ScoutNote[];
};

export function command(c: NightCommand): string {
  const goal = [c.goal.text, ...c.goal.targets.map((t) => `${t.n} × ${c.kindOf(t.channel)} ${t.channel}`)].filter((x) => x !== "");
  return (
    `/scout night${c.mode === "dry" ? " --dry" : ""} --until ${c.until}` +
    (c.goal.text !== "" || c.goal.targets.length > 0 ? `\ngoal: ${goal.join("; ")}` : "") +
    (c.splitSet ? `\nsplit: ${AUD.map((k) => `${k} ${c.split[k] ?? 0}%`).join(" · ")}` : "") +
    c.pauses.map((p) => `\npause: ${p}`).join("") +
    c.notes.map((n) => `\n${briefLine(n)}`).join("")
  );
}
