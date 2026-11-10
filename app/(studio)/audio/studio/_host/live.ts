// THE LIVE CONVERSATION'S STATE, SAID (spark audio-agent-studio, stage S2), pure: what the dock's pill
// reads, and a recorded message the door refused in one plain banner line (the ledger port keeps
// every studio event it could not read as a `refused` line of its conversation; never skipped).
import type { DockState } from "@gt/ui/components/dock/dock.ts";

import type { RefusedTurn } from "../_port/port.ts";

/** The dock's state: the offline preview first, then a pending answer, then whether anyone listens -
 *  nobody listening is `waiting`: the message may still be sent and waits in the inbox. */
export function dockStateOf(offline: boolean, thinking: boolean, presence: "listening" | "nobody"): DockState {
  if (offline) return "offline";
  if (thinking) return "thinking";
  return presence === "listening" ? "listening" : "waiting";
}

/** A message sent while nobody listens: it is in the inbox, waiting for /studio-agent to look. */
export const WAITING_LINE = "your message waits in the inbox for /studio-agent";

export function refusedLines(refused: readonly RefusedTurn[]): string | null {
  if (refused.length === 0) return null;
  const head = refused.length === 1 ? "1 message in this conversation could not be read" : `${refused.length} messages in this conversation could not be read`;
  const rows = refused.map((r) => `${r.from === "agent" ? "an answer from the agent" : "a message from you"} (ledger event ${r.seq}): ${r.reason}`);
  return `${head}: ${rows.join("; ")}`;
}
