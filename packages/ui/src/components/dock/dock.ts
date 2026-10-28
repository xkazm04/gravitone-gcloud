// The dock's words, pure (dock/Dock.tsx draws them): its states, and what the door dropped from a
// turn said for a non-musician - "1 piece could not be shown", then one line per item naming
// where it was, what it claimed to be and the door's reason.
import type { StudioDropped } from "@gt/domain/audio.studio";

export const DOCK_STATES = ["listening", "thinking", "offline"] as const;
export type DockState = (typeof DOCK_STATES)[number];

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** "show[4]" -> "piece 5", "actions[2]" -> "suggestion 3"; anything else as the door wrote it. */
export function placeWords(at: string): string {
  const m = /^(show|actions)\[(\d+)\]/.exec(at);
  if (m === null) return at;
  return `${m[1] === "show" ? "piece" : "suggestion"} ${Number(m[2]) + 1}`;
}

/** The disclosure's summary and rows; null when nothing was dropped (no disclosure at all). */
export function droppedWords(dropped: readonly StudioDropped[]): { readonly summary: string; readonly rows: readonly string[] } | null {
  if (dropped.length === 0) return null;
  const pieces = dropped.filter((d) => d.at.startsWith("show")).length;
  const actions = dropped.length - pieces;
  const parts = [pieces > 0 ? plural(pieces, "piece", "pieces") : null, actions > 0 ? plural(actions, "suggestion", "suggestions") : null].filter((x) => x !== null);
  const summary = `${parts.join(" and ")} could not be shown`;
  const rows = dropped.map((d) => `${placeWords(d.at)}${d.kind === "?" ? "" : ` (${d.kind})`}: ${d.reason}`);
  return { summary, rows };
}
