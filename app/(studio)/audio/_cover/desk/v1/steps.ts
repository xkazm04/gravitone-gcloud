// THE CONSOLE'S STRIPS (prototype v1), pure: which strip a cover's state has open, where each strip stands (done, now,
// later), and the one line of facts a folded strip carries. Read off the record only.
//
// A failed cover opens two strips: the takes, where the failure's sentence is, and the plan, where the relaunch is.
// A draft whose brief is under way opens the song strip, where the brief is; any other draft opens the plan.
import type { CoverRecord } from "@gt/domain/cover";

import { briefInFlight } from "../brief/brief.ts";
import { clock } from "../words.ts";

export const STEPS = ["song", "plan", "takes", "pick", "remix"] as const;
export type StepId = (typeof STEPS)[number];
export type Phase = "done" | "now" | "later";

export function currentSteps(r: CoverRecord): readonly StepId[] {
  switch (r.state) {
    case "draft":
      return briefInFlight(r.brief) ? ["song"] : ["plan"];
    case "queued":
    case "rendering":
    case "judging":
      return ["takes"];
    case "failed":
      return ["takes", "plan"];
    case "picked":
      return r.remix === undefined ? ["pick"] : ["remix"];
  }
}

/** Where a strip stands: before the work's first open strip it is done, an open one is now, after it later. */
export function phaseOf(id: StepId, r: CoverRecord): Phase {
  const now = currentSteps(r);
  if (now.includes(id)) return "now";
  const first = Math.min(...now.map((x) => STEPS.indexOf(x)));
  return STEPS.indexOf(id) < first ? "done" : "later";
}

/** The first `n` words of a style, an ellipsis when it ran on. */
export function firstWords(text: string, n = 5): string {
  const words = text.trim().split(/[\s,]+/).filter((w) => w !== "");
  if (words.length === 0) return "";
  return words.length <= n ? words.join(" ") : `${words.slice(0, n).join(" ")} …`;
}

export const spanWords = (startS: number, endS: number): string => `${clock(startS)}–${clock(endS)}`;

/** `take 2 · s9020114`, the winner as the console names it. */
export function winnerWords(r: CoverRecord): string | null {
  if (r.winnerSeed === undefined) return null;
  const t = r.takes.find((x) => x.seed === r.winnerSeed);
  return t === undefined ? `s${r.winnerSeed}` : `take ${t.n} · s${t.seed}`;
}

/** A cover's age on the rack: minutes under two hours, hours under two days, days after. */
export function ageWords(at: string, nowMs: number): string {
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return "—";
  const m = Math.max(0, Math.floor((nowMs - t) / 60_000));
  if (m < 120) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h} h` : `${Math.floor(h / 24)} d`;
}
