// WHICH ITEM A PACKET REVIEW DECIDES, AND WHEN IT COMMITS: pure, so no DOM is needed to test it.
// A packet of one item (an article) decides that item and commits at once. A packet of several
// (a Dojo review's claims) decides the focused item, then walks to the next undecided one, and
// commits only when every item holds a verdict - the verdict being given counts, the `verdicts`
// prop has not caught up with it yet.
import type { BoardVerdict } from "../../board/boardGate.ts";

export type ItemStep = {
  /** The id the verdict is written against. */
  readonly decide: string;
  /** Every item now holds a verdict: the commit may start. */
  readonly commit: boolean;
  /** Index of the next undecided item to focus, or null when there is none. */
  readonly next: number | null;
};

/** The step a verdict on `ids[focus]` takes; null when the focus names no item. */
export function stepItems(ids: readonly string[], verdicts: Readonly<Record<string, BoardVerdict>>, focus: number): ItemStep | null {
  const id = ids[focus];
  if (id === undefined) return null;
  if (ids.length <= 1) return { decide: id, commit: true, next: null };
  const open = (i: number) => i !== focus && verdicts[ids[i] as string] === undefined;
  const after = ids.map((_, k) => (focus + 1 + k) % ids.length).filter(open);
  return { decide: id, commit: after.length === 0, next: after[0] ?? null };
}

/** The reasons a reject starts from when focus lands on `id`: its recorded ones. */
export function seedReasons(verdicts: Readonly<Record<string, BoardVerdict>>, id: string | undefined): readonly string[] {
  return id === undefined ? [] : (verdicts[id]?.reasons ?? []);
}
