// THE STEER AND THE SEED STORE (spark scout-decision-graph WP-S0) - the advisory split's door, pause and
// resume with their appended history, the paused-branch lookup over a seed's ancestry, and the batch store's
// id reservation and ref helpers. Every store is a temp directory set before any lib/ module loads.

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-scout-steer-"));
  process.env["SCOUT_STORE_DIR"] = path.join(dir, "scout");
  return dir;
});

import { rmSync } from "node:fs";

import { ancestryOf, createSeedBatch, isKeptSeed, listSeedBatches, mutateSeedBatch, readSeedBatch, splitSeedRef } from "../../lib/foundry/scout/seedStore.ts";
import { checkSplit, pauseBranch, pausedUnder, readSteer, resumeBranch, setSplit } from "../../lib/foundry/scout/steer.ts";
import { listNights } from "../../lib/foundry/scout/store.ts";
import type { Seed, SeedBatch } from "../../lib/foundry/scout/types.ts";

afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

const seed = (id: string, over: Partial<Seed> = {}): Seed => ({ id, sentence: `a seed ${id}`, genre: "comedy", subgenre: "sketch", type: "animated comedy sketch", audience: "adult", format: "short", ...over });
const batch = (id: string, seeds: readonly Seed[], over: Partial<SeedBatch> = {}): SeedBatch => ({ id, createdAt: `${id.slice(0, 10)}T09:00:00.000Z`, dry: false, seeds, ...over });

describe("the split door", () => {
  it("takes audience shares that sum to 100, and genre shares inside an audience", () => {
    expect(checkSplit({ audience: { kids: 30, adult: 70 }, genre: { adult: { comedy: 60, horror: 40 } } }).ok).toBe(true);
  });
  it("refuses a level that does not sum to 100, a fraction, an unknown audience, a two-line genre", () => {
    expect(checkSplit({ audience: { kids: 30, adult: 60 } })).toMatchObject({ ok: false, error: { message: expect.stringContaining("sums to 90") } });
    expect(checkSplit({ audience: { kids: 30.5, adult: 69.5 } }).ok).toBe(false);
    expect(checkSplit({ audience: { teens: 100 } as never }).ok).toBe(false);
    expect(checkSplit({ audience: { adult: 100 }, genre: { adult: { "a\nb": 100 } } }).ok).toBe(false);
    expect(checkSplit({ audience: { adult: 100 }, genre: { adult: { comedy: 50 } } }).ok).toBe(false);
  });
});

describe("the steer file", () => {
  it("is empty until written, then keeps the split and appends every change to its history", async () => {
    expect(await readSteer()).toEqual({ paused: [], history: [] });
    const a = await setSplit({ audience: { kids: 40, adult: 60 } }, "operator", new Date("2026-10-23T10:00:00Z"));
    expect(a.ok).toBe(true);
    const b = await setSplit({ audience: { kids: 20, adult: 80 } }, "operator", new Date("2026-10-23T11:00:00Z"));
    expect(b.ok).toBe(true);
    const s = await readSteer();
    expect(s.split).toEqual({ audience: { kids: 20, adult: 80 } });
    expect(s.history.map((h) => (h.act === "split" ? h.split.audience["kids"] : h.act))).toEqual([40, 20]);
  });
  it("refuses a bad split and writes nothing", async () => {
    const before = await readSteer();
    expect((await setSplit({ audience: { kids: 10 } }, "operator")).ok).toBe(false);
    expect(await readSteer()).toEqual(before);
  });
  it("pauses and resumes a branch once each, and only a seed ref", async () => {
    expect((await pauseBranch("2026-10-23/sd-004", "operator")).ok).toBe(true);
    expect((await pauseBranch("2026-10-23/sd-004", "operator")).ok).toBe(true);
    expect((await readSteer()).paused).toEqual(["2026-10-23/sd-004"]);
    expect((await pauseBranch("2026-10-23/c-04", "operator")).ok).toBe(false);
    expect((await resumeBranch("2026-10-23/sd-004", "operator")).ok).toBe(true);
    const s = await readSteer();
    expect(s.paused).toEqual([]);
    expect(s.history.filter((h) => h.act !== "split").map((h) => h.act)).toEqual(["pause", "resume"]);
  });
});

describe("the seed store", () => {
  it("reserves batch ids per day, lists them newest first, and stays out of the night list", async () => {
    const one = await createSeedBatch("2026-10-23", (id) => batch(id, [seed("sd-001"), seed("sd-002")]));
    const two = await createSeedBatch("2026-10-23", (id) => ({ ...batch(id, [seed("sd-001", { parent: `${one.id}/sd-001` })]), createdAt: "2026-10-23T12:00:00.000Z" }));
    expect([one.id, two.id]).toEqual(["2026-10-23", "2026-10-23-2"]);
    expect((await listSeedBatches()).map((b) => b.id)).toEqual(["2026-10-23-2", "2026-10-23"]);
    expect(await listNights()).toEqual([]);
  });
  it("splits refs, walks ancestry nearest first, and knows a kept seed only from a live commit", async () => {
    expect(splitSeedRef("2026-10-23-2/sd-001")).toEqual({ batch: "2026-10-23-2", seed: "sd-001" });
    expect(splitSeedRef("2026-10-23/c-01")).toBeNull();
    let all = await listSeedBatches();
    expect(ancestryOf(all, "2026-10-23-2/sd-001")).toEqual(["2026-10-23-2/sd-001", "2026-10-23/sd-001"]);
    expect(isKeptSeed(all, "2026-10-23/sd-001")).toBe(false);
    await mutateSeedBatch("2026-10-23", (b) => ({ ...b, committed: { at: "2026-10-23T13:00:00.000Z", by: "operator", kept: ["sd-001"], rejected: ["sd-002"], reasons: { "sd-002": ["generic"] }, notes: {}, dry: false } }));
    all = await listSeedBatches();
    expect(isKeptSeed(all, "2026-10-23/sd-001")).toBe(true);
    expect(isKeptSeed(all, "2026-10-23/sd-002")).toBe(false);
    expect((await readSeedBatch("2026-10-23")).committed?.kept).toEqual(["sd-001"]);
  });
  it("finds the paused seed a child sits under", async () => {
    const all = await listSeedBatches();
    const chain = ancestryOf(all, "2026-10-23-2/sd-001");
    expect(pausedUnder({ paused: ["2026-10-23/sd-001"], history: [] }, chain)).toBe("2026-10-23/sd-001");
    expect(pausedUnder({ paused: [], history: [] }, chain)).toBeUndefined();
  });
});

describe("the seed door every seed-taking act calls", () => {
  it("takes a kept live seed, refuses an unkept, a rejected, an unknown and a paused one with the reason", async () => {
    const { usableSeed } = await import("../../lib/foundry/scout/seeds.ts");
    expect(await usableSeed("2026-10-23/sd-001")).toEqual({ ok: true, value: "2026-10-23/sd-001" });
    expect(await usableSeed("2026-10-23/sd-002")).toMatchObject({ ok: false, error: { message: expect.stringContaining("rejected: generic") } });
    expect(await usableSeed("2026-10-23-2/sd-001")).toMatchObject({ ok: false, error: { message: expect.stringContaining("uncommitted") } });
    expect(await usableSeed("2026-10-23/sd-099")).toMatchObject({ ok: false, error: { message: expect.stringContaining("no seed") } });
    await pauseBranch("2026-10-23/sd-001", "operator");
    expect(await usableSeed("2026-10-23/sd-001")).toMatchObject({ ok: false, error: { message: expect.stringContaining("paused branch 2026-10-23/sd-001") } });
    await resumeBranch("2026-10-23/sd-001", "operator");
  });
});
