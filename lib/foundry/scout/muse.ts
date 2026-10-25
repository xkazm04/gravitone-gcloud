// THE MUSE WING'S OWN WORDS (spark scout-muse): what a character card is, what the eye answers about a
// still, and the line a still must clear before the operator ever sees it. Pure and client-safe.
//
// The line is not a taste. Every woman this wing draws is a fictional ADULT, stated in the prompt and
// read as one by the eye; nothing is nude and nothing is a sexual act; nobody is a real person or a
// lookalike. A still that does not clear it is deleted before the Board, and the candidate fails with
// the field that failed (`judge: adult unsure`), so a pattern of near-misses shows in the night's record.

/** The youngest age a prompt may state. Anime and stylised looks drift young; the floor sits well above 18. */
export const MUSE_MIN_AGE = 25;
/** The oldest age a card or prompt may state - the operator, 2026-10-24: conventionally attractive, never over 50. */
export const MUSE_MAX_AGE = 50;
/** The youngest age the eye may READ before a still is thrown, whatever the prompt said. */
export const MUSE_MIN_APPARENT_AGE = 21;

/** Idea artboards a muse night draws by default, and the most one night may open with (the first launch: 50). */
export const MUSE_DEFAULT_IDEA_CAP = 25;
export const MUSE_MAX_IDEA_CAP = 50;
/** A muse night spends Gemini only when the local eye is down and the judge falls back; it is not a $15 night. */
export const MUSE_DEFAULT_CEILING_USD = 2;

export const CARD_NAME_MAX = 40;
export const CARD_LOOK_MAX = 400;
export const CARD_PERSONALITY_MAX = 200;

/**
 * A fictional woman, in words: the studio takes no reference image (leonardoStudio.ts supportsReferences),
 * so the card IS her identity, restated in every prompt that draws her. `look` holds what must not drift -
 * face, hair, build, skin, a signature garment or accessory; `personality` is the one line a roleplay
 * scene plays her by.
 */
export type CharacterCard = {
  readonly name: string;
  readonly age: number;
  /** IDENTITY only - what never varies: face, hair, build, skin, one signature garment (restated verbatim when cast). */
  readonly look: string;
  /** STATE - the line a scene plays her by; never restated as identity. */
  readonly personality: string;
  /** spark scout-vision S3 - absent on a muse card (read as an original adult). */
  readonly kind?: CardKind;
  /** A parody's original, named in words (`the plumber hero of a 1980s platform game`, or its title): parody only. */
  readonly origin?: string;
  /** How the character is drawn; an under-18 character must be `stylised`. */
  readonly render?: CardRender;
  /** Who the character is for - its seed's audience. Absent on a muse card: adult. */
  readonly audience?: "kids" | "family" | "adult";
};

/** An invented character, or a popular fictional one restyled for parody / what-if (spark scout-vision S3). */
export const CARD_KINDS = ["original", "parody"] as const;
export type CardKind = (typeof CARD_KINDS)[number];
export const CARD_RENDERS = ["photoreal", "stylised"] as const;
export type CardRender = (typeof CARD_RENDERS)[number];

export const JUDGE_ADULT = ["yes", "no", "unsure"] as const;
export const JUDGE_CLOTHING = ["covered", "revealing", "nude"] as const;
export const JUDGE_LIKENESS = ["no", "maybe"] as const;
export const JUDGE_HANDS = ["ok", "bad", "none"] as const;

/** What the eye reads off one still (lib/foundry/scout/judge.ts). */
export type MuseJudge = {
  readonly adult: (typeof JUDGE_ADULT)[number];
  /** The age the eye reads, a whole number of years; null when it would not say. */
  readonly apparentAge: number | null;
  readonly clothing: (typeof JUDGE_CLOTHING)[number];
  /** Does the face read as a specific real, recognisable person. */
  readonly realPerson: (typeof JUDGE_LIKENESS)[number];
  readonly hands: (typeof JUDGE_HANDS)[number];
  /** The eye's one line on the look it sees (render mode, light, finish). */
  readonly notes: string;
};

/** The first field that fails the line, or null when the still clears it. `hands` is a taste, never a gate. */
export function judgeFailure(j: MuseJudge): string | null {
  if (j.adult !== "yes") return `adult ${j.adult}`;
  if (j.apparentAge === null) return "apparent age unread";
  if (j.apparentAge < MUSE_MIN_APPARENT_AGE) return `apparent age ${j.apparentAge}`;
  if (j.clothing === "nude") return "clothing nude";
  if (j.realPerson !== "no") return `real person ${j.realPerson}`;
  return null;
}
