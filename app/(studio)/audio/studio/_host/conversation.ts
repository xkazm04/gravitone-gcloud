// THE FIXTURE CONVERSATION (spark audio-agent-studio, stage S1), pure. A scripted session is shown up
// to a cursor; a send - an agent-bound action pressed, or words typed in the dock - is ANSWERED only
// when the session's next turn is the user's and names that action (or says those words, ignoring
// case and the spaces around them). Then that user turn joins, the dock thinks for a moment, and
// the agent's reply joins after it. Anything else gets one plain line: the script has no answer.
// Stage S2 replaces the script with a live agent behind the same send.
import type { ParsedTurn } from "@gt/domain/audio.studio.door";

export const THINK_MS = 1200;

export const NO_ANSWER = "This scripted session has no answer to that yet (stage S1).";
export const OFFLINE_LINE = "No agent is listening, so that was not sent.";

export type Ask = { readonly action: string } | { readonly text: string };

/** The opening cursor: through the first agent reply (the user's first ask and its answer). */
export function openingCursor(turns: readonly ParsedTurn[]): number {
  const first = turns.findIndex((t) => t.turn.from === "agent");
  return first === -1 ? turns.length : first + 1;
}

const said = (s: string): string => s.trim().replace(/\s+/g, " ").toLowerCase();

/** Does the turn at `cursor` answer this ask: the user turn that follows in the script. */
export function answers(turns: readonly ParsedTurn[], cursor: number, ask: Ask): boolean {
  const next = turns[cursor]?.turn;
  if (next === undefined || next.from !== "user") return false;
  if ("action" in ask) return next.action === ask.action;
  return said(ask.text) !== "" && said(ask.text) === said(next.text);
}

/** The cursor once the agent has replied to the user turn at `cursor` (it stops at the script's end). */
export function replyCursor(turns: readonly ParsedTurn[], cursor: number): number {
  return turns[cursor]?.turn.from === "agent" ? cursor + 1 : cursor;
}

/** The newest agent turn shown, the one the dock and the panels speak for. */
export function visibleTurn(turns: readonly ParsedTurn[], cursor: number): ParsedTurn | null {
  for (let i = Math.min(cursor, turns.length) - 1; i >= 0; i--) if (turns[i]?.turn.from === "agent") return turns[i] ?? null;
  return null;
}
