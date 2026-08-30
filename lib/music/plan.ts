// Cue → composition plan. The one file where the registry's music-briefing
// doctrine becomes code, so the doctrine is testable and the translation is
// in exactly one place.
//
// What it encodes, and where each rule comes from
// (knowledge/media-generation/audio-generation in the ai-registry):
//
//   · section-plan-as-the-brief — a cue is briefed as ordered sections with
//     exact durations, never as one prose wish.
//   · sonic-style-vocabulary — the style block is restated in FULL on every
//     section (inheritance is a model behavior, not a promise), and the
//     exclude list is standing: instrumental cues fence out vocals, and
//     picture-locked cues fence out fade-outs, the two most expensive
//     unrequested defaults.
//   · duration-and-tempo-locking — durations come from THE PICTURE (below);
//     the bpm rides into the styles as words ("84 bpm") rather than being
//     hoped for, and barsFit() says whether a span is a whole number of bars
//     so the brief can ask for a hard ending only when one is actually
//     reachable.
//
// ── THE CHANGE THIS FILE EXISTS TO CARRY (2026-08-29) ──────────────────────
//
// Spotting means scoring AGAINST PICTURE, and this translation had never seen
// the picture. Its entire input was a hand-typed
// `{ title, intent, bpm, durS, styleBlock }`: no scene, no slugline, no mood,
// no position on the clock. What it produced above 20 seconds was a mechanical
// 2:1 Build→Release split with two hardcoded style words, applied identically
// to a pier walk and a rooftop turn. It was not scoring a film; it was
// decorating a number.
//
// It now takes `CuePicture` — the actual scenes the cue plays under, copied
// from the project's scene record — and the sections follow the CUTS. One
// section per scene, because the one thing everybody agrees a score must do is
// change where the picture changes. The scene's slugline and mood are the
// direction; the scene's length is the section's length.
//
// STILL PURE. No I/O, no env, no clock, no randomness — the same input gives
// the same plan forever, which is what makes the doctrine testable at all.
//
// WHAT IS STILL INVENTED, AND SAYS SO. Every constant below marked `INVENTED`
// is a guess this repo has not earned: nobody measured it, no source declares
// it, and it survives only because a brief has to say something. They are
// gathered in one block, named, and left obvious so the craft research that
// replaces them knows exactly what it is replacing. Do not add an unmarked one.

import { MusicError } from "./errors";
import type { CueBrief, CuePicture, CueScene, MusicPlan, PlanSection } from "./types";

/** Whole bars of 4/4 at `bpm` that fit in `seconds`; null when it isn't a
 *  whole number of bars — the caller then adjusts bpm, not the picture. */
export function barsFit(bpm: number, seconds: number): number | null {
  const bar = 240 / bpm;
  const bars = seconds / bar;
  return Math.abs(bars - Math.round(bars)) < 0.02 ? Math.round(bars) : null;
}

/* ── INVENTED CONSTANTS ─────────────────────────────────────────────────────
 *
 * Nothing below is measured, cited or tested against a real score. They are
 * placeholders with the honesty of being labelled as such.
 */

/** INVENTED. The excludes every picture-locked instrumental cue starts from.
 *  Defensible (a cue with no lyric brief should not be sung; a cue cut to
 *  picture should not fade), but no source establishes this list. */
const STANDING_EXCLUDES = ["vocals", "singing", "fade-out ending"];

/** INVENTED. The words the LAST section gets, because a cue that plays out
 *  over a cut wants an ending rather than a fade. Which words, and whether a
 *  trailer cue always wants them, is exactly the craft question this repo has
 *  not answered. */
const CLOSING_STYLES = ["arrival", "hard ending on the beat"];

/** INVENTED. The words every section BEFORE the last one gets. "Rising" is an
 *  assumption about shape that a real spotting session would make per cue. */
const APPROACH_STYLES = ["rising energy"];

/* ── The vendor's hard limits (NOT invented — elevenlabs.ts enforces them) ── */

/** Sections run 3s..120s vendor-side. A scene shorter than this cannot be its
 *  own section and is folded into its neighbour rather than dropped. */
const MIN_SECTION_S = 3;
const MAX_SECTION_S = 120;
/** ≤30 chunks per plan, vendor-side. */
const MAX_SECTIONS = 30;

/** How long a cue is: the film it plays under, summed. Not a stored number —
 *  a derived one, so it cannot drift from the span drawn on the clock. */
export function cueDurationS(picture: CuePicture): number {
  return picture.scenes.reduce((n, s) => n + s.durS, 0);
}

/** Where a cue starts on the project clock: its first scene. */
export function cueStartS(picture: CuePicture): number {
  return picture.scenes.length ? picture.scenes[0].startS : 0;
}

/**
 * A section under construction: one or more consecutive scenes.
 *
 * Scenes shorter than the vendor's 3s floor are MERGED forward rather than
 * dropped, because a dropped scene is a piece of film the score silently
 * stopped covering — the exact class of quiet untruth this pass is about.
 */
interface Packed {
  scenes: CueScene[];
  durS: number;
}

function packScenes(scenes: CueScene[]): Packed[] {
  const packs: Packed[] = [];
  for (const s of scenes) {
    const last = packs[packs.length - 1];
    // Too short to stand alone → join the pack before it. If it is the first
    // scene there is no pack before it, so it opens one and the NEXT scene
    // joins it instead.
    if (last && (s.durS < MIN_SECTION_S || last.durS < MIN_SECTION_S)) {
      last.scenes.push(s);
      last.durS += s.durS;
      continue;
    }
    packs.push({ scenes: [s], durS: s.durS });
  }
  // A pack that grew past the vendor's per-section ceiling is split evenly;
  // the picture cannot be re-cut to suit an API limit, so the section is.
  const out: Packed[] = [];
  for (const p of packs) {
    if (p.durS <= MAX_SECTION_S) {
      out.push(p);
      continue;
    }
    const parts = Math.ceil(p.durS / MAX_SECTION_S);
    const each = p.durS / parts;
    for (let i = 0; i < parts; i++) out.push({ scenes: p.scenes, durS: each });
  }
  return out;
}

/** What the model is told about the moment, and every word of it traces to the
 *  scene record: the slugline verbatim, the mood verbatim. */
function sceneDirections(pack: Packed): string[] {
  return pack.scenes.map((s) => `sc ${s.index} ${s.slug} — ${s.mood}`);
}

function sectionName(pack: Packed): string {
  const first = pack.scenes[0];
  const last = pack.scenes[pack.scenes.length - 1];
  return first === last ? `sc ${first.index}` : `sc ${first.index}-${last.index}`;
}

/**
 * The mood words the scene record already carries, split into brief-shaped
 * terms. "vertigo / turn" is two directions, not one adjective — the record
 * writes them that way and the brief should use them that way.
 */
function moodTerms(pack: Packed): string[] {
  const terms = pack.scenes.flatMap((s) => s.mood.split(/[/,]/));
  return [...new Set(terms.map((t) => t.trim()).filter(Boolean))];
}

/**
 * Cue → plan. Pure.
 *
 * THROWS `bad-request` when the cue has no picture. That is the honest
 * absence this direction is about: a project with no script does not get a
 * default cue, it gets no cue. The engine refusing to brief one is the last
 * line of that rule, after the surface has already declined to draw it.
 */
export function cueToPlan(cue: CueBrief): MusicPlan {
  const scenes = cue.picture?.scenes ?? [];
  if (!scenes.length)
    throw new MusicError(
      "bad-request",
      `Cue "${cue.title}" covers no scenes, so there is no picture to score against. ` +
        "A cue is a span of film; briefing one without it would mean inventing the film.",
    );

  const totalS = cueDurationS(cue.picture);
  if (totalS < MIN_SECTION_S)
    throw new MusicError(
      "bad-request",
      `Cue "${cue.title}" covers ${totalS}s of picture; the vendor's floor is ${MIN_SECTION_S}s.`,
    );

  const packs = packScenes(scenes);
  if (packs.length > MAX_SECTIONS)
    throw new MusicError(
      "bad-request",
      `Cue "${cue.title}" covers ${packs.length} sections of picture; a plan carries at most ${MAX_SECTIONS}.`,
    );

  // The style block in FULL on every section — inheritance is a model
  // behaviour, not a promise — plus the two facts the request itself fixes.
  const style = [...cue.styleBlock, "instrumental", `${cue.bpm} bpm`];
  const avoid = [...STANDING_EXCLUDES, ...(cue.avoid ?? [])];

  // The narrative context, verbatim from the project record. One sentence of
  // what the film IS is the only global context a section-level brief gets,
  // and it is the difference between "dark orchestral" and "dark orchestral
  // for THIS story".
  const context = [`for "${cue.picture.projectTitle}"`, cue.picture.logline].filter(Boolean);

  const sections: PlanSection[] = packs.map((pack, i) => {
    const last = i === packs.length - 1;
    const durationMs = Math.round(pack.durS * 1000);
    // barsFit's first real caller: a hard ending is only asked for when the
    // span IS a whole number of bars at this tempo. Asking a model to land on
    // the beat across a span that does not contain whole bars is asking it to
    // choose between the tempo and the cut, and it will choose silently.
    const bars = barsFit(cue.bpm, pack.durS);
    return {
      name: sectionName(pack),
      durationMs,
      positiveStyles: [
        ...style,
        ...moodTerms(pack),
        ...(last ? (bars === null ? ["arrival"] : CLOSING_STYLES) : APPROACH_STYLES),
      ],
      negativeStyles: last ? avoid : [...avoid, "full climax"],
      directions: [
        // The cue's own purpose sentence opens the cue, once.
        ...(i === 0 ? [cue.intent] : []),
        ...sceneDirections(pack),
        ...(bars === null
          ? // Said out loud rather than hoped away: the picture does not land on
            // a bar line at this tempo, so nothing in this brief pretends it does.
            [`${pack.durS}s at ${cue.bpm} bpm is not a whole number of bars — cut to picture, not to the bar`]
          : [`${bars} bars of 4/4 at ${cue.bpm} bpm`]),
      ],
      adherence: "high",
    };
  });

  return {
    positiveGlobalStyles: [...style, ...context],
    negativeGlobalStyles: avoid,
    sections,
  };
}
