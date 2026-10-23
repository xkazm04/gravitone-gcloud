// THE SEEDS DOOR AND THE NEXT NIGHT'S BRIEF (spark scout-decision-graph WP-S1) - `pipeline/scout.mts seeds
// new | status` end to end over a temp scout store: a batch written whole with its ids in order, every
// refusal the door makes naming the seed's place (a bad facet, a repeat in the batch, a sentence any earlier
// batch holds, a parent the seed door refuses) with nothing written, the status lines; then the taste brief's
// four seed sections over committed batches and the steer. Words only: no kernel job, no vendor.

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-scout-seeds-"));
  process.env["SCOUT_STORE_DIR"] = path.join(dir, "scout");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  process.env["AI_REGISTRY_DIR"] = path.join(dir, "no-registry");
  return dir;
});

import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { runCli } from "../../pipeline/scout.mts";
import { listSeedBatches, mutateSeedBatch } from "../../lib/foundry/scout/seedStore.ts";
import { addSeedBatch, usableSeed } from "../../lib/foundry/scout/seeds.ts";
import { pauseBranch } from "../../lib/foundry/scout/steer.ts";
import { seedSections, tasteOf } from "../../lib/foundry/scout/taste.ts";
import { MAX_SEED_BATCH, type IdeaCandidate, type Night, type Seed, type SeedBatch, type SeedCommit } from "../../lib/foundry/scout/types.ts";

afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

const ENV = { ...process.env, GRAVITONE_DRY_ONLY: "1" };
const DAY = new Date("2026-10-23T09:00:00.000Z");

async function cli(argv: string[], now: Date = DAY): Promise<{ code: number; out: string; err: string; doc: Record<string, unknown> }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(argv, { env: ENV, out: (s) => out.push(s), err: (s) => err.push(s), ports: { now: () => now } });
  let doc: Record<string, unknown> = {};
  try {
    doc = JSON.parse(out.join("\n")) as Record<string, unknown>;
  } catch {
    /* not a --json call */
  }
  return { code, out: out.join("\n"), err: err.join("\n"), doc };
}

let seq = 0;
function file(body: unknown): string {
  const p = path.join(ROOT, `seeds-${++seq}.json`);
  writeFileSync(p, JSON.stringify(body), "utf8");
  return p;
}

const brief = (sentence: string, o: Record<string, unknown> = {}) => ({ sentence, genre: "comedy", subgenre: "office sketch", type: "animated comedy sketch", audience: "adult", format: "short", ...o });
const THREE = [brief("A tired printer unionises the office machines."), brief("A lighthouse keeper rations the light.", { genre: "drama", subgenre: "quiet character study", type: "animated short", format: "video" }), brief("Ten seconds of a dog learning to whistle.", { audience: "kids", genre: "comedy", subgenre: "animal gag" })];

/** Commit a batch as the Board's apply would. */
async function decide(id: string, c: Partial<SeedCommit>): Promise<void> {
  await mutateSeedBatch(id, (b) => ({ ...b, committed: { at: "2026-10-23T10:00:00.000Z", by: "operator", kept: [], rejected: [], reasons: {}, notes: {}, dry: b.dry, ...c } }));
}

describe("seeds new - the batch's door", () => {
  let first = "";

  it("writes the batch whole: sd-001.. in order, createdAt now, dry, no night; prints its packet", async () => {
    const r = await cli(["seeds", "new", "--json", file(THREE)]);
    expect(r.code, r.err).toBe(0);
    // `--json <file>` is the input and the answer's shape both, as every reading command's: the line goes to stderr.
    expect(r.err).toBe("batch 2026-10-23 · 3 seeds · /board/pkt:seeds:2026-10-23");
    expect(r.doc).toEqual({ ok: true, batch: "2026-10-23", seeds: 3, packet: "pkt:seeds:2026-10-23", dry: false });
    first = "2026-10-23";
    const b = JSON.parse(readFileSync(path.join(ROOT, "scout", "seeds", first, "batch.json"), "utf8")) as SeedBatch;
    expect(b).toEqual({ id: first, createdAt: DAY.toISOString(), dry: false, seeds: THREE.map((s, i) => ({ id: `sd-00${i + 1}`, ...s })) });
    const j = await cli(["seeds", "new", "--json", file([brief("A second batch the same day.")]), "--dry"], new Date("2026-10-23T11:00:00.000Z"));
    expect(j.doc).toEqual({ ok: true, batch: "2026-10-23-2", seeds: 1, packet: "pkt:seeds:2026-10-23-2", dry: true });
  });

  it("refuses the whole batch with the seed's place and why, and writes nothing", async () => {
    const before = (await listSeedBatches()).length;
    const said = async (items: unknown): Promise<string> => {
      const r = await cli(["seeds", "new", "--json", file(items)]);
      expect(r.code).toBe(1);
      return r.err;
    };
    expect(await said({ sentence: "x" })).toBe("seeds: the input is a JSON array of seeds {sentence, genre, subgenre, type, audience, format, parent?}");
    expect(await said([])).toBe("seeds: the batch holds no seed");
    expect(await said(Array.from({ length: MAX_SEED_BATCH + 1 }, (_, i) => brief(`seed number ${i}`)))).toBe(`seeds: a batch holds at most ${MAX_SEED_BATCH} seeds; this one has ${MAX_SEED_BATCH + 1}`);
    expect(await said([brief("ok one"), brief("two\nlines")])).toBe("seed 2: sentence: one line");
    expect(await said([brief("s".repeat(201))])).toMatch(/^seed 1: sentence: /);
    expect(await said([brief("ok", { genre: "g".repeat(81) })])).toMatch(/^seed 1: genre: /);
    expect(await said([brief("ok", { audience: "teens" })])).toMatch(/^seed 1: audience: /);
    expect(await said([brief("ok", { format: "poster" })])).toMatch(/^seed 1: format: /);
    expect(await said([brief("ok", { mood: "dark" })])).toMatch(/^seed 1: /);
    expect(await said([brief("A fresh one."), brief("  a FRESH   one. ")])).toBe("seed 2: repeats seed 1 of this batch");
    expect(await said([brief("Fresh."), brief("a tired printer UNIONISES the office machines.")])).toBe("seed 2: done before - 2026-10-23/sd-001 (undecided)");
    expect(await said([brief("A child.", { parent: "2026-10-23/sd-001" })])).toBe("seed 1: parent: seed 2026-10-23/sd-001 is not decided yet: its batch 2026-10-23 is uncommitted");
    expect(await said([brief("A child.", { parent: "sd-001" })])).toMatch(/^seed 1: parent: /);
    expect((await listSeedBatches()).length).toBe(before);
  });

  it("a parent must be kept on a live batch, outside any paused branch; a thrown seed is done before", async () => {
    await decide(first, { kept: ["sd-001", "sd-002"], rejected: ["sd-003"], reasons: { "sd-003": ["audience"] }, notes: { "sd-003": "too young for this channel" } });
    await decide("2026-10-23-2", { kept: ["sd-001"] });
    expect(await addSeedBatch([brief("A child.", { parent: "2026-10-23/sd-003" })], { dry: false, now: DAY })).toMatchObject({ ok: false, error: { message: "seed 1: parent: seed 2026-10-23/sd-003 was not kept (rejected: audience)" } });
    expect(await addSeedBatch([brief("A child.", { parent: "2026-10-23-2/sd-001" })], { dry: false, now: DAY })).toMatchObject({ ok: false, error: { message: "seed 1: parent: seed 2026-10-23-2/sd-001 was kept on a dry batch; nothing derives from it" } });
    expect(await addSeedBatch([brief("Ten seconds of a dog learning to whistle.")], { dry: false, now: DAY })).toMatchObject({ ok: false, error: { message: "seed 1: done before - 2026-10-23/sd-003 (rejected)" } });
    expect((await pauseBranch("2026-10-23/sd-002", "operator")).ok).toBe(true);
    expect(await addSeedBatch([brief("A narrower keeper.", { parent: "2026-10-23/sd-002" })], { dry: false, now: DAY })).toMatchObject({ ok: false, error: { message: "seed 1: parent: seed 2026-10-23/sd-002 sits under the paused branch 2026-10-23/sd-002; resume it on /scout first" } });
    const child = await addSeedBatch([brief("The printer's union holds a strike vote.", { parent: "2026-10-23/sd-001" })], { dry: false, now: new Date("2026-10-24T01:00:00.000Z"), night: "2026-10-24" });
    expect(child.ok && child.value).toMatchObject({ id: "2026-10-24", night: "2026-10-24", seeds: [{ id: "sd-001", parent: "2026-10-23/sd-001" }] });
    expect((await usableSeed("2026-10-23/sd-001")).ok).toBe(true);
  });
});

describe("seeds status", () => {
  it("lists the batches newest first with their counts, and one batch's seeds with verdicts, reasons and notes", async () => {
    const all = await cli(["seeds", "status"]);
    expect(all.code).toBe(0);
    expect(all.out.split("\n")).toEqual([
      "2026-10-24      1 seeds · 0 kept · 0 rejected · 1 undecided · live",
      "2026-10-23-2    1 seeds · 1 kept · 0 rejected · 0 undecided · dry",
      "2026-10-23      3 seeds · 2 kept · 1 rejected · 0 undecided · live",
    ]);
    const one = await cli(["seeds", "status", "2026-10-23"]);
    expect(one.out.split("\n")).toEqual([
      "batch 2026-10-23 · 3 seeds · 2 kept · 1 rejected · 0 undecided · live · committed 2026-10-23 by operator",
      "  sd-001 kept      · adult · comedy › office sketch · animated comedy sketch · short — A tired printer unionises the office machines.",
      "  sd-002 kept      · adult · drama › quiet character study · animated short · video — A lighthouse keeper rations the light.",
      "  sd-003 rejected  (audience) - note: too young for this channel · kids · comedy › animal gag · animated comedy sketch · short — Ten seconds of a dog learning to whistle.",
    ]);
    expect((await cli(["seeds", "status", "2026-01-01"])).code).toBe(1);
    expect((await cli(["seeds", "plant"])).code).toBe(2);
  });
});

describe("taste - the seed sections", () => {
  const seed = (id: string, over: Partial<Seed> = {}): Seed => ({ id, sentence: `seed ${id}`, genre: "comedy", subgenre: "sketch", type: "animated comedy sketch", audience: "adult", format: "short", ...over });
  const committed = (kept: string[], rejected: string[], o: Partial<SeedCommit> = {}): SeedCommit => ({ at: "2026-10-23T10:00:00.000Z", by: "operator", kept, rejected, reasons: {}, notes: {}, dry: false, ...o });
  const b1: SeedBatch = {
    id: "2026-10-20",
    createdAt: "2026-10-20T09:00:00.000Z",
    dry: false,
    seeds: [seed("sd-001"), seed("sd-002", { audience: "kids", genre: "music", subgenre: "nursery", type: "music video" }), seed("sd-003"), seed("sd-004", { genre: "horror" }), seed("sd-005")],
    committed: committed(["sd-001", "sd-002", "sd-003", "sd-005"], ["sd-004"], { reasons: { "sd-004": ["not for us"] }, notes: { "sd-004": "no gore" } }),
  };
  const b2: SeedBatch = {
    id: "2026-10-21",
    createdAt: "2026-10-21T09:00:00.000Z",
    dry: false,
    seeds: [seed("sd-001", { parent: "2026-10-20/sd-001" }), seed("sd-002", { parent: "2026-10-20/sd-001" }), seed("sd-003", { sentence: "a newer throw" })],
    committed: committed(["sd-001"], ["sd-002", "sd-003"], { reasons: { "sd-002": ["generic"], "sd-003": ["generic", "format"] } }),
  };
  const dry: SeedBatch = { id: "2026-10-22", createdAt: "2026-10-22T09:00:00.000Z", dry: true, seeds: [seed("sd-001", { parent: "2026-10-20/sd-003" }), seed("sd-002", { parent: "2026-10-20/sd-003" })], committed: committed(["sd-001"], [], { dry: true }) };
  const ideaFrom = (id: string, fromSeed: string): IdeaCandidate => ({ id, kind: "idea", sourceIds: [], status: "rendered", title: id, target: "scene", prompt: "p", anchor: { kind: "free", ref: "" }, fromSeed });
  const night = (id: string, dryNight: boolean, candidates: IdeaCandidate[]): Night => ({ id, startedAt: `${id}T00:00:00.000Z`, ceilingUsd: 15, target: 20, clipCap: 2, dry: dryNight, state: "open", sources: [], candidates, jobs: [] });
  const nights = [night("2026-10-22", false, [ideaFrom("c-01", "2026-10-20/sd-002")]), night("2026-10-21", true, [ideaFrom("c-01", "2026-10-20/sd-003")])];
  const steer = { paused: ["2026-10-20/sd-005"], history: [] };
  const section = (md: string, h: string): string => {
    const at = md.indexOf(`## ${h}\n`);
    const end = md.indexOf("\n## ", at + 1);
    return md.slice(at, end < 0 ? undefined : end + 1);
  };

  it("lists each kept seed not paused with what it lacks; the thrown ones newest first; the paused; kept against thrown by audience then genre", () => {
    const md = tasteOf(nights, undefined, { seeds: { batches: [dry, b2, b1], steer }, extra: ["## Branches", "", "- the graph's lines", ""] });
    // b2/sd-001's two children are absent; b1/sd-001 has two (b2); sd-002 has an idea; a dry batch's children and a dry night's idea count for nothing.
    expect(section(md, "Seeds to develop")).toBe(
      [
        "## Seeds to develop",
        "",
        "- 2026-10-21/sd-001 · adult · comedy › sketch · animated comedy sketch · short (needs: child seeds, ideas) — seed sd-001",
        "- 2026-10-20/sd-001 · adult · comedy › sketch · animated comedy sketch · short (needs: ideas) — seed sd-001",
        "- 2026-10-20/sd-002 · kids · music › nursery · music video · short (needs: child seeds) — seed sd-002",
        "- 2026-10-20/sd-003 · adult · comedy › sketch · animated comedy sketch · short (needs: child seeds, ideas) — seed sd-003",
        "",
        "",
      ].join("\n"),
    );
    expect(section(md, "Seeds blocked")).toBe('## Seeds blocked\n\n- "seed sd-002" · generic\n- "a newer throw" · generic, format\n- "seed sd-004" · not for us · note: no gore\n\n');
    expect(section(md, "Paused")).toBe("## Paused\n\n- 2026-10-20/sd-005 — seed sd-005\n\n");
    expect(section(md, "Seed genres")).toBe("## Seed genres\n\n- kids: kept 1 · rejected 0\n  - music: kept 1 · rejected 0\n- adult: kept 4 · rejected 3\n  - comedy: kept 4 · rejected 2\n  - horror: kept 0 · rejected 1\n\n");
    // The extra lines follow the seed sections, before the nights.
    expect(md.indexOf("## Branches")).toBeGreaterThan(md.indexOf("## Seed genres"));
    expect(md).toContain("No committed live night yet");
  });

  it("is absent while no live batch is committed and nothing is paused; a fully developed seed is not listed", () => {
    expect(seedSections([], { batches: [dry], steer: { paused: [], history: [] } })).toEqual([]);
    expect(tasteOf([])).not.toContain("## Seeds");
    const grown: SeedBatch = { ...b1, seeds: [seed("sd-001")], committed: committed(["sd-001"], []) };
    const kids = [seed("sd-001", { sentence: "c1", parent: "2026-10-20/sd-001" }), seed("sd-002", { sentence: "c2", parent: "2026-10-20/sd-001" })];
    const child: SeedBatch = { id: "2026-10-21", createdAt: "2026-10-21T09:00:00.000Z", dry: false, seeds: kids };
    const lines = seedSections([night("2026-10-22", false, [ideaFrom("c-01", "2026-10-20/sd-001")])], { batches: [child, grown], steer: { paused: [], history: [] } });
    expect(lines.slice(0, 4)).toEqual(["## Seeds to develop", "", "- none", ""]);
  });
});
