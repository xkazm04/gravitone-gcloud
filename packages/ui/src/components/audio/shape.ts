// DRAW THE SHAPE, GET THE STRUCTURE - an energy curve painted over four-bar columns compiled into
// named sections, and the two briefs that carry structure to a vendor. Pure.
//
// Structure is the biggest thing luck decides today: Suno chooses length and form, and the
// composer always sent "[Instrumental]". Two channels were already open: Suno's lyrics field
// takes section tags (the door accepts 6,000 characters), and ElevenLabs' music_v2 takes a typed
// plan of sections with durations (lib/music/types.ts MusicPlan). A person who cannot say "eight
// bars of intro, drop at 0:45" can still paint quiet-then-full; this file turns the painting into
// both, quantised to whole four-bar groups at the seed's tempo (lib/music/plan.ts barsFit: a
// hard ending is reachable only on a whole number of bars).
//
// UNVERIFIED, AND SAID SO: whether Suno honours section tags on an instrumental cannot be checked
// without spending. The ElevenLabs plan is the typed contract the predictability claim leans on.
import type { Seed } from "./recipe.ts";

/** quiet · steady · lifting · full - four words a person can paint without music vocabulary. */
export type Level = 0 | 1 | 2 | 3;
export const LEVEL_WORDS: readonly [string, string, string, string] = ["quiet", "steady", "lifting", "full"];
/** The styles each level adds to a section's brief (layered vocabulary, not adjectives about quality). */
const LEVEL_STYLES: readonly (readonly string[])[] = [["sparse", "soft dynamics"], ["steady groove", "mid energy"], ["rising intensity", "fuller arrangement"], ["full arrangement", "high energy"]];

export const GROUP_BARS = 4;
export const MIN_COLUMNS = 2;
export const MAX_COLUMNS = 32;
/** ElevenLabs' per-section bounds (lib/music/types.ts PlanSection.durationMs). */
export const PLAN_SECTION_MIN_S = 3;
export const PLAN_SECTION_MAX_S = 120;

export type SectionName = "Intro" | "Build" | "Peak" | "Break" | "Theme" | "Outro";

export type Section = {
  readonly name: SectionName;
  /** "Peak 2" when a name repeats. */
  readonly label: string;
  readonly level: Level;
  /** Column indices, end exclusive. */
  readonly from: number;
  readonly to: number;
  readonly bars: number;
  readonly startS: number;
  readonly endS: number;
};

/** Seconds of one four-bar group of 4/4 at `bpm`. */
export const groupSeconds = (bpm: number): number => (GROUP_BARS * 240) / bpm;

/** The columns a length asks for at a tempo: whole four-bar groups, at least two. */
export function columnsFor(lengthS: number, bpm: number): number {
  return Math.min(MAX_COLUMNS, Math.max(MIN_COLUMNS, Math.round(lengthS / groupSeconds(bpm))));
}

/** The seconds a length becomes once fitted to whole groups: "10 seconds" at 90 bpm is two groups, 21 s. */
export const fittedSeconds = (lengthS: number, bpm: number): number => columnsFor(lengthS, bpm) * groupSeconds(bpm);

const SUNO_TAG: Readonly<Record<SectionName, string>> = { Intro: "Intro", Build: "Build-Up", Peak: "Chorus", Break: "Break", Theme: "Verse", Outro: "Outro" };

/** Runs of one level, named by where they sit: first and quieter is an intro, the loudest a peak. */
export function sectionsOf(levels: readonly Level[], bpm: number): Section[] {
  const g = groupSeconds(bpm);
  const runs: { level: Level; from: number; to: number }[] = [];
  levels.forEach((l, i) => {
    const last = runs[runs.length - 1];
    if (last !== undefined && last.level === l) last.to = i + 1;
    else runs.push({ level: l, from: i, to: i + 1 });
  });
  const max = Math.max(...levels, 0);
  const seen = new Map<SectionName, number>();
  return runs.map((r, i) => {
    const prev = runs[i - 1]?.level;
    const next = runs[i + 1]?.level;
    let name: SectionName;
    if (runs.length > 1 && i === 0 && (next === undefined || r.level < next)) name = "Intro";
    else if (runs.length > 1 && i === runs.length - 1 && prev !== undefined && r.level < prev) name = "Outro";
    else if (r.level === max && max >= 2) name = "Peak";
    else if (prev !== undefined && r.level > prev) name = "Build";
    else if (prev !== undefined && r.level < prev) name = "Break";
    else name = "Theme";
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    return { name, label: n === 1 ? name : `${name} ${n}`, level: r.level, from: r.from, to: r.to, bars: (r.to - r.from) * GROUP_BARS, startS: r.from * g, endS: r.to * g };
  });
}

/** m:ss */
export const clock = (s: number): string => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** Suno's lyrics field for an instrumental with a structure: one tag per section, its level as words. */
export function sunoLyricsOf(sections: readonly Section[]): string {
  if (sections.length === 0) return "[Instrumental]";
  return ["[Instrumental]", ...sections.map((s) => `[${SUNO_TAG[s.name]}: ${LEVEL_WORDS[s.level]}, ${s.bars} bars]`), "[End]"].join("\n");
}

/** Which of the seed's instruments a level carries: the arrangement thickens with the energy. */
export function voicesAt(level: Level, instruments: readonly string[]): readonly string[] {
  if (instruments.length === 0) return [];
  const n = Math.max(1, Math.min(instruments.length, Math.ceil(((level + 1) / 4) * instruments.length)));
  return instruments.slice(0, n);
}

/** A plan section in lib/music/types.ts PlanSection's shape (the package cannot import lib/). */
export type PlanSectionDraft = { readonly name: string; readonly durationMs: number; readonly positiveStyles: readonly string[]; readonly negativeStyles: readonly string[] };
export type PlanDraft = { readonly positiveGlobalStyles: readonly string[]; readonly negativeGlobalStyles: readonly string[]; readonly sections: readonly PlanSectionDraft[] };

/** The ElevenLabs music_v2 plan: global styles from the seed, per section its level's styles and voices. */
export function sectionsToPlan(seed: Seed, sections: readonly Section[]): PlanDraft {
  const out: PlanSectionDraft[] = [];
  for (const s of sections) {
    const styles = [...(LEVEL_STYLES[s.level] ?? []), ...voicesAt(s.level, seed.instruments)];
    let left = s.endS - s.startS;
    let part = 1;
    const parts = Math.ceil(left / PLAN_SECTION_MAX_S);
    while (left > 0.001) {
      const take = Math.min(left, Math.max(PLAN_SECTION_MIN_S, (s.endS - s.startS) / parts));
      out.push({ name: parts > 1 ? `${s.label} (${part})` : s.label, durationMs: Math.round(take * 1000), positiveStyles: styles, negativeStyles: [] });
      left -= take;
      part++;
    }
  }
  const tempo = seed.bpm === null ? [] : [`${Math.round(seed.bpm)} bpm`];
  return { positiveGlobalStyles: [...seed.genres, ...seed.moods, ...tempo, ...(seed.key === null ? [] : [seed.key])], negativeGlobalStyles: [...seed.avoid], sections: out };
}

export const planSeconds = (p: PlanDraft): number => p.sections.reduce((a, s) => a + s.durationMs, 0) / 1000;

/** Shapes named by what they are for, as a level per column for `n` columns. */
export type Preset = { readonly id: string; readonly label: string; readonly levels: (n: number) => Level[] };

const ramp = (n: number, at: (f: number) => Level): Level[] => Array.from({ length: n }, (_, i) => at(n === 1 ? 0 : i / (n - 1)));

export const PRESETS: readonly Preset[] = [
  { id: "arc", label: "arc", levels: (n) => ramp(n, (f) => (f < 0.2 ? 0 : f < 0.4 ? 2 : f < 0.8 ? 3 : 0)) },
  { id: "rise", label: "trailer rise", levels: (n) => ramp(n, (f) => (f < 0.3 ? 0 : f < 0.6 ? 1 : f < 0.85 ? 2 : 3)) },
  { id: "bed", label: "loopable bed", levels: (n) => ramp(n, () => 1) },
  { id: "sting", label: "intro sting", levels: (n) => ramp(n, (f) => (f < 0.5 ? 3 : 1)) },
  { id: "two-peaks", label: "two peaks", levels: (n) => ramp(n, (f) => (f < 0.15 ? 0 : f < 0.4 ? 3 : f < 0.55 ? 1 : f < 0.85 ? 3 : 0)) },
];

/** The preset a sentence's words name, if any (`trailer` -> rise, `loop`/`background` -> bed). */
export function presetForWords(words: readonly string[]): Preset | undefined {
  const has = (...w: string[]): boolean => w.some((x) => words.includes(x));
  const id = has("trailer", "rise", "rising", "build", "building", "crescendo") ? "rise" : has("loop", "loopable", "background", "bed", "ambient", "study") ? "bed" : has("sting", "jingle", "intro") ? "sting" : null;
  return PRESETS.find((p) => p.id === id);
}

/**
 * A reference track's energy contour as painted levels: one RMS per four-bar group, read in dB
 * against the track's own loudest group - within 1.5 dB is full, 1.5-4.5 lifting, 4.5-9 steady,
 * past 9 quiet. Relative, so a quiet master and a loud one paint the same shape. The thresholds
 * are set so the composer's own sketch round-trips (painted 0123330 at 89 bpm, rendered, read
 * back: 0123330 - its quiet column sits 11 dB under its full one); on other music they are a
 * guess, kept here as the one place to change them.
 */
export function levelsOfContour(rms: readonly number[]): Level[] {
  const db = rms.map((r) => 20 * Math.log10(Math.max(r, 1e-9)));
  const top = Math.max(...db);
  return db.map((d) => {
    const below = top - d;
    return below <= 1.5 ? 3 : below <= 4.5 ? 2 : below <= 9 ? 1 : 0;
  });
}
