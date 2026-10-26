import { cellId, type CandidateId, type Night, type NightId, type ReelCandidate, type ReelCutCandidate, type ReelSource } from "./types";

// A REAL REEL'S VERDICT AND ITS BRIEF LINES - pure (spark scout-vision S5). What ./reel.ts reads to refuse a cut of a
// reel nobody kept, and the section ./taste.ts writes, kept apart from the act so the taste brief reads the rule without
// loading the producer (./storyboardKept.ts's split).
//
// A REEL is judged on its ONE cell `c-NN/reel` (its strip's frame 120); a CUT on its one cell `c-NN/video`. Kept = that
// cell kept on a live (not dry) committed night; a cell still `open` on a remainder packet is not kept.

export const REEL_PART = "reel";
export const REEL_CUT_PART = "video";
export const reelCell = (cid: CandidateId): string => cellId(cid, REEL_PART);
export const reelCutCell = (cid: CandidateId): string => cellId(cid, REEL_CUT_PART);

/** The on-screen source line, verbatim: `Source: <title>` (table, article) or `What if: <premise> (fiction)`. */
export const sourceLine = (s: ReelSource): string => (s.kind === "what-if" ? `What if: ${s.premise ?? s.title} (fiction)` : `Source: ${s.title}`);

/** The verdict a live committed night holds for `cell`: kept, rejected, or open (no commit, a dry one, a remainder cell). */
export function cellVerdict(n: Night, cell: string): "kept" | "rejected" | "open" {
  const k = n.committed;
  if (k === undefined || n.dry || k.dry || (k.open ?? []).includes(cell)) return "open";
  return k.kept.includes(cell) ? "kept" : k.rejected.includes(cell) ? "rejected" : "open";
}

/** The real reel some night already holds for `ideaRef` (any status but failed): one real reel per kept idea. */
export function realReelOf(nights: readonly Night[], ideaRef: string): { readonly night: NightId; readonly candidate: ReelCandidate } | undefined {
  for (const n of nights) for (const c of n.candidates) if (c.kind === "reel" && c.fromIdea === ideaRef && c.status !== "failed") return { night: n.id, candidate: c };
  return undefined;
}

/** The cut some night already holds for `reelRef` (any status but failed): one full cut per kept reel. */
export function reelCutOf(nights: readonly Night[], reelRef: string): { readonly night: NightId; readonly candidate: ReelCutCandidate } | undefined {
  for (const n of nights) for (const c of n.candidates) if (c.kind === "reel-cut" && c.fromReel === reelRef && c.status !== "failed") return { night: n.id, candidate: c };
  return undefined;
}

/**
 * The taste brief's `## Reels to cut`: every kept real reel no night holds a cut of, with its title, its source line and
 * the beats its 8 s strip kept - each a `scout reel-cut` waiting (30 s - 2 min). `- none` when nothing is due.
 */
export function reelsToCut(nights: readonly Night[]): string[] {
  const due: string[] = [];
  for (const n of nights) {
    for (const c of n.candidates) {
      if (c.kind !== "reel" || cellVerdict(n, reelCell(c.id)) !== "kept") continue;
      const ref = `${n.id}/${c.id}`;
      if (reelCutOf(nights, ref) !== undefined) continue;
      due.push(`- ${ref} · ${c.title} · ${sourceLine(c.source)} · from ${c.fromIdea ?? `episode ${c.fromEpisode ?? "-"}`}`, `  cut: ${c.cut.join(" / ")}`);
    }
  }
  return ["## Reels to cut", "", ...(due.length === 0 ? ["- none"] : due), ""];
}
