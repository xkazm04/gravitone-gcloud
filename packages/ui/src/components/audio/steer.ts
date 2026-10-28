// STEER BY EAR, HEADLESS - a sentence compiled into everything the composer shows, as one value:
// the words heard (with the sentence words behind each), the words unheard, the seed, Suno's form
// fields (section tags in the lyrics when the piece has a shape), the sections and the ElevenLabs
// plan. Pure: the agent door (app/_server/mcp/tools/steer.ts) and the CLI (pipeline/steer.mts)
// return it; the screen draws the same parts from the same functions.
import { atlasFor } from "./atlas.ts";
import { translate, type Translation } from "./lexicon.ts";
import { sunoFieldsOf, type Seed, type SunoFieldsDraft } from "./recipe.ts";
import { columnsFor, planSeconds, presetForWords, PRESETS, sectionsOf, sectionsToPlan, sunoLyricsOf, type Level, type PlanDraft, type Section } from "./shape.ts";

export type SteerAsk = {
  readonly sentence: string;
  /** A preset id (`arc`, `rise`, `bed`, `sting`, `two-peaks`); else the sentence's words pick, or none. */
  readonly shape?: string;
  /** Seconds; else the sentence's ("90 seconds"), else 90 when a shape is asked for. */
  readonly lengthS?: number;
};

export type SteerBrief = {
  readonly heard: readonly { readonly list: string; readonly term: string; readonly from: readonly string[] }[];
  readonly unheard: readonly string[];
  /** Unheard words one slip from a word the lexicon hears: offered, not applied. */
  readonly near: readonly { readonly word: string; readonly to: string }[];
  /** The key the moods lean to, with the sentence words behind it; null when they do not lean. */
  readonly key: { readonly value: string; readonly from: readonly string[] } | null;
  readonly seed: Seed;
  /** null when the sentence produced no style word: a seed with no words is not a prompt. */
  readonly suno: SunoFieldsDraft | null;
  readonly levels: readonly Level[] | null;
  readonly sections: readonly Section[];
  readonly plan: PlanDraft | null;
  readonly planSeconds: number;
  /** The seed's instruments with their atlas id where one exists (an id is what an audition plays). */
  readonly instruments: readonly { readonly term: string; readonly atlas: string | null }[];
};

const DEFAULT_LENGTH_S = 90;
const DEFAULT_BPM = 90;

export function steerBrief(ask: SteerAsk): SteerBrief {
  const t: Translation = translate(ask.sentence);
  const bpm = t.seed.bpm ?? DEFAULT_BPM;
  const named = ask.shape === undefined ? undefined : PRESETS.find((p) => p.id === ask.shape);
  const said = presetForWords(t.tokens.filter((x) => x.kind === "cue").map((x) => x.text.toLowerCase()));
  const lengthS = ask.lengthS ?? t.lengthS?.value;
  const preset = named ?? said ?? (lengthS === undefined ? undefined : PRESETS[0]);
  const levels = preset === undefined ? null : preset.levels(columnsFor(lengthS ?? DEFAULT_LENGTH_S, bpm));
  const sections = levels === null ? [] : sectionsOf(levels, bpm);
  const base = sunoFieldsOf(t.seed, {});
  const suno = base === null ? null : levels === null ? base : { ...base, lyrics: sunoLyricsOf(sections) };
  const plan = levels === null ? null : sectionsToPlan(t.seed, sections);
  return {
    heard: t.terms.map((p) => ({ list: p.list, term: p.term, from: p.from.map((i) => t.tokens[i]?.text ?? "") })),
    unheard: t.unheard,
    near: t.near.map((n) => ({ word: t.tokens[n.token]?.text ?? "", to: n.to })),
    key: t.key === null ? null : { value: t.key.value, from: t.key.from.map((i) => t.tokens[i]?.text ?? "") },
    seed: t.seed,
    suno,
    levels,
    sections,
    plan,
    planSeconds: plan === null ? 0 : planSeconds(plan),
    instruments: t.seed.instruments.map((term) => ({ term, atlas: atlasFor(term)?.id ?? null })),
  };
}
