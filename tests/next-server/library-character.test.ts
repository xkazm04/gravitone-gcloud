// THE KEPT MUSE CHARACTERS IN THE LIBRARY (spark scout-use-aim): the character feed reads the muse
// wing's nights and shelves one `character` item per woman - her cards grouped by name across nights,
// her newest kept still the item's media, every look she was kept in on the item, the core prompt
// built from the newest. A night that is dry, uncommitted or whose cell was not kept shelves nothing;
// a look from before the wire fields has no `look`, `genre` or `app` and the keys are absent, not
// null; the catalogue style a look became rides the look only when the chain joins. Every root is a
// temp directory; the catalogue is a stand-in.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../../lib/foundry/store.ts", async (orig) => ({
  ...(await orig<typeof import("../../lib/foundry/store.ts")>()),
  getCatalogue: () => Promise.resolve({ styles: [{ id: "paper-relief", origin: { kind: "extracted", source: "extract-run-7" } }, { id: "authored-one", origin: { kind: "authored" } }], ledger: [], _rev: 1 }),
}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-library-character-"));
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  process.env["SCOUT_STORE_DIR"] = path.join(dir, "scout");
  process.env["SCOUT_MUSE_STORE_DIR"] = path.join(dir, "scout-muse");
  return dir;
});

import { libraryItemSchema } from "@gt/domain/libraryItem";
import { openKernel } from "@gt/kernel/kernel";
import { queryLibrary } from "@gt/kernel/library/query";
import { upsertItems } from "@gt/kernel/library/write";

import { characterFeed, characterItemId, shelveCharacters } from "../../lib/library/feeds/character.ts";
import type { Candidate, IdeaCandidate, Night } from "../../lib/foundry/scout/types.ts";

const CARD = { name: "Sofia", age: 29, look: "olive skin, long dark wavy hair, slim build, an emerald silk scarf", personality: "a warm, impulsive travel photographer" };
const prompt = (head: string, card = CARD): string => `${head} Sofia, aged ${card.age}, ${card.look}. Seated at a harbour cafe. Avoid: text.`;

function idea(id: string, over: Partial<IdeaCandidate> = {}): IdeaCandidate {
  return { id, kind: "idea", sourceIds: [], status: "rendered", title: "Sofia, risograph", target: "character", prompt: prompt("Risograph print."), anchor: { kind: "free", ref: "" }, image: `ideas/${id}.png`, genre: "risograph two-colour print", card: CARD, look: "risograph-two-colour", app: "dating-sim", ...over };
}

function night(id: string, candidates: readonly Candidate[], kept: readonly string[], over: Partial<Night> = {}): Night {
  return {
    id,
    startedAt: `${id.slice(0, 10)}T00:00:00.000Z`,
    ceilingUsd: 2,
    target: 3,
    clipCap: 0,
    dry: false,
    state: "committed",
    sources: [],
    candidates,
    jobs: [],
    committed: { at: `${id.slice(0, 10)}T08:00:00.000Z`, by: "operator", kept: [...kept], rejected: [], reasons: {}, notes: {}, dry: false },
    ...over,
  };
}

const resolve = (n: string, rel: string): string => path.join("/muse", n, rel);
const shelve = (nights: readonly Night[], styles: ReadonlyMap<string, string> = new Map()) => shelveCharacters(nights, styles, resolve, "real");

describe("the grouping", () => {
  const older = night("2026-10-23-2", [idea("c-02", { look: undefined, genre: undefined, app: undefined, card: { ...CARD, name: "SOFIA" } }), idea("c-03", { card: { ...CARD, name: "Hana", age: 31, look: "a sleek black bob, slender build" }, prompt: "Anime cel. Hana, aged 31, a sleek black bob, slender build. At a desk." })], ["c-02/board", "c-03/board"]);
  const newer = night("2026-10-24", [idea("c-05", { look: "gouache-portrait", genre: "gouache portrait", app: "videogame", prompt: prompt("Gouache on toned paper.") })], ["c-05/board"]);

  it("is one item per woman, her names folded, her looks newest first", () => {
    const r = shelve([older, newer]);
    expect(r.skipped).toEqual([]);
    expect(r.items.map((i) => i.item.id).sort()).toEqual(["character:muse:hana", "character:muse:sofia"]);
    const sofia = r.items.find((i) => i.item.id === characterItemId("Sofia"));
    expect(sofia?.item.title).toBe("Sofia");
    const looks = sofia?.extras.character?.looks ?? [];
    expect(looks.map((l) => [l.night, l.cell, l.look])).toEqual([["2026-10-24", "c-05/board", "gouache-portrait"], ["2026-10-23-2", "c-02/board", undefined]]);
  });

  it("makes her newest kept still the media, and builds her core prompt from that still's prompt", () => {
    const sofia = shelve([older, newer]).items.find((i) => i.item.id === "character:muse:sofia");
    expect(sofia?.file).toEqual({ abs: path.join("/muse", "2026-10-24", "ideas/c-05.png"), mime: "image/png" });
    expect(sofia?.item.at).toBe("2026-10-24T08:00:00.000Z");
    expect(sofia?.extras.character?.prompt).toBe(`Sofia, aged 29, ${CARD.look}.\n\nGouache on toned paper. Seated at a harbour cafe. Avoid: text.`);
    expect(sofia?.extras.character?.card).toEqual(CARD);
  });

  it("does not depend on the order the nights arrive in", () => {
    const a = shelve([older, newer]).items.find((i) => i.item.id === "character:muse:sofia");
    const b = shelve([newer, older]).items.find((i) => i.item.id === "character:muse:sofia");
    expect(b).toEqual(a);
  });

  it("carries the vocabulary: age, the build her card names, the looks and applications of every kept still", () => {
    const sofia = shelve([older, newer]).items.find((i) => i.item.id === "character:muse:sofia");
    expect(sofia?.item).toMatchObject({ kind: "character", state: "ratified", origin: "scout", rights: { use: "publishable" }, source: "real", vocabulary: { age: 29, build: "slim", looks: ["gouache-portrait"], applications: ["videogame"] } });
    expect(sofia?.item.collections).toEqual([{ kind: "run", id: "muse:2026-10-24" }, { kind: "run", id: "muse:2026-10-23-2" }]);
    expect(sofia?.meta).toBe("aged 29 · slim build · 2 looks");
    const hana = shelve([older]).items.find((i) => i.item.id === "character:muse:hana");
    expect(hana?.item).toMatchObject({ vocabulary: { age: 31, build: "slender", looks: ["risograph-two-colour"], applications: ["dating-sim"] } });
    expect(hana?.meta).toBe("aged 31 · slender build · 1 look");
  });
});

describe("a night from before the wire fields", () => {
  it("has no look, genre or application: the keys are absent, never null, and the item still shelves", () => {
    const legacy = night("2026-10-22", [idea("c-01", { look: undefined, genre: undefined, app: undefined })], ["c-01/board"]);
    const sofia = shelve([legacy]).items[0];
    const look = sofia?.extras.character?.looks[0];
    expect(look).toEqual({ night: "2026-10-22", cell: "c-01/board", image: "/api/foundry/file?kind=scout&run=muse%3A2026-10-22&path=ideas%2Fc-01.png" });
    expect(Object.keys(look ?? {})).not.toContain("look");
    expect(sofia?.item.vocabulary).toEqual({ age: 29, build: "slim", looks: [], applications: [] });
  });
});

describe("what does not shelve", () => {
  const kept = ["c-01/board"];
  it("a dry night, an uncommitted night and a dry commit", () => {
    const base = [idea("c-01")];
    expect(shelve([night("2026-10-24", base, kept, { dry: true })]).items).toEqual([]);
    expect(shelve([night("2026-10-24", base, kept, { state: "closed" })]).items).toEqual([]);
    const { committed, ...open } = night("2026-10-24", base, kept);
    expect(shelve([{ ...open, state: "committed" }]).items).toEqual([]);
    expect(shelve([night("2026-10-24", base, kept, { committed: { ...(committed as NonNullable<typeof committed>), dry: true } })]).items).toEqual([]);
  });
  it("a character whose cell was not kept, and a kept idea that is not a character", () => {
    const n = night("2026-10-24", [idea("c-01"), idea("c-02", { target: "scene" }), idea("c-03", { card: { ...CARD, name: "Hana" } })], ["c-02/board", "c-01/replica-1"]);
    expect(shelve([n]).items).toEqual([]);
  });
  it("a kept character with no card or no artboard is reported, not dropped", () => {
    const n = night("2026-10-24", [idea("c-01", { card: undefined }), idea("c-02", { image: undefined, card: { ...CARD, name: "Hana" } })], ["c-01/board", "c-02/board"]);
    const r = shelve([n]);
    expect(r.items).toEqual([]);
    expect(r.skipped.map((s) => s.id)).toEqual(["2026-10-24/c-01", "2026-10-24/c-02"]);
  });
  it("a newest still whose file escapes the night is reported and the woman is not shelved on an older one's file", () => {
    const r = shelveCharacters([night("2026-10-24", [idea("c-01")], ["c-01/board"])], new Map(), () => { throw new Error("outside the night"); }, "real");
    expect(r.items).toEqual([]);
    expect(r.skipped).toEqual([{ id: "2026-10-24/c-01", reason: "ideas/c-01.png: outside the night" }]);
  });
});

describe("the style join", () => {
  const styleOf = (id: string, fromIdea: string, extractRunId?: string): Candidate => ({ id, kind: "style", sourceIds: [], status: "rendered", fromIdea, ...(extractRunId === undefined ? {} : { extractRunId }) });
  const first = night("2026-10-23-2", [idea("c-02")], ["c-02/board"]);
  const looks = (nights: readonly Night[], styles: ReadonlyMap<string, string>) => shelve(nights, styles).items[0]?.extras.character?.looks ?? [];

  it("adds the style id when a later night's style candidate developed the kept idea and its extract run wrote a catalogue style", () => {
    const later = night("2026-10-24", [styleOf("c-01", "2026-10-23-2/c-02", "extract-run-7")], [], { state: "closed" });
    const got = looks([first, later], new Map([["extract-run-7", "paper-relief"]]));
    expect(got[0]?.styleId).toBe("paper-relief");
    expect(shelve([first, later], new Map([["extract-run-7", "paper-relief"]])).items[0]?.item.lineage).toContainEqual({ kind: "style", id: "paper-relief" });
  });
  it("omits the key when no style candidate names the idea, when the extract run wrote no style, or when it never ran", () => {
    expect(Object.keys(looks([first], new Map([["extract-run-7", "paper-relief"]]))[0] ?? {})).not.toContain("styleId");
    const nobody = night("2026-10-24", [styleOf("c-01", "2026-10-23-2/c-09", "extract-run-7")], [], { state: "closed" });
    expect(Object.keys(looks([first, nobody], new Map([["extract-run-7", "paper-relief"]]))[0] ?? {})).not.toContain("styleId");
    const unwritten = night("2026-10-24", [styleOf("c-01", "2026-10-23-2/c-02", "extract-run-8")], [], { state: "closed" });
    expect(Object.keys(looks([first, unwritten], new Map([["extract-run-7", "paper-relief"]]))[0] ?? {})).not.toContain("styleId");
    const neverRan = night("2026-10-24", [styleOf("c-01", "2026-10-23-2/c-02")], [], { state: "closed" });
    expect(Object.keys(looks([first, neverRan], new Map([["extract-run-7", "paper-relief"]]))[0] ?? {})).not.toContain("styleId");
  });
});

describe("the feed", () => {
  const writeNight = (root: string, n: Night): void => {
    mkdirSync(path.join(ROOT, root, n.id), { recursive: true });
    writeFileSync(path.join(ROOT, root, n.id, "night.json"), JSON.stringify(n));
  };
  beforeAll(() => {
    writeNight("scout-muse", night("2026-10-23-2", [idea("c-02")], ["c-02/board"]));
    writeNight("scout-muse", night("2026-10-24", [{ id: "c-01", kind: "style", sourceIds: [], status: "rendered", fromIdea: "2026-10-23-2/c-02", extractRunId: "extract-run-7" }], [], { state: "closed" }));
    writeNight("scout-muse", night("2026-10-25", [idea("c-01", { card: { ...CARD, name: "Dry One" } })], ["c-01/board"], { dry: true }));
    // The scout wing holds a kept character idea too: the feed never reads that root.
    writeNight("scout", night("2026-10-24", [idea("c-01", { card: { ...CARD, name: "Wrong Wing" } })], ["c-01/board"]));
  });
  afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

  it("reads the muse root only, joins the catalogue's style by its extract run, and writes items the Library takes", async () => {
    const r = await characterFeed.read({ universe: "fixture" });
    expect(r.skipped).toEqual([]);
    expect(r.items.map((i) => i.item.id)).toEqual(["character:muse:sofia"]);
    const only = r.items[0];
    expect(only?.item.source).toBe("fixture");
    expect(only?.extras.character?.looks[0]?.styleId).toBe("paper-relief");
    expect(only?.file?.abs).toBe(path.join(ROOT, "scout-muse", "2026-10-23-2", "ideas", "c-02.png"));

    const k = openKernel(":memory:");
    if (!k.ok) throw k.error;
    try {
      for (const i of r.items) expect(libraryItemSchema.safeParse(i.item).success).toBe(true);
      const up = upsertItems(k.value.store, r.items.map((i) => ({ item: i.item, meta: i.meta, extras: i.extras, feed: "character" })), { styleOf: () => undefined });
      expect(up.ok).toBe(true);
      const page = queryLibrary(k.value.store, { kind: "character", limit: 10 });
      expect(page.ok && page.value.items.map((x) => x.title)).toEqual(["Sofia"]);
    } finally {
      k.value.close();
    }
  });
});
