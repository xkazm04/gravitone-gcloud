// The cover desk's small vocabularies: a state's and a rights declaration's chip, a take's address, an error's
// words. Pure.
import type { CoverCard, CoverRights, CoverState, CoverTake, CoverTakeState } from "@gt/domain/cover";
import type { Tone } from "@gt/ui/components/chip/tone.ts";

export const RIGHTS_LABEL: Readonly<Record<CoverRights, string>> = { own: "own", licensed: "licensed", "third-party-uncleared": "third-party · uncleared" };
export const RIGHTS_TONE: Readonly<Record<CoverRights, Tone>> = { own: "neutral", licensed: "neutral", "third-party-uncleared": "amber" };

export const STATE_TONE: Readonly<Record<CoverState, Tone>> = { draft: "neutral", queued: "cyan", rendering: "cyan", judging: "amber", picked: "emerald", failed: "rose" };
export const TAKE_TONE: Readonly<Record<CoverTakeState, Tone>> = { pending: "neutral", done: "cyan", failed: "rose" };

// The twin of lib/sound/cover/rights.ts exportWarning, which is server-only (spark track-mirror-studio WP3 brief:
// the contract carries no warning, so the sentence is copied here). Change both or neither.
const YUE2_WEIGHTS = "YuE2 weights: CC BY-NC 4.0";
export function exportWarning(rights: CoverRights): string | undefined {
  return rights === "third-party-uncleared" ? `This is a cover of a third-party song with no licence recorded. Publishing it needs one. ${YUE2_WEIGHTS}.` : undefined;
}

/** The address a take plays from: the read keys takeUrls by seed (app/(studio)/audio/_cover/read.ts). */
export const takeUrl = (card: CoverCard, t: CoverTake): string | undefined => card.takeUrls[t.seed];

/** Every take the batch will hold, a pending row for one the record does not list yet. */
export function fiveTakes(takes: readonly CoverTake[], count: number): readonly CoverTake[] {
  return Array.from({ length: count }, (_, i) => takes.find((t) => t.n === i + 1) ?? { n: i + 1, seed: -1, state: "pending" as const });
}

export const seconds = (s: number): string => `${Math.round(s)} s`;

export function clock(s: number): string {
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}
