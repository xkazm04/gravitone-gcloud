"use client";

// SHOT → TEXT-TO-IMAGE PROMPT. Proposed, never called.
//
// This file produces the prompt a downstream image call WOULD use for one shot.
// It imports nothing from `lib/imaging/**` and exposes no function that reaches
// a provider: the output is a string on a read-only sheet. A shot list you can
// read the prompts off is the deliverable; a plate is not.
//
// ─── THE TWO-BLOCK LAW, AND WHERE EACH HALF COMES FROM ──────────────────────
//
// `knowledge/VISUAL-STYLE.md` § 1 (OBSERVED · n=1 · [00:03:33], "So, I had a
// style lock, replaced the action") splits a generation prompt into two blocks
// with DIFFERENT LIFETIMES:
//
//   STYLE   lives for the whole project   palette · technique · finish
//   ACTION  lives for one shot            what happens in this frame
//
// The style half is not this file's business and is not re-implemented here:
// `lib/stylePrompt.ts#compilePrompt` is "the one compiler" and it is called.
// That is also the registry law `style-is-restated-not-remembered` — "there is
// no short form, and no call may opt out of the style half of its prompt" —
// which is why nothing below can build a prompt without a `StyleBlock` in hand.
//
// This file owns the ACTION half only, and derives it from the SHOT.
//
// ─── DERIVED, NOT AUTHORED ──────────────────────────────────────────────────
//
// `frames.ts:17-19`: "SCENES COME FROM STEP 2 … the frame list is derived,
// never authored. Nobody retypes the script here." The same holds one layer
// down. A shot already carries its size, its facing, where the eye is asked to
// look and (once somebody writes one) its move — that is a staging instruction,
// and re-typing it as prose per shot is exactly the retyping that rule forbids.
//
// So `actionFor` composes the staging clause mechanically out of the shot's own
// fields, and takes its subject clause from a role×size recipe table lifted
// from [A]'s beat→shot recipes. `Shot.subject` overrides the recipe when an art
// director has written one, and `authoredSubject` says which happened.
//
// ─── WHAT THIS FILE DOES NOT DO, BY INSTRUCTION ─────────────────────────────
//
// It does not tune. There is no A/B of wordings, no score, no claim that one
// phrasing is honoured better than another — that measurement is a separate
// session on different hardware with open-source models, and inventing its
// result here would be manufacturing quality evidence, which this repo's own
// rules forbid twice over (`unmeasured-is-not-pass`; `knowledge/README.md`'s
// evidence contract). The job is a DEFENSIBLE FIRST PROMPT, not an optimal one,
// and `shotReview.ts` checks only what is mechanically checkable about it:
// that it exists, that it restates the style block, that it carries the no-text
// clause, and that it fits the vendor ceiling. Never that it is good.
//
// ─── THE EPISTEMIC SPLIT, AND WHAT IT DEGENERATES TO HERE ───────────────────
//
// `frames.ts:5-15` states it: "if a viewer could check it against a fact, code
// draws it; if it only has to feel right, a model may" — which in an explainer
// puts every number and caption in the vector layer, bound to a notebook fact
// through `factId`, and `sceneSpec.ts` REFUSES a figure that cites none.
//
// A trailer shot asserts nothing a viewer can check. There is no notebook
// behind it and no figure to bind, so the split does not disappear — IT LANDS
// ENTIRELY ON ONE SIDE. Everything in a trailer plate is feel-right, so the
// model draws all of it, and the vector layer's share is not "the numbers", it
// is the CARDS: the title, the date, the platforms, the location caption. Those
// are still checkable (a work has one real name and one real date) and they are
// still glyphs, so they stay ours and are never generated — [A] recipe 52 says
// the same thing from the other direction ("text must be post, not generated").
//
// The `factId` gate therefore does not go away either; it inverts. In an
// explainer a figure without a fact is refused. Here there are no facts, so
// there may be no figure: a trailer shot carries no `figure` text at all, and
// the `NO_TEXT_CLAUSE` welded into `compilePrompt` is what enforces the
// picture half of that.

import { PROMPT_CHAR_LIMIT, compilePrompt, compileStyleBlock, NO_TEXT_CLAUSE } from "@/lib/stylePrompt";
import type { StyleBlock } from "@/lib/themes";

import type { Shot, ShotSize, TrailerRole } from "./shots";

/* ── The subject recipes ──────────────────────────────────────────────────── */

/**
 * One IP-neutral subject clause per (role × size) the ladder can actually
 * produce — nine entries, each lifted from a numbered recipe in [A] § 2.
 *
 * SHAPE FIRST, NOUNS SECOND, which is `subjectFor`'s rule (`frames.ts:280-286`)
 * and its stated reason: "a plate drawn from the literal words gets the
 * reservation book with 'Reservation' written in it, which the trial grid
 * measured leaking text on 6 of 6 styles". So no clause below is built from the
 * beat's sentence — the beat's own words never reach a model through this path.
 *
 * They also avoid faces, hands and two-figure contact wherever the recipe
 * allows, following [A]'s generation-risk summary: 18 of its 30 situations are
 * low risk "because their real-trailer recipe already avoids faces, hands and
 * contact", and the villain MCU is kept because [A] measures frontal
 * symmetrical faces as "the model's comfort zone".
 */
const SUBJECT_RECIPE: Readonly<Record<string, string>> = {
  // recipe 10 — foreground object frames the land.
  "setup:EWS":
    "A wide landscape seen past a dark silhouetted form occupying one third of the frame, layered mist receding to a low horizon, one small point of light far in the distance.",
  // recipe 18 — hero from behind.
  "setup:MS":
    "A lone figure seen from behind at medium distance, back and shoulders only, walking away into soft depth, the place they are heading toward visible beyond them.",
  // recipe 26 — enemy walks toward camera out of smoke, backlit.
  "rung:WS":
    "Several figures at middle distance advancing toward the viewer out of smoke, rim-lit from behind, faces unreadable, low ground haze.",
  // recipe 29 — villain face, frontal, symmetrical.
  // The lighting clauses below name one in-world source and say what stays
  // dark — dojo 2026-08-30-what-stays-dark (`lighting-as-dramatic-instrument`,
  // human-gated, unanimous): the model lights evenly unless told what NOT to
  // light, and a frame where everything is visible has said nothing.
  "rung:MCU":
    "A single figure framed head and shoulders, dead centre and symmetrical, lit by one hard source with a strong colour cast from high to one side, the far side of the face falling to near-black, nothing else in the surround lit.",
  // recipe 43 — scale plate: beam / giant / army.
  "peak:EWS":
    "One vast form filling the horizon — a vertical beam of light above a massed crowd rendered as texture — with small figures beneath it for scale.",
  // recipe 44 — squad walk toward camera, low angle, through smoke.
  "peak:MS":
    "Three figures abreast at medium distance moving toward the viewer through smoke, seen from below, backlit, legs cropped by the lower frame edge.",
  // recipe 39 — super slow-mo single event.
  "peak:ECU":
    "One physical event frozen very close — debris, sparks and a single shard mid-flight — filling the frame against a dark ground, the sparks themselves the only light, everything a hand's width away falling to black.",
  // recipe 31 — the quiet wide where sound stops.
  "reset:EWS":
    "A single small structure on a flat horizon at night, one lit window its only light spilling a small warm pool onto the ground, the sky and the land otherwise dark, nothing moving, the lower third clear.",
  // recipe 46 — title over the held world plate; the quiet third is the card's ground.
  "tail:EWS":
    "A wide landscape plate with a deliberately quiet, empty upper third carrying no focal detail, atmosphere thinning toward the top of the frame.",
};

/** The recipe for a shot, or null when the role/size pair has none — which is every shot whose beat carried no role. */
export const recipeFor = (role: TrailerRole, size: ShotSize | null): string | null =>
  size ? (SUBJECT_RECIPE[`${role}:${size}`] ?? null) : null;

/* ── The staging clause ───────────────────────────────────────────────────── */

/** [A]'s shorthand, spelled out. A model reads "extreme wide shot"; it does not read "EWS". */
const SIZE_PHRASE: Readonly<Record<ShotSize, string>> = {
  EWS: "An extreme wide shot",
  WS: "A wide shot",
  MS: "A medium shot",
  MCU: "A medium close-up",
  CU: "A close-up",
  ECU: "An extreme close-up",
};

/**
 * The angle as ATTITUDE, not mechanics. Dojo cycle 2026-08-30-camera-attitude
 * (`cinematic-language/camera-position-semantics`, human-gated) A/B'd exactly
 * this table's old wording ("from a low angle looking up") against the
 * stance's meaning plus its headroom consequence, and the meaning won: the
 * model renders eye-level-centred-with-headroom as its null sentence, and only
 * an attitude sentence reliably moves it off that.
 */
const ANGLE_PHRASE: Readonly<Record<NonNullable<Shot["angle"]>, string>> = {
  LA: "seen from below, the camera low and tilted up so the subject looms against what is behind it, granted power, with almost no headroom",
  HA: "from a high vantage looking steeply down so the subject is diminished, small and surveilled, excess empty space pressing down from above",
  eye: "at eye level, meeting the subject as a peer",
};

/** [A] § Staging 1 — Miller's crosshair for fast cuts; thirds and negative space for holds. */
const PLACEMENT_PHRASE: Readonly<Record<NonNullable<Shot["placement"]>, string>> = {
  crosshair: "the subject dead centre on the crosshair so the eye finds it instantly",
  thirds: "the subject off-centre on a thirds intersection with generous negative space",
  // dojo 2026-08-31-study-diagonal (human-gated): the composition built on one
  // strong line — A-tier action's most common extreme-wide arrangement, which
  // this table previously could not say.
  diagonal: "the composition built on one strong diagonal, the line of action running corner to corner of the frame with the subject on it",
};

/** [A] § Staging 3 — the line of action. A neutral shot is the sequence's only legal reversal, so it is stated rather than omitted. */
const DIRECTION_PHRASE: Readonly<Record<Shot["direction"], string>> = {
  "screen-right": "the subject facing and travelling toward screen right",
  "screen-left": "the subject facing and travelling toward screen left",
  "toward-camera": "the subject moving toward the lens, screen direction neutral",
  neutral: "no dominant screen direction",
};

/**
 * The action block for one shot.
 *
 * Assembled from the shot's own fields in a fixed order, so two shots that
 * stage the same way produce the same clause and a reader can diff them. There
 * is no prose written here that a shot does not already contain.
 */
export function actionFor(shot: Shot): string {
  const parts: string[] = [];

  if (shot.size) {
    const angle = shot.angle ? ` ${ANGLE_PHRASE[shot.angle]}` : "";
    parts.push(`${SIZE_PHRASE[shot.size]}${angle}.`);
  }

  const subject = shot.subject?.trim() || recipeFor(shot.role, shot.size);
  if (subject) parts.push(subject);

  const staging = [shot.placement ? PLACEMENT_PHRASE[shot.placement] : null, DIRECTION_PHRASE[shot.direction]]
    .filter(Boolean)
    .join(", ");
  parts.push(`Compose with ${staging}.`);

  // The move, ONLY when somebody wrote one. `Shot.motion` is seeded empty on
  // purpose and an invented move here would re-introduce exactly the canned
  // lookup `frames.ts:266-268` refused — one rung short of the plate this time,
  // which makes it no better.
  if (shot.motion.trim()) parts.push(`The frame is the first frame of a shot that ${shot.motion.trim()}.`);

  return parts.join(" ");
}

/* ── The proposal ─────────────────────────────────────────────────────────── */

export interface ShotPrompt {
  shotId: string;
  /** The action half alone — the block whose lifetime is one shot. */
  action: string;
  /** The whole prompt, built by `lib/stylePrompt`'s one compiler: style, then action, then the no-text clause. */
  text: string;
  /** True when the subject clause came from an art director rather than the role recipe. */
  authoredSubject: boolean;
  /** True when neither existed — the shot's role never resolved, so it has no recipe and nobody wrote one. */
  subjectMissing: boolean;
  chars: number;
}

/**
 * Propose a prompt per shot.
 *
 * A `StyleBlock` is a REQUIRED argument and there is no overload without one:
 * `style-is-restated-not-remembered` says no call may opt out of the style
 * half, and the cheapest way to honour that is to make a prompt unbuildable
 * without it.
 *
 * Nothing here sends anything anywhere.
 */
export function promptsForShots(shots: readonly Shot[], block: StyleBlock): ShotPrompt[] {
  return shots.map((s) => {
    const action = actionFor(s);
    const text = compilePrompt(block, action);
    return {
      shotId: s.id,
      action,
      text,
      authoredSubject: Boolean(s.subject?.trim()),
      subjectMissing: !s.subject?.trim() && !recipeFor(s.role, s.size),
      chars: text.length,
    };
  });
}

/** Re-exported so `shotReview.ts` checks the SAME constants the compiler used, rather than a copy of them — a copy is what the defect would look like. */
export { PROMPT_CHAR_LIMIT, compileStyleBlock, NO_TEXT_CLAUSE };
