// THE CHARACTER RECORD'S IMPORTERS AND LIBRARY SHELF (spark concept-casting-stages S2), over temp pools and a temp
// kernel: a pool imported twice changes nothing, an edited source updates by its key, a rejected Codex set is not
// imported, parody-cast is refused by name, and the Library shows each saved character once with a used-by list that
// points at productions. No vendor, no GPU.

import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { mkdtempSync } from "node:fs";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = mkdtempSync(path.join(os.tmpdir(), "gt-characters-"));
process.env["SCOUT_STORE_DIR"] = path.join(ROOT, "scout");
process.env["SCOUT_MUSE_STORE_DIR"] = path.join(ROOT, "scout-muse");

import { blobStore } from "@gt/kernel/blob";
import { openKernel } from "@gt/kernel/kernel";
import { savedCharacters, recordCharacterUseIn } from "@gt/kernel/characters/store";
import { libraryDetail } from "@gt/kernel/library/detail";
import { upsertItems } from "@gt/kernel/library/write";
import { startProductionIn } from "@gt/kernel/productions/store";
import { must, scratch } from "../../packages/kernel/test/helpers.ts";

import { digestOfRow, PARODY_REFUSAL, readPool, refusalOfPool, type PoolRoots } from "../../lib/library/characterPools.ts";
import { blobIngest, importCharacters, type ImportTarget } from "../../lib/library/characters.ts";
import { shelveRecords, type ShelfRecord } from "../../lib/library/feeds/character.ts";
import type { FeedRead } from "../../lib/library/feeds/types.ts";

const tmp = scratch("characters");
const opened: { close(): void }[] = [];
afterAll(() => {
  for (const k of opened) k.close();
  tmp.dispose();
  rmSync(ROOT, { recursive: true, force: true });
});

const PNG = (k: number) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, k]);
const OP = { kind: "operator" as const, id: "op" };

let n = 0;
function fresh(): { roots: PoolRoots; target: ImportTarget } {
  n++;
  const base = path.join(ROOT, `case-${n}`);
  const museArmy = path.join(base, "muse-army");
  const codex = path.join(base, "scout-codex");
  mkdirSync(path.join(museArmy, "run-a", "img"), { recursive: true });
  mkdirSync(path.join(codex, "2026-11-08", "t6"), { recursive: true });
  const k = must(openKernel(path.join(tmp.dir, `k-${n}.sqlite`)));
  opened.push(k);
  const store = k.store;
  return { roots: { museArmy, codex, nights: [] }, target: { store, ingest: blobIngest(blobStore(path.join(base, "blobs"))) } };
}

const muse = (id: string, name: string, rating = "yes", extra: Record<string, unknown> = {}) => ({ id, rating, card: { key: id, name, style: "noir", heritage: "czech", age: 29, skin: "fair skin", eyes: "green eyes", face: "an oval face", hair: "dark blonde hair", build: "toned build", mark: "", role: "mage", use: "fantasy game", wardrobe: "flowing robes", setting: "a tower", expression: "a sly glance", ...extra } });

function writeMuse(roots: PoolRoots, rows: readonly ReturnType<typeof muse>[], extra: readonly unknown[] = []): void {
  writeFileSync(path.join(roots.museArmy, "run-a", "ratings.json"), JSON.stringify([...rows, ...extra]));
  for (const r of rows) writeFileSync(path.join(roots.museArmy, "run-a", "img", `${r.id}.png`), PNG(r.id.length));
}

function writeSet(roots: PoolRoots, set: string, verdict: string, over: Record<string, unknown> = {}): void {
  const dir = path.join(roots.codex, "2026-11-08", "t6", set);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "brief.json"), JSON.stringify({ id: set, title: set.replace("char-", ""), frames: [{ name: "sheet", prompt: "The same adult woman, aged 31: keep her face.", refs: [] }], ...over }));
  for (const f of ["sheet", "hair", "scene", "concept"]) writeFileSync(path.join(dir, `${f}.png`), PNG(f.length + set.length));
  const file = path.join(roots.codex, "2026-11-08", "verdicts.json");
  const prior = (() => {
    try {
      return JSON.parse(String(process.getBuiltinModule("node:fs").readFileSync(file, "utf8"))) as { items: Record<string, unknown> };
    } catch {
      return { items: {} };
    }
  })();
  prior.items[set] = { verdict };
  writeFileSync(file, JSON.stringify(prior));
}

const countRow = (s: ImportTarget["store"], t: string) => Number(must(s.read((r) => r.get(`SELECT count(*) AS n FROM ${t}`)))?.["n"]);

describe("the importers", () => {
  let c: ReturnType<typeof fresh>;
  beforeEach(() => {
    c = fresh();
  });

  it("imports muse-army cards with structured slots; twice changes nothing", async () => {
    writeMuse(c.roots, [muse("a-1-kristyna", "Kristyna"), muse("a-2-bora", "Bora", "no")], [{ id: "x1-A-photo", rating: "yes", card: null }]);
    expect(must(await importCharacters("muse-army", { target: c.target, roots: c.roots }))).toMatchObject({ added: 2, updated: 0, unchanged: 0 });
    const events = countRow(c.target.store, "events");
    expect(must(await importCharacters("muse-army", { target: c.target, roots: c.roots }))).toMatchObject({ added: 0, updated: 0, unchanged: 2 });
    expect(countRow(c.target.store, "events")).toBe(events);
    const all = must(c.target.store.read((r) => savedCharacters(r)));
    expect(all).toHaveLength(2);
    const k = all.find((x) => x.card.name === "Kristyna");
    expect(k?.card.look).toContain("dark blonde hair");
    expect(k?.card.personality).toBe("A mage for a fantasy game; a sly glance.");
    expect(k?.slots).toMatchObject({ wardrobe: "flowing robes", rating: "yes" });
    expect(k?.images[0]).toMatch(/^\/api\/blob\/[0-9a-f]{64}\?type=image%2Fpng$/);
  });

  it("an edited source updates by its stable key: same id, new words", async () => {
    writeMuse(c.roots, [muse("a-1-kristyna", "Kristyna")]);
    must(await importCharacters("muse-army", { target: c.target, roots: c.roots }));
    const id = must(c.target.store.read((r) => savedCharacters(r)))[0]?.id;
    writeMuse(c.roots, [muse("a-1-kristyna", "Kristyna", "yes", { hair: "cropped silver hair" })]);
    expect(must(await importCharacters("muse-army", { target: c.target, roots: c.roots }))).toMatchObject({ added: 0, updated: 1 });
    const all = must(c.target.store.read((r) => savedCharacters(r)));
    expect(all).toHaveLength(1);
    expect(all[0]?.id).toBe(id);
    expect(all[0]?.card.look).toContain("cropped silver hair");
  });

  it("codex keep sets join their muse-army card, one record each; a rejected set is not imported", async () => {
    writeMuse(c.roots, [muse("a-1-kristyna", "Kristyna")]);
    writeSet(c.roots, "char-a-1-kristyna", "keep");
    writeSet(c.roots, "char-b-9-zara", "reject");
    const read = must(await readPool("codex-kept", c.roots));
    expect(read.rows.map((r) => r.sourceKey)).toEqual(["codex-kept:2026-11-08/char-a-1-kristyna"]);
    expect(read.rows[0]?.samePerson).toBe("muse-army:run-a/a-1-kristyna");
    expect(read.rows[0]?.card.name).toBe("Kristyna");
    expect(must(await importCharacters("codex-kept", { target: c.target, roots: c.roots }))).toMatchObject({ added: 1 });
    expect(must(await importCharacters("muse-army", { target: c.target, roots: c.roots }))).toMatchObject({ added: 0, covered: 1 });
    const all = must(c.target.store.read((r) => savedCharacters(r)));
    expect(all).toHaveLength(1);
    expect(all[0]?.origin).toBe("codex-kept");
    expect(all[0]?.images).toHaveLength(5);
    expect(all[0]?.sheet).toBeDefined();
  });

  it("a kept set with no muse-army card still lands, saying it has no written card", async () => {
    writeSet(c.roots, "char-x1-C-photo", "keep", { title: "x1-C-photo" });
    const read = must(await readPool("codex-kept", c.roots));
    expect(read.rows[0]?.card).toMatchObject({ name: "x1-C-photo", age: 31 });
    expect(read.rows[0]?.card.look).toContain("no written card");
    expect(read.rows[0]?.samePerson).toBeUndefined();
  });

  it("parody-cast is refused by name, everywhere", async () => {
    expect(refusalOfPool("parody-cast")).toBe(PARODY_REFUSAL);
    expect(await readPool("parody-cast", c.roots)).toMatchObject({ ok: false, error: { code: "refused", message: expect.stringContaining("fan-site") } });
    const done = await importCharacters("parody-cast", { target: c.target, roots: c.roots });
    expect(done).toMatchObject({ ok: false, error: { code: "refused" } });
    expect(countRow(c.target.store, "characters")).toBe(0);
  });

  it("a kept set whose references reach into parody-cast is skipped", async () => {
    writeSet(c.roots, "char-a-1-pam", "keep", { frames: [{ name: "sheet", prompt: "x", refs: ["C:\\foundry-out\\parody-cast\\2026-10-27\\pam.png"] }] });
    const read = must(await readPool("codex-kept", c.roots));
    expect(read.rows).toEqual([]);
    expect(read.skipped[0]?.reason).toContain("parody-cast");
  });

  it("a row's digest moves when its words or its files move, and not otherwise", async () => {
    writeMuse(c.roots, [muse("a-1-kristyna", "Kristyna")]);
    const one = must(await readPool("muse-army", c.roots)).rows[0];
    const two = must(await readPool("muse-army", c.roots)).rows[0];
    if (one === undefined || two === undefined) throw new Error("no row");
    expect(await digestOfRow(one)).toBe(await digestOfRow(two));
    expect(statSync(one.files[0]?.abs ?? "").size).toBeGreaterThan(0);
    expect(await digestOfRow({ ...one, card: { ...one.card, name: "Other" } })).not.toBe(await digestOfRow(one));
  });
});

describe("the Library shelf", () => {
  const nightItem = (id: string, title: string): FeedRead["items"][number] => ({
    item: { kind: "character", id, title, state: "ratified", collections: [], origin: "scout", rights: { use: "publishable" }, source: "real", lineage: [], vocabulary: { age: 29, looks: [], applications: [] } },
    meta: "m",
    extras: {},
  });
  const nights: FeedRead = { items: Array.from({ length: 14 }, (_, i) => nightItem(`character:muse:n${i}`, `Night${i}`)), skipped: [] };

  const shelf = (over: Partial<ShelfRecord["record"]> = {}, uses: ShelfRecord["uses"] = []): ShelfRecord => ({
    record: { id: "chr:01JC9Z0Q5V3T8K2M4N6P7R9S1T", origin: "muse-army", card: { name: "Bora", look: "a lean build", personality: "p", age: 32 }, images: ["/x"], savedToLibrary: true, createdAt: "2026-11-09T00:00:00.000Z", ...over } as ShelfRecord["record"],
    images: [{ role: "portrait", blob: { sha256: "a".repeat(64), bytes: 4, mime: "image/png" } }],
    uses,
  });

  it("keeps the 14 and adds each saved record once", () => {
    const out = shelveRecords(nights, [shelf()], new Map(), "real");
    expect(out.items).toHaveLength(15);
    expect(out.items[14]?.item).toMatchObject({ kind: "character", id: "character:chr:01JC9Z0Q5V3T8K2M4N6P7R9S1T", origin: "import", media: { sha256: "a".repeat(64) } });
    expect(new Set(out.items.map((i) => i.item.id)).size).toBe(15);
  });

  it("a record imported from a kept Scout character is its night's item, not a second one, and carries its used-by", () => {
    const id = "chr:01JC9Z0Q5V3T8K2M4N6P7R9S1T";
    const out = shelveRecords(nights, [shelf({ origin: "scout-character", card: { name: "Night3", look: "x", personality: "p", age: 29 } } as Partial<ShelfRecord["record"]>, [{ productionId: "prdn:the-pour" as never, label: "The Pour", at: "t" }])], new Map([["night3", id]]), "real");
    expect(out.items).toHaveLength(14);
    expect(out.items[3]?.item.id).toBe("character:muse:n3");
    expect(out.items[3]?.item.lineage).toEqual([{ kind: "production", id: "prdn:the-pour", label: "The Pour" }]);
  });

  it("an age-less record is skipped with its reason, not dropped silently", () => {
    const out = shelveRecords({ items: [], skipped: [] }, [shelf({ card: { name: "NoAge", look: "x", personality: "p" } } as Partial<ShelfRecord["record"]>)], new Map(), "real");
    expect(out.items).toEqual([]);
    expect(out.skipped[0]?.reason).toContain("no age");
  });

  it("the detail lists a production a use named, as a link to it", async () => {
    const c = fresh();
    writeMuse(c.roots, [muse("a-1-kristyna", "Kristyna")]);
    must(await importCharacters("muse-army", { target: c.target, roots: c.roots }));
    const store = c.target.store;
    const rec = must(store.read((r) => savedCharacters(r)))[0];
    if (rec === undefined) throw new Error("no record");
    const p = must(store.tx((t) => startProductionIn(t, { source: { kind: "episode", ref: "F1-11" }, title: "The Pour", board: { logline: "x", aspect: "16:9", panels: [{ id: "panel-1", beat: "b", prompt: "p", still: { sha256: "b".repeat(64), bytes: 1, mime: "image/png" } }] } }, OP)));
    must(store.tx((t) => recordCharacterUseIn(t, { id: rec.id, productionId: p.id }, OP)));
    const out = shelveRecords({ items: [], skipped: [] }, [{ record: rec, images: [{ role: "portrait", blob: { sha256: "a".repeat(64), bytes: 4, mime: "image/png" } }], uses: [{ productionId: p.id, label: "The Pour", at: "t" }] }], new Map(), "real");
    const entry = out.items[0];
    if (entry === undefined) throw new Error("no item");
    must(upsertItems(store, [{ item: entry.item, meta: entry.meta, extras: entry.extras, feed: "character" }], { styleOf: () => undefined }));
    const d = must(libraryDetail(store, entry.item.id));
    expect(d.lineage.find((n) => n.role === "used by")).toMatchObject({ label: "The Pour", href: `/scout/productions?from=${encodeURIComponent(p.id)}` });
  });
});
