// THE RESEARCH STEP'S RECORDS — declared here, by their owner, and imported by
// every other step that reads or grows them (Frames reads and grows
// `music-video-source`). The shapes themselves still live in
// ../_shared/stepStore.ts for now; moving them out is a later stage.

import {
  defineRecord,
  isPlainObject,
  malformed,
} from "../_shared/records/registry";
import type { MusicVideoSourceStepData, ResearchStepData } from "../_shared/stepStore";

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
