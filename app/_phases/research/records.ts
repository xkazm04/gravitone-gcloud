// THE RESEARCH STEP'S RECORDS — declared here, by their owner, and imported by
// every other step that reads or grows them (Frames reads and grows
// `music-video-source`). The shapes themselves still live in
// ../_shared/stepStore.ts for now; moving them out is a later stage.

import {
  defineRecord,
  isPlainObject,
  malformed,
} from "../_shared/records/registry";
import type {
  BeatPicksStepData,
  MusicVideoSourceStepData,
  ResearchStepData,
  ScopeStepData,
} from "../_shared/stepStore";

/** The research gate: `researched` is what Script's gate reads. v1, every field
 *  optional — a record without `topic` is a music-video project's, which has
 *  none, and reads as the empty topic. */
export const RESEARCH = defineRecord<ResearchStepData>({
  key: "research",
  owner: "research",
  version: 1,
  parse: (raw) => {
    if (raw.topic !== undefined && typeof raw.topic !== "string") return malformed("research.topic is not text");
    return { ...raw, topic: (raw.topic as string | undefined) ?? "", researched: raw.researched === true };
  },
});

const FIELD_TYPES: Record<string, "string" | "number" | "object"> = {
  sourceAssetId: "string",
  style: "string",
  envelope: "object",
  posterAssetId: "string",
  seed: "number",
  effectParams: "object",
};

/** The music-video discipline's whole research output, grown by Frames (the
 *  poster, the seed, the effect parameters). Several writers, so it is only
 *  ever PATCHED — see `patchRecord`. A field of the wrong type refuses the
 *  record rather than being cast: a patch over a misread record would write the
 *  misreading back. */
export const MUSIC_VIDEO_SOURCE = defineRecord<MusicVideoSourceStepData>({
  key: "music-video-source",
  owner: "research",
  version: 1,
  parse: (raw) => {
    for (const [field, type] of Object.entries(FIELD_TYPES)) {
      const value = raw[field];
      if (value === undefined) continue;
      const ok = type === "object" ? isPlainObject(value) : typeof value === type;
      if (!ok) return malformed(`music-video-source.${field} is not a ${type}`);
    }
    return raw as MusicVideoSourceStepData;
  },
});

/** The beat board of a trailer / free project: picks, the confirmed spine, and
 *  the free discipline's facts-or-beats answer. Read by Script (the spine it
 *  composes from) and by the step verdicts. Its writer (useBeatPicks) never
 *  saves without a mode, so a record with none is not one it wrote. */
export const RESEARCH_BEATS = defineRecord<BeatPicksStepData>({
  key: "research-beats",
  owner: "research",
  version: 1,
  parse: (raw) => {
    if (raw.mode !== "facts" && raw.mode !== "beats") return malformed("research-beats.mode is neither facts nor beats");
    const picks = raw.picks ?? {};
    if (!isPlainObject(picks)) return malformed("research-beats.picks is not a map of slots");
    const confirmed = raw.confirmed ?? null;
    if (confirmed !== null && !isPlainObject(confirmed)) return malformed("research-beats.confirmed is not a spine");
    return { ...raw, picks, confirmed } as BeatPicksStepData;
  },
});

/** The creator's scope board and its confirmed checkpoint, and the digest of the
 *  notebook it was decided on. Still v1: the digest is additive, and its absence
 *  has a meaning (the fixture's — see ScopeStepData.digest). */
export const RESEARCH_SCOPE = defineRecord<ScopeStepData>({
  key: "research-scope",
  owner: "research",
  version: 1,
  parse: (raw) => {
    const scope = raw.scope ?? {};
    if (!isPlainObject(scope)) return malformed("research-scope.scope is not a map of cards");
    const confirmed = raw.confirmed ?? null;
    if (confirmed !== null && !isPlainObject(confirmed)) return malformed("research-scope.confirmed is not a map of cards");
    if (raw.digest !== undefined && typeof raw.digest !== "string") return malformed("research-scope.digest is not text");
    return { ...raw, scope, confirmed } as ScopeStepData;
  },
});
