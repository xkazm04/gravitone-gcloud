// VARIATIONS — the one-change fan-outs of a recipe, one axis each, so a verdict
// on the result says which axis mattered. Split out of book.ts; reads the seed
// (./prompts.ts) and the vocabulary (./vocabulary.ts). Moved verbatim; moved again, out of the
// retired v1 Library (app/library/audio, Phase 5) for the Sound lab that still reads it.
import { seedOf, type Seed } from "./prompts";
import type { Take } from "./take";
import type { Facet, TermEntry } from "./vocabulary";

/* ── variations: one axis each, so a verdict on the result says which axis mattered ── */

export interface Variation {
  axis: "swap" | "mood" | "tempo" | "key" | "fence";
  diff: string[];
  seed: Seed;
  why: string;
}

const REL: Record<string, string> = {
  "A minor": "C major",
  "C major": "A minor",
  "F minor": "Ab major",
  "D minor": "F major",
  "F major": "D minor",
  "E minor": "G major",
  "G minor": "Bb major",
  "C minor": "Eb major",
  "B minor": "D major",
  "G major": "E minor",
};

const pctKept = (e: TermEntry) => (e.keepRate != null ? `${Math.round(e.keepRate * 100)}% kept` : "");

export function variations(t: Take, voc: readonly TermEntry[]): Variation[] {
  if (t.kind !== "track") return [];
  return variationsOfSeed(seedOf(t), voc);
}

/** The one-change variations of a SEED, which is what `variations` always
 *  read off a take (its terms, tempo and key — `seedOf`). Split out so a
 *  recipe that is not yet a take — the Sound lab's working seed, a reference
 *  track's concept — fans out by the same rules rather than a second copy of
 *  them (app/playground/labModel.ts#fanOut). For a take the result is
 *  identical: `seedOf` starts with no fence, so the fence line below adds
 *  exactly the one term it always did. */
export function variationsOfSeed(base: Seed, voc: readonly TermEntry[]): Variation[] {
  const best = (facet: Facet, not: string[]) =>
    voc
      .filter((v) => v.facet === facet && !not.includes(v.term) && v.stance !== "avoid" && v.judged >= 2)
      .sort(
        (a, b) =>
          Number(b.stance === "prefer") - Number(a.stance === "prefer") ||
          (b.keepRate ?? 0) - (a.keepRate ?? 0) ||
          (b.avg ?? 0) - (a.avg ?? 0),
      )[0];
  const worst = (facet: Facet, among: string[]) =>
    voc
      .filter((v) => v.facet === facet && among.includes(v.term))
      .sort((a, b) => (a.stance === "avoid" ? -1 : 0) || (a.keepRate ?? 1) - (b.keepRate ?? 1))[0];
  const clone = (): Seed => ({
    genres: base.genres.slice(),
    moods: base.moods.slice(),
    instruments: base.instruments.slice(),
    bpm: base.bpm,
    key: base.key,
    avoid: base.avoid.slice(),
  });
  const out: Variation[] = [];
  const wi = worst("instrumentation", base.instruments);
  const bi = best("instrumentation", base.instruments);
  if (wi && bi) {
    const s = clone();
    s.instruments = s.instruments.map((x) => (x === wi.term ? bi.term : x));
    out.push({
      axis: "swap",
      diff: [`−${wi.term}`, `+${bi.term}`],
      seed: s,
      why: pctKept(bi),
    });
  }
  const wm = worst("mood_tags", base.moods);
  const bm = best("mood_tags", base.moods);
  if (wm && bm) {
    const s = clone();
    s.moods = s.moods.map((x) => (x === wm.term ? bm.term : x));
    out.push({
      axis: "mood",
      diff: [`−${wm.term}`, `+${bm.term}`],
      seed: s,
      why: pctKept(bm),
    });
  }
  const bpm = base.bpm || 100;
  for (const d of [-6, 6]) {
    const s = clone();
    s.bpm = bpm + d;
    out.push({
      axis: "tempo",
      diff: [`${d > 0 ? "+" : ""}${d} BPM`],
      seed: s,
      why: `${Math.round(bpm + d)} BPM`,
    });
  }
  if (base.key && REL[base.key]) {
    const s = clone();
    s.key = REL[base.key];
    out.push({
      axis: "key",
      diff: [`${base.key} → ${REL[base.key]}`],
      seed: s,
      why: "relative",
    });
  }
  const fence =
    voc.find((v) => v.stance === "avoid" && v.facet === "instrumentation" && !base.instruments.includes(v.term)) ??
    voc
      .filter((v) => v.facet === "instrumentation" && v.judged >= 4 && !base.instruments.includes(v.term))
      .sort((a, b) => (a.keepRate ?? 1) - (b.keepRate ?? 1))[0];
  if (fence) {
    const s = clone();
    s.avoid = [...s.avoid.filter((x) => x !== fence.term), fence.term];
    out.push({
      axis: "fence",
      diff: [`no ${fence.term}`],
      seed: s,
      why: pctKept(fence),
    });
  }
  return out;
}
