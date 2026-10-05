// THE STRENGTHS MAP — how each provider fares on each term and each technique,
// counted off the ledger's verdict rows. Pure: rows in, cells out, no disk, no
// clock. The route, the CLI and the knowledge generator all call this one
// function, so Triage's heat table and knowledge/audio/PATTERNS.md cannot count
// the same verdicts two ways.
//
// A CELL IS (kind × provider × facet × value), and a take lands in one cell per
// term it carries — a take briefed "lo-fi hip hop, warm, rhodes" with two
// techniques counts in five cells. That is what a facet table means; it is also
// why the cells must never be summed into a total (the `judged` figure beside
// them is the count of takes, and it is the only total).
//
// NOTHING HERE DECIDES WHAT IS TRUSTWORTHY. A cell with n=1 is returned with
// n=1; drawing it as "insufficient" (Triage) or refusing to claim it
// (knowledge.ts, below n=3) is the reader's job, and each reader says so. An
// aggregate that silently dropped small cells would make a provider look
// untested where it was tested once.

import { isVersionOnly, type LedgerVerdict } from "./ledger";
import type { DefectCode, InsightCell, ProviderId, SoundKind } from "./types";

type Facet = InsightCell["facet"];

/** The facets a row of each kind is read along. Effects have a category and no
 *  genre; music has no category. Mood and instrument apply to both. */
export const FACETS_FOR: Record<SoundKind, readonly Facet[]> = {
  music: ["genre", "mood", "instrument", "technique"],
  sfx: ["sfxCategory", "mood", "instrument", "technique"],
};

function valuesOf(r: LedgerVerdict, f: Facet): string[] {
  switch (f) {
    case "genre":
      return r.terms.genre;
    case "mood":
      return r.terms.mood;
    case "instrument":
      return r.terms.instrument;
    case "sfxCategory":
      return r.terms.sfxCategory ? [r.terms.sfxCategory] : [];
    case "technique":
      return r.technique;
  }
}

interface Acc {
  cell: InsightCell;
  scoreSum: number;
  scored: number;
  defects: Map<DefectCode, number>;
}

/** Normalise a term for counting: case and surrounding space are not a
 *  different genre. The first spelling seen is the one shown. */
const norm = (s: string) => s.trim().toLowerCase();

export function computeInsights(rows: readonly LedgerVerdict[], kind?: SoundKind): { cells: InsightCell[]; judged: number } {
  const acc = new Map<string, Acc>();
  let judged = 0;
  for (const r of rows) {
    if (kind && r.kind !== kind) continue;
    // Belt and braces: the ledger never holds a fixture (ledger.ts verdictRow),
    // but a hand-edited file could, and a fixture must not reach the map.
    if (r.origin === "fixture") continue;
    // The same for a bare version (ledger.ts isVersionOnly): never written
    // since the rule, but a row an older build left must not count as a keep.
    if (isVersionOnly(r)) continue;
    judged++;
    for (const facet of FACETS_FOR[r.kind]) {
      const seen = new Set<string>();
      for (const raw of valuesOf(r, facet)) {
        const n = norm(raw);
        if (!n || seen.has(n)) continue;
        seen.add(n);
        const key = `${r.kind}|${r.provider}|${facet}|${n}`;
        let a = acc.get(key);
        if (!a) {
          a = {
            cell: { kind: r.kind, provider: r.provider as ProviderId, facet, value: raw.trim(), n: 0, kept: 0, rejected: 0, meanScore: null, topDefect: null },
            scoreSum: 0,
            scored: 0,
            defects: new Map(),
          };
          acc.set(key, a);
        }
        a.cell.n++;
        if (r.verdict === "kept") a.cell.kept++;
        else {
          a.cell.rejected++;
          for (const d of r.reasons) a.defects.set(d, (a.defects.get(d) ?? 0) + 1);
        }
        if (typeof r.score === "number" && Number.isFinite(r.score)) {
          a.scoreSum += r.score;
          a.scored++;
        }
      }
    }
  }
  const cells = [...acc.values()].map(({ cell, scoreSum, scored, defects }) => {
    // Ties break by code order so the same ledger always names the same defect.
    const top = [...defects.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))[0];
    return { ...cell, meanScore: scored ? round2(scoreSum / scored) : null, topDefect: top ? top[0] : null };
  });
  cells.sort(
    (a, b) =>
      a.kind.localeCompare(b.kind) ||
      a.provider.localeCompare(b.provider) ||
      a.facet.localeCompare(b.facet) ||
      b.n - a.n ||
      a.value.localeCompare(b.value),
  );
  return { cells, judged };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Keep rate of a cell, or null when nothing in it was judged (n is never 0 for
 *  a returned cell, but a caller building one by hand gets the honest answer). */
export const keepRate = (c: Pick<InsightCell, "n" | "kept">): number | null => (c.n ? c.kept / c.n : null);
