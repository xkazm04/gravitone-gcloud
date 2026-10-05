// THE UNDO STACK — session-only, pure, newest last.
//
// One entry per decision, but an entry is a LIST of changes, not one: an
// adoption or an alternative is a one-of-N pick, so approving candidate B
// silently un-approves A. An undo that only put B back to undecided would lose
// A — the creator's previous pick — which is exactly the kind of silent second
// decision this Board exists to stop. So after a decide the Board diffs the
// source and records every item that moved, and an undo replays them all,
// newest change first.
//
// Bounded, like StatReel's (apps/studio/src/board/undo-store.ts UNDO_CAP), and
// with its rule that a row holds at most one entry: a newer decision on the
// same item replaces the older one, so Z never walks an item back through a
// verdict that was already superseded.

import type { BoardVerdict } from "./types";

export interface VerdictState {
  verdict: BoardVerdict;
  reasons: string[];
  note: string | null;
}

export interface UndoChange {
  itemId: string;
  prev: VerdictState;
  next: VerdictState;
}

export interface UndoEntry {
  id: number;
  /** The item the human acted on — the one the toast and the lane name. */
  itemId: string;
  label: string;
  at: number;
  changes: UndoChange[];
}

export const UNDO_CAP = 50;

export function pushUndo(stack: readonly UndoEntry[], entry: UndoEntry, cap = UNDO_CAP): UndoEntry[] {
  const touched = new Set(entry.changes.map((c) => c.itemId));
  // A newer decision on any item this one touches supersedes the older entry.
  const kept = stack.filter((e) => !e.changes.some((c) => touched.has(c.itemId)));
  return [...kept, entry].slice(-cap);
}

export const latestUndo = (stack: readonly UndoEntry[]): UndoEntry | null => stack[stack.length - 1] ?? null;

export function popUndo(stack: readonly UndoEntry[]): [UndoEntry | null, UndoEntry[]] {
  return [latestUndo(stack), stack.slice(0, -1)];
}

/** The entry that holds a given item, for the Rejected lane's per-row Undo. */
export const undoFor = (stack: readonly UndoEntry[], itemId: string): UndoEntry | null =>
  [...stack].reverse().find((e) => e.changes.some((c) => c.itemId === itemId)) ?? null;

export const withoutUndo = (stack: readonly UndoEntry[], id: number): UndoEntry[] => stack.filter((e) => e.id !== id);

/** The writes an undo performs, each change back to what it was — DECISIONS
 *  BEFORE CLEARS. In a one-of-N source the clear of the newer pick is only
 *  writable once the older pick is back (a scene always uses one plate:
 *  lib/board/sources/alternative.ts refuses to clear the active one), and in
 *  every other source the order between distinct items is immaterial. */
export function reversal(entry: UndoEntry): { itemId: string; to: VerdictState }[] {
  const back = [...entry.changes].reverse().map((c) => ({ itemId: c.itemId, to: c.prev }));
  return [...back.filter((w) => w.to.verdict !== null), ...back.filter((w) => w.to.verdict === null)];
}

/** Every item whose verdict differs between two readings of a source. */
export function diffVerdicts(
  before: ReadonlyMap<string, VerdictState>,
  after: ReadonlyMap<string, VerdictState>,
): UndoChange[] {
  const out: UndoChange[] = [];
  for (const [id, next] of after) {
    const prev = before.get(id);
    if (!prev) continue;
    if (prev.verdict !== next.verdict || prev.reasons.join("|") !== next.reasons.join("|") || prev.note !== next.note)
      out.push({ itemId: id, prev, next });
  }
  return out;
}
