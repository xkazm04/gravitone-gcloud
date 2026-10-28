import { describe, expect, it } from "vitest";

import { libraryItemSchema } from "../src/libraryItem.ts";
import {
  CHIP_GROUPS,
  FIXED_ORDER,
  GENRE_RUNGS,
  genreItemId,
  genreLibraryState,
  KIND_LABELS,
  LADDER_VALUES,
  LIBRARY_KINDS,
  MEDIA_KINDS,
  nightOfRef,
  parseSearch,
  railGroups,
  SEARCH_KEYS,
  VOCAB_GROUPS,
  ventureItemId,
  ventureLibraryState,
} from "../src/library.ts";

// The genre and venture kinds (spark scout-vision S2): a scout genre and a venture as Library items. Both are
// appended LAST so every stored kind_ord keeps its meaning; neither is a media kind (a genre is words first, its
// panel only when one was drawn). A genre's own state rides as the `ladder` facet and maps onto the shared state
// word; a venture's channel | album | game is its `type` - `state` and `kind` are taken by the shared grammar.

describe("the kinds", () => {
  it("are appended last, after character, so no stored kind_ord shifts", () => {
    expect(LIBRARY_KINDS.slice(-3)).toEqual(["character", "genre", "venture"]);
    expect(KIND_LABELS.slice(-2)).toEqual([
      { kind: "genre", label: "Genres", short: "genre" },
      { kind: "venture", label: "Ventures", short: "venture" },
    ]);
  });
  it("are not media kinds: a genre with no drawn panel is not `missing`", () => {
    expect(MEDIA_KINDS).not.toContain("genre");
    expect(MEDIA_KINDS).not.toContain("venture");
  });
  it("have their own rails and chips, the ladder in its own order", () => {
    expect(VOCAB_GROUPS.genre).toEqual(["ladder", "venture"]);
    expect(VOCAB_GROUPS.venture).toEqual(["type"]);
    expect(CHIP_GROUPS.genre).toEqual(["ladder", "venture"]);
    expect(CHIP_GROUPS.venture).toEqual(["type"]);
    expect(railGroups("genre").slice(0, 2).map((g) => g.key)).toEqual(["ladder", "venture"]);
    expect(FIXED_ORDER["ladder"]).toEqual(["perfecting", "piece-due", "publishable", "retired"]);
    expect(LADDER_VALUES.slice(0, 3)).toEqual(GENRE_RUNGS);
  });
  it("never name a group the shared grammar already owns", () => {
    for (const g of [...VOCAB_GROUPS.genre, ...VOCAB_GROUPS.venture]) expect(["state", "kind", "origin", "source", "id"]).not.toContain(g);
    for (const g of VOCAB_GROUPS.genre) expect(SEARCH_KEYS.has(g), g).toBe(true);
    expect(parseSearch("ladder:piece-due venture:vn-quiet-desk").tokens).toEqual([
      { key: "ladder", value: "piece due" },
      { key: "venture", value: "vn quiet desk" },
    ]);
  });
});

describe("the state words", () => {
  it("map a genre's state onto the shared word: perfecting and piece due a candidate, publishable ratified, retired rejected", () => {
    expect(LADDER_VALUES.map(genreLibraryState)).toEqual(["candidate", "candidate", "ratified", "rejected"]);
  });
  it("map a venture's retirement: live ratified, retired rejected", () => {
    expect(ventureLibraryState(undefined)).toBe("ratified");
    expect(ventureLibraryState("2026-10-25T09:00:00.000Z")).toBe("rejected");
  });
  it("name the items and read a ref's night", () => {
    expect(genreItemId("gn-rooftop-noir")).toBe("genre:gn-rooftop-noir");
    expect(ventureItemId("vn-quiet-desk")).toBe("venture:vn-quiet-desk");
    expect(nightOfRef("2026-10-24-2/c-07")).toBe("2026-10-24-2");
    expect(nightOfRef("no-slash")).toBe("");
  });
});

describe("the door", () => {
  const shared = { collections: [], origin: "scout", rights: { use: "publishable" }, source: "real", lineage: [] };
  const genre = { kind: "genre", id: "genre:gn-rooftop-noir", title: "rooftop noir, ink wash", state: "candidate", ...shared, vocabulary: { ladder: "perfecting" } };
  const venture = { kind: "venture", id: "venture:vn-quiet-desk", title: "Quiet Desk", state: "ratified", ...shared, vocabulary: { type: "channel" } };
  it("admits a genre with and without its venture, and a venture of each kind", () => {
    expect(libraryItemSchema.safeParse(genre).success).toBe(true);
    expect(libraryItemSchema.safeParse({ ...genre, vocabulary: { ladder: "publishable", venture: "vn-quiet-desk", ventureName: "Quiet Desk" } }).success).toBe(true);
    for (const type of ["channel", "album", "game"]) expect(libraryItemSchema.safeParse({ ...venture, vocabulary: { type } }).success, type).toBe(true);
  });
  it("refuses a rung off the ladder, a venture that is not a venture id, and an unknown venture kind", () => {
    expect(libraryItemSchema.safeParse({ ...genre, vocabulary: { ladder: "kept" } }).success).toBe(false);
    expect(libraryItemSchema.safeParse({ ...genre, vocabulary: { ladder: "perfecting", venture: "gn-rooftop-noir" } }).success).toBe(false);
    expect(libraryItemSchema.safeParse({ ...venture, vocabulary: { type: "show" } }).success).toBe(false);
  });
});
