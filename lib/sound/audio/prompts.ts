// PROMPTS: text for a human to paste, never a request. A seed is the recipe a
// human is about to put into a vendor's box; compose renders it in each vendor's
// dialect. Split out of book.ts with its header kept. Moved verbatim.
import type { Take } from "./take";
import type { Facet, Hand } from "./vocabulary";

/* ── prompts: text for a human to paste, never a request ───────────────── */

export type Target = "suno" | "elevenlabs";

export interface Seed {
  genres: string[];
  moods: string[];
  instruments: string[];
  bpm: number | null;
  key: string | null;
  avoid: string[];
}

export const blankSeed = (): Seed => ({
  genres: [],
  moods: [],
  instruments: [],
  bpm: null,
  key: null,
  avoid: [],
});

export function seedOf(t: Take): Seed {
  return {
    genres: t.genre_tags.slice(),
    moods: t.mood_tags.slice(),
    instruments: t.instrumentation.slice(),
    bpm: t.tempo_bpm,
    key: t.key,
    avoid: [],
  };
}

const phraseOf = (hands: Record<string, Hand>, facet: Facet, term: string) => hands[`${facet}:${term}`]?.phrase || term;

/** The two vendors' prompt dialects (core.js#compose): ElevenLabs reads a
 *  sentence, Suno a style line plus section tags. */
export function compose(seed: Seed, target: Target, hands: Record<string, Hand>): string {
  const g = seed.genres.map((t) => phraseOf(hands, "genre_tags", t));
  const mo = seed.moods.map((t) => phraseOf(hands, "mood_tags", t));
  const ins = seed.instruments.map((t) => phraseOf(hands, "instrumentation", t));
  const avoid = seed.avoid;
  const tk = [seed.bpm ? `${Math.round(seed.bpm)} BPM` : null, seed.key || null].filter((x): x is string => Boolean(x));
  if (target === "elevenlabs") {
    const head = [mo.join(", "), g.join(" / ")].filter(Boolean).join(" ");
    let s = `${head ? head.charAt(0).toUpperCase() + head.slice(1) : "Instrumental"} instrumental`;
    if (tk.length) s += `, ${tk.join(", ")}`;
    if (ins.length)
      s += `. Built on ${ins.slice(0, -1).join(", ")}${ins.length > 1 ? " and " : ""}${ins[ins.length - 1]}.`;
    if (avoid.length) s += ` No ${avoid.join(", no ")}.`;
    return s;
  }
  const style = [...g, ...mo, ...ins, ...tk].join(", ");
  const lines = [`Style: ${style}`];
  if (avoid.length) lines.push(`Exclude: ${avoid.join(", ")}`);
  lines.push("", "[Instrumental]", "[Intro]", "[Build]", "[Drop]", "[Breakdown]", "[Outro]");
  return lines.join("\n");
}
