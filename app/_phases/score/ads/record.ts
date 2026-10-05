// THE ADS SCORE RECORD — one music bed's pointers, declared step-local the way
// frames/records.ts and research/records.ts declare theirs.
//
// The bytes are the sound store's (lib/sound, origin "score"); this record holds
// only what the standard Score step keeps on a spot — the tempo the creator
// chose, the take ids the cue has had, and the one it USES — plus the scenario
// those takes were scored against, so a re-picked scenario reads as stale
// rather than silently inheriting a bed cut to another runtime.
//
// Finish reads `activeTakeId` as the render's `musicTakeId`.

import { defineRecord, malformed } from "../../_shared/records/registry";

export interface AdsScoreData {
  /** The picked scenario the takes were rendered for. */
  scenarioId: string | null;
  /** ABSENT until a human chooses one — never defaulted (CueSpot.bpm's rule). */
  bpm: number | null;
  /** Every take the bed has had, in arrival order. */
  takeIds: string[];
  /** The take the ad uses. */
  activeTakeId: string | null;
  savedAt?: number;
}

/** The bed's cue id in the sound store (`SoundTake.cueId`) — one per project. */
export const AD_BED_CUE_ID = "ad-bed";

export const ADS_SCORE = defineRecord<AdsScoreData>({
  key: "ads-score",
  owner: "score",
  version: 1,
  parse: (raw) => {
    if (raw.takeIds !== undefined && !Array.isArray(raw.takeIds)) return malformed("ads-score.takeIds is not a list");
    if (raw.bpm !== undefined && raw.bpm !== null && typeof raw.bpm !== "number") return malformed("ads-score.bpm is not a number");
    return {
      ...raw,
      scenarioId: typeof raw.scenarioId === "string" ? raw.scenarioId : null,
      bpm: typeof raw.bpm === "number" && Number.isFinite(raw.bpm) ? raw.bpm : null,
      takeIds: Array.isArray(raw.takeIds) ? raw.takeIds.filter((x): x is string => typeof x === "string") : [],
      activeTakeId: typeof raw.activeTakeId === "string" ? raw.activeTakeId : null,
    };
  },
});

export const EMPTY_ADS_SCORE: AdsScoreData = { scenarioId: null, bpm: null, takeIds: [], activeTakeId: null };
