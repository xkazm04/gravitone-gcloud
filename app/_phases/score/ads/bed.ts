// AN AD'S MUSIC BED — one cue spanning the picked scenario, end-card included.
//
// PURE, so the probe can hold it without a React tree. The bed goes through the
// SAME vendor path as every Score cue: a GenerateRequest op "cue" to
// /api/sound/generate, whose plan is derived server-side by lib/music/plan.ts
// cueToPlan from the picture handed in here. Nothing in this file decides how
// music is briefed; it only says what the picture IS for an ad:
//
//   · one scene per shot, at the shot's own duration, then one for the
//     end-card at its hold — so the seconds of music bought are the seconds of
//     the finished ad, by construction;
//   · every shot carries the scenario's `musicMood` verbatim (the only mood
//     words an ad's scenario has), and the end-card carries "resolve" — the
//     bed lands under the call to action;
//   · the intent is the mood and the brief's tone, verbatim.
//
// No tempo is invented: `null` without one, the rule `cueTakeRequest` keeps.

import type { AdBrief, AdScenario } from "@/lib/ads/types";
import { scenarioRuntimeS } from "@/lib/ads/types";
import type { CuePicture } from "@/lib/music/types";
import type { GenerateRequest } from "@/lib/sound/types";

import type { ScoreSpot } from "../spots";

import { AD_BED_CUE_ID, type AdsScoreData } from "./record";

/** The end-card's hold when Finish has not been opened yet — the same default
 *  the ADS_FINISH parser fills. */
export const DEFAULT_HOLD_S = 2;

/** Bounds `/api/music/generate` already holds a tempo to. */
export const BPM_RANGE = [40, 220] as const;

export function bedRuntimeS(scenario: AdScenario, holdS: number): number {
  return scenarioRuntimeS(scenario) + holdS;
}

export function adBedPicture(scenario: AdScenario, holdS: number, projectTitle: string): CuePicture {
  let at = 0;
  const scenes = scenario.shots.map((shot, i) => {
    const s = { index: i + 1, slug: `SHOT ${i + 1}: ${shot.motion}`.slice(0, 120), mood: scenario.musicMood, startS: at, durS: shot.durationS };
    at += shot.durationS;
    return s;
  });
  scenes.push({ index: scenes.length + 1, slug: `END CARD: ${scenario.endCard.cta}`.slice(0, 120), mood: "resolve", startS: at, durS: holdS });
  return { projectTitle, logline: scenario.logline, scenes };
}

export function adBedIntent(scenario: AdScenario, brief: AdBrief | null): string {
  const tone = brief?.tone.trim();
  return tone ? `${scenario.musicMood} — ${tone}` : scenario.musicMood;
}

/** The style block restated on the call: the scenario's mood and the brief's
 *  tone are the ad's whole standing identity. */
export function adBedStyleBlock(scenario: AdScenario, brief: AdBrief | null): string[] {
  return [scenario.musicMood, brief?.tone ?? "", "advertising music bed"].map((s) => s.trim()).filter(Boolean);
}

export function adBedRequest(args: {
  scenario: AdScenario;
  brief: AdBrief | null;
  projectTitle: string;
  projectId: string;
  holdS: number;
  bpm: number | null;
}): GenerateRequest | null {
  const { scenario, brief, projectTitle, projectId, holdS, bpm } = args;
  if (bpm === null || bpm < BPM_RANGE[0] || bpm > BPM_RANGE[1]) return null;
  const title = `${scenario.title} · bed`;
  return {
    kind: "music",
    provider: "elevenlabs",
    op: "cue",
    origin: "score",
    prompt: "",
    negative: null,
    durationS: 0,
    loop: null,
    promptInfluence: null,
    technique: [],
    terms: { genre: [], mood: [], instrument: [], sfxCategory: null },
    tempoBpm: bpm,
    key: null,
    sourceTakeId: null,
    editModes: null,
    plan: null,
    huntId: null,
    nodeId: null,
    title,
    projectId,
    cueId: AD_BED_CUE_ID,
    cue: {
      title,
      intent: adBedIntent(scenario, brief),
      bpm,
      styleBlock: adBedStyleBlock(scenario, brief),
      picture: adBedPicture(scenario, holdS, projectTitle),
    },
  };
}

/** The record as the spot CueTakes draws and edits. */
export function bedSpot(rec: AdsScoreData, scenario: AdScenario): ScoreSpot {
  return {
    id: AD_BED_CUE_ID,
    title: `${scenario.title} · bed`,
    sceneIds: [],
    note: scenario.musicMood,
    ...(rec.bpm !== null ? { bpm: rec.bpm } : {}),
    takeIds: rec.takeIds,
    ...(rec.activeTakeId ? { activeTakeId: rec.activeTakeId } : {}),
  };
}

/** A spot CueTakes handed back → the record's fields. */
export function fromSpot(rec: AdsScoreData, spot: ScoreSpot): AdsScoreData {
  return { ...rec, takeIds: spot.takeIds ?? [], activeTakeId: spot.activeTakeId ?? null };
}
