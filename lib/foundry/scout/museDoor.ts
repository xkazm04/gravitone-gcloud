import { z } from "zod";

import { ASPECT_PX, type Aspect } from "../../imaging/types.ts";
import { CARD_LOOK_MAX, CARD_NAME_MAX, CARD_PERSONALITY_MAX, MUSE_MAX_AGE, MUSE_MIN_AGE, type CharacterCard } from "./muse.ts";
import type { ScoutWing } from "./wing.ts";

// THE MUSE WING'S HALF OF THE IDEAS DOOR (spark scout-muse WP2). ./idea.ts parses a brief's shape for
// both wings; what follows is what a brief must also clear before the muse wing draws it - read off
// the brief's own words, before a candidate exists, so a refused batch writes nothing:
//
//   THE TARGETS. A muse night draws looks, situations and women: style, scene, character. A 3D asset
//   or a stats reel is the scout wing's work, and a `character` with its card is the muse wing's.
//
//   THE CARD. A character idea carries her card (./muse.ts CharacterCard) - the studio takes no
//   reference image, so the card IS her identity - and no other idea carries one.
//
//   THE STATED AGE. Every muse prompt says `aged NN`, every stated age is MUSE_MIN_AGE or older, and
//   a character prompt states her card's age and no other. The floor sits well above 18 because
//   anime and stylised looks drift young (knowledge/scout-muse/techniques.md); the eye's read of
//   the drawn still is the second gate (./judge.ts), never the only one.
//
//   THE WORDS. A youth word, or a nudity or sexual word, anywhere in the brief's text refuses it:
//   matched whole-word and case-blind, so `girlfriend` and `kidney` pass and `Teen` does not. The
//   list is a floor, not the line - a still that clears the words and still reads young or nude is
//   thrown by the judge.
//
// The scout wing reads none of this: its briefs are unchanged, but a card or a `character` target
// is refused there, so a muse brief sent without `--wing muse` never lands in the scout root.

/** Every aspect the imaging contract draws (lib/imaging/types.ts), as the door's enum. */
export const ASPECTS = Object.keys(ASPECT_PX) as [Aspect, ...Aspect[]];

/** What each wing draws when a brief names no aspect: the scout wing's video frame, the muse wing's tall portrait. */
export const WING_ASPECT: Readonly<Record<ScoutWing, Aspect>> = { scout: "16:9", muse: "9:16" };

/** The aspect radios the studio's generate page offers (read off the page 2026-10-23: 16:9, 1:1, 9:16 - no 4:5;
 *  the first live muse night failed 32 portraits on it, before any Generate). A muse brief asks for one of these. */
export const STUDIO_ASPECTS: readonly Aspect[] = ["16:9", "1:1", "9:16"];

/** The targets the muse wing draws. */
export const MUSE_TARGETS = ["style", "scene", "character"] as const;

const line = (max: number) => z.string().trim().min(1).max(max);
const AGE = { message: `her age is a whole number from ${MUSE_MIN_AGE} to ${MUSE_MAX_AGE}` };

export const cardSchema = z
  .object({
    name: line(CARD_NAME_MAX),
    age: z.number(AGE).int(AGE).min(MUSE_MIN_AGE, AGE).max(MUSE_MAX_AGE, AGE),
    look: line(CARD_LOOK_MAX),
    personality: line(CARD_PERSONALITY_MAX),
  })
  .strict();

/** Words that put a minor in the frame. Multi-word entries match across any run of spaces. */
export const YOUTH_WORDS = ["child", "children", "kid", "kids", "teen", "teens", "teenage", "teenager", "minor", "underage", "schoolgirl", "schoolboy", "school uniform", "loli", "lolita", "preteen", "young girl", "little girl", "petite girl"] as const;
/** Words that undress the frame or make it sexual: the wing is SFW. */
export const EXPLICIT_WORDS = ["nude", "naked", "topless", "nipple", "nipples", "lingerie", "explicit", "sexual", "sex", "erotic", "nsfw"] as const;

const wordsRe = (words: readonly string[]): RegExp => new RegExp(`\\b(?:${words.map((w) => w.split(" ").join("\\s+")).join("|")})\\b`, "i");
const YOUTH_RE = wordsRe(YOUTH_WORDS);
const EXPLICIT_RE = wordsRe(EXPLICIT_WORDS);

/** `aged NN`: two digits, whole-word. */
export const STATED_AGE_RE = /\baged (\d{2})\b/gi;

/** Every age the prompt states, in order. */
export const statedAges = (prompt: string): number[] => [...prompt.matchAll(STATED_AGE_RE)].map((m) => Number(m[1]));

/** The brief as ./idea.ts parsed it: the fields this door reads. */
export type MuseBrief = {
  readonly title: string;
  readonly target: string;
  readonly genre: string;
  readonly prompt: string;
  readonly anchor: { readonly ref: string };
  readonly use?: string;
  readonly appTarget?: string;
  readonly aim?: string;
  readonly look?: string;
  readonly card?: CharacterCard;
  readonly aspect?: Aspect;
};

/** A refusal: the brief's field and the rule it broke, in parseAt's `<path>: <message>` shape. */
export type DoorRefusal = { readonly path: string; readonly message: string };

/** Every text field of the brief, by its path, in the order a reader meets them. */
function texts(b: MuseBrief): [string, string][] {
  const out: [string, string][] = [
    ["title", b.title],
    ["genre", b.genre],
    ["prompt", b.prompt],
    ["anchor.ref", b.anchor.ref],
  ];
  if (b.use !== undefined) out.push(["use", b.use]);
  if (b.appTarget !== undefined) out.push(["appTarget", b.appTarget]);
  if (b.aim !== undefined) out.push(["aim", b.aim]);
  if (b.card !== undefined) out.push(["card.name", b.card.name], ["card.look", b.card.look], ["card.personality", b.card.personality]);
  return out;
}

/** The first rule `b` breaks on `wing`, or null. */
export function wingRefusal(b: MuseBrief, wing: ScoutWing): DoorRefusal | null {
  if (wing !== "muse") {
    if (b.target === "character") return { path: "target", message: "character is the muse wing's target (--wing muse)" };
    if (b.card !== undefined) return { path: "card", message: "a character card is the muse wing's (--wing muse)" };
    return null;
  }
  if (!(MUSE_TARGETS as readonly string[]).includes(b.target)) return { path: "target", message: `${b.target} is not drawn in the muse wing (it draws ${MUSE_TARGETS.join(", ")})` };
  if (b.target === "character" && b.card === undefined) return { path: "card", message: "a character idea carries her card {name, age, look, personality}" };
  if (b.target === "character" && b.look === undefined) return { path: "look", message: "a character idea names her look direction as a slug (the repeat guard's key)" };
  if (b.target !== "character" && b.card !== undefined) return { path: "card", message: "only a character idea carries a card" };
  if (b.aspect !== undefined && !STUDIO_ASPECTS.includes(b.aspect)) return { path: "aspect", message: `the studio draws ${STUDIO_ASPECTS.join(", ")}; it has no ${b.aspect}` };
  for (const [path, s] of texts(b)) {
    const youth = YOUTH_RE.exec(s);
    if (youth !== null) return { path, message: `"${youth[0]}" is a youth word; the muse wing draws adult women only` };
    const explicit = EXPLICIT_RE.exec(s);
    if (explicit !== null) return { path, message: `"${explicit[0]}" is a nudity or sexual word; the muse wing is SFW` };
  }
  const ages = statedAges(b.prompt);
  if (ages.length === 0) return { path: "prompt", message: `states no age; a muse prompt says "aged NN", ${MUSE_MIN_AGE} or older` };
  const young = ages.find((a) => a < MUSE_MIN_AGE);
  if (young !== undefined) return { path: "prompt", message: `"aged ${young}" is under ${MUSE_MIN_AGE}, the youngest a muse prompt may state` };
  const old = ages.find((a) => a > MUSE_MAX_AGE);
  if (old !== undefined) return { path: "prompt", message: `"aged ${old}" is over ${MUSE_MAX_AGE}, the oldest a muse prompt may state` };
  const other = b.card === undefined ? undefined : ages.find((a) => a !== b.card?.age);
  if (other !== undefined) return { path: "prompt", message: `"aged ${other}" is not her card's age, ${b.card?.age ?? ""}` };
  return null;
}
