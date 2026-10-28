import { z } from "zod";

import { ASPECT_PX, type Aspect } from "../../imaging/types.ts";
import { CARD_KINDS, CARD_LOOK_MAX, CARD_NAME_MAX, CARD_PERSONALITY_MAX, CARD_RENDERS, MUSE_MAX_AGE, MUSE_MIN_AGE, type CharacterCard } from "./muse.ts";
import { SEED_AUDIENCES, type SeedAudience, type UseApp } from "./types.ts";

// THE CHARACTER HALF OF THE IDEAS DOOR (spark scout-muse WP2; spark scout-vision S3 moved it from the WING to the
// BRIEF). ./idea.ts parses a brief's shape; what follows is what a brief that DRAWS SOMEONE - a `character` idea with
// her card, or any idea that casts kept characters (`cast`) - must also clear, read off the brief's own words before a
// candidate exists, so a refused batch writes nothing. Every other brief reads none of it.
//
//   THE CARD. A character idea carries her card (./muse.ts CharacterCard v2) - the studio takes no reference image,
//   so the card IS her identity - and no other idea carries one. A parody names its original in words (`origin`);
//   an original names none.
//
//   BY AUDIENCE AND APP (the Director's S3 rules). The audience is her seed's (a character idea grows from a kept
//   character seed; a legacy card without one reads as adult). An ADULT character is a stated adult, MUSE_MIN_AGE or
//   older - and MUSE_MAX_AGE or younger when the seed is for companion-chat, dating-sim or roleplay - and no youth word
//   touches her brief. A KIDS or FAMILY character may be any age, but under 18 she is drawn `stylised`, never
//   photoreal; such a brief may then use a youth word. A kids or family character is never cast into adult work.
//
//   THE STATED AGE. A character prompt says `aged NN` - her card's age and no other; a cast prompt states no age
//   but its cast's (their identity blocks state them). The eye's read of the drawn still is the second gate
//   (./judge.ts), never the only one.
//
//   THE WORDS. A nudity or sexual word anywhere in such a brief refuses it, for every audience: matched whole-word and
//   case-blind, so `girlfriend` and `kidney` pass and `Teen` does not. The lists are a floor, not the line - a still
//   that clears the words and still reads young or nude is thrown by the judge.

/** Every aspect the imaging contract draws (lib/imaging/types.ts), as the door's enum. */
export const ASPECTS = Object.keys(ASPECT_PX) as [Aspect, ...Aspect[]];

/** What a brief draws when it names no aspect: a character's tall portrait, every other idea the video frame. */
export const CHARACTER_ASPECT: Aspect = "9:16";
export const IDEA_ASPECT: Aspect = "16:9";

/** The aspect radios the studio's generate page offers (read off the page 2026-10-23: 16:9, 1:1, 9:16 - no 4:5;
 *  the first live muse night failed 32 portraits on it, before any Generate). A brief that draws someone asks for one of these. */
export const STUDIO_ASPECTS: readonly Aspect[] = ["16:9", "1:1", "9:16"];

/** The apps whose characters are held to MUSE_MAX_AGE (the operator, 2026-10-24: conventionally attractive, never over 50). */
export const COMPANION_APPS: readonly UseApp[] = ["companion-chat", "dating-sim", "roleplay"];

/** Under this a character is a child: drawn stylised, never photoreal. */
export const CHILD_AGE = 18;
/** A card's age bounds before its audience is known (its seed's rules narrow it). */
export const CARD_AGE_MIN = 1;
export const CARD_AGE_MAX = 120;
export const CARD_ORIGIN_MAX = 200;

const line = (max: number) => z.string().trim().min(1).max(max);
const AGE = { message: `her age is a whole number from ${CARD_AGE_MIN} to ${CARD_AGE_MAX}` };

export const cardSchema = z
  .object({
    name: line(CARD_NAME_MAX),
    age: z.number(AGE).int(AGE).min(CARD_AGE_MIN, AGE).max(CARD_AGE_MAX, AGE),
    look: line(CARD_LOOK_MAX),
    personality: line(CARD_PERSONALITY_MAX),
    kind: z.enum(CARD_KINDS).optional(),
    origin: line(CARD_ORIGIN_MAX).optional(),
    render: z.enum(CARD_RENDERS).optional(),
    audience: z.enum(SEED_AUDIENCES).optional(),
  })
  .strict();

/** Words that put a minor in the frame. Multi-word entries match across any run of spaces. */
export const YOUTH_WORDS = ["child", "children", "kid", "kids", "teen", "teens", "teenage", "teenager", "minor", "underage", "schoolgirl", "schoolboy", "school uniform", "loli", "lolita", "preteen", "young girl", "little girl", "petite girl"] as const;
/** Words that undress the frame or make it sexual: every idea brief is SFW (spark scout-vision S3). */
export const EXPLICIT_WORDS = ["nude", "naked", "topless", "nipple", "nipples", "lingerie", "explicit", "sexual", "sex", "erotic", "nsfw"] as const;

const wordsRe = (words: readonly string[]): RegExp => new RegExp(`\\b(?:${words.map((w) => w.split(" ").join("\\s+")).join("|")})\\b`, "i");
const YOUTH_RE = wordsRe(YOUTH_WORDS);
const EXPLICIT_RE = wordsRe(EXPLICIT_WORDS);

/** `aged NN`: one to three digits, whole-word (a kids character may be 9). */
export const STATED_AGE_RE = /\baged (\d{1,3})\b/gi;

/** Every age the prompt states, in order. */
export const statedAges = (prompt: string): number[] => [...prompt.matchAll(STATED_AGE_RE)].map((m) => Number(m[1]));

/** The brief as ./idea.ts parsed it: the fields this door reads. */
export type CharacterBrief = {
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
  readonly cast?: readonly string[];
  readonly aspect?: Aspect;
};

/** A refusal: the brief's field and the rule it broke, in parseAt's `<path>: <message>` shape. */
export type DoorRefusal = { readonly path: string; readonly message: string };

/** True for a brief this door holds: a character idea, or one that casts someone. */
export const drawsSomeone = (b: Pick<CharacterBrief, "target" | "cast">): boolean => b.target === "character" || (b.cast?.length ?? 0) > 0;

/** Every text field of the brief, by its path, in the order a reader meets them. */
function texts(b: CharacterBrief): [string, string][] {
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
  if (b.card?.origin !== undefined) out.push(["card.origin", b.card.origin]);
  return out;
}

/** The first rule `b` breaks on its own words - no seed, no kept character read - or null. */
export function briefRefusal(b: CharacterBrief): DoorRefusal | null {
  if (b.target === "character" && b.card === undefined) return { path: "card", message: "a character idea carries her card {name, age, look, personality}" };
  if (b.target === "character" && b.look === undefined) return { path: "look", message: "a character idea names her look direction as a slug (the repeat guard's key)" };
  if (b.target !== "character" && b.card !== undefined) return { path: "card", message: "only a character idea carries a card" };
  const card = b.card;
  if (card !== undefined && card.kind === "parody" && card.origin === undefined) return { path: "card.origin", message: "a parody names its original in words" };
  if (card !== undefined && card.kind !== "parody" && card.origin !== undefined) return { path: "card.origin", message: "only a parody names an original" };
  const seen = new Set<string>();
  for (const name of b.cast ?? []) {
    const k = name.trim().replace(/\s+/g, " ").toLowerCase();
    if (seen.has(k)) return { path: "cast", message: `${name} is cast twice` };
    seen.add(k);
  }
  // The SFW floor holds for EVERY brief, not only one that draws someone: no sexual content is a hard limit of the
  // whole loop (spark scout-vision S3, Director).
  for (const [path, s] of texts(b)) {
    const explicit = EXPLICIT_RE.exec(s);
    if (explicit !== null) return { path, message: `"${explicit[0]}" is a nudity or sexual word; every brief is SFW` };
  }
  if (!drawsSomeone(b)) return null;
  if (b.aspect !== undefined && !STUDIO_ASPECTS.includes(b.aspect)) return { path: "aspect", message: `the studio draws ${STUDIO_ASPECTS.join(", ")}; it has no ${b.aspect}` };
  return null;
}

/** What a brief that draws someone is held to: its seed's audience and app, and the kept cards it casts. */
export type BriefContext = {
  readonly audience: SeedAudience;
  /** The seed's `character.for` (a character seed); absent for any other seed or none. */
  readonly app?: UseApp;
  /** The kept cards the brief casts, in its cast order. */
  readonly cast: readonly CharacterCard[];
};

/** A legacy card names no audience: it was drawn by the muse wing, for adults. */
export const audienceOf = (card: Pick<CharacterCard, "audience">): SeedAudience => card.audience ?? "adult";

/** The first rule a brief that draws someone breaks under `ctx`, or null. Call it after briefRefusal. */
export function characterRefusal(b: CharacterBrief, ctx: BriefContext): DoorRefusal | null {
  const card = b.card;
  if (card !== undefined) {
    if (card.audience !== undefined && card.audience !== ctx.audience) return { path: "card.audience", message: `her seed is for ${ctx.audience}, not ${card.audience}` };
    if (ctx.audience === "adult" && card.age < MUSE_MIN_AGE) return { path: "card.age", message: `an adult-audience character is ${MUSE_MIN_AGE} or older; ${card.age} is under` };
    if (ctx.audience === "adult" && ctx.app !== undefined && COMPANION_APPS.includes(ctx.app) && card.age > MUSE_MAX_AGE) return { path: "card.age", message: `a ${ctx.app} character is ${MUSE_MAX_AGE} or younger; ${card.age} is over` };
    if (ctx.audience !== "adult" && card.age < CHILD_AGE && card.render !== "stylised") return { path: "card.render", message: `a character aged ${card.age} is under ${CHILD_AGE}: drawn stylised, never ${card.render ?? "unstated"}` };
  }
  for (const c of ctx.cast) {
    const aud = audienceOf(c);
    if (ctx.audience === "adult" && aud !== "adult") return { path: "cast", message: `${c.name} is a ${aud} character; this brief's seed is for adults` };
  }
  const drawn = [...(card === undefined ? [] : [card]), ...ctx.cast];
  const youthOk = ctx.audience !== "adult" && drawn.some((c) => c.age < CHILD_AGE && c.render === "stylised");
  if (!youthOk) {
    for (const [path, s] of texts(b)) {
      const youth = YOUTH_RE.exec(s);
      if (youth !== null) return { path, message: `"${youth[0]}" is a youth word; only a stylised kids or family character under ${CHILD_AGE} takes one` };
    }
  }
  const ages = statedAges(b.prompt);
  const allowed = new Set(ctx.cast.map((c) => c.age));
  const other = ages.find((a) => a !== card?.age && !allowed.has(a));
  if (other !== undefined && card !== undefined) return { path: "prompt", message: `"aged ${other}" is not her card's age, ${card.age}` };
  if (other !== undefined) return { path: "prompt", message: `"aged ${other}" is no cast member's age (${[...allowed].join(", ")})` };
  if (card !== undefined && !ages.includes(card.age)) return { path: "prompt", message: `states no age; a character prompt says "aged ${card.age}", her card's age` };
  return null;
}
