// THE SESSION UNDO STACK - pure, newest last. Moved from v1 lib/board/undo.ts with the gate
// kernel that reads it (app/foundry/gate/useGate.ts), because @gt/ui imports nothing from lib/.
//
// Kept as v1 wrote it, rule for rule:
//   · an entry is a LIST of changes (a row-wide ⇧K is one act; a one-of-N pick moves two
//     items), replayed newest change first;
//   · a newer decision on any item an older entry touched SUPERSEDES that entry, so an undo
//     never walks an item back through a verdict that was already overwritten;
//   · bounded (UNDO_CAP), the oldest aged out first;
//   · the reversal writes DECISIONS BEFORE CLEARS (a one-of-N source refuses to clear the
//     active pick until the older one is back).
// Dropped: `undoFor`, `withoutUndo`, `diffVerdicts` - the v1 Board's Rejected lane and its
// source diffing, which have no reader here.
//
// `verdict` is the source's own word (v1 said approve|reject, the kernel says keep|reject);
// the stack only ever asks whether it is null, so it does not pin a vocabulary.

export type VerdictState = {
  readonly verdict: string | null;
  readonly reasons: readonly string[];
  readonly note: string | null;
};

export type UndoChange = { readonly itemId: string; readonly prev: VerdictState; readonly next: VerdictState };

export type UndoEntry = {
  readonly id: number;
  /** The item the operator acted on - the one an announcement names. */
  readonly itemId: string;
  readonly label: string;
  readonly at: number;
  readonly changes: readonly UndoChange[];
};

export const UNDO_CAP = 50;

export function pushUndo(stack: readonly UndoEntry[], entry: UndoEntry, cap = UNDO_CAP): UndoEntry[] {
  const touched = new Set(entry.changes.map((c) => c.itemId));
  const kept = stack.filter((e) => !e.changes.some((c) => touched.has(c.itemId)));
  return [...kept, entry].slice(-cap);
}

export const latestUndo = (stack: readonly UndoEntry[]): UndoEntry | null => stack[stack.length - 1] ?? null;

export function popUndo(stack: readonly UndoEntry[]): readonly [UndoEntry | null, UndoEntry[]] {
  return [latestUndo(stack), stack.slice(0, -1)];
}

export function reversal(entry: UndoEntry): { readonly itemId: string; readonly to: VerdictState }[] {
  const back = [...entry.changes].reverse().map((c) => ({ itemId: c.itemId, to: c.prev }));
  return [...back.filter((w) => w.to.verdict !== null), ...back.filter((w) => w.to.verdict === null)];
}
