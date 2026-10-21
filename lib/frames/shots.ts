// STEP 3 (Frames) — SHOT DECOMPOSITION: one beat, one to MANY shots.
//
// Everything in this step assumed a beat is a picture. `framesFromRender` is
// `render.beats.map(...)` — exactly one frame per beat, forever — and for an
// explainer that is right: a beat there IS one composed picture held while a
// sentence is spoken.
//
// A trailer is not built that way. Its climax is ten cuts under one beat, its
// reset is a single held shot, and its setup is few and slow. So a trailer beat
// needs a layer between the beat and the picture, and this is it.
//
// ─── WHAT THIS FILE DERIVES, AND WHAT IT REFUSES TO ─────────────────────────
//
// The split is the whole design, and it is the same epistemic one `frames.ts`
// draws between what code may assert and what a model may:
//
//   STRUCTURE is derivable.   How many shots a beat carries, how long each
//                             holds, at what pace, which way the cut faces.
//                             Every one of those comes off a measured band or a
//                             stated rule, and the arithmetic runs over the
//                             script's OWN timings — never an invented number.
//
//   ART DIRECTION is not.     What the shot shows and what moves in it. A move
//                             guessed from a beat's role is the same canned
//                             lookup `frames.ts:266-268` refused for exactly
//                             this reason: it reads as authored when nobody
//                             authored it. `Shot.motion` is therefore seeded
//                             EMPTY, like `emptyClip()`, and stays empty until
//                             a human or a direction pass writes it.
//
// `size` sits between the two and is seeded anyway — see `SIZE_LADDER`, where
// the reason and the one deviation are both written down. Every seeded shot
// carries `seeded: true` and a `basis` line naming the rule it came from, so a
// surface can always tell a seed from a decision at a glance.
//
// ─── SOURCES, AND THEIR GRADES ──────────────────────────────────────────────
//
// Two bodies of evidence, cited inline as [R] and [A]:
//
//   [R]  ai-registry · knowledge/media-generation/narrative-craft/
//        trailer-structure/ — the golden path and its six techniques. Doctrine
//        distilled from practitioner literature; grade OBSERVED unless the
//        subject itself says MEASURED.
//
//   [A]  `.vault/Research/2026-08-23-atlas-trailer-shots.md` — beat→shot
//        recipes read off contact sheets cut from 20 real trailers (yt-dlp
//        360p, scene-change + 2.5s sampling). Timestamps ±0.5 s, so its
//        duration bands are MEASURED-on-n=20 and its risk ratings are the
//        lane's own INFERRED. `.vault/` is disposable and gitignored: the
//        grades are carried across here so this file does not depend on it
//        surviving.
//
// NOTHING here measures whether a cut WORKS. [R] states the ceiling plainly —
// "A structural checker can establish that a cut is malformed; it cannot
// establish that a cut works" — and `shotReview.ts` reports that gap rather
// than letting a green structural verdict stand in for it.
//
// ─── THIS FILE GENERATES NOTHING ────────────────────────────────────────────
//
// A Shot has no `plate`. It is not a `Frame` and it is deliberately not folded
// into the frame list: `framesFromRender` is untouched, so an explainer derives
// exactly the frames it always did, and no shot can reach an image provider.
// The seam note at the bottom of `shotTypes.ts` records why that separation is
// load-bearing rather than merely cautious.

import { atSeconds } from "@/lib/script/trailer/types";
import {
  ROLE_HINTS,
  PACE_BAND,
  SIZE_LADDER,
  sizeSteps,
  type ScreenDirection,
  type Shot,
  type ShotPace,
  type ShotSize,
  type ShotSourceBeat,
  type ShotSourceRender,
  type SubjectPlacement,
  type TrailerRole,
} from "./shotTypes";

// The vocabulary lives in `shotTypes.ts`; every name is re-exported so importers
// keep reading it from here.
export {
  PACE_BAND,
  ROLE_HINTS,
  SIZE_LADDER,
  SIZE_ORDER,
  TAIL_BAND,
  TRAILER_ROLES,
  sizeSteps,
} from "./shotTypes";
export type {
  ScreenDirection,
  Shot,
  ShotAngle,
  ShotPace,
  ShotSize,
  ShotSourceBeat,
  ShotSourceRender,
  SubjectPlacement,
  TrailerRole,
} from "./shotTypes";

/** The fastest cut the sheets measured. A shot shorter than this is not a shot. */
const FLOOR_S = 0.5;

/** The pace each role is directed at. [R] escalation-without-mechanism (rungs close, so they breathe), dynamic-reset (the reset is the stop), [A] beat 10 (climax cuts). */
const PACE_OF: Readonly<Record<TrailerRole, ShotPace>> = {
  setup: "held",
  rung: "measured",
  reset: "held",
  peak: "rapid",
  tail: "held",
};

/* ── Format detection ─────────────────────────────────────────────────────── */

/**
 * Whether a render is a promotional cut.
 *
 * OPEN by design: `ScriptRender.template` is a plain string and the trailer
 * template does not exist yet — it is the beat lane's to add. So this matches a
 * documented set of ids rather than importing `TemplateId`, and adding a new
 * one is a single entry here.
 *
 * The default answer is NO. An explainer must decompose exactly as it always
 * has, and a predicate that guessed "trailer" from an unfamiliar id would
 * change the frame count of a render nobody asked about.
 */
const TRAILER_TEMPLATES = new Set([
  // The three ids `lib/projects.ts#TEMPLATE_FAMILY` files under the `trailer`
  // discipline. They were not all here: `teaser` and `trailer` were, `cinematic`
  // was not, so a project created on the Cinematic template read as an explainer
  // at this layer and its composed spine decomposed into nothing at all. Added
  // as a single entry, which is what this list is for — the membership is still
  // an allow-list whose default answer is NO, never derived from the id.
  "trailer",
  "teaser",
  "cinematic",
  // Ids no template in this repo emits yet, kept from the original list because
  // removing one would silently narrow the predicate for a caller outside it.
  "concept-teaser",
  "game-trailer",
  "promo-cut",
]);

export const isTrailerFormat = (template: string) => TRAILER_TEMPLATES.has(template.trim().toLowerCase());

/* ── Derivation ───────────────────────────────────────────────────────────── */

/**
 * "m:ss" or "h:mm:ss" → seconds, or null.
 *
 * Deliberately NOT `frames.ts#secondsOf`, and deliberately identical in
 * behaviour to the beat lane's `atSeconds()`: an unparseable position is
 * reported, never defaulted to 0. Reconcile to that one function when the two
 * branches merge — one parser, not two.
 */
export function beatSeconds(b: ShotSourceBeat): number | null {
  // The beat layer already did this, including deciding it was unparseable.
  if (b.atS !== undefined) return b.atS;
  // Otherwise defer to the beat layer's parser rather than keeping a copy.
  // This body WAS a verbatim duplicate of `atSeconds` until the two lanes were
  // merged. Two identical parsers of the same format is one drift away from the
  // exact defect this function exists to avoid: `frames.ts#secondsOf` folds an
  // unparseable position to 0 and silently steals the next beat's span.
  //
  // This is the ONLY edge from this layer to the beat layer, and it is a
  // FUNCTION, not the beat vocabulary — so the reason `ShotSourceBeat.kind`
  // stays `string` (widening `TrailerBeatKind` must not break this file) is
  // untouched by it.
  return atSeconds(b.at);
}

/** The beats no shot could be derived for, because their position does not parse. Surfaced, never swallowed. */
export const unplaceableBeats = (beats: readonly ShotSourceBeat[]): ShotSourceBeat[] =>
  beats.filter((b) => beatSeconds(b) === null);

const roleOf = (b: ShotSourceBeat): { role: TrailerRole | null; declared: boolean } => {
  if (b.role) return { role: b.role, declared: true };
  const hint = ROLE_HINTS[b.kind.trim().toLowerCase()];
  return hint ? { role: hint, declared: false } : { role: null, declared: false };
};

/**
 * How many shots a beat of this role and this length carries.
 *
 * Every branch is a citation, and the conservative end of every band is used:
 * over-decomposing invents shots nobody asked for, and a shot list too short is
 * visibly short while one too long looks authored.
 */
export function shotCountFor(role: TrailerRole | null, beatS: number): number {
  // The floor is absolute — nothing may derive a shot the sheets never measured.
  const ceiling = Math.max(1, Math.floor(beatS / FLOOR_S));

  // Role undeclared: one shot, the whole beat, and the review says so. Guessing
  // a decomposition from a beat kind this file does not know is the failure the
  // `role` seam exists to prevent.
  if (!role) return 1;

  switch (role) {
    // [R] dynamic-reset: "Fill the silence with one thing… A reset that holds
    // two ideas has spent its whole value carrying neither." Exactly one.
    case "reset":
      return 1;
    // [A] beats 11-13: the title and the end card are each one held card.
    case "tail":
      return 1;
    // [R] escalation-without-mechanism: a rung "is a small closed unit —
    // typically a line or an image that states something, then a beat that
    // lands it". Two: the statement and the landing.
    case "rung":
      return Math.min(2, ceiling);
    // [A]: climax plates run 0.5–1.5 s. The SLOW end is used, so the count is
    // the fewest the measurement supports.
    case "peak":
      return Math.min(Math.max(1, Math.round(beatS / PACE_BAND.rapid[1])), ceiling);
    // [A]: cold-open and look-out wides run 6–13 s. 13 is where a second shot
    // becomes necessary rather than optional — the only point in that band the
    // measurement actually pins.
    case "setup":
      return Math.min(Math.max(1, Math.ceil(beatS / PACE_BAND.held[1])), ceiling);
  }
}

/** [A] § Staging 1: cuts ≤2 s get the subject on the crosshair (Miller/Fury Road, S7); holds ≥3 s may use thirds and negative space. Between the two the document says nothing, and neither does this. */
const placementFor = (holdS: number): SubjectPlacement | null =>
  holdS <= 2 ? "crosshair" : holdS >= 3 ? "thirds" : null;

/**
 * [A] § Staging 3: screen direction is fixed once per sequence (its three
 * worked teasers all read "hero faces/travels screen-right unless noted"), and
 * "the only legal reversal is a neutral shot… which is why every trailer
 * sheeted has a 'walk toward camera' or a black just before the title."
 *
 * So: the sequence direction everywhere, neutral at the reset and the tail.
 * This derivation therefore never emits a flip — a property `shotReview.ts`
 * states on the finding, because a check that cannot fire is not a check that
 * passed.
 */
const SEQUENCE_DIRECTION: ScreenDirection = "screen-right";
const directionFor = (role: TrailerRole | null): ScreenDirection =>
  role === "reset" || role === "tail" ? "neutral" : SEQUENCE_DIRECTION;

/** Walk the role's ladder for the first size ≥2 steps from the previous shot. Falls back to the ladder's rotation when nothing qualifies, and the review sees what that produced. */
function pickSize(role: TrailerRole | null, ordinal: number, previous: ShotSize | null): ShotSize | null {
  if (!role) return null;
  const ladder = SIZE_LADDER[role];
  if (!previous) return ladder[(ordinal - 1) % ladder.length];
  const ok = ladder.find((s) => sizeSteps(s, previous) >= 2);
  return ok ?? ladder[(ordinal - 1) % ladder.length];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Beats → shots. The trailer counterpart to `framesFromRender`, and pointedly
 * NOT a replacement for it: this returns shots, which carry no plate.
 *
 * Returns an EMPTY list for a non-trailer render. That is the whole guarantee
 * that explainer behaviour is unchanged — there is no path by which an
 * explainer beat becomes more than one of anything.
 */
export function shotsFromRender(render: ShotSourceRender): Shot[] {
  if (!isTrailerFormat(render.template)) return [];
  return shotsFromBeats(render.beats, render.durationS);
}

/**
 * The derivation proper, over beats and the cut's total length.
 *
 * Exported separately from `shotsFromRender` so the beat lane can hand it a
 * chain that is not yet a `ScriptRender`, and so a probe can drive it without
 * inventing a template id.
 */
export function shotsFromBeats(beats: readonly ShotSourceBeat[], totalS: number): Shot[] {
  const out: Shot[] = [];
  let previousSize: ShotSize | null = null;

  beats.forEach((b, i) => {
    const startS = beatSeconds(b);
    // A beat nobody can place yields NO shots rather than shots at the wrong
    // time. `unplaceableBeats` is how a surface says so — the alternative,
    // folding an unparseable timecode to 0, is the defect this refuses.
    if (startS === null) return;
    // The NEXT BOUNDARY is the next beat whose position PARSES, not simply the
    // next beat. An unplaceable beat is not a boundary — it derives no shots of
    // its own and nobody knows when it happens — so treating it as one used to
    // end this beat at `null`, fall through to `totalS`, and hand this one beat
    // the whole remainder of the cut EVEN WHEN A LATER BEAT WAS PERFECTLY
    // PLACEABLE. On a `peak` that is `beatS / 1.5` shots: one unparseable
    // timecode in the middle of a chain silently multiplied its predecessor's
    // shot count. Only when nothing placeable follows does the beat run to the
    // end of the cut, which is the honest read of "nothing is known to follow".
    let nextS: number | null = null;
    for (let j = i + 1; j < beats.length; j++) {
      const s = beatSeconds(beats[j]);
      if (s !== null) {
        nextS = s;
        break;
      }
    }
    // The beat's own span, from the script's own clock — the same derivation
    // `durationOf` runs over frames, and the only number in this file that is
    // not a rule.
    const beatS = Math.max(1, (nextS ?? totalS) - startS);

    const { role, declared } = roleOf(b);
    const n = shotCountFor(role, beatS);
    const holdS = round1(beatS / n);
    const pace = role ? PACE_OF[role] : "measured";

    for (let k = 1; k <= n; k++) {
      const size = pickSize(role, k, previousSize);
      if (size) previousSize = size;
      out.push({
        id: `sh-${i}-${k}`,
        beatId: b.id,
        beatAt: b.at,
        beatLabel: b.label,
        ordinal: k,
        ofBeat: n,
        movementId: b.movement,
        role: role ?? "rung",
        roleDeclared: declared,
        holdS,
        pace,
        size,
        // Never seeded. [A] § Staging 4's angle escape hatch only means
        // something when a person has used it.
        angle: null,
        direction: directionFor(role),
        placement: placementFor(holdS),
        // Art direction. Empty, for the reason `frames.ts:266-268` gives — and
        // `subject` is left off entirely rather than set to "", so that
        // "nobody has written one" is absence rather than an empty string
        // somebody might read as a decision.
        motion: "",
        seeded: true,
        basis: role
          ? `${role} · ${n} shot${n === 1 ? "" : "s"} · ${BASIS_OF[role]}`
          : "role undeclared · 1 shot, the whole beat, undecomposed",
      });
    }
  });

  return out;
}

/** The one line each role's count comes from, shown on the row so a reader never has to open this file to know why. */
const BASIS_OF: Readonly<Record<TrailerRole, string>> = {
  setup: "[A] cold-open/look-out wides 6–13 s (n=20)",
  rung: "[R] a rung states, then lands — two shots",
  reset: "[R] the silence holds ONE thing",
  peak: "[A] climax plates 0.5–1.5 s (n=20), slow end",
  tail: "[A] title/end card is one held card",
};

/**
 * Shots grouped by their parent BEAT, in cut order. What a read-only surface
 * renders.
 *
 * The group boundary is `ordinal === 1` — a new beat's first shot — and NOT a
 * change of `beatAt`. This file says two paragraphs up that `beatAt` "is a
 * position and positions repeat", and grouping on it made that statement false
 * in the one place a reader would notice: two distinct beats sharing a
 * timecode merged into a single group, the second beat's label and `basis`
 * vanished, and a surface keying rows by `beatAt` handed React the same key
 * twice. `beatId` is the identity where there is one, so it breaks a group too;
 * `ordinal` covers the explainer beats that carry no id.
 */
export function shotsByBeat(shots: readonly Shot[]): { beatAt: string; beatLabel: string; shots: Shot[] }[] {
  const out: { beatAt: string; beatLabel: string; shots: Shot[] }[] = [];
  let previous: Shot | undefined;
  for (const s of shots) {
    const last = out[out.length - 1];
    const sameBeat =
      last !== undefined &&
      previous !== undefined &&
      s.ordinal !== 1 &&
      s.beatAt === previous.beatAt &&
      s.beatId === previous.beatId;
    if (sameBeat) last.shots.push(s);
    else out.push({ beatAt: s.beatAt, beatLabel: s.beatLabel, shots: [s] });
    previous = s;
  }
  return out;
}
