// The Library's `character` kind in the index (spark scout-use-aim): a kept muse woman is faceted by
// her age band, build, the looks she was kept in and the applications they served; her newest still
// is the item's media and so its cover; her card, core prompt and looks survive the extras door and
// come back on the detail; a character a feed hands over with a malformed look is refused.
import { afterEach, describe, expect, it } from "vitest";

import type { CharacterExtras } from "@gt/domain/library";
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
const SHA = "d".repeat(64);
const STILL = (night: string): string => `/api/foundry/file?kind=scout&run=muse%3A${night}&path=ideas%2Fc-02.png`;

const EXTRAS: CharacterExtras = {
  card: { name: "Sofia", age: 29, look: "olive skin, slim build, an emerald silk scarf", personality: "a warm, impulsive travel photographer" },
  prompt: "Sofia, aged 29. olive skin, slim build, an emerald silk scarf.\n\nTwo-colour risograph print.",
  looks: [
    { night: "2026-10-24", cell: "c-02/board", look: "risograph-two-colour", genre: "risograph two-colour print", image: STILL("2026-10-24"), styleId: "paper-relief" },
    { night: "2026-10-23-2", cell: "c-02/board", image: STILL("2026-10-23-2") },
  ],
};

function woman(id: string, over: Partial<LibraryItemInput> = {}, extras: unknown = { character: EXTRAS }): LibraryEntry {
  const item = {
    kind: "character" as const,
    id,
    title: "Sofia",
    state: "ratified" as const,
    collections: [{ kind: "run" as const, id: "muse:2026-10-24" }],
    origin: "scout" as const,
    rights: { use: "publishable" as const },
    source: "real" as const,
    lineage: [{ kind: "run" as const, id: "muse:2026-10-24" }],
    vocabulary: { age: 29, build: "slim", looks: ["risograph-two-colour"], applications: ["dating-sim", "videogame"] },
    media: { sha256: SHA, bytes: 4000, mime: "image/png" },
    ...over,
  } as LibraryItemInput;
  return { item, meta: "aged 29 · slim build · 2 looks", extras: extras as LibraryEntry["extras"], feed: "character" };
}

describe("a character in the index", () => {
  it("facets by age band, build, look and application; her newest still is the row's cover", () => {
    const s = store();
    must(upsertItems(s, [woman("character:muse:sofia")], CTX));
    const page = must(queryLibrary(s, { kind: "character", limit: 10 }));
    expect(page.total).toBe(1);
    expect(page.kindCounts.character).toBe(1);
    expect(page.items[0]?.cover.blobSha).toBe(SHA);
    expect(page.items[0]?.chips.map((c) => [c.group, c.value])).toEqual([["age", "under 30"], ["build", "slim"], ["application", "dating-sim"]]);
    const groups = Object.fromEntries(page.groups.map((g) => [g.key, g.values.map((v) => v.value)]));
    expect(groups).toMatchObject({ age: ["under 30"], build: ["slim"], look: ["risograph-two-colour"], application: ["dating-sim", "videogame"] });
  });

  it("searches by a group's key and finds her by her name", () => {
    const s = store();
    must(upsertItems(s, [woman("character:muse:sofia"), woman("character:muse:hana", { title: "Hana", vocabulary: { age: 31, build: "slender", looks: ["anime-cel"], applications: ["companion-chat"] } })], CTX));
    expect(must(queryLibrary(s, { q: "look:anime-cel", limit: 10 })).items.map((r) => r.title)).toEqual(["Hana"]);
    expect(must(queryLibrary(s, { q: "application:dating", limit: 10 })).items.map((r) => r.title)).toEqual(["Sofia"]);
    expect(must(queryLibrary(s, { kind: "character", facets: { age: ["30–34"] }, limit: 10 })).items.map((r) => r.title)).toEqual(["Hana"]);
    expect(must(queryLibrary(s, { q: "sofia", limit: 10 })).total).toBe(1);
  });

  it("a legacy character has no build and no look: its facet groups are simply absent", () => {
    const s = store();
    must(upsertItems(s, [woman("character:muse:nadia", { vocabulary: { age: 33, looks: [], applications: [] } })], CTX));
    const keys = must(queryLibrary(s, { kind: "character", limit: 10 })).groups.map((g) => g.key);
    expect(keys).toContain("age");
    expect(keys).not.toContain("build");
    expect(keys).not.toContain("look");
    expect(keys).not.toContain("application");
  });

  it("keeps the card, the core prompt and the looks - styleId only where the join found one - on the detail", () => {
    const s = store();
    must(upsertItems(s, [woman("character:muse:sofia")], CTX));
    const d = must(libraryDetail(s, "character:muse:sofia"));
    expect(d.extras.character).toEqual(EXTRAS);
    expect(d.extras.character?.looks.map((l) => "styleId" in l)).toEqual([true, false]);
    expect(d.extras.character?.looks[1]).not.toHaveProperty("look");
    expect(d.acts).toEqual(["pin", "use-in-project"]);
  });

  it("refuses a character whose look has no address or whose card names nobody", () => {
    const s = store();
    const noImage = { character: { ...EXTRAS, looks: [{ night: "2026-10-24", cell: "c-02/board" }] } };
    expect(upsertItems(s, [woman("character:muse:a", {}, noImage)], CTX).ok).toBe(false);
    const noName = { character: { ...EXTRAS, card: { ...EXTRAS.card, name: "" } } };
    expect(upsertItems(s, [woman("character:muse:b", {}, noName)], CTX).ok).toBe(false);
  });
});
