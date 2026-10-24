// VARIATIONS AND REFERENCES - the composer's two ways to a next seed, pure.
//
// Variations (v1 app/library/audio/variations.ts `variationsOfSeed`, kept rule for rule): one
// axis each - swap the weakest instrument for the strongest unused one, the same for mood, ±6 BPM,
// the relative key, and a fence (exclude) on the instrument the evidence says to avoid - so a
// verdict on the result says which axis mattered. CHANGED, and why: v1 read `judged` and `avg`
// off a browser recount; the one derivation (lib/sound/vocabulary.ts) carries `n` (judged takes
// only) and no average, because a mean of per-provider means cannot be rebuilt honestly. So
// "judged >= 2" reads `n >= 2`, and the average tiebreak is gone rather than approximated.
//
// References (v1 app/library/audio/referenceTracks.ts): the kind of tempo error a method made (a
// half-time read is not a 20 % miss), the key relation, and the concept a reference yields - its
// measured tempo and key plus the terms its kept descendants share. No model guesses a genre
// here (core.js#conceptFor). The registry's reference-track-anchoring: a reference carries
// style, never melody - which is why only terms, tempo and key cross into the seed.
import { TEMPO } from "./batch.ts";
import { relativeKey, sameKey } from "./brief.ts";
import type { Seed, Term, TermFacet } from "./recipe.ts";

export type Variation = { readonly axis: "swap" | "mood" | "tempo" | "key" | "fence"; readonly diff: readonly string[]; readonly seed: Seed; readonly why: string };

// The relative key is computed, not listed: a hand list held 14 of the tracker's 24 keys (no
// F# minor / A major, no E major / C# minor), so those seeds offered no key axis and a
// reference read relative to its truth was graded `wrong`. ./brief.ts parses any spelling.

const pctKept = (e: Term): string => (e.keepRate !== null ? `${Math.round(e.keepRate * 100)}% kept` : "");

export function variationsOfSeed(base: Seed, terms: readonly Term[]): Variation[] {
  const best = (facet: TermFacet, not: readonly string[]): Term | undefined =>
    terms
      .filter((v) => v.facet === facet && !not.includes(v.term) && v.stance !== "avoid" && v.n >= 2)
      .sort((a, b) => Number(b.stance === "prefer") - Number(a.stance === "prefer") || (b.keepRate ?? 0) - (a.keepRate ?? 0) || b.n - a.n)[0];
  const worst = (facet: TermFacet, among: readonly string[]): Term | undefined =>
    terms.filter((v) => v.facet === facet && among.includes(v.term)).sort((a, b) => Number(b.stance === "avoid") - Number(a.stance === "avoid") || (a.keepRate ?? 1) - (b.keepRate ?? 1))[0];
  const out: Variation[] = [];
  const wi = worst("instrument", base.instruments);
  const bi = best("instrument", base.instruments);
  if (wi !== undefined && bi !== undefined) {
    out.push({ axis: "swap", diff: [`−${wi.term}`, `+${bi.term}`], seed: { ...base, instruments: base.instruments.map((x) => (x === wi.term ? bi.term : x)) }, why: pctKept(bi) });
  }
  const wm = worst("mood", base.moods);
  const bm = best("mood", base.moods);
  if (wm !== undefined && bm !== undefined) {
    out.push({ axis: "mood", diff: [`−${wm.term}`, `+${bm.term}`], seed: { ...base, moods: base.moods.map((x) => (x === wm.term ? bm.term : x)) }, why: pctKept(bm) });
  }
  const bpm = base.bpm !== null && base.bpm > 0 ? base.bpm : 100;
  // A step past the range a brief may lock is not a variation the batch would take (batch.ts TEMPO).
  for (const d of [-6, 6]) if (bpm + d >= TEMPO.min && bpm + d <= TEMPO.max) out.push({ axis: "tempo", diff: [`${d > 0 ? "+" : ""}${d} BPM`], seed: { ...base, bpm: bpm + d }, why: `${Math.round(bpm + d)} BPM` });
  const rel = base.key === null ? null : relativeKey(base.key);
  if (base.key !== null && rel !== null) out.push({ axis: "key", diff: [`${base.key} → ${rel}`], seed: { ...base, key: rel }, why: "relative" });
  const fence =
    terms.find((v) => v.stance === "avoid" && v.facet === "instrument" && !base.instruments.includes(v.term) && !base.avoid.includes(v.term)) ??
    terms.filter((v) => v.facet === "instrument" && v.n >= 4 && !base.instruments.includes(v.term) && !base.avoid.includes(v.term)).sort((a, b) => (a.keepRate ?? 1) - (b.keepRate ?? 1))[0];
  if (fence !== undefined) out.push({ axis: "fence", diff: [`no ${fence.term}`], seed: { ...base, avoid: [...base.avoid, fence.term] }, why: pctKept(fence) });
  return out;
}

/* ── references ─────────────────────────────────────────────────────────── */

export type TempoError = { readonly ok: boolean; readonly pct: number; readonly kind: string };

/** v1 `tempoError`: the method matters, not just the number. */
export function tempoError(est: number, truth: number): TempoError {
  const r = est / truth;
  const pct = Math.abs(r - 1) * 100;
  const named = (
    [
      [0.5, "half-time"],
      [2, "double-time"],
      [2 / 3, "2:3"],
      [3 / 2, "3:2"],
      [3 / 4, "3:4"],
      [4 / 3, "4:3"],
    ] as const
  ).find(([k]) => Math.abs(r / k - 1) < 0.03);
  if (pct <= 3) return { ok: true, pct, kind: `within ${pct.toFixed(1)}%` };
  if (named !== undefined) return { ok: false, pct, kind: `${named[1]} error` };
  return { ok: false, pct, kind: `${pct.toFixed(0)}% off` };
}

export type KeyRelation = "exact" | "relative" | "wrong";

export const keyRelation = (est: string, truth: string): KeyRelation => {
  if (sameKey(est, truth)) return "exact";
  const rel = relativeKey(est);
  return rel !== null && sameKey(rel, truth) ? "relative" : "wrong";
};

/** A take as the concept reads it: its verdict, whether it scores (proven), its words. */
export type ConceptTake = {
  readonly referenceTrackId: string | null;
  readonly verdict: "kept" | "rejected" | "unjudged";
  readonly proven: boolean;
  readonly terms: { readonly genre: readonly string[]; readonly mood: readonly string[]; readonly instrument: readonly string[] };
};

/** The concept a reference yields: proven counts 2, kept 1, rejected −1 (v1 `conceptFor`). */
export function conceptFor(refId: string, measured: { readonly tempo: number; readonly key: string }, takes: readonly ConceptTake[]): Seed {
  const kids = takes.filter((t) => t.referenceTrackId === refId);
  const top = (k: "genre" | "mood" | "instrument", n: number): string[] => {
    const c = new Map<string, number>();
    for (const t of kids) {
      const w = t.verdict === "kept" ? (t.proven ? 2 : 1) : t.verdict === "rejected" ? -1 : 0;
      for (const term of t.terms[k]) c.set(term, (c.get(term) ?? 0) + w);
    }
    return [...c.entries()]
      .filter((e) => e[1] > 0)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, n)
      .map((e) => e[0]);
  };
  return { genres: top("genre", 2), moods: top("mood", 2), instruments: top("instrument", 4), bpm: measured.tempo, key: measured.key, avoid: [] };
}
