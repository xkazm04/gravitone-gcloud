// THE VOCABULARY — the terms a track or an effect is described by, read off the
// ledger on every render: the facets, each term's evidence, its team stance and
// its phrasing, and the sorts over them. Split out of book.ts as one unit; the
// term evidence is derived (./derived.ts) and never stored. Moved verbatim.
import { score, verdict } from "./derived";
import type { Take } from "./take";

/* ── the vocabulary ────────────────────────────────────────────────────── */

export type Facet = "genre_tags" | "mood_tags" | "instrumentation";
export type TermFacet = Facet | "sfx_category";
export type Stance = "prefer" | "avoid";

export interface Hand {
  stance?: Stance | null;
  phrase?: string;
}

export interface TermEntry {
  id: string;
  term: string;
  facet: TermFacet;
  n: number;
  kept: number;
  proven: number;
  rejected: number;
  judged: number;
  avg: number | null;
  keepRate: number | null;
  stance: Stance | null;
  phrase: string;
  topReason: [string, number] | null;
  sfx: boolean;
}

export const FACETS: readonly { key: Facet; label: string }[] = [
  { key: "genre_tags", label: "Genre" },
  { key: "mood_tags", label: "Mood" },
  { key: "instrumentation", label: "Instrument" },
];

interface Acc {
  n: number;
  kept: number;
  proven: number;
  rejected: number;
  sum: number;
  rated: number;
  reasons: Map<string, number>;
}

function tally(acc: Acc, t: Take) {
  acc.n++;
  const v = verdict(t);
  if (v === "proven") acc.proven++;
  if (v === "proven" || v === "kept") acc.kept++;
  if (v === "rejected") {
    acc.rejected++;
    if (t.reject_reason) acc.reasons.set(t.reject_reason, (acc.reasons.get(t.reject_reason) ?? 0) + 1);
  }
  const s = score(t);
  if (s != null) {
    acc.sum += s;
    acc.rated++;
  }
}

function finish(id: string, term: string, facet: TermFacet, acc: Acc, hand: Hand | undefined): TermEntry {
  const judged = acc.kept + acc.rejected;
  const top = [...acc.reasons.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
  return {
    id,
    term,
    facet,
    n: acc.n,
    kept: acc.kept,
    proven: acc.proven,
    rejected: acc.rejected,
    judged,
    avg: acc.rated ? acc.sum / acc.rated : null,
    keepRate: judged ? acc.kept / judged : null,
    stance: facet === "sfx_category" ? null : (hand?.stance ?? null),
    phrase: facet === "sfx_category" ? "" : (hand?.phrase ?? ""),
    topReason: top,
    sfx: facet === "sfx_category",
  };
}

const fresh = (): Acc => ({
  n: 0,
  kept: 0,
  proven: 0,
  rejected: 0,
  sum: 0,
  rated: 0,
  reasons: new Map(),
});

/** Track terms, one entry per facet:term, with the team's hand laid over. */
export function vocabulary(takes: readonly Take[], hands: Record<string, Hand>): TermEntry[] {
  const m = new Map<string, { term: string; facet: Facet; acc: Acc }>();
  for (const t of takes) {
    if (t.kind !== "track") continue;
    for (const f of FACETS)
      for (const term of t[f.key]) {
        const k = `${f.key}:${term}`;
        if (!m.has(k)) m.set(k, { term, facet: f.key, acc: fresh() });
        tally(m.get(k)!.acc, t);
      }
  }
  return [...m.entries()].map(([id, e]) => finish(id, e.term, e.facet, e.acc, hands[id]));
}

/** Effect categories, read the same way. No stance: a category is not a word
 *  that goes into a prompt (app.js#sfxVocab). */
export function sfxVocabulary(takes: readonly Take[]): TermEntry[] {
  const m = new Map<string, Acc>();
  for (const t of takes) {
    if (t.kind !== "sfx" || !t.sfx_category) continue;
    if (!m.has(t.sfx_category)) m.set(t.sfx_category, fresh());
    tally(m.get(t.sfx_category)!, t);
  }
  return [...m.entries()].map(([term, acc]) => finish(`sfx_category:${term}`, term, "sfx_category", acc, undefined));
}

export type TermSort = "rate" | "n" | "name";

/** "keep %" sorts by a Laplace-smoothed rate, so one kept take of one does not
 *  outrank nine of ten (app.js#sortTerms). */
export function sortTerms(list: readonly TermEntry[], k: TermSort): TermEntry[] {
  return list
    .slice()
    .sort((a, b) =>
      k === "name"
        ? a.term.localeCompare(b.term)
        : k === "n"
          ? b.n - a.n || a.term.localeCompare(b.term)
          : (b.kept + 1) / (b.judged + 2) - (a.kept + 1) / (a.judged + 2) || b.judged - a.judged,
    );
}
