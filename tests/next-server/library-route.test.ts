// The Library route's server half (Phase 5, L50): the fixture index keeps the index's rules (the
// screen is built against it, so a lenient fixture would let a screen pass that the real index
// breaks), the one presentation mapping both sides share, and the address. Behaviour only.
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { fixtureAct, fixtureDetail, fixtureEverything, fixtureQuery, resetLibraryFixture } from "../../app/(studio)/library-next/_port/fixture.ts";
import { cardOf, gotoFor, lineageOf, type Media } from "../../app/(studio)/library-next/_port/present.ts";
import { hrefOf, identity, parseUrl, toggled, withKind, DEFAULT_URL } from "../../app/(studio)/library-next/_library/url.ts";
import type { LibraryPage, LibraryRow } from "@gt/domain/library";

const page = (r: ReturnType<typeof fixtureQuery>): LibraryPage => {
  if (!r.ok) throw r.error;
  return r.value;
};
const count = (p: LibraryPage, g: string, v: string): number => p.groups.find((x) => x.key === g)?.values.find((x) => x.value === v)?.count ?? -1;

beforeEach(() => resetLibraryFixture());

describe("the fixture index keeps the index's rules", () => {
  test("the corpus is the prototype's 5,000, every kind present", () => {
    expect(fixtureEverything()).toBe(5000);
    const all = page(fixtureQuery({ limit: 0 }));
    expect(all.total).toBe(5000);
    for (const k of ["image", "plate", "style", "motion", "audio", "video", "doc"] as const) expect(all.kindCounts[k]).toBeGreaterThan(0);
  });

  test("OR within a group, AND across groups", () => {
    const tense = page(fixtureQuery({ kind: "audio", facets: { mood: ["tense"] }, limit: 0 })).total;
    const warm = page(fixtureQuery({ kind: "audio", facets: { mood: ["warm"] }, limit: 0 })).total;
    const both = page(fixtureQuery({ kind: "audio", facets: { mood: ["tense", "warm"] }, limit: 0 })).total;
    expect(both).toBeGreaterThan(Math.max(tense, warm));
    expect(both).toBeLessThanOrEqual(tense + warm);
    const across = page(fixtureQuery({ kind: "audio", facets: { mood: ["tense"], type: ["sfx"] }, limit: 500 }));
    expect(across.total).toBeLessThan(tense);
    for (const r of across.items.slice(0, 20)) {
      const d = fixtureDetail(r.id);
      if (!d.ok) throw d.error;
      const vals = (k: string) => d.value.vocabulary.find((x) => x.key === k)?.values.map((x) => x.value) ?? [];
      expect(vals("mood")).toContain("tense");
      expect(vals("type")).toEqual(["sfx"]);
    }
  });

  test("a group's counts leave its own selection out: each value's count is what selecting it alone would give", () => {
    const p = page(fixtureQuery({ kind: "audio", facets: { mood: ["tense"], type: ["music"] }, limit: 0 }));
    for (const mood of ["warm", "ominous", "tense"]) {
      const alone = page(fixtureQuery({ kind: "audio", facets: { mood: [mood], type: ["music"] }, limit: 0 })).total;
      expect(count(p, "mood", mood), mood).toBe(alone);
    }
  });

  test("the kind counts honour only the shared groups; a pressed value at 0 is still sent", () => {
    const p = page(fixtureQuery({ kind: "audio", facets: { mood: ["no-such-mood"], state: ["ratified"] }, limit: 0 }));
    expect(p.total).toBe(0);
    expect(p.kindCounts.plate).toBe(page(fixtureQuery({ kind: "plate", facets: { state: ["ratified"] }, limit: 0 })).total);
    const v = p.groups.find((g) => g.key === "mood")?.values.find((x) => x.value === "no-such-mood");
    expect(v).toMatchObject({ count: 0, selected: true });
  });

  test("the search grammar: free words prefix a word; key:value hits a facet; kind: narrows", () => {
    const words = page(fixtureQuery({ q: "chal", limit: 500 }));
    expect(words.total).toBeGreaterThan(0);
    const tok = page(fixtureQuery({ q: "mood:tense kind:audio", limit: 500 }));
    expect(tok.total).toBe(page(fixtureQuery({ kind: "audio", facets: { mood: ["tense"] }, limit: 0 })).total);
    expect(tok.parsed.tokens.map((t) => t.key)).toEqual(["mood", "kind"]);
  });

  test("pages are windows of one order; media that cannot show sorts last", () => {
    const a = page(fixtureQuery({ limit: 120 }));
    const b = page(fixtureQuery({ offset: 120, limit: 120 }));
    expect(new Set([...a.items, ...b.items].map((r) => r.id)).size).toBe(240);
    const tail = page(fixtureQuery({ offset: 4990, limit: 10 }));
    expect(tail.items.every((r) => r.attention !== undefined)).toBe(true);
    expect(fixtureQuery({ limit: 501 }).ok).toBe(false);
  });

  test("an act is written once: a second pin is a conflict; the pin facet counts it", () => {
    const id = page(fixtureQuery({ limit: 1 })).items[0]?.id ?? "";
    expect(fixtureAct(id, { act: "pin" }, () => "t").ok).toBe(true);
    const again = fixtureAct(id, { act: "pin" }, () => "t");
    expect(again.ok ? "" : again.error.code).toBe("conflict");
    expect(count(page(fixtureQuery({ limit: 0 })), "pin", "pinned")).toBe(1);
    const d = fixtureDetail(id);
    expect(d.ok && d.value.acts).toContain("unpin");
  });
});

describe("one presentation for both sides", () => {
  const m: Media = { url: (sha) => `/blob/${sha}`, look: () => ({ peaks: [0.5] }), ledger: (id) => `/ledger?q=${id}` };
  const row = (over: Partial<LibraryRow>): LibraryRow => ({ id: "x", kind: "video", title: "T", meta: "m", state: "unjudged", origin: "studio", source: "fixture", date: "2026-10-01T00:00:00Z", cover: { blobSha: "abc", mime: "image/jpeg", nearBlack: false }, chips: [], ...over });

  test("a cover becomes the picture; media trouble becomes the designed face, never a broken image", () => {
    expect(cardOf(row({}), m).face).toEqual({ kind: "poster", url: "/blob/abc" });
    expect(cardOf(row({ attention: "unreadable" }), m).face.kind).toBe("designed");
    expect(cardOf(row({ kind: "audio" }), m).face).toEqual({ kind: "wave", peaks: [0.5] });
    expect(cardOf(row({ kind: "style", cover: { blobSha: null, mime: null, nearBlack: false } }), m).face.kind).toBe("swatch");
    expect(cardOf(row({}), m).date).toBe("2026-10-01");
  });

  test("lineage is one line per role, and a facet that is not this kind's switches kind", () => {
    const lines = lineageOf(
      [
        { role: "styles", ref: { kind: "style", id: "a" }, label: "A", itemId: "style-1" },
        { role: "styles", ref: { kind: "style", id: "b" }, label: "B" },
        { role: "this", ref: { kind: "self", id: "x" }, label: "image" },
      ],
      "image",
      m,
    );
    expect(lines.map((l) => [l.role, l.refs.length, l.self === true])).toEqual([
      ["styles", 2, false],
      ["this", 1, true],
    ]);
    expect(gotoFor("style", "plates", "style")).toBe("plate");
    expect(gotoFor("project", "used by", "style")).toBeUndefined();
  });
});

describe("the address", () => {
  test("defaults are omitted; a facet the kind cannot show is dropped; the window does not change identity", () => {
    expect(hrefOf(DEFAULT_URL)).toBe("/library-next");
    const u = parseUrl({ kind: "audio", f: ["mood:tense", "station:forge", "state:ratified"], view: "list", sel: "audio-1" });
    expect(u.f).toEqual({ mood: ["tense"], state: ["ratified"] });
    expect(parseUrl(Object.fromEntries(new URLSearchParams(hrefOf(u).split("?")[1]))).kind).toBe("audio");
    expect(identity(u)).toBe(identity({ ...u, view: "grid", sel: null, d: "l" }));
    expect(identity(u)).not.toBe(identity(toggled(u, "mood", "warm", true)));
  });

  test("a kind change keeps the shared filters and drops the vocabulary the new kind lacks", () => {
    const u = { ...DEFAULT_URL, kind: "audio" as const, f: { mood: ["tense"], state: ["ratified"] } };
    expect(withKind(u, "plate").f).toEqual({ state: ["ratified"] });
    expect(toggled(toggled(u, "mood", "tense", false), "x", "y", false).f).toEqual({ state: ["ratified"] });
  });
});
