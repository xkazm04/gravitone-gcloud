// PROVIDER STRENGTHS - how each provider fares on each term and technique, as a table a person
// can read without being lied to by a small sample. Pure (Phase 6, L66).
//
// Absorbed from v1 app/playground/triage/model.ts (dead since Phase 3, when triage moved to the
// Board and nothing drew this table): the operator's stated purpose for judging at all, "which
// prompt techniques, genres and instruments are a good choice, to understand the strengths of
// each audio provider" (2026-10-05). Kept whole:
//   · a cell is (provider × facet × value) and is NEVER summed across providers - the /audio
//     composer's term rail sums them (lib/sound/vocabulary.ts), which answers a different
//     question, and since Phase 3 that sum was the only reading left;
//   · THE FLOOR: under three judged takes a cell carries no rate and no mean - not a rounded
//     one, not a zero - only how much evidence it is waiting for (knowledge/README.md's
//     evidence contract, the same n=3 lib/sound/knowledge.ts claims nothing below). A 100% off
//     one take is the most misleading number this table could print (measurement-honesty
//     minimum-sample-floors: below the floor there is no signal to report at any confidence);
//   · a missing rate sorts BELOW every real one in both directions - absent is not low;
//   · a lesson drafted from a cell carries evidence computed from the takes behind it, so the
//     ids and the figures cannot disagree, and the draft states the evidence, never a verdict.
// Upgraded: the cell's take test (`inCell`) and the evidence read a narrow take shape, so the
// table can be fed from the server without shipping whole takes to the browser.

export type Facet = "genre" | "mood" | "instrument" | "technique" | "sfxCategory";
export type Provider = "elevenlabs" | "suno" | "local";
export type StrengthKind = "music" | "sfx";

/** lib/sound/types.ts InsightCell, as the table reads it. */
export type StrengthCell = {
  readonly kind: StrengthKind;
  readonly provider: Provider;
  readonly facet: Facet;
  readonly value: string;
  readonly n: number;
  readonly kept: number;
  readonly rejected: number;
  readonly meanScore: number | null;
  readonly topDefect: string | null;
};

/** v1 FACETS: an effect has a category and no genre; music no category. */
export const FACETS: { readonly [K in StrengthKind]: readonly Facet[] } = {
  music: ["genre", "mood", "instrument", "technique"],
  sfx: ["sfxCategory", "technique", "mood"],
};

export const FACET_WORD: { readonly [F in Facet]: string } = { genre: "genre", mood: "mood", instrument: "instrument", technique: "technique", sfxCategory: "category" };

export const PROVIDER_NAME: { readonly [P in Provider]: string } = { elevenlabs: "ElevenLabs", suno: "Suno", local: "Local" };

/** Below this many judged takes a cell shows how much evidence it is waiting for, never a rate. */
export const MIN_N = 3;

export type Heat = -2 | -1 | 0 | 1 | 2;

export type CellView =
  | { readonly state: "empty" }
  | { readonly state: "insufficient"; readonly n: number; readonly need: number }
  | {
      readonly state: "measured";
      readonly n: number;
      readonly keepRate: number;
      readonly keepPct: string;
      readonly mean: string | null;
      readonly topDefect: string | null;
      /** How far the keep rate sits from a coin toss, and which way. */
      readonly heat: Heat;
    };

/** How a cell may speak. n = 0 is empty; n < MIN_N carries NO rate and NO mean. */
export function cellView(c: StrengthCell | null | undefined): CellView {
  if (c === null || c === undefined || c.n <= 0) return { state: "empty" };
  if (c.n < MIN_N) return { state: "insufficient", n: c.n, need: MIN_N - c.n };
  const keepRate = c.kept / c.n;
  const heat: Heat = keepRate >= 0.75 ? 2 : keepRate >= 0.55 ? 1 : keepRate > 0.4 ? 0 : keepRate > 0.2 ? -1 : -2;
  return { state: "measured", n: c.n, keepRate, keepPct: `${Math.round(keepRate * 100)}%`, mean: c.meanScore === null ? null : c.meanScore.toFixed(1), topDefect: c.topDefect, heat };
}

export type StrengthRow = {
  readonly value: string;
  readonly cells: Readonly<Partial<Record<Provider, StrengthCell>>>;
  /** Judged takes behind the row, all providers: the row's size, never a rate. */
  readonly n: number;
};

const ORDER: readonly Provider[] = ["elevenlabs", "suno", "local"];

/**
 * The providers drawn as columns: every one with a cell of this kind, and the two this studio
 * renders through always - ElevenLabs (v1's rule: its column never vanishes because nothing is
 * judged yet) and Suno, the desk's live music engine since Phase 5. Local appears only once
 * something it made was judged.
 */
export function providerColumns(cells: readonly StrengthCell[]): readonly Provider[] {
  const have = new Set<Provider>(["elevenlabs", "suno", ...cells.map((c) => c.provider)]);
  return ORDER.filter((p) => have.has(p));
}

/** Rows of the provider × value table for one facet. */
export function pivot(cells: readonly StrengthCell[], facet: Facet): StrengthRow[] {
  const by = new Map<string, { value: string; cells: Partial<Record<Provider, StrengthCell>>; n: number }>();
  for (const c of cells) {
    if (c.facet !== facet) continue;
    const r = by.get(c.value) ?? { value: c.value, cells: {}, n: 0 };
    r.cells[c.provider] = c;
    r.n += c.n;
    by.set(c.value, r);
  }
  return [...by.values()];
}

export type SortKey = "value" | "n" | "keep" | "mean";
export type Sort = { readonly key: SortKey; readonly provider: Provider | null; readonly dir: "asc" | "desc" };

/** Sort rows. A cell under the floor has no rate, so on a keep or mean sort it falls BELOW every
 *  measured row in either direction - a missing number is not a low one. */
export function sortRows(rows: readonly StrengthRow[], s: Sort): StrengthRow[] {
  const metric = (r: StrengthRow): number | null => {
    if (s.key === "n") return r.n;
    if (s.key === "value") return null;
    const c = r.cells[s.provider ?? "elevenlabs"];
    const v = cellView(c);
    if (v.state !== "measured") return null;
    return s.key === "keep" ? v.keepRate : (c?.meanScore ?? null);
  };
  const sign = s.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (s.key === "value") return sign * a.value.localeCompare(b.value);
    const ma = metric(a);
    const mb = metric(b);
    if (ma === null && mb === null) return a.value.localeCompare(b.value);
    if (ma === null) return 1;
    if (mb === null) return -1;
    return sign * (ma - mb) || a.value.localeCompare(b.value);
  });
}

/** What the evidence of a cell reads off a take. */
export type EvidenceTake = {
  readonly id: string;
  readonly provider: Provider;
  readonly verdict: "unjudged" | "kept" | "rejected";
  readonly origin: string;
  readonly technique: readonly string[];
  readonly terms: { readonly genre: readonly string[]; readonly mood: readonly string[]; readonly instrument: readonly string[]; readonly sfxCategory: string | null };
  /** The take's rubric mean (./rubric.ts `rubricMean`), null when unscored. */
  readonly mean: number | null;
};

const norm = (s: string): string => s.trim().toLowerCase();

/** Does a judged, non-fixture take stand behind this cell? Terms compare as the cells were
 *  counted (lib/sound/insights.ts `norm`): case and surrounding space are not a different genre. */
export function inCell(t: EvidenceTake, c: Pick<StrengthCell, "provider" | "facet" | "value">): boolean {
  if (t.provider !== c.provider || t.verdict === "unjudged" || t.origin === "fixture") return false;
  const v = norm(c.value);
  switch (c.facet) {
    case "technique":
      return t.technique.some((x) => norm(x) === v);
    case "sfxCategory":
      return t.terms.sfxCategory !== null && norm(t.terms.sfxCategory) === v;
    default:
      return t.terms[c.facet].some((x) => norm(x) === v);
  }
}

export type Evidence = { readonly n: number; readonly keepRate: number | null; readonly meanScore: number | null; readonly takeIds: readonly string[] };

/** A lesson's evidence, from the takes themselves. The mean renormalises over the scored takes
 *  (measurement-honesty renormalize-over-present): an unscored take is not a zero. */
export function evidenceFor(takes: readonly EvidenceTake[], c: Pick<StrengthCell, "provider" | "facet" | "value">): Evidence {
  const ts = takes.filter((t) => inCell(t, c));
  const kept = ts.filter((t) => t.verdict === "kept").length;
  const means = ts.map((t) => t.mean).filter((m): m is number => m !== null);
  return {
    n: ts.length,
    keepRate: ts.length === 0 ? null : Math.round((kept / ts.length) * 1000) / 1000,
    meanScore: means.length === 0 ? null : Math.round((means.reduce((a, b) => a + b, 0) / means.length) * 10) / 10,
    takeIds: ts.map((t) => t.id),
  };
}

/** A first draft of the claim - "when X, brief Y, because Z" - for the operator to rewrite. It
 *  states the evidence; the judgement is theirs. */
export function claimDraft(c: StrengthCell): string {
  const v = cellView(c);
  const who = PROVIDER_NAME[c.provider];
  const what = c.kind === "sfx" ? "effects" : "music";
  const good = v.state === "measured" ? v.keepRate >= 0.5 : true;
  const fig = v.state === "measured" ? `it kept ${c.kept} of ${c.n}${v.mean === null ? "" : ` (mean ${v.mean})`}` : `n=${c.n}`;
  const defect = c.topDefect !== null && !good ? `; the usual defect is ${c.topDefect.replace(/-/g, " ")}` : "";
  if (c.facet === "technique") return `When briefing ${who} for ${what}, ${good ? "use" : "avoid"} the ${c.value} technique, because ${fig}${defect}.`;
  return `When the brief's ${FACET_WORD[c.facet]} is ${c.value}, ${good ? "send it to" : "do not send it to"} ${who}, because ${fig}${defect}.`;
}

/** The cells of one facet that clear the floor, of all its cells: the table's coverage, stated. */
export function coverage(cells: readonly StrengthCell[], facet: Facet): { readonly measured: number; readonly of: number } {
  const mine = cells.filter((c) => c.facet === facet);
  return { measured: mine.filter((c) => c.n >= MIN_N).length, of: mine.length };
}

/** A cell's address in a URL or a key: provider, facet, value. */
export const cellKey = (c: Pick<StrengthCell, "provider" | "facet" | "value">): string => `${c.provider}|${c.facet}|${c.value}`;
