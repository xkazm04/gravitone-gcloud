// THE BACKLOG AND THE SEED GATE, AND A MUSIC SEED'S SONG (spark scout-vision WP1) - lib/foundry/scout/backlog.ts over
// nights and batches (what waits, what does not, the kept seeds with no idea, the refusal's sentence, the brief's
// `## Backlog`); the seeds door end to end over a temp scout store (21 fresh refused while 20 ideas wait, accepted at
// 19, children never counted, a dry batch gated too, nothing written on a refusal); the `music` facets (required on a
// music type, refused on any other, old seeds read as they are, the facets line); the seed Board cell's hashed body
// byte-identical for a seed without music; `status --json`'s backlog. Words only: no kernel job, no vendor.

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-scout-backlog-"));
  process.env["SCOUT_STORE_DIR"] = path.join(dir, "scout");
  process.env["SCOUT_MUSE_STORE_DIR"] = path.join(dir, "scout-muse");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  process.env["AI_REGISTRY_DIR"] = path.join(dir, "no-registry");
  return dir;
});

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { runCli } from "../../pipeline/scout.mts";
import { body } from "../../lib/decision/v1/sources/seeds.ts";
import { backlogOf, backlogSection, freshSeedRefusal, type Backlog } from "../../lib/foundry/scout/backlog.ts";
import { createSeedBatch, listSeedBatches } from "../../lib/foundry/scout/seedStore.ts";
import { addSeedBatch, seedFacets } from "../../lib/foundry/scout/seeds.ts";
import type { Candidate, IdeaCandidate, Night, NightCommit, Seed, SeedBatch, SeedCommit, StoryboardCandidate } from "../../lib/foundry/scout/types.ts";

afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

const ENV = { ...process.env, GRAVITONE_DRY_ONLY: "1" };
const pad = (i: number): string => String(i).padStart(2, "0");
const idea = (id: string, o: Partial<IdeaCandidate> = {}): IdeaCandidate => ({ id, kind: "idea", sourceIds: [], status: "rendered", title: `idea ${id}`, target: "scene", prompt: `prompt ${id}`, anchor: { kind: "free", ref: "" }, image: `ideas/${id}.png`, ...o });
const board = (id: string, fromIdea: string, o: Partial<StoryboardCandidate> = {}): StoryboardCandidate => ({ id, kind: "storyboard", sourceIds: [], status: "rendered", fromIdea, title: `board ${id}`, paragraph: "p", bullets: ["a", "b", "c"], panels: ["x"], ...o });
const commit = (kept: string[], o: Partial<NightCommit> = {}): NightCommit => ({ at: "2026-10-10T08:00:00.000Z", by: "operator", kept, rejected: [], reasons: {}, notes: {}, dry: false, ...o });
const night = (id: string, candidates: Candidate[], committed?: NightCommit, dry = false): Night => ({ id, startedAt: `${id}T00:00:00.000Z`, ceilingUsd: 15, target: 20, clipCap: 2, dry, state: committed === undefined ? "closed" : "committed", sources: [], candidates, jobs: [], ...(committed === undefined ? {} : { committed }) });

/** `n` kept scene ideas waiting on one live committed night, c-01..c-nn. */
const waitingNight = (id: string, n: number): Night => {
  const ideas = Array.from({ length: n }, (_, i) => idea(`c-${pad(i + 1)}`));
  return night(id, ideas, commit(ideas.map((c) => `${c.id}/board`)));
};

describe("backlogOf - what waits", () => {
  it("a kept scene or style idea of a live committed night with no storyboard that did not fail; oldest night first", () => {
    const older = night(
      "2026-10-01",
      [idea("c-01"), idea("c-02", { target: "style" }), idea("c-03", { target: "stats" }), idea("c-04", { target: "asset3d" }), idea("c-05"), idea("c-06"), idea("c-07"), idea("c-08")],
      commit(["c-01/board", "c-02/board", "c-03/board", "c-04/board", "c-05/board", "c-06/board", "c-07/board"], { rejected: ["c-08/board"], open: ["c-07/board"] }),
    );
    const newer = night("2026-10-02", [idea("c-01"), board("c-02", "2026-10-01/c-05"), board("c-03", "2026-10-01/c-06", { status: "failed", error: "panel 1: comfy answered 500" })], commit(["c-01/board"]));
    const dryNight = night("2026-10-03", [idea("c-01")], commit(["c-01/board"], { dry: true }), true);
    const dryCommit = night("2026-10-04", [idea("c-01")], commit(["c-01/board"], { dry: true }));
    const uncommitted = night("2026-10-05", [idea("c-01")]);
    const b = backlogOf([uncommitted, dryCommit, dryNight, newer, older], []);
    // c-03 stats and c-04 asset never hold the gate; c-05 has a storyboard; c-06's failed so it waits; c-07 is still open; c-08 thrown.
    expect(b).toEqual({ waiting: ["2026-10-01/c-01", "2026-10-01/c-02", "2026-10-01/c-06", "2026-10-02/c-01"], seedsWaiting: 0, gated: false, freshAllowed: null });
  });

  it("gated at BACKLOG_GATE waiting: 20 closes it, 19 does not", () => {
    expect(backlogOf([waitingNight("2026-10-01", 20)], [])).toMatchObject({ gated: true, freshAllowed: 20 });
    expect(backlogOf([waitingNight("2026-10-01", 19)], [])).toMatchObject({ gated: false, freshAllowed: null });
  });

  it("counts the kept seeds no idea grows from: a paused branch, a dry batch, a rejected seed and a seed with an idea are left out; a failed idea grows nothing", () => {
    const seed = (id: string, o: Partial<Seed> = {}): Seed => ({ id, sentence: `seed ${id}`, genre: "comedy", subgenre: "sketch", type: "animated comedy sketch", audience: "adult", format: "short", ...o });
    const c = (kept: string[], o: Partial<SeedCommit> = {}): SeedCommit => ({ at: "2026-10-01T08:00:00.000Z", by: "operator", kept, rejected: [], reasons: {}, notes: {}, dry: false, ...o });
    const live: SeedBatch = { id: "2026-10-01", createdAt: "2026-10-01T07:00:00.000Z", dry: false, seeds: ["sd-001", "sd-002", "sd-003", "sd-004", "sd-005", "sd-006"].map((id) => seed(id)), committed: c(["sd-001", "sd-002", "sd-003", "sd-004", "sd-006"], { rejected: ["sd-005"], reasons: { "sd-005": ["generic"] } }) };
    const child: SeedBatch = { id: "2026-10-02", createdAt: "2026-10-02T07:00:00.000Z", dry: false, seeds: [seed("sd-001", { parent: "2026-10-01/sd-002" })], committed: c(["sd-001"]) };
    const dry: SeedBatch = { id: "2026-10-03", createdAt: "2026-10-03T07:00:00.000Z", dry: true, seeds: [seed("sd-001")], committed: c(["sd-001"], { dry: true }) };
    const grown = night("2026-10-04", [idea("c-01", { fromSeed: "2026-10-01/sd-003" }), idea("c-02", { fromSeed: "2026-10-01/sd-004", status: "failed", error: "studio answered 500" })]);
    const dryIdea = night("2026-10-05", [idea("c-01", { fromSeed: "2026-10-01/sd-006" })], undefined, true);
    // sd-001 and sd-004 (its only idea failed) and sd-006 (a dry night's idea is a stand-in) wait; sd-002 is paused, and its child under it.
    const b = backlogOf([grown, dryIdea], [dry, child, live], { paused: ["2026-10-01/sd-002"], history: [] });
    expect(b.seedsWaiting).toBe(3);
    expect(backlogOf([grown, dryIdea], [dry, child, live]).seedsWaiting).toBe(5);
  });
});

describe("freshSeedRefusal and the brief's section", () => {
  const gated: Backlog = { waiting: Array.from({ length: 52 }, (_, i) => `2026-10-01/c-${pad(i + 1)}`), seedsWaiting: 89, gated: true, freshAllowed: 20 };
  const fresh = (n: number) => Array.from({ length: n }, (_, i) => ({ sentence: `s${i}`, genre: "g", subgenre: "s", type: "t", audience: "adult" as const, format: "short" as const }));
  const children = (n: number) => fresh(n).map((s) => ({ ...s, parent: "2026-10-01/sd-001" }));

  it("refuses more fresh seeds than the gate allows, in one sentence with the numbers; children are not counted", () => {
    expect(freshSeedRefusal(gated, [...fresh(64), ...children(10)])).toBe("the backlog holds 52 kept ideas with no storyboard (gate 20): at most 20 fresh seeds, this batch has 64; child seeds are not limited");
    expect(freshSeedRefusal(gated, [...fresh(20), ...children(100)])).toBeUndefined();
    expect(freshSeedRefusal({ ...gated, waiting: gated.waiting.slice(0, 19), gated: false, freshAllowed: null }, fresh(150))).toBeUndefined();
  });

  it("`## Backlog`: the counts, the gate, the 20 oldest waiting with their titles", () => {
    const n = waitingNight("2026-10-01", 22);
    const lines = backlogSection(backlogOf([n], []), [n]);
    expect(lines.slice(0, 6)).toEqual(["## Backlog", "", "- kept ideas waiting for a storyboard: 22", "- kept seeds with no idea: 0", "- gate: on · at most 20 fresh seeds a batch; child seeds unlimited", ""]);
    expect(lines.slice(6)).toEqual([...Array.from({ length: 20 }, (_, i) => `- 2026-10-01/c-${pad(i + 1)} · idea c-${pad(i + 1)}`), "- and 2 more", ""]);
    expect(backlogSection(backlogOf([], []))).toEqual(["## Backlog", "", "- kept ideas waiting for a storyboard: 0", "- kept seeds with no idea: 0", "- gate: off · 20 more waiting ideas close it", ""]);
  });
});

/* ── the door, on disk ─────────────────────────────────────────────────────── */

const NIGHT = "2026-10-01";
function writeNight(n: Night): void {
  const dir = path.join(ROOT, "scout", n.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "night.json"), JSON.stringify(n));
}

let seq = 0;
const brief = (o: Record<string, unknown> = {}) => ({ sentence: `A fresh seed number ${++seq}.`, genre: "comedy", subgenre: "office sketch", type: "animated comedy sketch", audience: "adult", format: "short", ...o });
const briefs = (n: number, o: Record<string, unknown> = {}) => Array.from({ length: n }, () => brief(o));
const PARENT = "2026-09-30/sd-001";
const parentBatch = createSeedBatch("2026-09-30", (id) => ({
  id,
  createdAt: "2026-09-30T08:00:00.000Z",
  dry: false,
  seeds: [{ id: "sd-001", sentence: "The kept parent of every child below.", genre: "comedy", subgenre: "office sketch", type: "animated comedy sketch", audience: "adult", format: "short" }],
  committed: { at: "2026-09-30T09:00:00.000Z", by: "operator", kept: ["sd-001"], rejected: [], reasons: {}, notes: {}, dry: false },
}));
const DAY = new Date("2026-10-11T09:00:00.000Z");

describe("the seeds door holds the gate", () => {
  it("21 fresh refused while 20 ideas wait, nothing written; 20 fresh and any children pass; a dry batch is gated too", async () => {
    await parentBatch;
    writeNight(waitingNight(NIGHT, 20));
    const before = (await listSeedBatches()).length;
    const no = await addSeedBatch(briefs(21), { dry: false, now: DAY });
    expect(no).toMatchObject({ ok: false, error: { code: "refused", message: "seeds: the backlog holds 20 kept ideas with no storyboard (gate 20): at most 20 fresh seeds, this batch has 21; child seeds are not limited" } });
    expect(await addSeedBatch(briefs(21), { dry: true, now: DAY })).toMatchObject({ ok: false, error: { code: "refused" } });
    expect((await listSeedBatches()).length).toBe(before);
    const kids = await addSeedBatch([...briefs(20), ...briefs(40, { parent: PARENT })], { dry: false, now: DAY });
    expect(kids.ok && kids.value.seeds.length).toBe(60);
  });

  it("accepted at 19 waiting", async () => {
    writeNight(waitingNight(NIGHT, 19));
    const r = await addSeedBatch(briefs(21), { dry: false, now: DAY });
    expect(r.ok && r.value.seeds.length).toBe(21);
  });

  it("`status <night> --json` carries the backlog, over the scout wing", async () => {
    writeNight(waitingNight(NIGHT, 20));
    const out: string[] = [];
    const code = await runCli(["status", NIGHT, "--json"], { env: ENV, out: (s) => out.push(s), err: () => undefined });
    expect(code).toBe(0);
    const doc = JSON.parse(out.join("\n")) as { backlog: unknown };
    // The parent and the children batches' kept seeds: only the parent is decided and kept, and no idea grows from it.
    expect(doc.backlog).toEqual({ waiting: 20, seedsWaiting: 1, gated: true, freshAllowed: 20 });
  });
});

describe("a music seed's song", () => {
  const music = { instruments: ["nylon guitar", "cello"], tempo: 92, mood: "melancholic", vocals: "instrumental" };
  const door = async (items: unknown[]): Promise<string> => {
    const r = await addSeedBatch(items, { dry: false, now: DAY });
    return r.ok ? "ok" : r.error.message;
  };

  it("is required on a music type, refused on any other, and held to its bounds", async () => {
    writeNight(waitingNight(NIGHT, 0));
    expect(await door([brief({ type: "music video" })])).toBe("seed 1: music: a music video seed gives its song {instruments, tempo, mood, vocals}");
    expect(await door([brief({ music })])).toBe("seed 1: music: only a music video, lyric video, visualizer seed takes music; this one is a animated comedy sketch");
    // The exact string: "Music Video" is not a music type, so it takes no song.
    expect(await door([brief({ type: "Music Video", music })])).toMatch(/^seed 1: music: only a /);
    expect(await door([brief({ type: "visualizer", music: { ...music, tempo: 39 } })])).toMatch(/^seed 1: music\.tempo: /);
    expect(await door([brief({ type: "visualizer", music: { ...music, tempo: 92.5 } })])).toMatch(/^seed 1: music\.tempo: /);
    expect(await door([brief({ type: "visualizer", music: { ...music, instruments: [] } })])).toMatch(/^seed 1: music\.instruments: /);
    expect(await door([brief({ type: "visualizer", music: { ...music, instruments: ["a", "b", "c", "d", "e", "f", "g"] } })])).toMatch(/^seed 1: music\.instruments: /);
    expect(await door([brief({ type: "visualizer", music: { ...music, instruments: ["x".repeat(41)] } })])).toMatch(/^seed 1: music\.instruments\.0: /);
    expect(await door([brief({ type: "visualizer", music: { ...music, mood: "" } })])).toMatch(/^seed 1: music\.mood: /);
    expect(await door([brief({ type: "visualizer", music: { ...music, vocals: "rap" } })])).toMatch(/^seed 1: music\.vocals: /);
    expect(await door([brief({ type: "visualizer", music: { ...music, key: "D minor" } })])).toMatch(/^seed 1: music: /);
  });

  it("is stored as given and printed after the facets; a stored seed without one still reads", async () => {
    writeNight(waitingNight(NIGHT, 0));
    const r = await addSeedBatch([brief({ type: "lyric video", music: { ...music, vocals: "female" } })], { dry: false, now: DAY });
    if (!r.ok) throw new Error(r.error.message);
    const s = r.value.seeds[0];
    expect(s?.music).toEqual({ ...music, vocals: "female" });
    if (s === undefined) throw new Error("no seed");
    expect(seedFacets(s)).toBe("adult · comedy › office sketch · lyric video · short · 92 bpm · nylon guitar, cello · melancholic · female");
    const old = (await listSeedBatches()).find((b) => b.id === "2026-09-30")?.seeds[0];
    expect(old?.music).toBeUndefined();
    if (old === undefined) throw new Error("no parent seed");
    expect(seedFacets(old)).toBe("adult · comedy › office sketch · animated comedy sketch · short");
  });

  it("the seed Board cell's hashed body is byte-identical for a seed without music; a music seed's song is one more line", () => {
    const plain: Seed = { id: "sd-001", sentence: "A tired printer unionises.", genre: "comedy", subgenre: "office sketch", type: "animated comedy sketch", audience: "adult", format: "short", parent: "2026-10-01/sd-002" };
    expect(body(plain)).toBe("A tired printer unionises.\nadult\ncomedy\noffice sketch\nanimated comedy sketch\nshort\n2026-10-01/sd-002");
    const { parent: _p, ...fresh } = plain;
    expect(body(fresh)).toBe("A tired printer unionises.\nadult\ncomedy\noffice sketch\nanimated comedy sketch\nshort\n");
    expect(body({ ...fresh, type: "visualizer", music: { instruments: ["cello"], tempo: 60, mood: "still", vocals: "instrumental" } })).toBe("A tired printer unionises.\nadult\ncomedy\noffice sketch\nvisualizer\nshort\n\n60 bpm · cello · still · instrumental");
  });
});
