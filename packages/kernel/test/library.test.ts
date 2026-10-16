import { afterEach, describe, expect, it } from "vitest";
import type { MediaFacts } from "@gt/domain/library";
import type { LibraryItemInput } from "@gt/domain/libraryItem";
import { events } from "./library.fixtures.ts";
import { bucketPeaks, ftsExpression, type IndexContext, type LibraryEntry } from "../src/library/core.ts";
import { chooseCover, libraryDetail } from "../src/library/detail.ts";
import { queryLibrary } from "../src/library/query.ts";
import { actOnItem, factsMissing, pruneFeed, putMediaFacts, upsertItems } from "../src/library/write.ts";
import { openKernel, type Kernel } from "../src/kernel.ts";
import type { Store } from "../src/store.ts";
import { must } from "./helpers.ts";

// The Library index's write path and its invariants: idempotent upsert, the
// counts table kept by trigger, prune, media facts moving attention and the
// sort, the operator's acts surviving a re-projection, the search door, and the
// detail's lineage. The counting rule itself is held to the prototype's by
// tests/next-server/library-index.test.ts over a 3,000-item corpus.

const open: Kernel[] = [];
afterEach(() => {
  for (const k of open.splice(0)) k.close();
});
function store(): Store {
  const k = must(openKernel(":memory:"));
  open.push(k);
  return k.store;
}

const SHA = (c: string): string => c.repeat(64);
const CTX: IndexContext = {
  styleOf: (id) => (id === "painted-3d" ? { name: "Painted 3D", family: "animation", observables: { render_mode: "painterly", black_handling: "crushed" } } : undefined),
};
const operator = { kind: "operator" as const, id: "op" };

function plate(id: string, over: Partial<LibraryItemInput> = {}, sha?: string): LibraryEntry {
  const item = {
    kind: "plate",
    id,
    title: `Plate ${id}`,
    state: "unjudged",
    collections: [],
    origin: "forge",
    rights: { use: "unknown" },
    source: "fixture",
    lineage: [{ kind: "run", id: "run-1" }],
    vocabulary: { station: "forge", styleId: "painted-3d", mechanism: "text" },
    at: "2026-10-01T00:00:00.000Z",
    ...(sha === undefined ? {} : { media: { sha256: sha, bytes: 10, mime: "image/png" } }),
    ...over,
  } as const;
  return { item: item as LibraryItemInput, meta: "text · s1", extras: {}, feed: "test" };
}
const audio = (id: string, mood: string[]): LibraryEntry => ({
  item: {
    kind: "audio",
    id,
    title: `Take ${id}`,
    state: "ratified",
    collections: [],
    origin: "suno",
    rights: { use: "publishable" },
    source: "fixture",
    lineage: [],
    vocabulary: { type: "music", genre: ["ambient"], mood, instrument: ["piano"], provider: "suno", durationS: 30 },
  },
  meta: "30 s",
  extras: {},
  feed: "test",
});
const facts = (sha: string, over: Partial<MediaFacts> = {}): MediaFacts => ({
  sha,
  decodable: true,
  mime: "image/png",
  w: 10,
  h: 10,
  durationS: null,
  posterSha: null,
  meanLuma: 120,
  nearBlack: false,
  probedAt: "2026-10-17T00:00:00.000Z",
  error: null,
  ...over,
});

const page = (s: Store, q: Parameters<typeof queryLibrary>[1]) => must(queryLibrary(s, q));
const counts = (s: Store, kind?: "plate" | "audio") => {
  const p = page(s, { ...(kind === undefined ? {} : { kind }), limit: 0 });
  return Object.fromEntries(p.groups.map((g) => [g.key, Object.fromEntries(g.values.map((v) => [v.value, v.count]))]));
};
/** The counts the trigger-kept table claims, recomputed by brute force. */
const brute = (s: Store) =>
  must(
    s.read((r) => ({
      table: r.all("SELECT grp, kind, value, n FROM library_counts ORDER BY grp, kind, value"),
      facets: r.all("SELECT grp, kind, value, count(*) AS n FROM library_facets GROUP BY grp, kind, value ORDER BY grp, kind, value"),
      columns: r.all(
        "SELECT grp, kind, value, count(*) AS n FROM (SELECT 'state' AS grp, kind, state AS value FROM library_items UNION ALL SELECT 'origin', kind, origin FROM library_items UNION ALL SELECT 'source', kind, source FROM library_items UNION ALL SELECT 'attention', kind, attention FROM library_items WHERE attention IS NOT NULL) GROUP BY grp, kind, value ORDER BY grp, kind, value",
      ),
    })),
  );

describe("upsertItems", () => {
  it("is idempotent: a re-projection of unchanged items writes nothing", () => {
    const s = store();
    expect(must(upsertItems(s, [plate("p1"), plate("p2")], CTX))).toEqual({ inserted: 2, updated: 0, unchanged: 0 });
    expect(must(upsertItems(s, [plate("p1"), plate("p2")], CTX))).toEqual({ inserted: 0, updated: 0, unchanged: 2 });
    expect(must(upsertItems(s, [plate("p1", { state: "ratified" })], CTX))).toEqual({ inserted: 0, updated: 1, unchanged: 0 });
  });
  it("reads a plate's family and observables through its style", () => {
    const s = store();
    must(upsertItems(s, [plate("p1")], CTX));
    const c = counts(s, "plate");
    expect(c["family"]).toEqual({ animation: 1 });
    expect(c["render_mode"]).toEqual({ painterly: 1 });
    expect(c["style"]).toEqual({ "painted-3d": 1 });
    const g = page(s, { kind: "plate", limit: 0 }).groups.find((x) => x.key === "style");
    expect(g?.values[0]?.label).toBe("Painted 3D");
  });
  it("refuses an item its door refuses, whole, before a row is written", () => {
    const s = store();
    const bad = plate("p2", { source: "derived", lineage: [] });
    const r = upsertItems(s, [plate("p1"), bad], CTX);
    expect(r.ok).toBe(false);
    expect(page(s, { limit: 0 }).total).toBe(0);
  });
  it("keeps the counts table equal to a recount through inserts, updates, prunes and acts", () => {
    const s = store();
    must(upsertItems(s, [plate("p1", {}, SHA("a")), plate("p2"), audio("a1", ["tense", "dark"]), audio("a2", ["warm"])], CTX));
    must(upsertItems(s, [plate("p1", { state: "rejected" }, SHA("a")), audio("a2", ["tense"])], CTX));
    must(putMediaFacts(s, [facts(SHA("a"), { decodable: false, error: "moov atom not found", meanLuma: null })]));
    must(actOnItem(s, "a1", { act: "pin" }, operator));
    must(pruneFeed(s, "test", new Set(["p1", "a1", "a2"])));
    const b = brute(s);
    const merged = [...b.facets, ...b.columns].map((x) => `${String(x["grp"])}|${String(x["kind"])}|${String(x["value"])}=${String(x["n"])}`).sort();
    expect(b.table.map((x) => `${String(x["grp"])}|${String(x["kind"])}|${String(x["value"])}=${String(x["n"])}`).sort()).toEqual(merged);
  });
});

describe("pruneFeed", () => {
  it("removes what the feed no longer holds - its rows, its facets, its text - and nothing else", () => {
    const s = store();
    must(upsertItems(s, [plate("p1"), plate("p2")], CTX));
    must(upsertItems(s, [{ ...audio("a1", ["tense"]), feed: "other" }], CTX));
    expect(must(pruneFeed(s, "test", new Set(["p1"])))).toBe(1);
    expect(page(s, { limit: 10 }).items.map((i) => i.id).sort()).toEqual(["a1", "p1"]);
    expect(page(s, { q: "p2", limit: 10 }).total).toBe(0);
  });
});

describe("media facts", () => {
  it("flags a missing medium at upsert and an undecodable one when its facts land, and sinks both", () => {
    const s = store();
    must(upsertItems(s, [plate("ok", { at: "2026-10-01T00:00:00.000Z" }, SHA("a")), plate("gone", { at: "2026-10-09T00:00:00.000Z" }), plate("broken", { at: "2026-10-05T00:00:00.000Z" }, SHA("b"))], CTX));
    expect(must(factsMissing(s, 10)).map((f) => f.sha).sort()).toEqual([SHA("a"), SHA("b")]);
    must(putMediaFacts(s, [facts(SHA("a")), facts(SHA("b"), { decodable: false, error: "invalid data found", meanLuma: null })]));
    expect(must(factsMissing(s, 10))).toEqual([]);
    const p = page(s, { kind: "plate", limit: 10 });
    expect(p.items.map((i) => [i.id, i.attention ?? null])).toEqual([
      ["ok", null],
      ["gone", "missing"],
      ["broken", "unreadable"],
    ]);
    expect(page(s, { kind: "plate", facets: { attention: ["unreadable"] }, limit: 10 }).items.map((i) => i.id)).toEqual(["broken"]);
    // A re-probe that decodes clears it, by the same trigger.
    must(putMediaFacts(s, [facts(SHA("b"))]));
    expect(page(s, { kind: "plate", facets: { attention: ["unreadable"] }, limit: 10 }).total).toBe(0);
  });
  it("holds nearBlack to the luma rule and an undecodable blob to its words", () => {
    const s = store();
    expect(putMediaFacts(s, [facts(SHA("c"), { meanLuma: 9, nearBlack: false })]).ok).toBe(false);
    expect(putMediaFacts(s, [facts(SHA("c"), { meanLuma: 40, nearBlack: true })]).ok).toBe(false);
    expect(putMediaFacts(s, [facts(SHA("c"), { decodable: false, meanLuma: null })]).ok).toBe(false);
    expect(must(putMediaFacts(s, [facts(SHA("c"), { meanLuma: 9, nearBlack: true })]))).toBe(1);
  });
  it("leads a set with a cover that decodes and is not near-black", () => {
    const s = store();
    must(upsertItems(s, [plate("dark", {}, SHA("d")), plate("bright", {}, SHA("e")), plate("none")], CTX));
    must(putMediaFacts(s, [facts(SHA("d"), { meanLuma: 3, nearBlack: true }), facts(SHA("e"))]));
    expect(must(chooseCover(s, ["none", "dark", "bright"]))).toBe("bright");
    expect(must(chooseCover(s, ["none", "dark"]))).toBe("dark");
    const row = page(s, { q: "id:dark", limit: 1 }).items[0];
    expect(row?.cover).toEqual({ blobSha: SHA("d"), mime: "image/png", nearBlack: true });
  });
});

describe("the operator's acts", () => {
  it("pins with an event, survives a re-projection and a prune-and-return, and unpins", () => {
    const s = store();
    must(upsertItems(s, [audio("a1", ["tense"])], CTX));
    expect(must(actOnItem(s, "a1", { act: "pin" }, operator)).changed).toBe(true);
    expect(must(actOnItem(s, "a1", { act: "pin" }, operator)).changed).toBe(false);
    must(upsertItems(s, [audio("a1", ["warm"])], CTX));
    expect(page(s, { facets: { pin: ["pinned"] }, limit: 5 }).items.map((i) => i.id)).toEqual(["a1"]);
    must(pruneFeed(s, "test", new Set()));
    must(upsertItems(s, [audio("a1", ["warm"])], CTX));
    expect(page(s, { facets: { pin: ["pinned"] }, limit: 5 }).total).toBe(1);
    expect(must(libraryDetail(s, "a1")).acts).toEqual(["unpin", "use-in-project"]);
    must(actOnItem(s, "a1", { act: "unpin" }, operator));
    expect(page(s, { facets: { pin: ["pinned"] }, limit: 5 }).total).toBe(0);
    expect(must(events(s)).map((e) => e.type)).toEqual(["library.pinned", "library.unpinned"]);
  });
  it("refuses an act on an item the index does not hold", () => {
    const r = actOnItem(store(), "nope", { act: "pin" }, operator);
    expect(!r.ok && r.error.code).toBe("not-found");
  });
});

describe("the search door", () => {
  it("quotes every word, so FTS5's operators and a stray quote are words", () => {
    expect(ftsExpression(["not", 'a"b', "near"])).toBe('"not"* AND "a""b"* AND "near"*');
    const s = store();
    must(upsertItems(s, [audio("a1", ["tense"])], CTX));
    for (const q of ['NOT "', "OR AND", "a*", "^x", "(take"]) expect(queryLibrary(s, { q, limit: 5 }).ok, q).toBe(true);
    expect(page(s, { q: "(take", limit: 5 }).total).toBe(1);
  });
  it("matches a word by prefix and folds diacritics", () => {
    const s = store();
    must(upsertItems(s, [{ ...audio("a1", ["tense"]), item: { ...audio("a1", ["tense"]).item, title: "Café noir" } }], CTX));
    expect(page(s, { q: "CAFE no", limit: 5 }).total).toBe(1);
    expect(page(s, { q: "afe", limit: 5 }).total).toBe(0);
  });
  it("refuses an unbounded page and a facet key that is not a rail group", () => {
    const s = store();
    expect(queryLibrary(s, { limit: 501 }).ok).toBe(false);
    expect(queryLibrary(s, { facets: { kind: ["plate"] }, limit: 5 }).ok).toBe(false);
  });
});

describe("the row's designed face", () => {
  it("carries an audio item's waveform, bucketed to 64, and a style's swatch", () => {
    const s = store();
    const peaks = Array.from({ length: 200 }, (_, i) => (i === 7 ? 1 : 0.25));
    const take = audio("a1", ["tense"]);
    const facts = { asked: { tempoBpm: null, key: null, durationS: 30 }, measured: null };
    must(upsertItems(s, [{ ...take, extras: { audio: { prompt: "p", reasons: [], facts, peaks, src: null } } }], CTX));
    const row = page(s, { kind: "audio", limit: 1 }).items[0];
    expect(row?.peaks).toHaveLength(64);
    expect(row?.peaks?.[2]).toBe(1);
    expect(row?.palette).toBeUndefined();
    expect(bucketPeaks([0.5, 0.25])).toEqual([0.5, 0.25]);
  });
});

describe("libraryDetail", () => {
  it("resolves lineage against the index: the run filters, the style opens its item", () => {
    const s = store();
    const style: LibraryEntry = {
      item: { kind: "style", id: "style:painted-3d", title: "Painted 3D", state: "ratified", collections: [], origin: "extract", rights: { use: "publishable" }, source: "real", lineage: [], vocabulary: { styleId: "painted-3d", derivation: "readback" } },
      meta: "animation",
      extras: { prompt: "painted", observables: { render_mode: "painterly" } },
      feed: "test",
    };
    must(upsertItems(s, [plate("p1"), style], CTX));
    const d = must(libraryDetail(s, "p1"));
    expect(d.lineage.map((n) => n.role)).toEqual(["run", "this", "style"]);
    expect(d.lineage[0]?.facet).toEqual({ group: "run", value: "run-1" });
    expect(d.lineage[2]?.itemId).toBe("style:painted-3d");
    expect(d.vocabulary.map((g) => g.key).slice(0, 3)).toEqual(["style", "family", "render_mode"]);
    expect(must(libraryDetail(s, "style:painted-3d")).extras.prompt).toBe("painted");
    const missing = libraryDetail(s, "nope");
    expect(!missing.ok && missing.error.code).toBe("not-found");
  });
});
