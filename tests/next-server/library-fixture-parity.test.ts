import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ok, type Result } from "@gt/domain/errors";
import type { LibraryPage, LibraryQuery, MediaFacts } from "@gt/domain/library";
import { queryEvents } from "@gt/kernel/events-query";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { libraryDetail } from "@gt/kernel/library/detail";
import { queryLibrary } from "@gt/kernel/library/query";
import { putMediaFacts, upsertItems, type MarkAct } from "@gt/kernel/library/write";

import { fixtureAct, fixtureActs, fixtureDetail, fixtureQuery, resetLibraryFixture } from "../../app/(studio)/library/_port/fixture.ts";
import { buildCorpus } from "../../app/(studio)/library/_port/fixtureCorpus.ts";
import { PROJECTS, STYLES } from "../../app/(studio)/library/_port/fixtureData.ts";
import { makeRealLibrary, type ServerLibrary } from "../../app/(studio)/library/_port/real.ts";

// THE FIXTURE INDEX ANSWERS WHAT THE KERNEL'S INDEX ANSWERS, OVER THE SAME ITEMS. GRAVITONE_PRODUCE_SIDE
// =fixture is how the Library is built and photographed, so a count, a label, an order or a refusal
// the fixture gives and the kernel cannot is a screen designed against a port that does not exist.
// The fixture's own corpus is loaded into a kernel in memory through the projection's door
// (upsertItems, and the media facts it carries), and each case asks BOTH sides the same question.

let k: Kernel;
const corpus = buildCorpus();

/** A kernel in memory holding `records` as the projection would write them, and the projects. */
function kernelOf(records: typeof corpus): Kernel {
  const opened = openKernel(":memory:");
  if (!opened.ok) throw opened.error;
  const store = opened.value.store;
  const up = upsertItems(
    store,
    records.map((x) => ({ item: x.raw, meta: x.row.meta, extras: x.extras, feed: "fixture" })),
    {
      styleOf: (id) => {
        const s = STYLES.find((st) => st.id === id);
        return s === undefined ? undefined : { name: s.name, family: s.family, observables: s.obs };
      },
      projectTitle: (id) => PROJECTS.find((p) => p.id === id)?.title,
    },
  );
  if (!up.ok) throw up.error;
  // One fact a blob: the corpus names one public file under one sha for many items.
  const facts = new Map<string, MediaFacts>();
  for (const x of records) if (x.media !== null && !facts.has(x.media.sha)) facts.set(x.media.sha, x.media);
  const f = putMediaFacts(store, [...facts.values()]);
  if (!f.ok) throw f.error;
  const p = store.tx((t) => {
    for (const pr of PROJECTS) t.run("INSERT INTO projects (id, rev, listed, updated_at, record) VALUES (?, 1, 1, ?, ?)", pr.id, "2026-10-15T00:00:00.000Z", JSON.stringify({ id: pr.id, title: pr.title }));
  });
  if (!p.ok) throw p.error;
  return opened.value;
}

beforeAll(() => {
  k = kernelOf(corpus);
});
afterAll(() => k.close());
beforeEach(() => resetLibraryFixture());

function pages(q: LibraryQuery): { readonly fixture: LibraryPage; readonly real: LibraryPage } {
  const f = fixtureQuery(q);
  const r = queryLibrary(k.store, q);
  if (!f.ok) throw f.error;
  if (!r.ok) throw r.error;
  return { fixture: f.value, real: r.value };
}

const RAILS: readonly [string, LibraryQuery][] = [
  ["everything", { limit: 0 }],
  ["audio", { kind: "audio", limit: 0 }],
  ["plates", { kind: "plate", limit: 0 }],
  ["documents", { kind: "doc", limit: 0 }],
  ["models", { kind: "model", limit: 0 }],
  ["characters", { kind: "character", limit: 0 }],
];

describe("a rail value is labelled as the index labels it", () => {
  // The index labels a value from what the projection wrote: a hunt and a bundle by their ids, an
  // attention value by its own word (kernel library/core.ts facetsOf, counts.ts fallbackLabel).
  const labels = (p: LibraryPage): string[] => p.groups.flatMap((g) => g.values.map((v) => `${g.key}:${v.value} = ${v.label}`)).sort();
  for (const [name, q] of RAILS) {
    it(name, () => {
      const { fixture, real } = pages(q);
      expect(labels(fixture)).toEqual(labels(real));
    });
  }
});

describe("a free word finds what the index's search text holds", () => {
  // The index searches the title, the meta and its haystack: the id, every facet value and label,
  // the lineage ids, the state and the origin (kernel library/core.ts indexRowOf) - not the source,
  // not the attention column, and nothing the projection never wrote.
  const WORDS = ["fixture", "derived", "media", "chalk", "rain city", "ratified", "suno", "image 0003", "plate-0001", "flywheel"];
  for (const q of WORDS) {
    it(q, () => {
      const { fixture, real } = pages({ q, limit: 500 });
      expect({ total: fixture.total, kinds: fixture.kindCounts }).toEqual({ total: real.total, kinds: real.kindCounts });
    });
  }
});

describe("the kind counts are the index's: under the shared groups and the search only", () => {
  // @gt/domain/library LibraryPage.kindCounts; kernel library/counts.ts kindCountsOf.
  const CASES: readonly [string, LibraryQuery][] = [
    ["a kind and its own vocabulary", { kind: "audio", facets: { mood: ["tense"] }, limit: 0 }],
    ["a kind, vocabulary and a shared group", { kind: "plate", facets: { station: ["forge"], state: ["ratified"] }, limit: 0 }],
    ["a kind, vocabulary and a word", { kind: "doc", q: "search", facets: { bundle: ["software-engineering"] }, limit: 0 }],
  ];
  for (const [name, q] of CASES) {
    it(name, () => {
      const { fixture, real } = pages(q);
      expect(fixture.kindCounts).toEqual(real.kindCounts);
    });
  }
});

describe("a page is the same window of the same order", () => {
  // kernel library/query.ts ORDER: a tie on the date falls to the newer write (seq DESC), and an
  // undated item sorts after every dated one. The fixture's corpus order is the kernel's seq here.
  const WINDOWS: readonly [string, LibraryQuery][] = [
    ["newest, the first page", { limit: 500 }],
    ["newest, the undated tail", { offset: 4500, limit: 500 }],
    ["by kind, the undated documents", { sort: "kind", offset: 4400, limit: 500 }],
    ["by name", { sort: "name", offset: 2000, limit: 500 }],
    ["models, one night", { kind: "model", limit: 10 }],
    ["characters", { kind: "character", limit: 10 }],
  ];
  for (const [name, q] of WINDOWS) {
    it(name, () => {
      const { fixture, real } = pages(q);
      expect(fixture.items.map((r) => r.id)).toEqual(real.items.map((r) => r.id));
    });
  }
});

describe("a key:value token matches what the index's clause matches", () => {
  // kernel library/clauses.ts clausesOf: `id:` is a substring of the id, `kind:` a substring of a
  // kind or its short label, a column token a substring of the column's value alone.
  const TOKENS = ["id:0042", "id:MODEL:mesh", "kind:ate", "kind:doc", "attention:media", "attention:miss", "state:rat", "mood:ten"];
  for (const q of TOKENS) {
    it(q, () => {
      const { fixture, real } = pages({ q, limit: 500 });
      expect({ total: fixture.total, kinds: fixture.kindCounts, ids: fixture.items.map((r) => r.id) }).toEqual({ total: real.total, kinds: real.kindCounts, ids: real.items.map((r) => r.id) });
    });
  }
});

describe("a query the index's door refuses, the fixture refuses", () => {
  // kernel library/clauses.ts querySchema: a facet key is a rail group, an offset at most 1,000,000.
  const REFUSED: readonly [string, LibraryQuery][] = [
    ["a group no rail holds", { facets: { nope: ["x"] }, limit: 10 }],
    ["an offset past the index's bound", { offset: 2_000_000, limit: 10 }],
    ["an empty facet value", { kind: "audio", facets: { mood: [""] }, limit: 10 }],
    ["a fractional limit", { limit: 1.5 }],
  ];
  for (const [name, q] of REFUSED) {
    it(name, () => {
      const f = fixtureQuery(q);
      const r = queryLibrary(k.store, q);
      expect(f.ok ? "ok" : [f.error.code, f.error.message]).toEqual(r.ok ? "ok" : [r.error.code, r.error.message]);
    });
  }
});

describe("an act answers what the kernel answers, and leaves the events it leaves", () => {
  // A kernel of its own (the first items of the corpus), so the acts never move the pages above.
  let acts: Kernel;
  let lib: ServerLibrary;
  beforeAll(() => {
    acts = kernelOf(corpus.slice(0, 40));
    lib = makeRealLibrary({ store: () => ok(acts.store), atelierOf: (id) => `/library/style/${id}` });
  });
  afterAll(() => acts.close());
  const image = (n: number): string => corpus.filter((x) => x.raw.kind === "image")[n]?.raw.id ?? "";

  /** An answer as a comparable shape: what was said, or the refusal's code and words. */
  const said = <T,>(r: Result<T>, words: (v: T) => string): string => (r.ok ? words(r.value) : `${r.error.code}: ${r.error.message}`);
  const both = (id: string, act: MarkAct): { fixture: string; real: string } => ({
    fixture: said(fixtureAct(id, act, () => "2026-10-25T00:00:00.000Z"), (v) => v.said),
    real: said(lib.act(id, act, {}), (v) => v.said),
  });
  const realEvents = (id: string): string[] => {
    const e = queryEvents(acts.store, { order: "asc", limit: 200 });
    if (!e.ok) throw e.error;
    return e.value.events.filter((x) => x.subject.id === id && x.type.startsWith("library.")).map((x) => x.type);
  };
  const fixtureEvents = (id: string): string[] => fixtureActs().filter((a) => a.id === id).map((a) => a.type);

  it("an item the index does not hold", () => {
    const d = fixtureDetail("image-9999");
    const r = lib.detail("image-9999", {});
    expect(d.ok ? "ok" : d.error.message).toBe(r.ok ? "ok" : r.error.message);
    const a = both("image-9999", { act: "pin" });
    expect(a.fixture).toBe(a.real);
  });

  it("pin, pin again, unpin, unpin again", () => {
    const id = image(0);
    for (const act of [{ act: "pin" }, { act: "pin" }, { act: "unpin" }, { act: "unpin" }] as const) {
      const a = both(id, act);
      expect(a.fixture, act.act).toBe(a.real);
    }
    expect(fixtureEvents(id)).toEqual(realEvents(id));
  });

  it("use in a project twice: one event, as the kernel writes one", () => {
    const id = image(1);
    const projectId = PROJECTS[0]?.id ?? "";
    for (let i = 0; i < 2; i++) {
      const a = both(id, { act: "use-in-project", projectId });
      expect(a.fixture).toBe(a.real);
    }
    expect(fixtureEvents(id)).toEqual(realEvents(id));
    const gone = both(id, { act: "use-in-project", projectId: "prj-nope" });
    expect(gone.fixture).toBe(gone.real);
  });

  it("a pin into a named collection is its own mark; the default pin still answers", () => {
    const id = image(2);
    for (const act of [{ act: "pin", collection: "moodboard" }, { act: "pin" }, { act: "unpin", collection: "moodboard" }] as const) {
      const a = both(id, act);
      expect(a.fixture, JSON.stringify(act)).toBe(a.real);
    }
    const d = fixtureDetail(id);
    const r = lib.detail(id, {});
    expect(d.ok && d.value.acts).toEqual(r.ok && r.value.acts);
    expect(fixtureEvents(id)).toEqual(realEvents(id));
  });
});

describe("a detail lists the vocabulary the index lists", () => {
  // kernel library/detail.ts vocabularyOf: every facet group the item holds, in rail order, each
  // group's values in value order; the row's chips are the first of each (query.ts chipsFor).
  const KINDS = ["image", "plate", "style", "motion", "audio", "video", "doc", "model", "character"] as const;
  for (const kind of KINDS) {
    it(kind, () => {
      const ids = corpus.filter((x) => x.raw.kind === kind).slice(0, 40).map((x) => x.raw.id);
      const shown = (id: string, side: "fixture" | "real") => {
        const d = side === "fixture" ? fixtureDetail(id) : libraryDetail(k.store, id);
        if (!d.ok) throw d.error;
        return { id, vocabulary: d.value.vocabulary, chips: d.value.row.chips };
      };
      expect(ids.map((id) => shown(id, "fixture"))).toEqual(ids.map((id) => shown(id, "real")));
    });
  }
});
