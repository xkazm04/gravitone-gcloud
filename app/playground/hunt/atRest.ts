// THE HUNT AT REST — the hunt's counts, the length label, and the idea-box
// example per kind. Separate because none of it is about a selection or a
// render; it reads the hunt as it stands.

import type { Hunt, SoundKind } from "@/lib/sound/types";
import { buildTree } from "./tree";

/* ── the hunt at rest ──────────────────────────────────────────────────── */

export interface HuntCounts {
  leaves: number;
  rendered: number;
  awaiting: number;
  failed: number;
  winners: number;
}

export function countsOf(hunt: Pick<Hunt, "nodes">): HuntCounts {
  const t = buildTree(hunt.nodes);
  return {
    leaves: t.leaves.length,
    rendered: t.leaves.filter((l) => l.state === "rendered").length,
    awaiting: t.leaves.filter((l) => l.state === "awaiting-return").length,
    failed: t.leaves.filter((l) => l.state === "failed").length,
    winners: t.leaves.filter((l) => l.winner).length,
  };
}

/** A leaf's length: seconds to a tenth under ten (an SFX leaf can be 0.6s),
 *  m:ss above. */
export function lengthOf(s: number): string {
  if (!Number.isFinite(s) || s <= 0) return "–";
  if (s < 10) return `${Math.round(s * 10) / 10}s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
}

/** Example problems for the idea box, per kind — the operator's own examples
 *  from the round-4 brief, so the box shows the SHAPE of a good idea. */
export const IDEA_EXAMPLE: Record<SoundKind, string> = {
  music: "a tense but hopeful underscore for a 60s explainer about inflation",
  sfx: "a satisfying UI confirm sound",
};
