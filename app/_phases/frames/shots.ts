"use client";

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
// The seam note at the bottom of this file records why that separation is
// load-bearing rather than merely cautious.


import { atSeconds, type ShotLaneBeat, type ShotLaneSourceBeat } from "../script/trailer/types";

/* ── What this layer consumes ─────────────────────────────────────────────── */

/**
 * A beat, AS THIS LAYER READS ONE — and it is one declaration now, not two.
 *
 * This used to be a hand-kept SECOND copy of `ShotLaneBeat`'s field list, held
 * to it by the `AssertAssignable` witness below and by a merge-time TODO at the
 * bottom of this file that said to make the two one. That TODO is discharged
 * here, and not the way it asked: its premise — "field-by-field they already
 * agree" — was false, because the consumer is deliberately WIDER and that width
 * is what lets `ScriptRender.beats` reach `shotsFromRender` at all.
 *
 * So the field list lives ONCE, in the beat layer, at the consumer's width
 * (`ShotLaneSourceBeat`), with `ShotLaneBeat` declared as its narrowing. What
 * this file adds is the ONE field that is the shot layer's own vocabulary and
 * must not migrate into the beat layer:
 *
 *   `role` — the structural part a beat plays in the CUT, which is the thing
 *   that changes a shot count. `TrailerRole` is declared BELOW, in this file;
 *   a beat layer that imported it would be importing the shot layer's reason
 *   for existing. When `role` is absent `ROLE_HINTS` is consulted, and when
 *   that misses too the beat is decomposed into a single shot and the review
 *   says the role was undeclared. It is never guessed.
 */
export type ShotSourceBeat = ShotLaneSourceBeat & { role?: TrailerRole };

/* The producer must keep satisfying the consumer — and now it does so BY
   CONSTRUCTION, because `ShotLaneBeat extends ShotLaneSourceBeat` and there is
   no second field list left to drift.

   The witness is KEPT anyway, because the construction it checks is one edit
   away from untrue: a REQUIRED field added to the intersection above (a `role`
   without its `?`, say) compiles perfectly here and silently stops every beat
   the beat layer emits from being readable. This line is where that is caught.
   It keeps passing when `TrailerBeatKind` widens, because `kind` on the source
   shape is `string` — which is the point. */
type AssertAssignable<A extends B, B> = [A, B] extends [B, B] ? true : never;
type _ShotLaneBeatIsReadable = AssertAssignable<ShotLaneBeat, ShotSourceBeat>;

/** A render, narrowed the same way. `ScriptRender` satisfies it structurally. */
export interface ShotSourceRender {
  template: string;
  durationS: number;
  beats: readonly ShotSourceBeat[];
}

/* ── The vocabulary ───────────────────────────────────────────────────────── */

/**
 * The structural role a beat plays in the cut — the trailer spine's five parts
 * collapsed to what changes a shot count.
 *
 * [R] trailer-structure § "The spine, and what it is a spine of" names cold
 * open · introduction · escalation · climax · button. `setup` folds the first
 * two because they decompose identically (few shots, long holds); `tail` is the
 * button plus the title/end cards, which [A] beat 11-13 shows are one held card
 * each. `reset` is not one of the four parts — it is the device that sits
 * between the escalation and the climax ([R] dynamic-reset) — and it earns its
 * own role because it is the only one whose shot count is fixed at one.
 */
export type TrailerRole = "setup" | "rung" | "reset" | "peak" | "tail";

export const TRAILER_ROLES: readonly TrailerRole[] = ["setup", "rung", "reset", "peak", "tail"];

/**
 * Reconciliation seam with the beat lane, and it is meant to be one line each.
 *
 * Keys are the registry's OWN part names ([R] § "The spine"). If the beat
 * vocabulary that lands names its kinds differently, add its terms here rather
 * than teaching this file a second vocabulary. Anything not listed falls
 * through to "role undeclared", which is reported, never guessed.
 */
export const ROLE_HINTS: Readonly<Record<string, TrailerRole>> = {
  // These eight are `TrailerBeatKind` exactly, as the beat lane declares it —
  // cold-open · stakes · rung · reset · peak · title · button · cta. The map was
  // first written against the registry's PART names (introduction, escalation,
  // climax, breath, world), which is what the golden path calls the spine's
  // sections; the beat lane named its KINDS differently and this is the one line
  // per term that reconciles them. Every key here resolves; no key here is dead.
  "cold-open": "setup",
  stakes: "setup",
  rung: "rung",
  reset: "reset",
  peak: "peak",
  title: "tail",
  button: "tail",
  cta: "tail",
};

/**
 * Shot size, as the ordered ladder [A] § Staging measures distance along.
 *
 * OTS is in [A]'s shorthand and is NOT here: it is a camera position, not a
 * rung on this ladder, and putting it on one would make "two steps from OTS" a
 * number with no meaning.
 */
export type ShotSize = "EWS" | "WS" | "MS" | "MCU" | "CU" | "ECU";
export const SIZE_ORDER: readonly ShotSize[] = ["EWS", "WS", "MS", "MCU", "CU", "ECU"];
export const sizeSteps = (a: ShotSize, b: ShotSize) =>
  Math.abs(SIZE_ORDER.indexOf(a) - SIZE_ORDER.indexOf(b));

/** [A]'s shorthand: LA/HA low/high angle. Never seeded — see `Shot.angle`. */
export type ShotAngle = "LA" | "eye" | "HA";

/** The duration INTENT. What the doctrine asks the shot to do; `holdS` is what the script's clock actually gives it. */
export type ShotPace = "rapid" | "measured" | "held";

/**
 * Screen direction, [A] § Staging 3 (Katz's line of action).
 *
 * "toward-camera" and "neutral" are one thing in that rule — the legal
 * reversal — but they are kept apart because a frontal approach is a shot you
 * can direct and a card is not.
 */
export type ScreenDirection = "screen-left" | "screen-right" | "toward-camera" | "neutral";

/** Where the eye is asked to find the subject. [A] § Staging 1. */
/** `diagonal` joined 2026-08-31 — dojo cycle 2026-08-31-study-diagonal
 *  (corpus study, human-gated): across 159 A-tier frames, diagonal is the
 *  most common extreme-wide action composition (10/31 EW) and this vocabulary
 *  could not express it. `placementFor` still emits only the original two —
 *  diagonal is an art director's or beat layer's choice, not a hold-time
 *  default. */
export type SubjectPlacement = "crosshair" | "thirds" | "diagonal";

/* ── The shot ─────────────────────────────────────────────────────────────── */

export interface Shot {
  id: string;
  /**
   * The parent beat's stable id, when it had one. This is the identity a finding
   * should be located by; `beatAt` is a position and positions repeat.
   */
  beatId?: string;
  /** The parent beat's timestamp — the key `frames.ts` and `sceneSpec.ts` use. NOT unique. */
  beatAt: string;
  /** The beat's own label, carried so a surface never has to re-look-up the beat. */
  beatLabel: string;
  /** 1-based position of this shot INSIDE its beat. */
  ordinal: number;
  /** How many shots that beat carries in total. `1` of `1` is a beat that did not decompose. */
  ofBeat: number;
  /** The act/movement's id, when the beat layer declared one. Opaque here. */
  movementId?: string;
  role: TrailerRole;
  /**
   * True when the BEAT LAYER declared this role, false when it came from
   * `ROLE_HINTS` or from nowhere at all.
   *
   * The doc on this field said exactly the opposite until it was corrected —
   * "true when the role came from ROLE_HINTS or was absent entirely" — while
   * `roleOf` has always set it from `Boolean(b.role)`. Nothing broke, because
   * the one consumer (`beat-roles-were-declared`, shotReview.ts) was written
   * against the code; but a reader trusting the comment would have inverted
   * that check and reported every declared beat as unmeasured.
   */
  roleDeclared: boolean;
  /**
   * How long this shot holds, in seconds.
   *
   * DERIVED, NEVER AUTHORED, and that is the whole reason this field may exist
   * where `FrameClip` refuses one: it is the beat's own span — a real number
   * from the script — divided by the shot count. No constant is added to it and
   * no default stands in for it. `frames.ts:93-96` refuses to invent a clip
   * length; this does not invent one either.
   */
  holdS: number;
  pace: ShotPace;
  /** Seeded from `SIZE_LADDER`. Null only when the role was never resolved. */
  size: ShotSize | null;
  /**
   * NEVER seeded. [A] § Staging 4 lets an angle change ≥30° stand in for a size
   * jump, so an undeclared angle is the difference between "this cut reads as a
   * jump" and "I cannot tell" — which is precisely the distinction the review
   * has to preserve.
   */
  angle: ShotAngle | null;
  direction: ScreenDirection;
  /** Null in the 2–3 s band, which [A] § Staging 1 does not cover in either direction. */
  placement: SubjectPlacement | null;
  /**
   * The motion intent — same field, same shape and same emptiness as
   * `FrameClip.motion`. Seeded empty on purpose; see the header.
   */
  motion: string;
  /**
   * WHAT IS IN FRAME, when an art director has said. Absent by default and
   * never invented: the same field `Plate.subject` and `SceneSpec.subject`
   * already are, at the layer above.
   *
   * A prompt does not go without one — `shotPrompt.ts` falls back to the
   * role×size recipe lifted from [A] § 2, which is a cited staging default
   * rather than a guess. This field is how someone overrides it.
   */
  subject?: string;
  /** True while every non-null field above came from a rule rather than a person. */
  seeded: boolean;
  /** The one line naming the rule this shot's seed came from. */
  basis: string;
}

/* ── The measured bands ───────────────────────────────────────────────────── */

/**
 * [A] § "Cross-beat observations from the sheets (measured, not recalled)":
 * "Holds are long at the ends and short in the middle: cold-open and look-out
 * wides run 6–13 s; climax plates 0.5–1.5 s; title 3 s (film) to 9 s (game
 * announce)." n=20 trailers, ±0.5 s.
 *
 * `measured` is the one band NOT in that sentence — it is this file's INFERRED
 * interpolation between the two that are, and `shotReview.ts` says so on the
 * finding rather than letting it pass as measured.
 */
export const PACE_BAND: Readonly<Record<ShotPace, readonly [number, number]>> = {
  rapid: [0.5, 1.5],
  measured: [1.5, 6],
  held: [6, 13],
};

/** The tail is its own band in the same sentence: 3 s (film) to 9 s (game announce). */
export const TAIL_BAND: readonly [number, number] = [3, 9];

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

/**
 * Size rotations per role, from [A] § 2's recipes. The chooser in
 * `pickSize` walks a role's ladder and takes the first entry ≥2 steps from the
 * previous shot's size, which is [A] § Staging 4's rule applied at derivation
 * time rather than left for the review to complain about.
 *
 * ONE DELIVERATE DEVIATION, recorded because the two rules it sits between
 * genuinely disagree. [A] recipe 42 directs the climax as "alternate EWS
 * spectacle / MS action / MCU face" — but MS and MCU are ADJACENT on
 * `SIZE_ORDER`, so no rotation containing both can satisfy [A] § Staging 4's
 * two-step rule. The trio is unrealisable as written. ECU is substituted for
 * MCU: it is the same document's own climax-adjacent detail size (recipes 23
 * insert-ladder, 39 super-slow-mo) and it preserves the recipe's actual
 * instruction, which is to alternate wide / action / detail. The face is what
 * is lost, and a director who wants it declares MCU and the review will flag
 * the adjacency honestly.
 */
export const SIZE_LADDER: Readonly<Record<TrailerRole, readonly ShotSize[]>> = {
  // recipe 10 (fg object frames the land) alternating with 17/18 (hooded hero, hero from behind).
  setup: ["EWS", "MS"],
  // recipe 26 (enemy out of smoke, WS) → recipe 29 (villain frontal, MCU) — [A]'s own beat-6 pair.
  rung: ["WS", "MCU"],
  // recipe 42, with the substitution above.
  peak: ["EWS", "MS", "ECU"],
  // recipe 31 — "the quiet wide where sound stops" (NOPE, Neil).
  reset: ["EWS"],
  // recipe 46 — title over the held world plate, which is the last EWS.
  tail: ["EWS"],
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

/* ── The seam with the frame list, stated rather than left to be discovered ──
 *
 * A shot is NOT folded into `Frame[]`, and the reason is load-bearing rather
 * than stylistic:
 *
 *  1. A `Frame` owns a `plate`, and a plate is what gets generated. Giving
 *     every shot one would turn a decomposition into a generation order, which
 *     is out of this layer's scope by construction, not by discipline.
 *
 *  2. `sceneSpec.ts:reviewSceneSpecs` keys frames by `f.at` into a Map and
 *     enforces "no beat covered twice". Three shots under one beat share one
 *     `at`, so a per-shot frame list would silently drop two of them from
 *     `byAt` AND have the direction pass reject the second and third scenes as
 *     duplicates. Whoever builds shot→frame has to give a shot its own identity
 *     in that contract first; it is not a drop-in.
 *
 * Nothing in this file imports `BeatKind`, and that absence is deliberate: the
 * explainer vocabulary and the trailer one are the beat layer's business, and
 * this layer reads a beat's `kind` only through `ROLE_HINTS`.
 *
 * ─── AND THE SEAM WITH THE BEAT LANE, WHICH IS ONE DECLARATION NOW ──────────
 *
 * This paragraph used to carry a merge-time TODO: `ShotSourceBeat` is the shape
 * `app/_phases/script/trailer/types.ts` exports as `ShotLaneBeat`, "THE TWO ARE
 * NOT YET THE SAME DECLARATION and must be made one on merge". The branches
 * merged long ago and the unification did not happen, because the TODO asked for
 * something that would have been wrong: delete `ShotSourceBeat` and import
 * `ShotLaneBeat`. That would have narrowed this layer's input to a beat carrying
 * a required `id`, a required `movement` and a `TrailerBeatKind`, and the
 * explainer's `ScriptRender.beats` would no longer have compiled against
 * `shotsFromRender` — which is the one call whose answer for an explainer must
 * stay "no shots at all".
 *
 * BOTH HALVES ARE NOW DISCHARGED, in the direction that keeps that guarantee:
 *
 *   · the field list lives ONCE, in the beat layer, at the consumer's width
 *     (`ShotLaneSourceBeat`), and `ShotLaneBeat extends` it. `ShotSourceBeat`
 *     above is that shape plus `role`, this layer's own vocabulary.
 *   · `beatSeconds` has no parsing half left: it defers to `atSeconds`.
 *
 * `movement` is carried onto a shot as `Shot.movementId`, because on a shot it
 * is an id rather than a container.
 *
 * ONE THING THIS LAYER CANNOT SUPPLY, and the reason is doctrinal rather than
 * an implementation gap: the beat lane's magnitude check wants an injected
 * `magnitudeOf` resolver, and a shot list is the wrong place to get one. The
 * only magnitude-adjacent quantity here is CUT RATE, and
 * [R] escalation-without-mechanism names precisely that as the naive
 * substitute — "the naive substitute is size — bigger images, louder hits,
 * faster cuts. That produces the form's most common defect". A resolver built
 * on shots-per-second would encode the defect the check exists to find, and
 * turn its honest `unmeasured` into a confident wrong answer. The field that
 * would carry it is `TrailerBeat.raises`, which the beat lane already models
 * and which is where the doctrine puts it: "In a tool, make the raised variable
 * an explicit field." */
