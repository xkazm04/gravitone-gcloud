import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { isSharedGroup, KIND_LABELS, normText, parseSearch, railGroups, type LibraryKindName, type LibraryPage, type LibraryQuery } from "@gt/domain/library";
import { parseAt } from "@gt/domain/door";
import { libraryItemSchema } from "@gt/domain/libraryItem";
import { indexRowOf } from "@gt/kernel/library/core";
import { queryLibrary } from "@gt/kernel/library/query";
import { openKernel, type Kernel } from "@gt/kernel/kernel";

import { generateCorpus, prng, type Corpus } from "../../lib/library/corpus.ts";
import { loadCorpus } from "../../lib/library/probe.ts";

// THE INDEX AGAINST THE PROTOTYPE'S RULE. The kernel counts the rail three ways
// depending on the query's shape (the counts table, one scope pass, GROUP BYs for
// a selected column - kernel library/counts.ts says why). This test holds every
// one of them to ONE reference: the prototype's `compute` (docs/next/prototype/
// app/library.js) - OR within a group, AND across, each group counted with its
// own selection left out, the kind counts under the shared groups only -
// written out plainly over the same corpus held in memory. 200 seeded queries of
// every shape; a count that differs anywhere is a red test with the query in it.

const N = 3000;
let k: Kernel;
let corpus: Corpus;

type Ref = { id: string; seq: number; kind: LibraryKindName; values: Map<string, { value: string; label: string }[]>; text: string[]; bad: number; at: string | null; name: string; kindOrd: number };
let ref: Ref[] = [];

beforeAll(() => {
  const opened = openKernel(":memory:");
  if (!opened.ok) throw opened.error;
  k = opened.value;
  corpus = generateCorpus(N, 0x1ab49);
  const loaded = loadCorpus(k.store, corpus, 500);
  if (!loaded.ok) throw loaded.error;
  const facts = new Map(corpus.facts.map((f) => [f.sha, f]));
  ref = corpus.entries.map((e, i) => {
    const item = parseAt("corpus item", libraryItemSchema, e.item);
    if (!item.ok) throw item.error;
    const row = indexRowOf({ ...e, item: item.value }, corpus.ctx);
    const values = new Map<string, { value: string; label: string }[]>();
    const add = (g: string, value: string, label = value): void => {
      values.set(g, [...(values.get(g) ?? []), { value, label }]);
    };
    for (const f of row.facets) add(f.grp, f.value, f.label);
    add("state", row.state);
    add("origin", row.origin);
    add("source", row.source);
    const media = e.item.media;
    const attention = media === undefined ? (row.needsMedia ? "missing" : null) : facts.get(media.sha256)?.decodable === false ? "unreadable" : null;
    if (attention !== null) add("attention", attention);
    const text = normText(`${row.title} ${row.meta} ${row.hay}`).split(" ");
    return { id: row.id, seq: i + 1, kind: row.kind, values, text, bad: attention === null ? 0 : 1, at: row.at, name: row.sortName, kindOrd: row.kindOrd };
  });
});
afterAll(() => k.close());

/** library.js `compute`, over the reference rows. */
function reference(q: LibraryQuery): { total: number; kindCounts: Record<string, number>; groups: Record<string, Record<string, number>>; first: string[] } {
  const parsed = parseSearch(q.q ?? "");
  const searchOk = (it: Ref): boolean =>
    parsed.words.every((w) => it.text.some((t) => t.startsWith(w))) &&
    parsed.tokens.every((t) => {
      if (t.key === "id") return it.id.toLowerCase().includes(t.value.toLowerCase());
      if (t.key === "kind") return KIND_LABELS.some((x) => x.kind === it.kind && (x.kind.includes(t.value) || normText(x.short).includes(t.value)));
      return (it.values.get(t.key) ?? []).some((v) => `${normText(v.value)}|${normText(v.label)}`.includes(t.value) || (["state", "origin", "source", "attention"].includes(t.key) && normText(v.value).includes(t.value)));
    });
  const active = Object.entries(q.facets ?? {}).filter(([, vs]) => (vs ?? []).length > 0);
  const vis = railGroups(q.kind ?? "all").map((g) => g.key);
  const counts: Record<string, Record<string, number>> = {};
  const kindCounts: Record<string, number> = {};
  const match: Ref[] = [];
  for (const it of ref) {
    if (!searchOk(it)) continue;
    let fails = 0;
    let failKey = "";
    let sharedFail = 0;
    for (const [g, vs] of active) {
      const ok = (it.values.get(g) ?? []).some((v) => (vs ?? []).includes(v.value));
      if (!ok) {
        fails++;
        failKey = g;
        if (isSharedGroup(g)) sharedFail++;
      }
    }
    if (sharedFail === 0) {
      kindCounts["all"] = (kindCounts["all"] ?? 0) + 1;
      kindCounts[it.kind] = (kindCounts[it.kind] ?? 0) + 1;
    }
    if (q.kind !== undefined && it.kind !== q.kind) continue;
    if (fails === 0) match.push(it);
    if (fails <= 1) {
      for (const g of vis) {
        if (fails === 1 && failKey !== g) continue;
        for (const v of it.values.get(g) ?? []) (counts[g] ??= {})[v.value] = (counts[g]?.[v.value] ?? 0) + 1;
      }
    }
  }
  const desc = (a: string | null, b: string | null): number => (a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? 1 : -1);
  const order = q.sort ?? "newest";
  match.sort((a, b) =>
    order === "name"
      ? a.bad - b.bad || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) || a.seq - b.seq
      : order === "kind"
        ? a.bad - b.bad || a.kindOrd - b.kindOrd || desc(a.at, b.at) || b.seq - a.seq
        : a.bad - b.bad || desc(a.at, b.at) || b.seq - a.seq,
  );
  const offset = q.offset ?? 0;
  return { total: match.length, kindCounts, groups: counts, first: match.slice(offset, offset + q.limit).map((m) => m.id) };
}

const flat = (p: LibraryPage): Record<string, Record<string, number>> =>
  Object.fromEntries(
    p.groups.flatMap((g) => {
      const counted = g.values.filter((v) => v.count > 0);
      return counted.length === 0 ? [] : [[g.key, Object.fromEntries(counted.map((v) => [v.value, v.count]))]];
    }),
  );

/** Seeded queries of every shape the rail and the search field produce. */
function queries(n: number): LibraryQuery[] {
  const rnd = prng(0x0b49);
  const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)] as T;
  const out: LibraryQuery[] = [];
  for (let i = 0; i < n; i++) {
    const kind = rnd() < 0.3 ? undefined : pick(["image", "plate", "style", "motion", "audio", "video", "doc"] as const);
    const pool = ref.filter((r) => kind === undefined || r.kind === kind);
    const facets: Record<string, string[]> = {};
    const groups = railGroups(kind ?? "all").map((g) => g.key);
    const nGroups = Math.floor(rnd() * 4);
    for (let j = 0; j < nGroups; j++) {
      const g = pick(groups);
      const vals = [...new Set(pool.flatMap((r) => (r.values.get(g) ?? []).map((v) => v.value)))];
      if (vals.length === 0) continue;
      facets[g] = [...new Set([pick(vals), ...(rnd() < 0.4 ? [pick(vals)] : []), ...(rnd() < 0.1 ? ["no-such-value"] : [])])];
    }
    const shape = rnd();
    const someone = pick(pool.length > 0 ? pool : ref);
    const word = pick(someone.text.filter((t) => t.length > 2)) ?? "x";
    const q = shape < 0.4 ? "" : shape < 0.6 ? word.slice(0, 2 + Math.floor(rnd() * 3)) : shape < 0.75 ? `${word} ${pick(someone.text)}` : shape < 0.9 ? `mood:${pick(["tense", "warm", "dark"])}` : `state:${pick(["rat", "unj", "cand"])} ${word.slice(0, 3)}`;
    const sort = pick(["newest", "name", "kind"] as const);
    out.push({ ...(kind === undefined ? {} : { kind }), q, facets, sort, offset: rnd() < 0.2 ? Math.floor(rnd() * 40) : 0, limit: 25 });
  }
  return out;
}

describe("the index answers the prototype's rule", () => {
  it("holds every total, kind count, group count and page order to the reference over 200 queries", () => {
    let nonEmpty = 0;
    for (const q of queries(200)) {
      const got = queryLibrary(k.store, q);
      if (!got.ok) throw got.error;
      const want = reference(q);
      const label = JSON.stringify(q);
      expect(got.value.total, label).toBe(want.total);
      expect(Object.fromEntries(Object.entries(got.value.kindCounts).filter(([, n]) => n > 0)), label).toEqual(want.kindCounts);
      // A group past LIBRARY_GROUP_TOP shows its largest values and counts the rest
      // in `more`; every value shown must still carry the reference's count.
      const shown = flat(got.value);
      for (const g of got.value.groups.filter((x) => x.more > 0)) {
        const all = want.groups[g.key] ?? {};
        for (const [v, n] of Object.entries(shown[g.key] ?? {})) expect(n, `${label} ${g.key}:${v}`).toBe(all[v]);
        expect(g.values.length + g.more, label).toBe(Object.keys(all).length + g.values.filter((v) => v.count === 0).length);
        const smallestShown = Math.min(...g.values.filter((v) => v.count > 0).map((v) => v.count));
        expect(Object.values(all).filter((n) => n > smallestShown).length, label).toBeLessThanOrEqual(g.values.length);
        delete shown[g.key];
        delete want.groups[g.key];
      }
      expect(shown, label).toEqual(want.groups);
      expect(got.value.items.map((i) => i.id), label).toEqual(want.first);
      if (want.total > 0) nonEmpty++;
    }
    // A generator that only produced empty matches would agree with anything.
    expect(nonEmpty).toBeGreaterThan(80);
  });

  it("keeps a selected value with no matches on the rail at 0", () => {
    const got = queryLibrary(k.store, { kind: "audio", facets: { mood: ["no-such-mood"] }, limit: 5 });
    if (!got.ok) throw got.error;
    const mood = got.value.groups.find((g) => g.key === "mood");
    expect(mood?.values.find((v) => v.value === "no-such-mood")).toMatchObject({ count: 0, selected: true });
    expect(got.value.total).toBe(0);
  });
});
