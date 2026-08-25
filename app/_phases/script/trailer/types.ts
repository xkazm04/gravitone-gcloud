// STEP 2 (Script) — THE TRAILER FORM. A second beat vocabulary, disjoint from
// the explainer's, plus the movement container the explainer never had.
//
// ─── why this is a separate vocabulary and not three more BeatKinds ─────────
//
// `../types.ts` models a piece that PAYS every debt it opens: it asks a question
// aloud, answers it, states a promise as topics, and closes by reframing. A
// trailer is the inversion. The registry states the boundary in one sentence:
//
//   "short-form-narrative-structure governs a piece that must pay every debt it
//    opens; this subject governs a piece whose entire function is to open a debt
//    another artifact will pay."
//   — ai-registry/knowledge/media-generation/narrative-craft/trailer-structure/
//     trailer-structure.md § Where this subject ends and its neighbours begin
//
// Folding `cold-open` and `rung` into `BeatKind` would put `answer`, `verdict`
// and `close` in reach of a chain whose whole product is an UNPAID debt — and
// would let a checker written for one form report `pass` over the other. The two
// unions are therefore disjoint by construction, and `VOCABULARIES_ARE_DISJOINT`
// below makes `tsc` prove it rather than a comment assert it.
//
// ─── what this file deliberately does NOT carry ────────────────────────────
//
// **No `checks[]`.** `../renders.ts:46-58` hand-types a `checks` array onto each
// fixture — twelve sentences a human wrote ABOUT a render, none of which could
// catch the violation that actually shipped (`../gate.ts:19-21`). A trailer cut
// carries authored data only; every verdict about it is computed by
// `./structure.ts`, which reads it.
//
// **No durations, no shot counts, no ratios.** The doctrine gives most of its
// quantities as hedges ("roughly ten seconds per rung", "a short cut should carry
// two or three rungs"), and hardening a hedge into a constant is how a checker
// starts enforcing something nobody measured. Where a rule has a number the
// doctrine states unconditionally — one variable per rung, one structural reset,
// "three or more, remove all but one" — it is encoded and quoted at its use site.
// Everything else is absent on purpose, exactly as
// `knowledge/templates/short-educational-video/steps/02-frames/PATTERNS.md:65-74`
// refuses to ship a `params.json` over impressions.
//
// **No shots.** Duration, size and motion intent belong to the shot layer, which
// is a separate lane. The seam is `toShotLaneBeat()` at the bottom of this file.

import type { Connector } from "../../_shared/notebook/types";
import type { BeatKind } from "../types";

/* ───────────────────────────── the two forms ───────────────────────────────
   A render is one kind or the other, and the tag is required on both sides so
   `tsc` narrows rather than a reader guessing. `ScriptRender.form` is the
   explainer half; see `../types.ts`. */

export type NarrativeForm = "explainer" | "trailer";

/* ─────────────────────── the trailer's beat vocabulary ─────────────────────
   Named after the parts the golden path names, one beat kind per part, plus the
   two devices that run across parts (`reset`, `title`). Nothing here is a
   synonym for an explainer kind: a `cold-open` is not a `hook` (a hook opens a
   gap the piece will close; a cold open opens one another artifact will close),
   and there is deliberately no trailer `answer`. */

export type TrailerBeatKind =
  /** Context-free grab. "buys attention with something that needs no context …
   *  whether the viewer wants to know how the moment resolves *and* believes it
   *  will resolve soon" — trailer-structure.md § The spine. Optional. */
  | "cold-open"
  /** The introduction's information floor: "the least information that makes the
   *  stakes legible: who these people are, what they want, why the coming
   *  spectacle matters" — ibid. */
  | "stakes"
  /** One escalation rung — "a small closed unit … you can say what the viewer
   *  knows after it that they did not know before" —
   *  techniques/escalation-without-mechanism.md § What a rung is made of. */
  | "rung"
  /** The dynamic reset: the stop / fall to near-silence before the peak.
   *  techniques/dynamic-reset.md. */
  | "reset"
  /** The climax. "emphatically *not required to be the work's own climax*." */
  | "peak"
  /** A title or copy card. Punctuates sections as well as naming the work —
   *  .vault/Research/2026-08-23-trailer-cinematic-grammar.md C1 (OBSERVED, S1):
   *  "a title card punctuates this section, signalling transition to the climax". */
  | "title"
  /** The optional last joke, sting or flourish after the title. */
  | "button"
  /** Call-to-action / end card. Kept because the length ladder names it among the
   *  last three things to go — techniques/length-ladder.md § The drop order. */
  | "cta";

/** COMPILE-TIME PROOF that the two vocabularies share no member. If somebody
 *  later adds `hook` to `TrailerBeatKind` (or `rung` to `BeatKind`), this line
 *  stops compiling and says why — which is the only form of "these are disjoint"
 *  that survives a refactor nobody reads the comment for. */
type AssertDisjoint<A, B> = [Extract<A, B>] extends [never] ? true : never;
export const VOCABULARIES_ARE_DISJOINT: AssertDisjoint<BeatKind, TrailerBeatKind> = true;

/* ───────────────────────────── escalation ─────────────────────────────────
   "It raises exactly one variable. Scale, threat, speed, intimacy, cost. A rung
   that raises three at once has nothing left for the rung after it."
   — escalation-without-mechanism.md § What a rung is made of.

   The list is the doctrine's, verbatim and closed. */

export type RaisedVariable = "scale" | "threat" | "speed" | "intimacy" | "cost";

/** The four moves that raise stakes while withholding the mechanism, in the
 *  doctrine's own order of cost (§ Escalating without spending the mechanism).
 *  Recorded, not checked: no rule in the subject constrains which move a rung
 *  uses, and inventing one here would be this file asserting craft the registry
 *  does not state. */
export type EscalationMove =
  | "widen-scope"
  | "shorten-clock"
  | "personalise-cost"
  | "invert-frame";

/* ────────────────────────── the movement container ────────────────────────
   The thing the explainer step never had. Act structure exists in `../renders.ts`
   only as prose inside `Beat.label` ("M1 · where the money went"), which means no
   function can read it and every act-level rule stayed a sentence.

   A movement is not a free-floating label: "the cue is the skeleton, and the
   picture parts are named after the cue movements they sit on" — trailer-structure.md
   § The spine, and what it is a spine of. */

export type MovementRole =
  | "cold-open"
  | "introduction"
  | "escalation"
  | "climax"
  /** The cue's closing phrase, under the title and end cards; where the button
   *  lives. Cue writers "describe a four-movement structure with a five-second
   *  tail for the title and logos" — the duration is theirs and is NOT encoded. */
  | "tail";

/** Spine order. The sequence, not the count, is what a checker can read. */
export const SPINE_ORDER: readonly MovementRole[] = [
  "cold-open",
  "introduction",
  "escalation",
  "climax",
  "tail",
] as const;

/** The parts the spine treats as optional. Absence of anything else is a finding.
 *  "It is not mandatory — a work with an existing audience, or an opening image
 *  strong enough on its own, is better off without one" (cold open); the button
 *  "is optional"; the tail is a cue fact rather than a story part. */
export const OPTIONAL_ROLES: readonly MovementRole[] = ["cold-open", "tail"] as const;

export interface Movement {
  id: string;
  role: MovementRole;
  /** Position in the cut. Duplicated ordinals and gaps are findings, not crashes. */
  ordinal: number;
  label: string;
  /** The cue section this movement sits on. Optional in the type and reported as
   *  UNMEASURED when absent — a movement the music does not mark is "a boundary
   *  the viewer cannot perceive" (cue-first-assembly.md § Decision rules), and a
   *  checker that scored it `pass` would be certifying a boundary that is not
   *  there. */
  cueSection?: string;
}

/* ─────────────────────────────── the cue ───────────────────────────────────
   "In a tool, model the cue as the timeline's parent, not as a track. A system
   where beats carry timings and music is attached afterwards has encoded the
   inverted dependency, and every structural check it runs will be measured
   against positions the music does not mark."
   — cue-first-assembly.md § Decision rules.

   So `TrailerCut.cue` is a field of the cut, movements point INTO it, and the
   shot layer inherits the marks rather than setting them. */

/** The shape the form wants, from cue-first-assembly.md § What a usable cue has:
 *  "a mood opening; an exposition section where a rhythmic device enters …; a
 *  response section that adds drive; a build; a peak of full energy; and a brief
 *  closing phrase, drawn from the peak's material". */
export type CueSectionKind =
  | "mood-open"
  | "exposition"
  | "response"
  | "build"
  | "peak"
  | "tail";

export interface CueSection {
  id: string;
  kind: CueSectionKind;
  label: string;
  /** Does the cue breathe here? "When a cue has no breath before its peak, reject
   *  it however good it sounds. There is nowhere to put the reset." A boundary is
   *  where a reset CAN land — not where anyone would like it to. */
  isBoundary: boolean;
}

export interface Cue {
  id: string;
  title: string;
  sections: CueSection[];
  /** True once the cue is frozen. "Freeze the cue before showing the cut to
   *  anyone who can request changes. Every note after this point is a picture
   *  note by construction." Recorded so a later cue change is visible as the
   *  re-cut it is, rather than presented as an adjustment. */
  frozen: boolean;
}

/* ───────────────────────── the withholding budget ──────────────────────────
   "Denominate it in the work's own assets, listed by name before any cutting
   starts" — withholding-budget.md § What the budget is denominated in. The five
   asset kinds and the three allowances are the technique's, closed. */

export type WorkAssetKind = "turn" | "reveal" | "resolution" | "best-moment" | "novum";
export type Allowance = "spend" | "imply" | "hold";

export interface WorkAsset {
  id: string;
  kind: WorkAssetKind;
  /** "named specifically, written by someone who owns the work rather than the
   *  campaign." */
  name: string;
  allowance: Allowance;
  /** "Record the trade for every `spend`. One sentence: what conversion this buys
   *  and what experience it costs. A spend with no recorded reason is a drift that
   *  has already happened." */
  trade?: string;
}

export interface WithholdingBudget {
  /** "Bind the budget to the campaign, not to the cut." The id is the campaign's. */
  campaignId: string;
  assets: WorkAsset[];
}

/* ────────────────────────── the promise ledger ─────────────────────────────
   "In a tool, make the payer a required field. If a system composes or checks
   promotional cuts, a promise-bearing beat that carries no reference to the
   moment paying it should be surfaced as incomplete rather than accepted."
   — promise-ledger.md § Decision rules.

   Note what the same technique says two lines earlier about gating: "As a gate.
   Every grade in the ledger is a judgement … A system that blocks on it will
   block on correct work; report the rows and let a human read them." Both are
   honoured: the field exists and is checked; the check never contributes to
   `malformed`. */

export type PromiseSource = "claim" | "register" | "assembly";
export type PayerGrade = "paid" | "partly-paid" | "unpaid";

export interface PromiseClaim {
  id: string;
  /** "write the sentence a first-time viewer would take away". */
  sentence: string;
  source: PromiseSource;
  /** The moment in the finished work that satisfies it. Absent = incomplete. */
  payer?: string;
  /** A judgement, never computed here. */
  grade?: PayerGrade;
  /** "Separate spend from debt": did the CUT pay this itself? A joke or a scare
   *  delivered inside the promotion will not land again when the work ships. */
  spentByTheCut?: boolean;
}

/* ─────────────────────────── the length ladder ─────────────────────────────
   "Halving a cut does not halve its parts. It removes parts, in a known order."
   The order below is length-ladder.md § The drop order, verbatim and ordered —
   the technique's own words are "This ordering is the technique's actual
   content", which makes it data rather than an impression. */

export type DroppablePart =
  | "introduction"
  | "dialogue-lines"
  | "middle-rungs"
  | "reset"
  | "cold-open";

export const DROP_ORDER: readonly DroppablePart[] = [
  "introduction",
  "dialogue-lines",
  "middle-rungs",
  "reset",
  "cold-open",
] as const;

/** The rungs of the ladder. Part counts are the technique's ("two for a teaser,
 *  three for a spot"); runtimes are NOT encoded — every figure the doctrine gives
 *  for them is approximate ("at around thirty seconds", "at fifteen seconds"). */
export type LadderRung = "long-cut" | "teaser" | "spot" | "platform";

/* ─────────────────────────────── the beat ─────────────────────────────────── */

export interface TrailerBeat {
  /** Stable id. `at` is not unique and a finding you cannot locate is a rumour
   *  (`../gate.ts:88`). */
  id: string;
  /** The movement this beat belongs to. A beat outside any movement is a finding,
   *  not a default — the container is the point of this file. */
  movement: string;
  /** Timecode, same convention as the explainer's `Beat.at` ("0:00"). Seconds are
   *  derived by `atSeconds()`; they are not a second source of truth. */
  at: string;
  kind: TrailerBeatKind;
  /** The connector to the PREVIOUS beat. "AND THEN" is a defect here for exactly
   *  the reason it is one in the explainer — the neighbour's test "applying here
   *  unchanged and for the same reason"
   *  (escalation-without-mechanism.md → _laws.md#causality-over-sequence).
   *  `null` on a non-first beat means UNDECLARED, which is reported as unmeasured
   *  rather than passed. */
  connector: Connector;
  label: string;
  text: string;

  /** ESCALATION RUNGS ONLY. An array rather than a single value ON PURPOSE: the
   *  defect the doctrine names is "a rung that raises three at once", and a
   *  checker can only find what the type lets an author express. A single-valued
   *  field would make the rule true by construction and the check vacuous. */
  raises?: RaisedVariable[];
  /** Recorded, not checked. See `EscalationMove`. */
  move?: EscalationMove;

  /** Promises this beat makes, in any of the three ways. */
  promises?: PromiseClaim[];
  /** Ids of `WorkAsset`s this beat puts on screen. What the budget is audited
   *  against. */
  spends?: string[];

  /** What the silence holds, for a `reset` beat. An array for the same reason
   *  `raises` is one: the doctrine's defect is "A reset that holds two ideas has
   *  spent its whole value carrying neither", and a single-valued field would make
   *  the rule true by construction and the check vacuous. */
  resetHolds?: ResetContent[];

  /** The cue mark this beat lands on (a `CueSection.id`). "Lay the cue down alone
   *  and mark its boundaries … Assign the parts to the marks. If a part has no
   *  mark to sit on, the cue is wrong for the plan" — cue-first-assembly.md
   *  § Procedure. The reset's landing point is read from here: it "can only land
   *  on a natural downbeat", so the section it names must be a boundary. */
  cueMark?: string;
}

/** "Fill the silence with one thing. A line, an image, a breath." The third
 *  option is the doctrine's "Nothing at all — a beat of black. The strongest and
 *  the most fragile". */
export type ResetContent = "line" | "image" | "nothing";

/* ─────────────────────────────── the cut ─────────────────────────────────── */

export interface TrailerCut {
  /** The discriminant. See `NarrativeForm`. */
  form: "trailer";
  id: string;
  title: string;
  /** Which rung of the family this is. */
  rung: LadderRung;
  /** THE CUE IS THE PARENT, not a track. Optional in the type because a cut can
   *  be planned before a cue is chosen — and every check that depends on cue
   *  boundaries then reports unmeasured, which is the honest verdict for a plan
   *  whose act boundaries nothing marks yet. */
  cue?: Cue;
  movements: Movement[];
  beats: TrailerBeat[];

  /** Parts deliberately removed for this rung, per the drop order. A dropped part
   *  turns the checks that depend on it into `not-engaged` — a declared absence is
   *  not a defect, and it is also not a pass. */
  droppedParts?: DroppablePart[];

  /** THE LANE. "use the spine as the default and as the diagnostic, never as the
   *  gate. A cut that deviates from it is either a specialty-lane choice or a
   *  defect, and the structure alone cannot tell you which."
   *  — trailer-structure.md § The spine is a default, not a law.
   *
   *  So the cut declares which it is, and the checker refuses to grade the spine
   *  of a piece that has deliberately abandoned it. */
  lane: "wide-release" | "specialty";
  /** "A cut built as one sustained emotional gradient rather than a sequence of
   *  steps is a recognised and successful shape, and auditing it for rungs will
   *  report a defect that is a deliberate choice." Set it and the rung/reset
   *  checks report `not-engaged` naming this field. */
  moodLed?: boolean;

  /** Declared deviations from the doctrine, flagged never hidden — the same
   *  convention as `ScriptRender.deviations`. */
  deviations?: string[];
}

/* ────────────────────────── the seam with the shot lane ────────────────────
   The shot layer (a separate lane) turns one beat into 1..n shots with duration,
   size and motion intent. It consumes a beat as `{ at, atS, kind, label, text }`
   plus the movement id. That projection is exported here rather than reproduced
   there, so the beat layer stays the one definition of a beat.

   Nothing below models a shot. */

export interface ShotLaneBeat {
  id: string;
  movement: string;
  at: string;
  /** Seconds, parsed from `at`. `null` when `at` is not a timecode — an
   *  unparseable position is reported, never defaulted to 0. */
  atS: number | null;
  kind: TrailerBeatKind;
  label: string;
  text: string;
}

/** "m:ss" or "h:mm:ss" → seconds. Returns null rather than guessing. */
export function atSeconds(at: string): number | null {
  const parts = at.trim().split(":");
  if (parts.length < 2 || parts.length > 3) return null;
  let total = 0;
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return null;
    total = total * 60 + Number(p);
  }
  return total;
}

export function toShotLaneBeat(b: TrailerBeat): ShotLaneBeat {
  return {
    id: b.id,
    movement: b.movement,
    at: b.at,
    atS: atSeconds(b.at),
    kind: b.kind,
    label: b.label,
    text: b.text,
  };
}

export type { Connector };
