// SAY IT LIKE A PERSON - a sentence compiled into a seed, deterministically, with its working
// shown. Pure: the composer draws it, the kit specimens it, the tests hold it to 20 sentences.
//
// Before this, a sentence reached Suno one of two invisible ways: pasted raw into the style line
// (the DRY stand-in, lib/sound/suno/draft.ts `sentenceStand`) or handed to an LLM turn nobody
// read (lib/sound/suno/propose.ts). Either way a person could not predict the result or learn
// from it. Here every word of the seed carries the words of the sentence that produced it
// (`from`, token indices), and every word that produced nothing is returned as `unheard` - a
// translation that hid what it ignored would teach the wrong lesson about what was asked.
//
// Matching is greedy, longest cue first, over accent-stripped lower-case tokens; plain suffixes
// are tried off when the word as typed matches nothing ("rainy nights" -> night, "stealing" -> steal). A negator before a cue ("no drums", "without vocals")
// fences the cue's own words and drops every instrument that carries them ("brushed drums"). Tempo is the mean of
// the matched rows' ranges, unless the sentence says a number with "bpm".
import { ATLAS } from "./atlas.ts";
import { BLANK_SEED, type Seed } from "./recipe.ts";
import { FILLER, NEGATORS, ROWS, type LexRow } from "./lexicon.rows.ts";

export type TokenKind = "cue" | "filler" | "unheard" | "negator";

export type Token = {
  readonly text: string;
  /** Character offsets into the sentence as typed. */
  readonly start: number;
  readonly end: number;
  readonly kind: TokenKind;
};

export type TermList = "genres" | "moods" | "instruments" | "avoid";

export type Produced = {
  readonly list: TermList;
  readonly term: string;
  /** Indices into `tokens`: the words that produced this term. */
  readonly from: readonly number[];
};

export type Translation = {
  readonly sentence: string;
  readonly tokens: readonly Token[];
  /** What went into the seed, in sentence order. */
  readonly terms: readonly Produced[];
  /** What a cue produced past a list's cap: offered, not sent. */
  readonly spare: readonly Produced[];
  readonly bpm: { readonly value: number; readonly from: readonly number[] } | null;
  /** A length the sentence said ("90 seconds", "a 2-minute"), in seconds. */
  readonly lengthS: { readonly value: number; readonly from: readonly number[] } | null;
  /** The mode the seed's moods lean to ("sad" -> A minor), with the words behind those moods; null when they do not lean. */
  readonly key: { readonly value: string; readonly from: readonly number[] } | null;
  readonly unheard: readonly string[];
  /** Unheard words one slip from a word the lexicon hears ("melancolic" -> melancholic): offered, never applied. */
  readonly near: readonly { readonly token: number; readonly to: string }[];
  readonly seed: Seed;
};

/** How many words of each list a sentence may put in the seed; the rest are `spare`. */
export const CAPS: Readonly<Record<TermList, number>> = { genres: 2, moods: 3, instruments: 4, avoid: 6 };

const fold = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[‘’]/g, "'").toLowerCase();

type Cue = { readonly words: readonly string[]; readonly row: LexRow; readonly atlas?: true; readonly own?: true };

/** Every cue as its token list, longest first: "rainy cafe" is tried before "rain". */
// Every instrument the atlas can play is a word the lexicon hears as itself ("slap bass" -> slap
// bass): a term learned by ear and then typed must compile back to the sound it was chosen as. The
// written rows come first, so where both name a word the row's reading stands - and where an
// instrument's name holds a word with a reading of its own ("JAZZ guitar", "ROCK drums"), that
// word's genre, mood and tempo are kept beside the instrument.
const ATLAS_ROWS: readonly LexRow[] = ATLAS.map((e) => ({ cue: [e.term, ...e.aka].map((c) => c.toLowerCase()), i: [e.term] }));
// The same holds for every genre and mood a row can emit: "bossa nova" typed is bossa nova, not
// two unheard words. These are tried only where no written or atlas cue matches, and only as typed
// (no suffixes off: "lights" is not the mood light): a written row's reading always stands. The
// words inside such a name keep their own rows' readings ("solo PIANO" still plays a piano).
const SAID = new Set(ROWS.flatMap((r) => r.cue));
const SKIP = new Set([...FILLER, ...NEGATORS]);
const ownable = (t: string): boolean => !SAID.has(t) && !SKIP.has(t);
const OWN_ROWS: readonly LexRow[] = [
  ...[...new Set(ROWS.flatMap((r) => r.g ?? []))].filter(ownable).map((t): LexRow => ({ cue: [t], g: [t] })),
  ...[...new Set(ROWS.flatMap((r) => r.m ?? []))].filter(ownable).map((t): LexRow => ({ cue: [t], m: [t] })),
];
const byLength = (a: Cue, b: Cue): number => b.words.length - a.words.length;
const CUES: readonly Cue[] = [
  ...ROWS.flatMap((row) => row.cue.map((c): Cue => ({ words: c.split(" "), row }))),
  ...ATLAS_ROWS.flatMap((row) => row.cue.map((c): Cue => ({ words: c.split(" "), row, atlas: true }))),
].sort(byLength);
const OWN_CUES: readonly Cue[] = OWN_ROWS.flatMap((row) => row.cue.map((c): Cue => ({ words: c.split(" "), row, own: true }))).sort(byLength);
/** A single word's own written row ("jazz" -> the jazz row), for the words inside an instrument's name. */
const WORD_ROW = new Map<string, LexRow>();
for (const r of ROWS) for (const c of r.cue) if (!c.includes(" ") && !WORD_ROW.has(c)) WORD_ROW.set(c, r);
const MAX_CUE = Math.max(CUES[0]?.words.length ?? 1, OWN_CUES[0]?.words.length ?? 1);
const headed = (cues: readonly Cue[]): Map<string, Cue[]> => {
  const m = new Map<string, Cue[]>();
  for (const c of cues) m.set(c.words[0] ?? "", [...(m.get(c.words[0] ?? "") ?? []), c]);
  return m;
};
const BY_HEAD = headed(CUES);
const OWN_BY_HEAD = headed(OWN_CUES);
const FILL = new Set(FILLER);
const NEG = new Set(NEGATORS);

/** The sentence's words, folded, with their offsets INTO THE SENTENCE AS TYPED: letters (any script,
 *  with their marks), digits, hyphens and apostrophes. Folding happens per word, after the offsets
 *  are taken, because folding can change a string's length (NFD Hangul, a decomposed accent). */
export function tokenize(sentence: string): { readonly text: string; readonly start: number; readonly end: number }[] {
  const out: { text: string; start: number; end: number }[] = [];
  for (const m of sentence.matchAll(/[\p{L}\p{M}\p{N}&]+(?:['’‘-][\p{L}\p{M}\p{N}]+)*/gu)) out.push({ text: fold(m[0]), start: m.index, end: m.index + m[0].length });
  return out;
}

/** The word as typed first, then plain suffixes off: rainy nights -> night, remembering -> remember, sneaked -> sneak. */
function variants(w: string): string[] {
  if (w.endsWith("'s")) return [w, ...variants(w.slice(0, -2))];
  const v = [w];
  if (w.length > 3 && w.endsWith("s")) v.push(w.slice(0, -1));
  if (w.length > 5 && w.endsWith("ing")) v.push(w.slice(0, -3), `${w.slice(0, -3)}e`);
  if (w.length > 4 && w.endsWith("ed")) v.push(w.slice(0, -2), w.slice(0, -1));
  if (w.length > 4 && w.endsWith("ly")) v.push(w.slice(0, -2));
  return v;
}

/** The longest cue starting at word i; a written or atlas cue wins a tie with a derived one. */
function cueAt(words: readonly string[], i: number): Cue | null {
  const own = (OWN_BY_HEAD.get(words[i] ?? "") ?? []).find((c) => c.words.every((w, k) => words[i + k] === w)) ?? null;
  for (const head of variants(words[i] ?? "")) {
    for (const c of BY_HEAD.get(head) ?? []) {
      if (c.words.length > MAX_CUE) continue;
      const ok = c.words.every((w, k) => k === 0 || variants(words[i + k] ?? "").includes(w));
      if (ok) return own !== null && own.words.length > c.words.length ? own : c;
    }
  }
  return own;
}

/** The sentence, compiled: tokens with their kind, the seed's words with their provenance, the unheard. */
export function translate(sentence: string): Translation {
  const raw = tokenize(sentence);
  const words = raw.map((t) => t.text);
  const kinds: TokenKind[] = raw.map((t) => (FILL.has(t.text) ? "filler" : NEG.has(t.text) ? "negator" : "unheard"));
  const produced: Produced[] = [];
  const ranges: { lo: number; hi: number; from: number[] }[] = [];
  let explicit: { value: number; from: number[] } | null = null;
  let lengthS: { value: number; from: number[] } | null = null;
  let explicitKey: { value: string; from: number[] } | null = null;
  let negate = -1;
  for (let i = 0; i < words.length; ) {
    const w = words[i] ?? "";
    if (/^\d{2,3}$/.test(w) && Number(w) >= 40 && Number(w) <= 220 && (words[i + 1] === "bpm" || (words[i + 1] === "beats" && words[i + 2] === "per"))) {
      explicit = { value: Number(w), from: [i, i + 1] };
      kinds[i] = "cue";
      kinds[i + 1] = "cue";
      i += 2;
      continue;
    }
    const unit = (u: string | undefined): number => (u === undefined ? 0 : /^(seconds?|secs?|s)$/.test(u) ? 1 : /^(minutes?|mins?)$/.test(u) ? 60 : 0);
    const joined = /^(\d{1,3})-(seconds?|secs?|minutes?|mins?)$/.exec(w);
    if (joined !== null && unit(joined[2]) > 0) {
      lengthS = { value: Number(joined[1]) * unit(joined[2]), from: [i] };
      kinds[i] = "cue";
      i++;
      continue;
    }
    if (/^\d{1,3}$/.test(w) && unit(words[i + 1]) > 0) {
      lengthS = { value: Number(w) * unit(words[i + 1]), from: [i, i + 1] };
      kinds[i] = "cue";
      kinds[i + 1] = "cue";
      i += 2;
      continue;
    }
    const said = keySaid(words, i);
    if (said !== null) {
      explicitKey = { value: said.value, from: Array.from({ length: said.n }, (_, k) => i + k) };
      for (const k of explicitKey.from) kinds[k] = "cue";
      i += said.n;
      continue;
    }
    if (kinds[i] === "negator") {
      negate = i;
      i++;
      continue;
    }
    const c = cueAt(words, i);
    if (c === null) {
      if (kinds[i] !== "filler") negate = -1;
      i++;
      continue;
    }
    const from = c.words.map((_, k) => i + k);
    for (const k of from) kinds[k] = "cue";
    if (negate >= 0) {
      // The fence is the person's own word ("no drums" fences "drums"), not the row's instrument:
      // "live drums" fenced would leave the café's "brushed drums" standing beside it.
      produced.push({ list: "avoid", term: c.words.join(" "), from: [negate, ...from] });
      kinds[negate] = "cue";
    } else {
      for (const t of c.row.g ?? []) produced.push({ list: "genres", term: t, from });
      for (const t of c.row.m ?? []) produced.push({ list: "moods", term: t, from });
      for (const t of c.row.i ?? []) produced.push({ list: "instruments", term: t, from });
      if (c.row.bpm !== undefined) ranges.push({ lo: c.row.bpm[0], hi: c.row.bpm[1], from });
      if (c.atlas === true || c.own === true)
        for (const k of c.atlas === true ? from.slice(0, -1) : from.length > 1 ? from : []) {
          const own = WORD_ROW.get(words[k] ?? "");
          if (own === undefined || (own.g === undefined && own.m === undefined && (c.atlas === true || own.i === undefined))) continue;
          for (const t of own.g ?? []) produced.push({ list: "genres", term: t, from: [k] });
          for (const t of own.m ?? []) produced.push({ list: "moods", term: t, from: [k] });
          if (c.own === true) for (const t of own.i ?? []) produced.push({ list: "instruments", term: t, from: [k] });
          if (own.bpm !== undefined) ranges.push({ lo: own.bpm[0], hi: own.bpm[1], from: [k] });
        }
    }
    negate = -1;
    i += c.words.length;
  }
  // A term two cues produced is one term with both cues' words; a fence beats an instrument.
  const merged: Produced[] = [];
  for (const p of produced) {
    const at = merged.findIndex((q) => q.list === p.list && q.term === p.term);
    if (at < 0) merged.push(p);
    else {
      const q = merged[at];
      if (q !== undefined) merged[at] = { ...q, from: [...new Set([...q.from, ...p.from])] };
    }
  }
  const fences = merged.filter((p) => p.list === "avoid").map((p) => p.term);
  const fenced = (term: string): boolean => fences.some((f) => ` ${term} `.includes(` ${f} `) || ` ${term} `.includes(` ${f.replace(/s$/, "")} `));
  const terms: Produced[] = [];
  const spare: Produced[] = [];
  const count: Record<TermList, number> = { genres: 0, moods: 0, instruments: 0, avoid: 0 };
  for (const p of merged) {
    if (p.list === "instruments" && fenced(p.term)) continue;
    if (count[p.list] < CAPS[p.list]) {
      count[p.list]++;
      terms.push(p);
    } else spare.push(p);
  }
  const bpm = explicit ?? tempoOf(ranges);
  const tokens: Token[] = raw.map((t, k) => ({ text: sentence.slice(t.start, t.end), start: t.start, end: t.end, kind: kinds[k] === "negator" ? "filler" : (kinds[k] ?? "unheard") }));
  const unheard = tokens.filter((t) => t.kind === "unheard").map((t) => t.text);
  const near = tokens.flatMap((t, k) => {
    const to = t.kind === "unheard" ? spelledAs(fold(t.text)) : null;
    return to === null ? [] : [{ token: k, to }];
  });
  const pick = (list: TermList): string[] => terms.filter((p) => p.list === list).map((p) => p.term);
  const key = explicitKey ?? keyOf(terms);
  const seed: Seed = { ...BLANK_SEED, genres: pick("genres"), moods: pick("moods"), instruments: pick("instruments"), avoid: pick("avoid"), bpm: bpm?.value ?? null, key: key?.value ?? null };
  return { sentence, tokens, terms, spare, bpm, lengthS, key, unheard, near, seed };
}

// A slip of the keyboard is not a word nobody taught the lexicon. One edit away (two for long
// words) from a single-word cue is offered as that cue; short words are left alone, because
// "five" is one letter from "fire" and a real word wrongly corrected teaches the wrong spelling.
const WORDS: readonly string[] = [...new Set(CUES.filter((c) => c.words.length === 1).map((c) => c.words[0] ?? ""))].filter((w) => w.length >= 4);

function spelledAs(w: string): string | null {
  if (w.length < 5 || /\d/.test(w)) return null;
  // Under eight letters only a letter dropped, doubled or swapped counts: a letter CHANGED in a
  // short word is as often another real word (short / shore, story / storm, noise / noisy).
  const most = w.length >= 8 ? 2 : 1;
  const sub = w.length >= 8 ? 1 : 2;
  let best: string | null = null;
  let bestD = most + 1;
  for (const c of WORDS) {
    if (Math.abs(c.length - w.length) > most) continue;
    const d = slips(w, c, most, sub);
    if (d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

/** Edits between two words (insert, delete, swap a letter, swap two neighbours), stopping past `most`. */
function slips(a: string, b: string, most: number, sub = 1): number {
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : sub;
      let v = Math.min((prev[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, (prev2[j - 2] ?? 0) + 1);
      row.push(v);
    }
    if (Math.min(...row) > most) return most + 1;
    prev2 = prev;
    prev = row;
  }
  return prev[b.length] ?? most + 1;
}

// Which way a mood leans. A person who says "sad" means minor without knowing the word, and an
// audition of a sad seed played in C major would answer a question nobody asked. The two keys
// share their notes (A minor is C major's relative), so the phrase changes mode, not register.
const MINOR = new Set(["sad", "melancholic", "dark", "eerie", "ominous", "tense", "suspenseful", "brooding", "lonely", "mysterious", "heartbroken", "moody", "cold", "haunting", "menacing", "somber", "sombre", "grim", "anxious", "nocturnal", "wistful", "mournful", "sinister", "uneasy", "smoky", "noir"]);
const MAJOR = new Set(["happy", "bright", "hopeful", "uplifting", "triumphant", "playful", "cheerful", "optimistic", "bouncy", "heroic", "friendly", "positive", "joyful", "sunny", "carefree", "festive", "victorious", "celebratory", "proud", "whimsical", "silly", "jubilant", "light"]);
export const MINOR_KEY = "A minor";
export const MAJOR_KEY = "C major";

/** A key the sentence says - "E major", "b flat minor", "Eb major", "in minor", "a minor key" -
 *  which the moods' lean never overrides; null when the words at i do not name one. */
function keySaid(words: readonly string[], i: number): { value: string; n: number } | null {
  const w = words[i] ?? "";
  const letter = /^([a-g])(b)?$/.exec(w);
  if (letter !== null) {
    let j = i + 1;
    let acc = letter[2] ?? "";
    if (acc === "" && (words[j] === "flat" || words[j] === "sharp")) acc = words[j++] === "flat" ? "b" : "#";
    const mode = words[j];
    if (mode === "major" || mode === "minor") return { value: `${(letter[1] ?? "c").toUpperCase()}${acc} ${mode}`, n: j - i + 1 + (words[j + 1] === "key" ? 1 : 0) };
  }
  if ((w === "minor" || w === "major") && (words[i + 1] === "key" || words[i - 1] === "in")) return { value: w === "minor" ? MINOR_KEY : MAJOR_KEY, n: words[i + 1] === "key" ? 2 : 1 };
  return null;
}

/** The seed's moods counted by lean; a tie or no lean names no key. */
function keyOf(terms: readonly Produced[]): { value: string; from: number[] } | null {
  const moods = terms.filter((p) => p.list === "moods");
  const minor = moods.filter((p) => MINOR.has(p.term));
  const major = moods.filter((p) => MAJOR.has(p.term));
  if (minor.length === major.length) return null;
  const won = minor.length > major.length ? minor : major;
  return { value: won === minor ? MINOR_KEY : MAJOR_KEY, from: [...new Set(won.flatMap((p) => p.from))] };
}

/** The tempo the matched rows agree on: the mean of their ranges' middles, rounded. */
function tempoOf(ranges: readonly { lo: number; hi: number; from: number[] }[]): { value: number; from: number[] } | null {
  if (ranges.length === 0) return null;
  const mid = ranges.reduce((a, r) => a + (r.lo + r.hi) / 2, 0) / ranges.length;
  return { value: Math.round(mid), from: [...new Set(ranges.flatMap((r) => r.from))] };
}

/** The tokens that produced one seed word, for the provenance underline; [] when the sentence did not. */
export function provenanceOf(t: Translation | null, list: TermList, term: string): readonly number[] {
  if (t === null) return [];
  const w = term.trim().toLowerCase();
  return [...t.terms, ...t.spare].find((p) => p.list === list && p.term.toLowerCase() === w)?.from ?? [];
}
