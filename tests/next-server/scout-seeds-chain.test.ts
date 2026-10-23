// EVERY IDEA, RUN AND DIRECTION RECORDS ITS SEED (spark scout-decision-graph WP-S1) - end to end on dry nights
// over temp stores: the ideas door asks no seed until a live batch keeps one and then refuses a brief without
// one (and one the seed door refuses), each idea carrying `fromSeed`; a kept idea brought in as a source
// copies its seed, so a style, a scene, an asset over it inherit the branch; `--seed` on style/scene/asset
// adds one through the seed door and is refused when it names another branch than the idea's; a direction's
// optional `seed`. No vendor, no network: every launch is dry and detached, and fetch throws.

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-scout-seeds-chain-"));
  process.env["SCOUT_STORE_DIR"] = path.join(dir, "scout");
  process.env["EXTRACT_STORE_DIR"] = path.join(dir, "extract");
  process.env["MESH_STORE_DIR"] = path.join(dir, "mesh");
  process.env["FOUNDRY_DIR"] = path.join(dir, "catalogue");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  process.env["AI_REGISTRY_DIR"] = path.join(dir, "no-registry");
  fs.mkdirSync(path.join(dir, "catalogue"), { recursive: true });
  fs.writeFileSync(path.join(dir, "catalogue", "styles.json"), JSON.stringify({ styles: [] }), "utf8");
  return dir;
});

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { closeProcessKernel } from "@gt/kernel/process";

import { runCli, type CliPorts } from "../../pipeline/scout.mts";
import { markFromIdea } from "../../lib/foundry/scout/acts.ts";
import { checkIdeaSeeds, parseIdeas } from "../../lib/foundry/scout/idea.ts";
import { createSeedBatch } from "../../lib/foundry/scout/seedStore.ts";
import { readNight } from "../../lib/foundry/scout/store.ts";
import type { IdeaCandidate, Night, Seed } from "../../lib/foundry/scout/types.ts";

const ENV = { ...process.env, GRAVITONE_DRY_ONLY: "1" };
const LIVE = "2026-09-20";
const BATCH = "2026-09-21";
const KEPT = `${BATCH}/sd-001`;
const OTHER = `${BATCH}/sd-003`;
const THROWN = `${BATCH}/sd-002`;
/** A dry ideas job asks no studio. */
const NEVER: CliPorts = {
  ideas: {
    generate: async () => {
      throw new Error("a dry ideas job called the studio");
    },
  },
};

function png(seed: number): Buffer {
  const b = Buffer.alloc(40);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write("IHDR", 12, "ascii");
  b.writeUInt32BE(1024, 16);
  b.writeUInt32BE(576, 20);
  b.writeUInt32BE(seed, 33);
  return b;
}

const kept = (id: string, o: Partial<IdeaCandidate> = {}): IdeaCandidate => ({ id, kind: "idea", sourceIds: [], status: "rendered", title: `idea ${id}`, target: "scene", genre: "music video", prompt: `prompt of ${id}`, anchor: { kind: "free", ref: "" }, image: `ideas/${id}.png`, ...o });

beforeAll(() => {
  vi.stubGlobal("fetch", async (input: string | URL | Request) => {
    throw new Error(`unexpected fetch ${String(input)}`);
  });
  const dir = path.join(ROOT, "scout", LIVE);
  mkdirSync(path.join(dir, "ideas"), { recursive: true });
  const candidates = [kept("c-01", { fromSeed: KEPT }), kept("c-02", { title: "an idea from before seeds" })];
  candidates.forEach((c, i) => writeFileSync(path.join(dir, c.image ?? ""), png(i + 1)));
  const night: Night = { id: LIVE, startedAt: `${LIVE}T00:00:00.000Z`, ceilingUsd: 15, target: 20, clipCap: 2, dry: false, state: "committed", stop: "target", sources: [], candidates, jobs: [], committed: { at: `${LIVE}T08:00:00.000Z`, by: "operator", kept: ["c-01/board", "c-02/board"], rejected: [], reasons: {}, notes: {}, dry: false } };
  writeFileSync(path.join(dir, "night.json"), JSON.stringify(night));
});
afterEach(() => closeProcessKernel());
afterAll(() => {
  vi.unstubAllGlobals();
  rmSync(ROOT, { recursive: true, force: true });
});

async function cli(argv: string[], ports?: CliPorts): Promise<{ code: number; err: string; doc: Record<string, unknown> }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(argv, { env: ENV, out: (s) => out.push(s), err: (s) => err.push(s), ...(ports === undefined ? {} : { ports }) });
  let doc: Record<string, unknown> = {};
  try {
    doc = JSON.parse(out.join("\n")) as Record<string, unknown>;
  } catch {
    /* not a --json call */
  }
  return { code, err: err.join("\n"), doc };
}

let seq = 0;
function file(body: unknown): string {
  const p = path.join(ROOT, `in-${++seq}.json`);
  writeFileSync(p, JSON.stringify(body), "utf8");
  return p;
}

async function open(): Promise<string> {
  const r = await cli(["open", "--json"]);
  expect(r.code, r.err).toBe(0);
  return String(r.doc["night"]);
}

const idea = (title: string, o: Record<string, unknown> = {}) => ({ title, target: "scene", genre: "music video", prompt: `A rough artboard: ${title}.`, anchor: { kind: "free", ref: "" }, ...o });
const seed = (id: string, sentence: string): Seed => ({ id, sentence, genre: "music", subgenre: "lo-fi", type: "music video", audience: "family", format: "video" });

describe("the ideas door", () => {
  it("asks no seed before any live batch has kept one", async () => {
    const briefs = parseIdeas([idea("one")]);
    expect(briefs.ok && (await checkIdeaSeeds(briefs.value)).ok).toBe(true);
  });

  it("once a seed is kept, refuses a brief without one, and one the seed door refuses, with its place - nothing drawn", async () => {
    await createSeedBatch(BATCH, (id) => ({
      id,
      createdAt: `${BATCH}T09:00:00.000Z`,
      dry: false,
      seeds: [seed("sd-001", "a lo-fi rain loop for a city night"), seed("sd-002", "a nursery rhyme remix"), seed("sd-003", "a harbour at dawn, scored")],
      committed: { at: `${BATCH}T10:00:00.000Z`, by: "operator", kept: ["sd-001", "sd-003"], rejected: ["sd-002"], reasons: { "sd-002": ["generic"] }, notes: {}, dry: false },
    }));
    const night = await open();
    const no = await cli(["ideas", night, "--json", file([idea("one", { seed: KEPT }), idea("two")]), "--detach"], NEVER);
    expect(no.code).toBe(1);
    expect(no.err).toBe("idea 2: names no seed; a kept seed is in force, so every idea grows from one (seed: <batch>/sd-NNN)");
    const thrown = await cli(["ideas", night, "--json", file([idea("one", { seed: THROWN })]), "--detach"], NEVER);
    expect(thrown.err).toBe(`idea 1: seed: seed ${THROWN} was not kept (rejected: generic)`);
    expect((await cli(["ideas", night, "--json", file([idea("one", { seed: "sd-001" })]), "--detach"], NEVER)).err).toMatch(/^idea 1: seed: /);
    expect((await readNight(night)).candidates).toEqual([]);
  });

  it("an idea that names its seed carries it as fromSeed", async () => {
    const night = await open();
    const r = await cli(["ideas", night, "--json", file([idea("rain on neon", { seed: KEPT }), idea("harbour at dawn", { seed: OTHER })]), "--detach"], NEVER);
    expect(r.code, r.err).toBe(0);
    expect((await readNight(night)).candidates.map((c) => [c.id, c.fromSeed])).toEqual([
      ["c-01", KEPT],
      ["c-02", OTHER],
    ]);
  });
});

describe("a kept idea's seed rides onto what develops it", () => {
  let night = "";

  it("add-source {fromIdea} copies the idea's fromSeed onto the source; an idea from before seeds has none", async () => {
    night = await open();
    const r = await cli(["add-source", night, "--json", file([{ fromIdea: `${LIVE}/c-01` }, { fromIdea: `${LIVE}/c-02` }])]);
    expect(r.code, r.err).toBe(0);
    expect((await readNight(night)).sources.map((s) => [s.id, s.fromIdea, s.fromSeed])).toEqual([
      ["s-01", `${LIVE}/c-01`, KEPT],
      ["s-02", `${LIVE}/c-02`, undefined],
    ]);
  });

  it("a style over it carries fromIdea and fromSeed; --seed naming another branch is refused before anything is written", async () => {
    const st = await cli(["style", night, "--sources", "s-01", "--use", "a lo-fi video's look", "--detach", "--json"]);
    expect(st.code, st.err).toBe(0);
    expect(st.doc["candidate"]).toMatchObject({ kind: "style", fromIdea: `${LIVE}/c-01`, fromSeed: KEPT });
    const before = (await readNight(night)).candidates.length;
    const other = await cli(["scene", night, "--source", "s-01", "--use", "a title opener", "--seed", OTHER, "--detach"]);
    expect(other.code).toBe(1);
    expect(other.err).toBe(`--seed ${OTHER} disagrees with ${KEPT}, the seed of kept idea ${LIVE}/c-01 this run develops`);
    const same = await cli(["scene", night, "--source", "s-01", "--use", "a title opener", "--seed", KEPT, "--detach"]);
    expect(same.code, same.err).toBe(0);
    const thrown = await cli(["style", night, "--sources", "s-02", "--use", "a look", "--seed", THROWN, "--detach"]);
    expect(thrown.err).toBe(`--seed: seed ${THROWN} was not kept (rejected: generic)`);
    expect((await readNight(night)).candidates).toHaveLength(before + 1);
  });

  it("--seed on a run over a source with no seed adds one", async () => {
    const r = await cli(["scene", night, "--source", "s-02", "--use", "a harbour opener", "--seed", OTHER, "--detach"]);
    expect(r.code, r.err).toBe(0);
    const scenes = (await readNight(night)).candidates.filter((c) => c.kind === "scene");
    expect(scenes.map((c) => [c.fromIdea, c.fromSeed])).toEqual([
      [`${LIVE}/c-01`, KEPT],
      [`${LIVE}/c-02`, OTHER],
    ]);
  });

  it("an asset from a kept idea inherits its seed; --seed adds one to an asset with no idea, and a refused one writes nothing", async () => {
    const brief = { class: "prop", subject: "a rain-streaked neon sign", use: "a lo-fi video's hero prop", serves: { newProject: "a lo-fi channel" } };
    const a = await cli(["asset", night, "--brief", file({ ...brief, fromIdea: `${LIVE}/c-01` }), "--detach", "--json"]);
    expect(a.code, a.err).toBe(0);
    expect(a.doc["candidate"]).toMatchObject({ kind: "asset3d", fromIdea: `${LIVE}/c-01`, fromSeed: KEPT });
    const before = (await readNight(night)).candidates.length;
    const bad = await cli(["asset", night, "--brief", file({ ...brief, subject: "a ship's bell", fromIdea: `${LIVE}/c-01` }), "--seed", OTHER, "--detach"]);
    expect(bad.err).toBe(`--seed ${OTHER} disagrees with ${KEPT}, the seed of kept idea ${LIVE}/c-01 this run develops`);
    expect((await readNight(night)).candidates).toHaveLength(before);
    const b = await cli(["asset", night, "--brief", file({ ...brief, subject: "a harbour crane" }), "--seed", OTHER, "--detach", "--json"]);
    expect(b.code, b.err).toBe(0);
    expect(b.doc["candidate"]).toMatchObject({ kind: "asset3d", fromSeed: OTHER });
    const c = (await readNight(night)).candidates.at(-1);
    expect(c).toMatchObject({ kind: "asset3d", fromSeed: OTHER });
    expect(c?.fromIdea).toBeUndefined();
  });

  it("markFromIdea sets the idea's seed with its ref", async () => {
    const c = (await readNight(night)).candidates.at(-1);
    if (c === undefined) throw new Error("no candidate");
    await markFromIdea(night, c.id, `${LIVE}/c-01`);
    expect((await readNight(night)).candidates.at(-1)).toMatchObject({ fromIdea: `${LIVE}/c-01`, fromSeed: KEPT });
  });

  it("a direction may name the seed it confirms, through the seed door", async () => {
    const d = { title: "Lo-fi city nights", format: "video", genre: "music video", style: "rain on neon", tone: "slow, warm", audience: "families", premise: "One city, one rain, one loop.", basedOn: [`${LIVE}/c-01/board`] };
    const bad = await cli(["direction", night, "--json", file({ ...d, seed: THROWN })]);
    expect(bad.err).toBe(`direction: seed: seed ${THROWN} was not kept (rejected: generic)`);
    const r = await cli(["direction", night, "--json", file({ ...d, seed: KEPT })]);
    expect(r.code, r.err).toBe(0);
    expect((await readNight(night)).candidates.at(-1)).toMatchObject({ kind: "direction", fromSeed: KEPT });
  });
});
