// THE TASTE DUEL - a cold start by ear: pairs of sounds that differ on exactly ONE axis, the
// answers compiled into a seed with each word's reason. Pure.
//
// A question teaches something only when its pair differs on one axis, and a generator cannot
// hold that - so every pair here is rendered by the composer's own local engine (the audition
// phrase and the sketch, /audio/audition and /audio/sketch): the same notes, the same length, the
// same loudness, and one thing changed - the tempo, the mode, the instrument family, the
// material, the warmth, the beat, the density. The axis names are the vocabulary the person sees at the
// end ("slow over quick"), after they have already chosen by ear.

import { BLANK_SEED, type Seed } from "./recipe.ts";

/** What one side of a pair plays: instruments over levels (one digit per four bars), tempo, key. */
export type DuelSound = { readonly ids: readonly string[]; readonly levels: readonly number[]; readonly bpm: number; readonly key: string };

export type DuelPole = {
  /** The plain word for this side, shown after the choice. */
  readonly plain: string;
  readonly sound: DuelSound;
  readonly genres?: readonly string[];
  readonly moods?: readonly string[];
  readonly instruments?: readonly string[];
  readonly bpm?: number;
};

export type DuelAxis = { readonly id: string; readonly name: string; readonly a: DuelPole; readonly b: DuelPole };

export type Answer = "a" | "b" | "skip";

const BASE: DuelSound = { ids: ["grand-piano"], levels: [1], bpm: 90, key: "C major" };
const with_ = (over: Partial<DuelSound>): DuelSound => ({ ...BASE, ...over });

export const AXES: readonly DuelAxis[] = [
  { id: "pace", name: "pace", a: { plain: "slow", sound: with_({ bpm: 70 }), moods: ["calm"], bpm: 72 }, b: { plain: "quick", sound: with_({ bpm: 124 }), moods: ["energetic"], bpm: 120 } },
  { id: "colour", name: "colour", a: { plain: "bright", sound: with_({ key: "C major" }), moods: ["hopeful", "bright"] }, b: { plain: "shadowed", sound: with_({ key: "C minor" }), moods: ["melancholic", "moody"] } },
  { id: "touch", name: "touch", a: { plain: "plucked", sound: with_({ ids: ["nylon-guitar"] }), instruments: ["nylon guitar"] }, b: { plain: "bowed", sound: with_({ ids: ["string-section"] }), instruments: ["string section"] } },
  { id: "material", name: "material", a: { plain: "acoustic", sound: with_({ ids: ["upright-piano"] }), genres: ["acoustic"], instruments: ["upright piano"] }, b: { plain: "electronic", sound: with_({ ids: ["analog-synth"] }), genres: ["electronic"], instruments: ["analog synth"] } },
  { id: "warmth", name: "warmth", a: { plain: "warm", sound: with_({ ids: ["rhodes"] }), moods: ["warm"], instruments: ["rhodes"] }, b: { plain: "glassy", sound: with_({ ids: ["electric-piano"] }), moods: ["crisp"], instruments: ["electric piano"] } },
  { id: "beat", name: "beat", a: { plain: "played", sound: with_({ ids: ["live-drums"] }), instruments: ["live drums"] }, b: { plain: "programmed", sound: with_({ ids: ["drum-machine"] }), genres: ["electronic"], instruments: ["drum machine"] } },
  {
    id: "density",
    name: "density",
    a: { plain: "sparse", sound: with_({ ids: ["grand-piano", "upright-bass", "string-section"], levels: [0] }), moods: ["sparse", "intimate"] },
    b: { plain: "full", sound: with_({ ids: ["grand-piano", "upright-bass", "string-section"], levels: [3] }), moods: ["lush"], instruments: ["grand piano", "upright bass", "string section"] },
  },
];

/** The ids a pair needs, so a machine missing one is offered only the pairs it can play. */
export const idsOf = (x: DuelAxis): readonly string[] => [...new Set([...x.a.sound.ids, ...x.b.sound.ids])];

/** The axes this machine can play both sides of. */
export const playableAxes = (audible: ReadonlySet<string>): DuelAxis[] => AXES.filter((x) => idsOf(x).every((id) => audible.has(id)));

/** The next undecided axis, in table order; null when every axis is answered. */
export function nextAxis(axes: readonly DuelAxis[], answers: Readonly<Record<string, Answer>>): DuelAxis | null {
  return axes.find((x) => answers[x.id] === undefined) ?? null;
}

export type DuelReason = { readonly list: "genres" | "moods" | "instruments" | "bpm"; readonly term: string; readonly why: string };

/** The seed the answers make, every word with the pair that decided it; a skipped axis decides nothing. */
export function compileDuel(axes: readonly DuelAxis[], answers: Readonly<Record<string, Answer>>): { readonly seed: Seed; readonly reasons: readonly DuelReason[] } {
  const reasons: DuelReason[] = [];
  const pick = { genres: [] as string[], moods: [] as string[], instruments: [] as string[] };
  let bpm: number | null = null;
  for (const x of axes) {
    const ans = answers[x.id];
    if (ans === undefined || ans === "skip") continue;
    const won = ans === "a" ? x.a : x.b;
    const lost = ans === "a" ? x.b : x.a;
    const why = `${won.plain} over ${lost.plain}`;
    for (const list of ["genres", "moods", "instruments"] as const)
      for (const t of won[list] ?? []) {
        if (pick[list].includes(t)) continue;
        pick[list].push(t);
        reasons.push({ list, term: t, why });
      }
    if (won.bpm !== undefined) {
      bpm = won.bpm;
      reasons.push({ list: "bpm", term: `${won.bpm} bpm`, why });
    }
  }
  const seed: Seed = { ...BLANK_SEED, genres: pick.genres.slice(0, 2), moods: pick.moods.slice(0, 3), instruments: pick.instruments.slice(0, 4), bpm };
  return { seed, reasons: reasons.filter((r) => r.list === "bpm" || seed[r.list].includes(r.term)) };
}
