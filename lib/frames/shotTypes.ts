// The shot layer's vocabulary: the types and constants `shots.ts` derives over.
// Split out so the derivation stays under the file cap. `shots.ts` re-exports
// every name here, so importers keep reading them from `shots.ts`; the header
// there is the doctrine, and this file only declares what it speaks in.

import type { ShotLaneBeat, ShotLaneSourceBeat } from "@/lib/script/trailer/types";

/* ── What this layer consumes ─────────────────────────────────────────────── */

/**
 * A beat, AS THIS LAYER READS ONE — and it is one declaration now, not two.
 *
 * This used to be a hand-kept SECOND copy of `ShotLaneBeat`'s field list, held
 * to it by the `AssertAssignable` witness below and by a merge-time TODO at the
 * bottom of `shots.ts` that said to make the two one. That TODO is discharged
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
   * no default stands in for it. `frames.ts#FrameClip` refuses to invent a clip
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
 * Nothing in `shots.ts` imports `BeatKind`, and that absence is deliberate: the
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
