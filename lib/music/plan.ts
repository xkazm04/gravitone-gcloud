// Cue → composition plan. The one file where the registry's music-briefing
// doctrine becomes code, so the doctrine is testable and the translation is
// in exactly one place.
//
// What it encodes, and where each rule comes from
// (knowledge/media-generation/audio-generation in the ai-registry):
//
//   · section-plan-as-the-brief — a cue is briefed as ordered sections with
//     exact durations, never as one prose wish. Short cues get one section;
//     anything with room gets build → release, because a trailer cue's job is
//     almost always "promise, then land".
//   · sonic-style-vocabulary — the style block is restated in FULL on every
//     section (inheritance is a model behavior, not a promise), and the
//     exclude list is standing: instrumental cues fence out vocals, and
//     picture-locked cues fence out fade-outs, the two most expensive
//     unrequested defaults.
//   · duration-and-tempo-locking — durations come from the cue row in whole
//     seconds; the bpm rides into the styles as words ("84 bpm") rather than
//     being hoped for, and barsFit() exists so a caller choosing a tempo for
//     a picture hit can do the bar math instead of guessing.

import type { CueBrief, MusicPlan, PlanSection } from "./types";

/** Whole bars of 4/4 at `bpm` that fit in `seconds`; null when it isn't a
 *  whole number of bars — the caller then adjusts bpm, not the picture. */
export function barsFit(bpm: number, seconds: number): number | null {
  const bar = 240 / bpm;
  const bars = seconds / bar;
  return Math.abs(bars - Math.round(bars)) < 0.02 ? Math.round(bars) : null;
}

/** The excludes every picture-locked instrumental cue starts from. */
const STANDING_EXCLUDES = ["vocals", "singing", "fade-out ending"];

/** Below this there is no room for a two-part arc — one section, one job. */
const MIN_TWO_SECTION_S = 20;

export function cueToPlan(cue: CueBrief): MusicPlan {
  const style = [...cue.styleBlock, "instrumental", `${cue.bpm} bpm`];
  const avoid = [...STANDING_EXCLUDES, ...(cue.avoid ?? [])];
  const totalMs = Math.round(cue.durS * 1000);

  let sections: PlanSection[];
  if (cue.durS < MIN_TWO_SECTION_S) {
    sections = [
      {
        name: cue.title,
        durationMs: totalMs,
        positiveStyles: style,
        negativeStyles: avoid,
        directions: [cue.intent],
        adherence: "high",
      },
    ];
  } else {
    // Build → release, roughly 2:1 — the release owns the ending, so the
    // "hard ending on the beat" direction lands there and only there.
    const buildMs = Math.round((totalMs * 2) / 3);
    sections = [
      {
        name: "Build",
        durationMs: buildMs,
        positiveStyles: [...style, "rising energy", "restrained"],
        negativeStyles: [...avoid, "full climax"],
        directions: [cue.intent],
        adherence: "high",
      },
      {
        name: "Release",
        durationMs: totalMs - buildMs,
        positiveStyles: [...style, "arrival", "hard ending on the beat"],
        negativeStyles: avoid,
        adherence: "high",
      },
    ];
  }

  return {
    positiveGlobalStyles: style,
    negativeGlobalStyles: avoid,
    sections,
  };
}
