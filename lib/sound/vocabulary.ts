// THE ONE VOCABULARY DERIVATION — the terms a sound is described by (genre,
// mood, instrument, effect category), each with its evidence and the team's
// stance on it. Pure: insights cells and a hand in, term entries out.
//
// WHY IT CONSUMES CELLS. The Library used to recount the verdicts its own way
// (app/library/audio/vocabulary.ts, off browser takes) while the server counted
// them in computeInsights for Triage. Two counters over one ledger is how a
// term reads 7 kept in one place and 6 in the other. This file never counts a
// verdict: it SUMS cells (which are per provider, over disjoint takes) and lays
// the hand over the sum, so n, kept and keepRate are computeInsights' figures
// by construction.
//
// WHAT IT DOES NOT CARRY. A cell holds a mean of means per provider and no
// scored-take count, so an honest cross-provider average cannot be rebuilt from
// cells; `avg` is therefore absent here rather than approximated.

import type { InsightCell, SoundKind } from "./types";

export type VocabFacet = "genre" | "mood" | "instrument" | "sfxCategory";
export type Stance = "prefer" | "avoid";

/** The team's hand on one term, as the Library keeps it today. */
export interface Hand {
  stance?: Stance | null;
  phrase?: string;
}

export interface VocabEntry {
  /** `${facet}:${value}` with the value normalised (trimmed, lower-cased). */
  id: string;
  term: string;
  facet: VocabFacet;
  kind: SoundKind;
  n: number;
  kept: number;
  rejected: number;
  /** n is already judged takes only (the ledger holds no others). */
  keepRate: number | null;
  stance: Stance | null;
  phrase: string;
  topDefect: string | null;
}

const FACET_KIND: Record<VocabFacet, SoundKind> = { genre: "music", mood: "music", instrument: "music", sfxCategory: "sfx" };
const norm = (s: string) => s.trim().toLowerCase();

/** The id a hand is keyed by. */
export const termId = (facet: VocabFacet, value: string) => `${facet}:${norm(value)}`;

/** Terms across every provider, one entry per facet:value, with the hand laid
 *  over. Technique cells are not vocabulary and are skipped; so are mood and
 *  instrument cells of effects, which the Library's term list never showed. */
export function deriveVocabulary(cells: readonly InsightCell[], hands: Readonly<Record<string, Hand>> = {}): VocabEntry[] {
  const acc = new Map<string, VocabEntry & { defects: Map<string, number> }>();
  for (const c of cells) {
    if (c.facet === "technique") continue;
    const facet: VocabFacet = c.facet;
    if (c.kind !== FACET_KIND[facet]) continue;
    const id = termId(facet, c.value);
    let e = acc.get(id);
    if (!e) {
      e = { id, term: c.value, facet, kind: c.kind, n: 0, kept: 0, rejected: 0, keepRate: null, stance: null, phrase: "", topDefect: null, defects: new Map() };
      acc.set(id, e);
    }
    e.n += c.n;
    e.kept += c.kept;
    e.rejected += c.rejected;
    // Each cell names only its own top defect; weight it by the rejections it
    // stands for, so the term's top defect is the provider-spanning mode.
    if (c.topDefect) e.defects.set(c.topDefect, (e.defects.get(c.topDefect) ?? 0) + c.rejected);
  }
  return [...acc.values()].map(({ defects, ...e }) => {
    const hand = hands[e.id];
    const top = [...defects.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    return {
      ...e,
      keepRate: e.n ? e.kept / e.n : null,
      // A category is not a word that goes into a prompt: no stance, no phrase.
      stance: e.facet === "sfxCategory" ? null : (hand?.stance ?? null),
      phrase: e.facet === "sfxCategory" ? "" : (hand?.phrase ?? ""),
      topDefect: top ? top[0] : null,
    };
  });
}
