// THE RECIPE BOOK'S MODEL, rebuilt for the Audio lane's composer - pure, so the composer, the
// kit and the server door that turns a seed into a Suno proposal all read ONE copy.
//
// Absorbed from v1, file by file:
//   lib/sound/audio/prompts.ts   `Seed`, `compose` (the two vendors' dialects) - kept verbatim in
//                                behaviour; ElevenLabs reads a sentence, Suno a style line.
//   lib/sound/vocabulary.ts      `VocabEntry` / `Hand` - the term list is the ONE derivation
//                                (`deriveVocabulary`, which sums the ledger's insight cells) and
//                                arrives here as `Term`; nothing in the composer recounts a verdict
//                                (v1's Library counted them a second way, app/library/audio/
//                                vocabulary.ts, and a term read 7 kept in one place and 6 in the
//                                other).
//   app/library/audio/vocabulary.ts `sortTerms` - the Laplace-smoothed keep rate, so one kept of
//                                one does not outrank nine of ten.
// UPGRADED: v1's Suno "prompt" was text for a human to paste (`Style: …` plus section tags). The
// queue now takes FIELDS (lib/suno/types.ts SunoFields: style, exclude, lyrics, title), so
// `sunoFieldsOf` writes the form itself - the style line in the order the propose prompt asks for
// (genre, mood, instruments, tempo, key: pipeline/SUNO-PROPOSE-PROMPT.md), the avoid list as the
// exclude fence, and "[Instrumental]" unless told otherwise: the registry's sonic-style-vocabulary
// names the one-word failure of an underscore brief as forgetting "instrumental".

export type Target = "suno" | "elevenlabs";
export type Stance = "prefer" | "avoid";
export type TermFacet = "genre" | "mood" | "instrument" | "sfxCategory";
export type SeedList = "genres" | "moods" | "instruments";

/** The team's hand on one term (lib/sound/vocabulary.ts `Hand`). */
export type Hand = { readonly stance?: Stance | null; readonly phrase?: string };

/** One term with its evidence (lib/sound/vocabulary.ts `VocabEntry`, the fields the composer reads). */
export type Term = {
  /** `${facet}:${value}`, value trimmed and lower-cased - the key a hand is stored under. */
  readonly id: string;
  readonly term: string;
  readonly facet: TermFacet;
  /** Judged takes carrying it (the ledger holds no others). */
  readonly n: number;
  readonly kept: number;
  readonly rejected: number;
  readonly keepRate: number | null;
  readonly stance: Stance | null;
  readonly phrase: string;
  readonly topDefect: string | null;
};

export type Seed = {
  readonly genres: readonly string[];
  readonly moods: readonly string[];
  readonly instruments: readonly string[];
  readonly bpm: number | null;
  readonly key: string | null;
  readonly avoid: readonly string[];
};

export const BLANK_SEED: Seed = { genres: [], moods: [], instruments: [], bpm: null, key: null, avoid: [] };

/** Which term facet a seed list draws its words from. */
export const FACET_OF: Readonly<Record<SeedList, TermFacet>> = { genres: "genre", moods: "mood", instruments: "instrument" };
export const SEED_LISTS: readonly { readonly list: SeedList; readonly label: string }[] = [
  { list: "genres", label: "genre" },
  { list: "moods", label: "mood" },
  { list: "instruments", label: "instrument" },
];

/** Suno's form limits (lib/sound/suno/store.ts STYLE_MAX, TITLE_MAX, EXCLUDE_MAX). */
export const STYLE_MAX = 200;
export const TITLE_MAX = 80;
export const EXCLUDE_MAX = 200;
export const INSTRUMENTAL = "[Instrumental]";

/** The id a hand is keyed by (lib/sound/vocabulary.ts `termId`). */
export const termId = (facet: TermFacet, value: string): string => `${facet}:${value.trim().toLowerCase()}`;

const phraseOf = (hands: Readonly<Record<string, Hand>>, facet: TermFacet, term: string): string => {
  const p = hands[termId(facet, term)]?.phrase?.trim();
  return p === undefined || p === "" ? term : p;
};

/** The hands a term list carries, as the map `compose` reads. */
export function handsOf(terms: readonly Term[]): Record<string, Hand> {
  const out: Record<string, Hand> = {};
  for (const t of terms) if (t.stance !== null || t.phrase !== "") out[t.id] = { stance: t.stance, phrase: t.phrase };
  return out;
}

function tempoKey(seed: Seed): string[] {
  return [seed.bpm !== null && seed.bpm > 0 ? `${Math.round(seed.bpm)} BPM` : null, seed.key !== null && seed.key.trim() !== "" ? seed.key.trim() : null].filter((x): x is string => x !== null);
}

/** The two vendors' prompt dialects (v1 lib/sound/audio/prompts.ts `compose`, core.js#compose). */
export function compose(seed: Seed, target: Target, hands: Readonly<Record<string, Hand>>): string {
  const g = seed.genres.map((t) => phraseOf(hands, "genre", t));
  const mo = seed.moods.map((t) => phraseOf(hands, "mood", t));
  const ins = seed.instruments.map((t) => phraseOf(hands, "instrument", t));
  const tk = tempoKey(seed);
  if (target === "elevenlabs") {
    const head = [mo.join(", "), g.join(" / ")].filter(Boolean).join(" ");
    let s = `${head ? head.charAt(0).toUpperCase() + head.slice(1) : "Instrumental"} instrumental`;
    if (tk.length) s += `, ${tk.join(", ")}`;
    if (ins.length) s += `. Built on ${ins.slice(0, -1).join(", ")}${ins.length > 1 ? " and " : ""}${ins[ins.length - 1] ?? ""}.`;
    if (seed.avoid.length) s += ` No ${seed.avoid.join(", no ")}.`;
    return s;
  }
  const lines = [`Style: ${[...g, ...mo, ...ins, ...tk].join(", ")}`];
  if (seed.avoid.length) lines.push(`Exclude: ${seed.avoid.join(", ")}`);
  lines.push("", INSTRUMENTAL);
  return lines.join("\n");
}

/** A string cut to a form limit at a comma or a word, never mid-word when it can help it. */
export function fitTo(text: string, max: number): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const at = Math.max(cut.lastIndexOf(","), cut.lastIndexOf(" "));
  return (at > max / 2 ? cut.slice(0, at) : cut).replace(/[\s,]+$/, "");
}

export type SunoFieldsDraft = { readonly title?: string; readonly style: string; readonly lyrics: string; readonly exclude?: string };

/**
 * Suno's custom-create form from a seed: the style line genre → mood → instruments → tempo → key,
 * phrased through the team's hand, held to STYLE_MAX; the avoid list as `exclude`; instrumental.
 * An empty style is `null` - a seed with no words is not a prompt, and the door refuses it.
 */
export function sunoFieldsOf(seed: Seed, hands: Readonly<Record<string, Hand>>, title?: string): SunoFieldsDraft | null {
  const g = seed.genres.map((t) => phraseOf(hands, "genre", t));
  const mo = seed.moods.map((t) => phraseOf(hands, "mood", t));
  const ins = seed.instruments.map((t) => phraseOf(hands, "instrument", t));
  const tk = tempoKey(seed).map((x) => x.replace(/ BPM$/, " bpm"));
  const style = fitTo([...g, ...mo, ...ins, ...tk].join(", "), STYLE_MAX);
  if (style === "") return null;
  const exclude = fitTo(seed.avoid.join(", "), EXCLUDE_MAX);
  const name = title === undefined ? "" : fitTo(title, TITLE_MAX);
  return { ...(name === "" ? {} : { title: name }), style, lyrics: INSTRUMENTAL, ...(exclude === "" ? {} : { exclude }) };
}

/* ── terms ──────────────────────────────────────────────────────────────── */

export type TermSort = "rate" | "n" | "name";

/** v1 app/library/audio/vocabulary.ts `sortTerms`: a Laplace-smoothed keep rate. */
export function sortTerms(list: readonly Term[], k: TermSort): Term[] {
  return list
    .slice()
    .sort((a, b) =>
      k === "name" ? a.term.localeCompare(b.term) : k === "n" ? b.n - a.n || a.term.localeCompare(b.term) : (b.kept + 1) / (b.n + 2) - (a.kept + 1) / (a.n + 2) || b.n - a.n || a.term.localeCompare(b.term),
    );
}

/** The preferred terms of a facet not yet in the seed's list: v1's ★ floats. */
export const preferredFloats = (terms: readonly Term[], facet: TermFacet, have: readonly string[]): Term[] =>
  terms.filter((t) => t.facet === facet && t.stance === "prefer" && !have.includes(t.term));

/** The avoided terms not yet fenced: v1's ⊘ floats. */
export const avoidFloats = (terms: readonly Term[], have: readonly string[]): Term[] => terms.filter((t) => t.stance === "avoid" && !have.includes(t.term));

/** Add a word to a seed list, once. */
export function addTo(seed: Seed, list: SeedList | "avoid", word: string): Seed {
  const w = word.trim();
  if (w === "" || seed[list].includes(w)) return seed;
  return { ...seed, [list]: [...seed[list], w] };
}

export const removeFrom = (seed: Seed, list: SeedList | "avoid", word: string): Seed => ({ ...seed, [list]: seed[list].filter((x) => x !== word) });

/** A seed's words in one line, for a draft's caption and a receipt label. */
export const seedLine = (seed: Seed): string => [...seed.genres, ...seed.moods, ...seed.instruments, ...tempoKey(seed)].join(", ");
