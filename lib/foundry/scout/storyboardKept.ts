import { parseCellId, type Night, type NightId, type StoryboardCandidate } from "./types";

// THE STORYBOARD GATE AND ITS BRIEF LINES - pure (spark scout-storyboards). What ./storyboard.ts re-exports as
// `keptStoryboardFor`, and the two sections ./taste.ts writes, kept apart from the act so the taste brief and
// the graph read the rule without loading the producer.
//
// KEPT. A storyboard is judged WHOLE on its night's packet (the Board draws it as one run: its frames as
// `c-NN/panel-N` cells and its words as `c-NN/words`). It is kept when its WORDS cell is kept - the words are
// the vision a full video is made from - or when any of its cells is kept and none is rejected. Only a live
// night counts (a dry night's verdicts were over stand-ins), only once it has committed verdicts, and a
// night committed in parts counts its committed cells: a cell still `open` on the remainder packet is not
// kept. The newest such storyboard wins.

export const WORDS_PART = "words";

/** The storyboard's verdict on a committed live night: kept, rejected, or neither (undecided, or not judged). */
export function storyboardVerdict(n: Night, c: StoryboardCandidate): "kept" | "rejected" | undefined {
  const k = n.committed;
  if (k === undefined || n.dry || k.dry) return undefined;
  const open = new Set(k.open ?? []);
  const mine = (cells: readonly string[]): string[] => cells.filter((cell) => !open.has(cell) && parseCellId(cell)?.candidate === c.id);
  const kept = mine(k.kept);
  const rejected = mine(k.rejected);
  if (kept.some((cell) => parseCellId(cell)?.part === WORDS_PART)) return "kept";
  if (kept.length > 0 && rejected.length === 0) return "kept";
  return rejected.length > 0 ? "rejected" : undefined;
}

/**
 * THE GATE: the kept storyboard a full-video act grows from, by the idea it composes (`<night>/<c-id>`), or
 * null. Kept = its run was kept on a live (not dry) committed night - a part counts once committed.
 */
export function keptStoryboardFor(nights: readonly Night[], ideaRef: string): { readonly night: NightId; readonly candidate: StoryboardCandidate } | null {
  let best: { readonly night: NightId; readonly candidate: StoryboardCandidate } | null = null;
  for (const n of nights) {
    for (const c of n.candidates) {
      if (c.kind !== "storyboard" || c.fromIdea !== ideaRef || storyboardVerdict(n, c) !== "kept") continue;
      if (best === null || n.id.localeCompare(best.night) > 0) best = { night: n.id, candidate: c };
    }
  }
  return best;
}

/** The storyboard some night already holds for `ideaRef` (any status but failed): one storyboard per idea. */
export function storyboardOf(nights: readonly Night[], ideaRef: string): { readonly night: NightId; readonly candidate: StoryboardCandidate } | undefined {
  for (const n of nights) for (const c of n.candidates) if (c.kind === "storyboard" && c.fromIdea === ideaRef && c.status !== "failed") return { night: n.id, candidate: c };
  return undefined;
}

/**
 * The taste brief's `## Storyboards to make` - the kept ideas of the judged nights (live, committed) that no
 * night holds a storyboard for, each with its prompt: the words the storyboard reads the artboard as - and
 * `## Ready for full video`: every kept storyboard, by the idea it composes, with its title and paragraph.
 */
export function storyboardSections(judged: readonly Night[], nights: readonly Night[]): string[] {
  const toMake: string[] = [];
  for (const n of judged) {
    const k = n.committed;
    if (k === undefined) continue;
    const open = new Set(k.open ?? []);
    for (const c of n.candidates) {
      if (c.kind !== "idea") continue;
      const ref = `${n.id}/${c.id}`;
      const kept = k.kept.some((cell) => !open.has(cell) && parseCellId(cell)?.candidate === c.id);
      if (!kept || storyboardOf(nights, ref) !== undefined) continue;
      toMake.push(`- ${ref} · ${c.target} · ${c.genre ?? "-"} · ${c.aspect ?? "16:9"} · ${c.title}`, `  ${c.prompt}`);
    }
  }
  const ready: string[] = [];
  for (const n of nights) {
    for (const c of n.candidates) {
      if (c.kind !== "storyboard" || storyboardVerdict(n, c) !== "kept") continue;
      ready.push(`- ${c.fromIdea ?? `episode ${c.fromEpisode ?? "-"}`} · storyboard ${n.id}/${c.id} · ${c.title}`, `  ${c.paragraph}`);
    }
  }
  const none = (xs: readonly string[]): readonly string[] => (xs.length === 0 ? ["- none"] : xs);
  return ["## Storyboards to make", "", ...none(toMake), "", "## Ready for full video", "", ...none(ready), ""];
}
