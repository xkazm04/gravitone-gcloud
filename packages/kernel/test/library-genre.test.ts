// The Library's `genre` and `venture` kinds in the index (spark scout-vision S2): a genre is faceted by its rung on
// the ladder and the venture it produces for (labelled by the venture's name), a venture by its type; a genre with no
// drawn panel has no cover and is not `missing`; the extras - ladder state, kept trials, piece, grammar, frame -
// survive the door and come back on the detail; a genre handed over with a malformed piece is refused.
import { afterEach, describe, expect, it } from "vitest";

import type { GenreExtras, VentureExtras } from "@gt/domain/library";
import type { LibraryItemInput } from "@gt/domain/libraryItem";
import type { IndexContext, LibraryEntry } from "../src/library/core.ts";
import { libraryDetail } from "../src/library/detail.ts";
import { queryLibrary } from "../src/library/query.ts";
import { upsertItems } from "../src/library/write.ts";
import { openKernel, type Kernel } from "../src/kernel.ts";
import type { Store } from "../src/store.ts";
import { must } from "./helpers.ts";

const open: Kernel[] = [];
afterEach(() => {
  for (const k of open.splice(0)) k.close();
});
function store(): Store {
  const k = must(openKernel(":memory:"));
  open.push(k);
  return k.store;
}

const CTX: IndexContext = { styleOf: () => undefined };
const SHA = "e".repeat(64);

const GENRE: GenreExtras = {
  state: "publishable",
  use: "a 30 s Short: one meeting that should have been an email",
  look: "painted 3D, soft key light",
  grammar: ["cold open on a mundane object", "the absurd rule stated flatly", "the deadpan button"],
  keptTrials: ["2026-10-14/c-06", "2026-10-16/c-03", "2026-10-19/c-07", "2026-10-21/c-02"],
  piece: { ref: "2026-10-23/c-11", verdict: "kept", video: "/api/foundry/file?kind=scout&run=2026-10-23&path=pieces%2Fc-11%2Fpiece.mp4" },
  bornFrom: { ref: "2026-10-12/c-04", image: "/api/foundry/file?kind=scout&run=2026-10-12&path=storyboards%2Fc-04%2Fpanel-1.png" },
  proposal: "2026-10-12/c-14",
  venture: { id: "vn-quiet-desk", name: "Quiet Desk" },
};

const VENTURE: VentureExtras = {
  kind: "channel",
  tone: "deadpan, dry",
  audience: "office workers, 25-40",
  format: "a 30 s vertical Short",
  look: "painted 3D",
  genres: [{ id: "gn-deadpan-office", name: "deadpan office satire" }],
  proposal: "2026-10-24/c-15",
};

const shared = { origin: "scout" as const, rights: { use: "publishable" as const }, source: "real" as const, collections: [] };

function genre(id: string, over: Partial<LibraryItemInput> = {}, extras: unknown = { genre: GENRE }): LibraryEntry {
  const item = {
    kind: "genre" as const,
    id,
    title: "deadpan office satire",
    state: "ratified" as const,
    ...shared,
    lineage: [{ kind: "run" as const, id: "2026-10-12" }, { kind: "candidate" as const, id: "2026-10-12/c-04" }],
    vocabulary: { ladder: "publishable" as const, venture: "vn-quiet-desk", ventureName: "Quiet Desk" },
    media: { sha256: SHA, bytes: 4000, mime: "image/png" },
    ...over,
  } as LibraryItemInput;
  return { item, meta: "publishable · 4/4 trials", extras: extras as LibraryEntry["extras"], feed: "genre" };
}

function venture(id: string, over: Partial<LibraryItemInput> = {}): LibraryEntry {
  const item = { kind: "venture" as const, id, title: "Quiet Desk", state: "ratified" as const, ...shared, lineage: [{ kind: "candidate" as const, id: "2026-10-24/c-15" }], vocabulary: { type: "channel" as const }, ...over } as LibraryItemInput;
  return { item, meta: "channel · 1 genre", extras: { venture: VENTURE }, feed: "genre" };
}

describe("a genre in the index", () => {
  it("facets by its rung and its venture, labelled by the venture's name; its panel is the cover", () => {
    const s = store();
    must(upsertItems(s, [genre("genre:gn-deadpan-office")], CTX));
    const page = must(queryLibrary(s, { kind: "genre", limit: 10 }));
    expect(page.kindCounts.genre).toBe(1);
    expect(page.items[0]?.cover.blobSha).toBe(SHA);
    expect(page.items[0]?.chips.map((c) => [c.group, c.value, c.label])).toEqual([
      ["ladder", "publishable", "publishable"],
      ["venture", "vn-quiet-desk", "Quiet Desk"],
    ]);
  });

  it("a genre with no panel and no venture has no cover, no attention and no venture group", () => {
    const s = store();
    const { media: _m, ...bare } = genre("genre:gn-rooftop-noir").item as LibraryItemInput & { media?: unknown };
    void _m;
    must(upsertItems(s, [{ ...genre("genre:gn-rooftop-noir"), item: { ...bare, vocabulary: { ladder: "perfecting" } } as LibraryItemInput }], CTX));
    const page = must(queryLibrary(s, { kind: "genre", limit: 10 }));
    expect(page.items[0]?.cover.blobSha).toBeNull();
    expect(page.items[0]).not.toHaveProperty("attention");
    expect(page.groups.map((g) => g.key)).not.toContain("venture");
  });

  it("finds a rung by its key, and the ladder rail keeps the ladder's order", () => {
    const s = store();
    must(
      upsertItems(
        s,
        [genre("genre:gn-a", { title: "a", vocabulary: { ladder: "publishable" } }), genre("genre:gn-b", { title: "b", state: "candidate", vocabulary: { ladder: "piece-due" } }), genre("genre:gn-c", { title: "c", state: "candidate", vocabulary: { ladder: "perfecting" } }), genre("genre:gn-d", { title: "d", state: "candidate", vocabulary: { ladder: "perfecting" } })],
        CTX,
      ),
    );
    expect(must(queryLibrary(s, { q: "ladder:piece-due", limit: 10 })).items.map((r) => r.title)).toEqual(["b"]);
    const ladder = must(queryLibrary(s, { kind: "genre", limit: 0 })).groups.find((g) => g.key === "ladder");
    expect(ladder?.values.map((v) => v.value)).toEqual(["perfecting", "piece-due", "publishable"]);
  });

  it("keeps its state, trials, piece, grammar and venture on the detail", () => {
    const s = store();
    must(upsertItems(s, [genre("genre:gn-deadpan-office")], CTX));
    const d = must(libraryDetail(s, "genre:gn-deadpan-office"));
    expect(d.extras.genre).toEqual(GENRE);
    expect(d.lineage.map((n) => n.ref.kind)).toEqual(["run", "candidate", "self"]);
  });

  it("refuses a genre whose piece has no verdict word, or whose kept trial is empty", () => {
    const s = store();
    expect(upsertItems(s, [genre("genre:gn-x", {}, { genre: { ...GENRE, piece: { ref: "2026-10-23/c-11", verdict: "maybe" } } })], CTX).ok).toBe(false);
    expect(upsertItems(s, [genre("genre:gn-y", {}, { genre: { ...GENRE, keptTrials: [""] } })], CTX).ok).toBe(false);
  });
});

describe("a venture in the index", () => {
  it("facets by its type and keeps its frame on the detail", () => {
    const s = store();
    must(upsertItems(s, [venture("venture:vn-quiet-desk"), venture("venture:vn-night-tracks", { title: "Night Tracks", vocabulary: { type: "album" } })], CTX));
    expect(must(queryLibrary(s, { kind: "venture", facets: { type: ["album"] }, limit: 10 })).items.map((r) => r.title)).toEqual(["Night Tracks"]);
    expect(must(libraryDetail(s, "venture:vn-quiet-desk")).extras.venture).toEqual(VENTURE);
  });
});
