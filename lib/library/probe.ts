import { performance } from "node:perf_hooks";

import { err, ok, type Result } from "@gt/domain/errors";
import type { LibraryQuery } from "@gt/domain/library";
import { queryLibrary } from "@gt/kernel/library/query";
import { putMediaFacts, upsertItems } from "@gt/kernel/library/write";
import type { Store } from "@gt/kernel/store";

import type { Corpus } from "./corpus.ts";

// THE LATENCY PROBE - the plan's Phase 5 exit number ("search under 50 ms p95 at
// 50k; measure, do not assume"), taken the way measurement-honesty asks:
//   - the ENDPOINTS are named: the timer spans one `queryLibrary` call, which is
//     the whole page a route serves - rows, total, kind counts AND every rail
//     group's counts, in one read transaction - from the call to its returned
//     value. Not the HTTP hop, not the render;
//   - UNELIDABLE: every result's total and row count is folded into a checksum
//     that is returned and compared run to run, so no query can be skipped or
//     answered from a cache the harness built;
//   - n, the machine and the date travel with the numbers (the caller prints them);
//   - warm-up runs are taken and DISCARDED, and said so: the first statement of
//     each shape pays SQLite's prepare and the page cache's fill, which a serving
//     process pays once.

/** The fixed mix: every query shape the rail and the search field produce. */
export const QUERY_MIX: readonly { readonly name: string; readonly search: boolean; readonly query: LibraryQuery }[] = [
  { name: "empty", search: false, query: { limit: 60 } },
  { name: "kind switch (plate)", search: false, query: { kind: "plate", limit: 60 } },
  { name: "kind switch (audio)", search: false, query: { kind: "audio", limit: 60 } },
  { name: "free word", search: true, query: { q: "cavalry", limit: 60 } },
  { name: "prefix", search: true, query: { q: "pain", limit: 60 } },
  { name: "two words", search: true, query: { q: "night market", limit: 60 } },
  { name: "kv token", search: true, query: { q: "mood:tense", limit: 60 } },
  { name: "word + kv in kind", search: true, query: { kind: "audio", q: "warm genre:ambient", limit: 60 } },
  {
    name: "3-group facets",
    search: true,
    query: { kind: "plate", facets: { render_mode: ["painterly", "cel-shaded"], state: ["ratified", "unjudged"], station: ["forge"] }, limit: 60 },
  },
  { name: "deep scroll (offset 20k)", search: false, query: { offset: 20_000, limit: 60 } },
  { name: "name sort + attention", search: false, query: { sort: "name", facets: { attention: ["unreadable", "missing"] }, limit: 60 } },
];

export type Stat = { readonly name: string; readonly search: boolean; readonly n: number; readonly p50: number; readonly p95: number; readonly p99: number; readonly max: number; readonly total: number };

const pct = (sorted: readonly number[], p: number): number => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? Number.NaN;
const round = (x: number): number => Math.round(x * 100) / 100;

/** Load a corpus into `store` in batches of `batch` (one transaction each). */
export function loadCorpus(store: Store, corpus: Corpus, batch = 1000): Result<{ readonly items: number; readonly ms: number }> {
  const t0 = performance.now();
  for (let i = 0; i < corpus.entries.length; i += batch) {
    const r = upsertItems(store, corpus.entries.slice(i, i + batch), corpus.ctx);
    if (!r.ok) return r;
  }
  for (let i = 0; i < corpus.facts.length; i += batch) {
    const r = putMediaFacts(store, corpus.facts.slice(i, i + batch));
    if (!r.ok) return r;
  }
  return ok({ items: corpus.entries.length, ms: Math.round(performance.now() - t0) });
}

/** Run the mix: `warm` discarded runs, then `runs` timed runs of each query, interleaved. */
export function measure(store: Store, runs: number, warm = 5): Result<{ readonly stats: readonly Stat[]; readonly checksum: number }> {
  const times = QUERY_MIX.map(() => [] as number[]);
  const totals = QUERY_MIX.map(() => -1);
  let checksum = 0;
  for (let round_ = -warm; round_ < runs; round_++) {
    // Interleaved, not one query's runs back to back: a query that follows itself
    // finds exactly its own pages hot, which the route never does.
    for (const [i, m] of QUERY_MIX.entries()) {
      const t0 = performance.now();
      const page = queryLibrary(store, m.query);
      const dt = performance.now() - t0;
      if (!page.ok) return err(page.error.code, `probe: ${m.name}: ${page.error.message}`);
      checksum = (checksum + page.value.total * 31 + page.value.items.length + page.value.groups.length) % 1_000_000_007;
      if (totals[i] === -1) totals[i] = page.value.total;
      else if (totals[i] !== page.value.total) return err("internal", `probe: ${m.name} answered ${page.value.total} after ${totals[i] ?? -1}`);
      if (round_ >= 0) times[i]?.push(dt);
    }
  }
  const stats = QUERY_MIX.map((m, i): Stat => {
    const t = [...(times[i] ?? [])].sort((a, b) => a - b);
    return { name: m.name, search: m.search, n: t.length, p50: round(pct(t, 50)), p95: round(pct(t, 95)), p99: round(pct(t, 99)), max: round(t.at(-1) ?? Number.NaN), total: totals[i] ?? -1 };
  });
  return ok({ stats, checksum });
}

/** The plan's budget: every SEARCH query's p95 under this many milliseconds at 50k. */
export const SEARCH_P95_BUDGET_MS = 50;
