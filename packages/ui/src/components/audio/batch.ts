// THE OPERATOR BATCH - N identical briefs, so the takes differ only by the provider's own
// variance, which is what a judge is then measuring. Pure (Phase 6, L66).
//
// Absorbed from v1 app/playground/triage/model.ts (BatchForm, blankBatch, DURATION,
// composeSfxPrompt, batchProblem, batchRequests; dark since Phase 3 with the rest of triage):
//   · an effect is briefed ENVELOPE-FIRST - the event, then what it is made of, then where it
//     sits - the shape the registry's sound-effect-generation technique puts first; free text
//     after it is kept verbatim, and a loop says so in the prompt as well as in the flag;
//   · bounds per kind (effects 0.5-30 s, music 10-300 s), 1-6 takes, prompt influence 0-1 or
//     the vendor's default - refused with the field's own words before anything is priced;
//   · the technique tags are the kind's own vocabulary: an unknown tag is dropped, never sent.
// Upgraded: the brief is ONE value (`batchBrief`) the server holds to the same check before it
// prices a receipt (lib/sound/batch.ts), and the count is not part of it - the receipt prices
// N lines of the one brief, so "N identical" is true by construction rather than by copying.

export type BatchKind = "music" | "sfx";

export type BatchForm = {
  readonly prompt: string;
  readonly negative: string;
  readonly technique: readonly string[];
  readonly genre: string;
  readonly mood: string;
  readonly instrument: string;
  /** sfx: envelope-first fields. */
  readonly event: string;
  readonly material: string;
  readonly space: string;
  readonly sfxCategory: string;
  readonly loop: boolean;
  /** sfx: the vendor's prompt_influence, 0..1; null = the vendor's default. */
  readonly promptInfluence: number | null;
  readonly durationS: number;
  readonly count: number;
  readonly tempoBpm: number | null;
  readonly key: string | null;
};

/** v1 lib/sound/types.ts TECHNIQUES, per kind: the axis lessons are learned along. */
export const TECHNIQUES: { readonly [K in BatchKind]: readonly string[] } = {
  music: ["single-sentence", "tag-list", "section-plan-as-the-brief", "sonic-style-vocabulary", "negative-styles", "duration-and-tempo-locking", "reference-track-anchoring", "lyrics-for-singability"],
  sfx: ["single-sentence", "envelope-first-briefing", "layered-element-assembly", "loop-seam-acceptance", "picture-as-timing-brief"],
};

export const blankBatch = (kind: BatchKind): BatchForm => ({
  prompt: "",
  negative: "",
  technique: kind === "sfx" ? ["envelope-first-briefing"] : [],
  genre: "",
  mood: "",
  instrument: "",
  event: "",
  material: "",
  space: "",
  sfxCategory: "",
  loop: false,
  promptInfluence: null,
  durationS: kind === "sfx" ? 3 : 30,
  count: kind === "sfx" ? 3 : 2,
  tempoBpm: null,
  key: null,
});

/** The lengths a provider accepts per kind: effects 0.5-30 s, music 10-300 s (v1 DURATION). */
export const DURATION: { readonly [K in BatchKind]: { readonly min: number; readonly max: number; readonly step: number } } = {
  music: { min: 10, max: 300, step: 5 },
  sfx: { min: 0.5, max: 30, step: 0.5 },
};

export const COUNT = { min: 1, max: 6 } as const;

const list = (s: string): string[] =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x !== "");

/** The event, then the material, then the space; free text after it; a loop said in words. */
export function composeSfxPrompt(f: Pick<BatchForm, "event" | "material" | "space" | "prompt" | "loop">): string {
  const head = [f.event, f.material, f.space]
    .map((x) => x.trim())
    .filter((x) => x !== "")
    .join(", ");
  return [head, f.prompt.trim(), f.loop ? "seamless loop" : ""].filter((x) => x !== "").join(". ");
}

export const batchPrompt = (kind: BatchKind, f: BatchForm): string => (kind === "sfx" ? composeSfxPrompt(f) : f.prompt.trim());

/** What the form cannot send, in its own words, or null. */
export function batchProblem(kind: BatchKind, f: BatchForm): string | null {
  if (batchPrompt(kind, f) === "") return kind === "sfx" ? "no event" : "no prompt";
  const d = DURATION[kind];
  if (!(f.durationS >= d.min && f.durationS <= d.max)) return `length ${d.min}–${d.max}s`;
  if (!(Number.isInteger(f.count) && f.count >= COUNT.min && f.count <= COUNT.max)) return `${COUNT.min}–${COUNT.max} takes`;
  if (kind === "sfx" && f.promptInfluence !== null && !(f.promptInfluence >= 0 && f.promptInfluence <= 1)) return "influence 0–1";
  if (kind === "music" && f.tempoBpm !== null && !(f.tempoBpm >= 40 && f.tempoBpm <= 220)) return "tempo 40–220";
  return null;
}

/** One brief, the same for every take of the batch. */
export type BatchBrief = {
  readonly kind: BatchKind;
  readonly prompt: string;
  readonly negative: string | null;
  readonly durationS: number;
  /** sfx only; null for music. */
  readonly loop: boolean | null;
  readonly promptInfluence: number | null;
  readonly technique: readonly string[];
  readonly terms: { readonly genre: readonly string[]; readonly mood: readonly string[]; readonly instrument: readonly string[]; readonly sfxCategory: string | null };
  readonly tempoBpm: number | null;
  readonly key: string | null;
};

export function batchBrief(kind: BatchKind, f: BatchForm): BatchBrief {
  const neg = f.negative.trim();
  const key = f.key?.trim() ?? "";
  return {
    kind,
    prompt: batchPrompt(kind, f),
    negative: neg === "" ? null : neg,
    durationS: f.durationS,
    loop: kind === "sfx" ? f.loop : null,
    promptInfluence: kind === "sfx" ? f.promptInfluence : null,
    technique: f.technique.filter((t) => TECHNIQUES[kind].includes(t)),
    terms: {
      genre: kind === "music" ? list(f.genre) : [],
      mood: list(f.mood),
      instrument: kind === "music" ? list(f.instrument) : [],
      sfxCategory: kind === "sfx" && f.sfxCategory.trim() !== "" ? f.sfxCategory.trim() : null,
    },
    tempoBpm: kind === "music" ? f.tempoBpm : null,
    key: kind === "music" && key !== "" ? key : null,
  };
}

/** The seconds a price line prints: tenths under ten seconds (a 1.5 s effect is not "2s"),
 *  whole seconds above (v1 shared/price.tsx `priceSeconds`). */
export const priceSeconds = (seconds: number): number => (seconds < 10 ? Math.round(seconds * 10) / 10 : Math.round(seconds));

/** Seconds of audio the batch asks a provider for: the meter ElevenLabs bills by. */
export const batchSeconds = (f: Pick<BatchForm, "durationS" | "count">): number => priceSeconds(f.durationS * f.count);
