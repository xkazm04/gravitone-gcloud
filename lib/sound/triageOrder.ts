// THE ORDER TAKES ARE JUDGED IN - pure (Phase 6, L66; moved from v1 app/playground/triage/
// model.ts `ORIGIN_RANK` / `queueOrder`, which dies with the playground). The Board's audio pile
// (lib/decision/v1/sources/audio.ts) had dropped it for plain oldest-first; this puts it back,
// because the reason still holds: an agent's batch is the main inflow (pipeline/sound.mts generate
// lands takes unjudged with origin "agent") and somebody is waiting on it, so agents are heard
// first, then the operator's own lab and Library renders, then hunt leaves and Score cues, Suno
// returns, imports. Within an origin, OLDEST first: a batch is heard in the order it was made and
// a take that has waited longest is not buried by a fresh one. A fixture never waits - it is a
// design sample the ledger refuses, so judging it would teach nothing.
import type { SoundTake, TakeOrigin } from "./types.ts";

export const ORIGIN_RANK: { readonly [O in TakeOrigin]: number } = {
  agent: 0,
  lab: 1,
  library: 1,
  hunt: 2,
  score: 2,
  "suno-return": 3,
  import: 4,
  fixture: 9,
};

/** The judging queue: unjudged, non-fixture takes, by origin rank, then oldest, then id. */
export function judgingOrder<T extends Pick<SoundTake, "id" | "origin" | "verdict" | "createdAt">>(takes: readonly T[]): T[] {
  return takes
    .filter((t) => t.verdict === "unjudged" && t.origin !== "fixture")
    .sort((a, b) => ORIGIN_RANK[a.origin] - ORIGIN_RANK[b.origin] || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}
