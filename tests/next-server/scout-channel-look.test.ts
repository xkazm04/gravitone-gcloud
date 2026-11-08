// A CHANNEL'S LOOK (perfect 2026-11-08, channel-look-in-frames) - lib/foundry/scout/channelLook.ts and the door that
// uses it, over the REAL channel store in a temp SCOUT_CHANNELS_DIR (no fake door): the pure composition (look first, no
// doubling, the ceiling refused with a sentence, no look = the same array), a file written before looks existed still
// reading while an unknown key is still refused, the verb that sets and clears a look, a re-import and a state move that
// keep it, and the storyboard act writing the composed prompts and the look it drew with - a channel with no look
// writing the seat's words byte for byte. No ComfyUI, no seat, no network.

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-scout-look-"));
  process.env["SCOUT_STORE_DIR"] = path.join(dir, "scout");
  process.env["SCOUT_MUSE_STORE_DIR"] = path.join(dir, "scout-muse");
  process.env["SCOUT_CHANNELS_DIR"] = path.join(dir, "scout-channels");
  process.env["SCOUT_SEED_STORE_DIR"] = path.join(dir, "seeds");
  process.env["EXTRACT_STORE_DIR"] = path.join(dir, "extract");
  process.env["MESH_STORE_DIR"] = path.join(dir, "mesh");
  process.env["STRIPS_STORE_DIR"] = path.join(dir, "strips");
  process.env["FOUNDRY_DIR"] = path.join(dir, "catalogue");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  process.env["AI_REGISTRY_DIR"] = path.join(dir, "no-registry");
  process.env["SPEND_STORE"] = "memory";
  fs.mkdirSync(path.join(dir, "catalogue"), { recursive: true });
  fs.writeFileSync(path.join(dir, "catalogue", "styles.json"), JSON.stringify({ styles: [] }), "utf8");
  return dir;
});

import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { closeProcessKernel } from "@gt/kernel/process";

import { runCli, type CliPorts } from "../../pipeline/scout.mts";
import { composeLook, LOOK_MAX, lookOf } from "../../lib/foundry/scout/channelLook.ts";
import { episodesDue, importEpisodes, readChannel, setChannelLook, setEpisodeState } from "../../lib/foundry/scout/channels.ts";
import { Refusal } from "../../lib/foundry/scout/acts.ts";
import { readNight } from "../../lib/foundry/scout/store.ts";
import type { StoryboardCandidate } from "../../lib/foundry/scout/types.ts";

const DRY = { ...process.env, GRAVITONE_DRY_ONLY: "1" };
const LIVE = (() => {
  const { GRAVITONE_DRY_ONLY: _pin, ...rest } = process.env;
  return rest;
})();
const DIR = path.join(ROOT, "scout-channels");
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const LOOK = "35mm documentary grain, cold steel light, shallow depth";

beforeEach(() => {
  rmSync(DIR, { recursive: true, force: true });
  rmSync(path.join(ROOT, "scout"), { recursive: true, force: true });
  vi.stubGlobal("fetch", async (input: string | URL | Request) => {
    throw new Error(`unexpected fetch ${String(input)}`);
  });
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  closeProcessKernel();
});
afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

const BEATS = ["the kettle sits cold", "the element glows", "bubbles nucleate", "the whistle", "steam rolls"];
const item = (id: string) => ({ id, title: `Title of ${id}`, logline: `logline of ${id}`, beats: BEATS, spec: `spec of ${id}` });
const chan = (id: string, group: string, ids: string[]) => ({ id, group, name: `Channel ${id}`, audience: "adults", promise: `promise of ${id}`, gap: "a gap", edge: "an edge", items: ids.map(item) });
const report = (ids: string[]): string => ["Outline triage", ...ids.map((i) => `  ${i} keep · Title of ${i}`)].join("\n");

async function seed(): Promise<void> {
  const r = await importEpisodes({ outlines: [chan("F1", "Documentary", ["F1-01", "F1-02", "F1-03"]), chan("D1", "Data explainer", ["D1-01"])], report: report(["F1-01", "F1-02", "D1-01"]) });
  expect(r.imported).toEqual(["F1-01", "F1-02", "D1-01"]);
}

/* ── the composition ──────────────────────────────────────────────────────── */

describe("composeLook", () => {
  const panels = ["a cold steel kettle, macro", "the element glowing orange"];

  it("no look: the very same array, so the prompts are byte-identical", () => {
    expect(composeLook(undefined, panels)).toBe(panels);
  });

  it("the look leads every panel, ending in one full stop", () => {
    expect(composeLook(LOOK, panels)).toEqual([`${LOOK}. a cold steel kettle, macro`, `${LOOK}. the element glowing orange`]);
    expect(composeLook(`${LOOK}.`, panels)[0]).toBe(`${LOOK}. a cold steel kettle, macro`);
  });

  it("a panel that already opens with the look's words is not doubled (case and spacing aside)", () => {
    const said = ["35MM documentary  grain, cold steel light, shallow depth. a cold kettle", "a cold steel kettle, macro"];
    const out = composeLook(LOOK, said);
    expect(out[0]).toBe(said[0]);
    expect(out[1]).toBe(`${LOOK}. a cold steel kettle, macro`);
  });

  it("a look in the middle of a panel is not an opening: it is still written in front", () => {
    expect(composeLook(LOOK, [`a kettle, ${LOOK}`])[0]).toBe(`${LOOK}. a kettle, ${LOOK}`);
  });

  it("the longest brief panel and the longest look always fit under what Flux takes", () => {
    const out = composeLook("x".repeat(LOOK_MAX), ["y".repeat(1500)], "storyboard 1");
    expect(out[0]?.length).toBeLessThanOrEqual(2000);
  });

  it("a composed prompt past the frame ceiling is refused with a sentence naming the panel", () => {
    expect(() => composeLook(LOOK, ["a", "b".repeat(1990)], "storyboard 2")).toThrow(/^storyboard 2: panel 2 with its channel's look is \d+ characters; a frame prompt is at most 2000$/);
    expect(() => composeLook(LOOK, ["b".repeat(1990)])).toThrow(Refusal);
  });

  it("lookOf reads a channel's look and calls blank or absent none", () => {
    const base = { id: "F1", group: "g", name: "n", audience: "a", promise: "p", gap: "g", edge: "e", medium: "storyboard" as const };
    expect(lookOf(base)).toBeUndefined();
    expect(lookOf({ ...base, look: LOOK } as typeof base)).toBe(LOOK);
    expect(lookOf({ ...base, look: "  " } as typeof base)).toBeUndefined();
  });
});

/* ── the store ────────────────────────────────────────────────────────────── */

describe("the channel's look in the store", () => {
  it("a file written before looks existed still parses, reads as no look, and an unknown key is still refused", async () => {
    await seed();
    const f = path.join(DIR, "F1.json");
    const old = JSON.parse(readFileSync(f, "utf8")) as { channel: Record<string, unknown> };
    expect(old.channel).not.toHaveProperty("look");
    expect((await readChannel("F1")).channel).not.toHaveProperty("look");
    writeFileSync(f, JSON.stringify({ ...old, channel: { ...old.channel, tone: "x" } }), "utf8");
    await expect(readChannel("F1")).rejects.toThrow(/damaged/);
  });

  it("sets, trims, replaces and (with empty text) clears a look; refuses an unknown channel and one too long", async () => {
    await seed();
    expect((await setChannelLook("F1", `  ${LOOK}  `)).look).toBe(LOOK);
    expect((await readChannel("F1")).channel.look).toBe(LOOK);
    expect((await readChannel("D1")).channel).not.toHaveProperty("look");
    expect((await setChannelLook("F1", "a warmer look")).look).toBe("a warmer look");
    const cleared = await setChannelLook("F1", "   ");
    expect(cleared).not.toHaveProperty("look");
    expect(JSON.parse(readFileSync(path.join(DIR, "F1.json"), "utf8")).channel).not.toHaveProperty("look");
    await expect(setChannelLook("F9", LOOK)).rejects.toThrow("channels: no channel F9");
    await expect(setChannelLook("nope", LOOK)).rejects.toThrow("not a channel id");
    await expect(setChannelLook("F1", "x".repeat(LOOK_MAX + 1))).rejects.toThrow(`a look is at most ${LOOK_MAX} characters`);
    expect((await readChannel("F1")).channel).not.toHaveProperty("look");
  });

  it("a re-import and a state move leave a set look where it was", async () => {
    await seed();
    await setChannelLook("F1", LOOK);
    const again = await importEpisodes({ outlines: [chan("F1", "Documentary", ["F1-01", "F1-02", "F1-03"])], report: report(["F1-01", "F1-03"]) });
    expect(again.imported).toEqual(["F1-03"]);
    expect((await readChannel("F1")).channel.look).toBe(LOOK);
    await setEpisodeState("F1-01", "in-production", { candidate: "2026-11-08/c-01" });
    expect((await readChannel("F1")).channel.look).toBe(LOOK);
    expect((await episodesDue()).find((d) => d.channel.id === "F1")?.channel).toMatchObject({ look: LOOK });
  });
});

/* ── the verb ─────────────────────────────────────────────────────────────── */

async function cli(argv: string[], o: { env?: Record<string, string | undefined>; ports?: CliPorts } = {}): Promise<{ code: number; out: string; err: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(argv, { env: o.env ?? DRY, out: (s) => out.push(s), err: (s) => err.push(s), ...(o.ports === undefined ? {} : { ports: o.ports }) });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

describe("scout channel-look", () => {
  it("sets a look on the channel file in the temp store, shows it, and an empty text clears it", async () => {
    await seed();
    const set = await cli(["channel-look", "F1", LOOK]);
    expect(set.code, set.err).toBe(0);
    expect(set.out).toContain(`F1 Channel F1 · look: ${LOOK}`);
    expect(JSON.parse(readFileSync(path.join(DIR, "F1.json"), "utf8")).channel.look).toBe(LOOK);
    const json = await cli(["channel-look", "F1", "a second look", "--json"]);
    expect(JSON.parse(json.out)).toMatchObject({ ok: true, channel: { id: "F1", look: "a second look" } });
    const clear = await cli(["channel-look", "F1", ""]);
    expect(clear.code, clear.err).toBe(0);
    expect(clear.out).toContain("F1 Channel F1 · no look");
    expect(JSON.parse(readFileSync(path.join(DIR, "F1.json"), "utf8")).channel).not.toHaveProperty("look");
  });

  it("refuses an unknown channel, a missing text and an over-long one", async () => {
    await seed();
    expect((await cli(["channel-look", "F7", LOOK])).code).toBe(1);
    expect((await cli(["channel-look", "F1"])).err).toContain("channel-look <channelId>");
    const long = await cli(["channel-look", "F1", "x".repeat(LOOK_MAX + 1)]);
    expect(long.code).toBe(1);
    expect(long.err).toContain("a look is at most");
  });
});

/* ── the storyboard door ──────────────────────────────────────────────────── */

const PANELS = ["a cold steel kettle on a stove, macro", "the element glowing orange beneath water", "bubbles forming on hot steel, macro"];
const brief = (o: Record<string, unknown>) => ({
  title: "The kettle from inside",
  paragraph: "A camera rides a bubble from the element to the spout while the water boils.",
  bullets: ["beats: cold, glow, nucleation, whistle, steam", "format: a 60 s video", "look: macro, warm steel"],
  panels: PANELS,
  ...o,
});
let seq = 0;
function file(body: unknown): string {
  const p = path.join(ROOT, `in-${++seq}.json`);
  writeFileSync(p, JSON.stringify(body), "utf8");
  return p;
}
async function open(env: Record<string, string | undefined>, args: string[] = []): Promise<string> {
  const r = await cli(["open", "--json", ...args], { env });
  expect(r.code, r.err).toBe(0);
  return String((JSON.parse(r.out) as { night: string }).night);
}
const boards = async (night: string): Promise<StoryboardCandidate[]> => (await readNight(night)).candidates.filter((c): c is StoryboardCandidate => c.kind === "storyboard");

describe("storyboard under a channel's look", () => {
  it("writes the composed prompts and records the look it drew with", async () => {
    await seed();
    await setChannelLook("F1", LOOK);
    const night = await open(DRY);
    const r = await cli(["storyboard", night, "--json", file([brief({ fromEpisode: "F1-01" })])]);
    expect(r.code, r.err).toBe(0);
    const [c] = await boards(night);
    expect(c?.panels).toEqual(PANELS.map((p) => `${LOOK}. ${p}`));
    expect(c?.look).toBe(LOOK);
  });

  it("does not double a look the seat's panel already opens with", async () => {
    await seed();
    await setChannelLook("F1", LOOK);
    const night = await open(DRY);
    const said = [`${LOOK}. a cold kettle`, ...PANELS.slice(1)];
    expect((await cli(["storyboard", night, "--json", file([brief({ fromEpisode: "F1-01", panels: said })])])).code).toBe(0);
    const [c] = await boards(night);
    expect(c?.panels[0]).toBe(said[0]);
    expect(c?.panels[1]).toBe(`${LOOK}. ${PANELS[1]}`);
  });

  it("a channel with no look writes the seat's words byte for byte and no look key", async () => {
    await seed();
    const night = await open(DRY);
    expect((await cli(["storyboard", night, "--json", file([brief({ fromEpisode: "F1-02" })])])).code).toBe(0);
    const [c] = await boards(night);
    expect(c?.panels).toEqual(PANELS);
    expect(c).not.toHaveProperty("look");
  });

  it("a live night draws the composed prompts, the same ones the candidate holds (the receipt hashes those)", async () => {
    await seed();
    await setChannelLook("F1", LOOK);
    const night = await open(LIVE, ["--live"]);
    const drawn: string[] = [];
    const ports: CliPorts = { storyboard: { draw: async (prompt, o) => (drawn.push(prompt), { png: PNG, seed: o.seed ?? 7 }) } };
    const r = await cli(["storyboard", night, "--json", file([brief({ fromEpisode: "F1-01" })])], { env: LIVE, ports });
    expect(r.code, r.err).toBe(0);
    const [c] = await boards(night);
    expect(c?.panels).toEqual(PANELS.map((p) => `${LOOK}. ${p}`));
    expect(drawn).toEqual(c?.panels);
  });

  it("a reel channel's episode is refused before any look is read", async () => {
    await seed();
    await setChannelLook("D1", LOOK);
    const night = await open(DRY);
    const r = await cli(["storyboard", night, "--json", file([brief({ fromEpisode: "D1-01" })])]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("only a storyboard channel's episode is storyboarded");
  });
});
