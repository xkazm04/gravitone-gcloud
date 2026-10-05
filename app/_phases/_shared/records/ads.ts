// THE ADS DISCIPLINE'S RECORDS — five, one per step that writes, declared in
// one file because every ads step reads the one upstream of it (Scenario reads
// the picked idea, Frames the picked scenario, Finish the adopted clips).
//
// The shapes live in lib/ads/types.ts (server-safe, shared with the routes). The
// parsers here refuse what they cannot read and keep fields they do not know,
// so a patch never drops a sibling writer's field (registry.ts, ADR rule 1).

import { defineRecord, isPlainObject, malformed } from "./registry";
import {
  EMPTY_BRIEF,
  type AdBrief,
  type AdsBriefData,
  type AdsFinishData,
  type AdsIdeasData,
  type AdsScenariosData,
  type AdsShotsData,
} from "@/lib/ads/types";

const str = (x: unknown) => (typeof x === "string" ? x : "");
const strOrNull = (x: unknown) => (typeof x === "string" ? x : null);

function parseBrief(raw: unknown): AdBrief {
  if (!isPlainObject(raw)) return { ...EMPTY_BRIEF };
  return {
    product: str(raw.product),
    audience: str(raw.audience),
    proposition: str(raw.proposition),
    tone: str(raw.tone),
    mustInclude: Array.isArray(raw.mustInclude) ? raw.mustInclude.filter((x): x is string => typeof x === "string") : [],
    cta: str(raw.cta),
    platform: str(raw.platform),
  };
}

/** The creator's brief — Idea step, top card. */
export const ADS_BRIEF = defineRecord<AdsBriefData>({
  key: "ads-brief",
  owner: "research",
  version: 1,
  parse: (raw) => {
    if (raw.brief !== undefined && !isPlainObject(raw.brief)) return malformed("ads-brief.brief is not an object");
    return { ...raw, brief: parseBrief(raw.brief) };
  },
});

/** Round 1 — the generated ideas and the one picked. */
export const ADS_IDEAS = defineRecord<AdsIdeasData>({
  key: "ads-ideas",
  owner: "research",
  version: 1,
  parse: (raw) => {
    if (raw.options !== undefined && !Array.isArray(raw.options)) return malformed("ads-ideas.options is not a list");
    return {
      ...raw,
      briefDigest: strOrNull(raw.briefDigest),
      options: (raw.options as AdsIdeasData["options"] | undefined) ?? [],
      pickedId: strOrNull(raw.pickedId),
      engine: isPlainObject(raw.engine) ? (raw.engine as unknown as AdsIdeasData["engine"]) : null,
    };
  },
});

/** Round 2 — the scenarios executing the picked idea, and the one picked. */
export const ADS_SCENARIOS = defineRecord<AdsScenariosData>({
  key: "ads-scenarios",
  owner: "script",
  version: 1,
  parse: (raw) => {
    if (raw.options !== undefined && !Array.isArray(raw.options)) return malformed("ads-scenarios.options is not a list");
    return {
      ...raw,
      ideaId: strOrNull(raw.ideaId),
      options: (raw.options as AdsScenariosData["options"] | undefined) ?? [],
      pickedId: strOrNull(raw.pickedId),
      engine: isPlainObject(raw.engine) ? (raw.engine as unknown as AdsScenariosData["engine"]) : null,
    };
  },
});

/** Per shot: key-image takes, the adopted one, every clip, the adopted clip. */
export const ADS_SHOTS = defineRecord<AdsShotsData>({
  key: "ads-shots",
  owner: "frames",
  version: 1,
  parse: (raw) => {
    if (raw.shots !== undefined && !isPlainObject(raw.shots)) return malformed("ads-shots.shots is not an object");
    return {
      ...raw,
      scenarioId: strOrNull(raw.scenarioId),
      shots: (raw.shots as AdsShotsData["shots"] | undefined) ?? {},
    };
  },
});

/** Finish — supers, the end-card, the aspects to export, the exports made. */
export const ADS_FINISH = defineRecord<AdsFinishData>({
  key: "ads-finish",
  owner: "cut",
  version: 1,
  parse: (raw) => {
    if (raw.supers !== undefined && !isPlainObject(raw.supers)) return malformed("ads-finish.supers is not an object");
    const card = isPlainObject(raw.endCard) ? raw.endCard : {};
    return {
      ...raw,
      supers: (raw.supers as AdsFinishData["supers"] | undefined) ?? {},
      endCard: {
        cta: str(card.cta),
        line: strOrNull(card.line),
        logoAssetId: strOrNull(card.logoAssetId),
        holdS: typeof card.holdS === "number" && card.holdS > 0 ? card.holdS : 2,
      },
      aspects: Array.isArray(raw.aspects) ? (raw.aspects as AdsFinishData["aspects"]) : [],
      exports: Array.isArray(raw.exports) ? (raw.exports as AdsFinishData["exports"]) : [],
    };
  },
});
