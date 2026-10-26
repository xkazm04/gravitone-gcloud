// A CHANNEL EPISODE AT THE NIGHT'S DOORS (spark project-baseline WP-B) - `scout storyboard` and `scout reel` with
// `fromEpisode`, every store a temp directory set below before any lib/ module loads, the channel store a FAKE door
// (lib/foundry/scout/episodeMoves.ts setEpisodeDoorForTests) that holds the store's state machine: the door's refusals
// (both or neither ref, a twice-named episode, a wrong state, a reel of a storyboard channel, a reel ask with no brief
// or approach), the channel's use and aim lent, the moves a live night makes (in production at the launch, made at the
// render, back to outline-kept when the storyboard fails - and the failed one frees it), a dry night moving nothing,
// `followNight` over a committed night (kept, thrown, idempotent, a refusing store never thrown), and the taste brief's
// `## Episodes due`. No ComfyUI, no seat, no network: the engines are fakes.

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-scout-episodes-"));
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

import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { Channel, Episode, EpisodeState } from "@gt/domain/channel";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { closeProcessKernel } from "@gt/kernel/process";

import { runCli, type CliPorts } from "../../pipeline/scout.mts";
import type { AgentResult, RunAgentInput } from "../../lib/agent/cliSeam.ts";
import { Refusal, type ActContext } from "../../lib/foundry/scout/acts.ts";
import { followNight, movesTo, setEpisodeDoorForTests, type EpisodeDoor } from "../../lib/foundry/scout/episodeMoves.ts";
import { reelAct } from "../../lib/foundry/scout/reel.ts";
import { parseReelAsks } from "../../lib/foundry/scout/reelDoor.ts";
import { createNight, readNight } from "../../lib/foundry/scout/store.ts";
import { parseStoryboards } from "../../lib/foundry/scout/storyboard.ts";
import { episodesFirst, episodesSection } from "../../lib/foundry/scout/tasteEpisodes.ts";
import type { Night, ReelCandidate, StoryboardCandidate } from "../../lib/foundry/scout/types.ts";
import { standInPage } from "../../lib/foundry/strips/author.ts";
import type { ReelEngines } from "../../lib/producers/scoutReelActs.ts";

const DRY = { ...process.env, GRAVITONE_DRY_ONLY: "1" };
const LIVE = (() => {
  const { GRAVITONE_DRY_ONLY: _pin, ...rest } = process.env;
  return rest;
})();
const LOC = path.join(ROOT, "kernel.sqlite");
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

/* ── The fake channel store ───────────────────────────────────────────────── */

const F1: Channel = { id: "F1", group: "Documentary", name: "While It Works", audience: "curious adults", promise: "see inside a machine while it runs", gap: "no short photoreal cutaway", edge: "realism, the impossible view chosen per episode", medium: "storyboard" };
const D1: Channel = { id: "D1", group: "Data explainer", name: "Came From Nowhere", audience: "chart lovers", promise: "every overtake has a dated event", gap: "races without causes", edge: "each pass names its cause", medium: "reel" };

const BEATS = ["the kettle sits cold", "the element glows", "bubbles nucleate", "the whistle", "steam rolls"];
const ep = (id: string, state: EpisodeState = "outline-kept", candidate?: string): Episode => ({ id, channel: id.slice(0, 2), title: `Title of ${id}`, logline: `logline of ${id}`, beats: BEATS, spec: `spec of ${id}`, state, at: "2026-10-26T20:00:00.000Z", ...(candidate === undefined ? {} : { candidate }) });

const MOVES: Readonly<Record<EpisodeState, readonly EpisodeState[]>> = { "outline-kept": ["in-production"], "in-production": ["made", "outline-kept"], made: ["kept", "thrown"], kept: [], thrown: [] };

/** An in-memory store with ./channels.ts's machine: a same-state move or one off the machine refused, the candidate named only at the take. */
function fakeStore(eps: Episode[]): { door: EpisodeDoor; moves: [string, EpisodeState, string?][]; state: (id: string) => Episode | undefined } {
  const held = new Map(eps.map((e) => [e.id, e]));
  const moves: [string, EpisodeState, string?][] = [];
  const door: EpisodeDoor = {
    episodeOf: async (id) => {
      const e = held.get(id);
      return e === undefined ? undefined : { channel: e.channel === "D1" ? D1 : F1, episode: e };
    },
    setEpisodeState: async (id, next, patch = {}) => {
      const e = held.get(id);
      if (e === undefined) throw new Refusal(`episodes: no episode ${id}`);
      if (!MOVES[e.state].includes(next)) throw new Refusal(`episodes: ${id} cannot move ${e.state} -> ${next}`);
      if (next === "in-production" && patch.candidate === undefined) throw new Refusal(`episodes: ${id} -> in-production names the candidate`);
      if (next !== "in-production" && patch.candidate !== undefined && patch.candidate !== e.candidate) throw new Refusal(`episodes: ${id} takes no new candidate`);
      const { candidate: was, ...rest } = e;
      const candidate = next === "in-production" ? patch.candidate : next === "outline-kept" ? undefined : was;
      const moved: Episode = { ...rest, state: next, ...(candidate === undefined ? {} : { candidate }) };
      held.set(id, moved);
      moves.push(next === "in-production" ? [id, next, patch.candidate] : [id, next]);
      return moved;
    },
  };
  return { door, moves, state: (id) => held.get(id) };
}

let fake = fakeStore([]);
const use = (eps: Episode[]): void => {
  fake = fakeStore(eps);
  setEpisodeDoorForTests(fake.door);
};

beforeEach(() => {
  vi.stubGlobal("fetch", async (input: string | URL | Request) => {
    throw new Error(`unexpected fetch ${String(input)}`);
  });
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  setEpisodeDoorForTests(null);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  closeProcessKernel();
});
afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

/* ── The CLI ──────────────────────────────────────────────────────────────── */

async function cli(argv: string[], o: { env?: Record<string, string | undefined>; ports?: CliPorts } = {}): Promise<{ code: number; err: string; doc: Record<string, unknown> }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(argv, { env: o.env ?? DRY, out: (s) => out.push(s), err: (s) => err.push(s), ...(o.ports === undefined ? {} : { ports: o.ports }) });
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

async function open(args: string[], env: Record<string, string | undefined>): Promise<string> {
  const r = await cli(["open", "--json", ...args], { env });
  expect(r.code, r.err).toBe(0);
  return String(r.doc["night"]);
}

const brief = (o: Record<string, unknown>) => ({
  title: "The kettle from inside",
  paragraph: "A camera rides a bubble from the element to the spout while the water boils.",
  bullets: ["beats: cold, glow, nucleation, whistle, steam", "format: a 60 s video", "look: macro, warm steel"],
  panels: ["a cold steel kettle on a stove, macro", "the element glowing orange beneath water", "bubbles forming on hot steel, macro"],
  ...o,
});

const boards = async (night: string): Promise<StoryboardCandidate[]> => (await readNight(night)).candidates.filter((c): c is StoryboardCandidate => c.kind === "storyboard");

const engine = (refuseAll = false): CliPorts => ({
  storyboard: {
    draw: async (_prompt, o) => {
      if (refuseAll) throw new Error("ComfyUI SamplerCustomAdvanced (node 11) failed: out of memory");
      return { png: PNG, seed: o.seed ?? 7 };
    },
  },
});

/* ── storyboard ───────────────────────────────────────────────────────────── */

describe("storyboard from an episode - the door", () => {
  const at = (raw: unknown): string => {
    const r = parseStoryboards(raw);
    return r.ok ? "ok" : r.error.message;
  };

  it("takes fromEpisode in place of fromIdea, and refuses both, neither, a twice-named episode and a bad id", () => {
    expect(at([brief({ fromEpisode: "F1-01" })])).toBe("ok");
    expect(at([brief({ fromEpisode: "F1-01", fromIdea: "2026-09-20/c-01" })])).toBe("storyboard 1: fromEpisode: a brief names exactly one of fromIdea (a kept idea) and fromEpisode (a channel episode)");
    expect(at([brief({})])).toBe("storyboard 1: fromEpisode: a brief names exactly one of fromIdea (a kept idea) and fromEpisode (a channel episode)");
    expect(at([brief({ fromEpisode: "F1-01" }), brief({ fromEpisode: "F1-01" })])).toBe("storyboard 2: fromEpisode: F1-01 is storyboard 1's too; one storyboard per episode");
    expect(at([brief({ fromEpisode: "F1-1" })])).toMatch(/^storyboard 1: fromEpisode: /);
  });
});

describe("storyboard from an episode - the act", () => {
  it("a dry night writes it with the channel's use and aim, 16:9, and moves nothing; a second one is refused while it lives", async () => {
    use([ep("F1-01")]);
    const night = await open([], DRY);
    const r = await cli(["storyboard", night, "--json", file([brief({ fromEpisode: "F1-01" })])]);
    expect(r.code, r.err).toBe(0);
    const [c] = await boards(night);
    expect(c).toMatchObject({ status: "rendered", fromEpisode: "F1-01", use: "While It Works: Title of F1-01", aim: "see inside a machine while it runs", images: [] });
    expect(c).not.toHaveProperty("fromIdea");
    expect(c).not.toHaveProperty("aspect");
    expect(fake.moves).toEqual([]);
    // The store still says outline-kept (a dry night moves nothing); the nights still hold it.
    const other = await open([], DRY);
    const again = await cli(["storyboard", other, "--json", file([brief({ fromEpisode: "F1-01" })])]);
    expect(again.code).toBe(1);
    expect(again.err).toContain(`storyboard 1: episode F1-01 already has storyboard ${night}/c-01 (rendered); one storyboard per episode, unless that one failed`);
  });

  it("the seat's use and aim stand when it wrote them", async () => {
    use([ep("F1-05")]);
    const night = await open([], DRY);
    const r = await cli(["storyboard", night, "--json", file([brief({ fromEpisode: "F1-05", use: "video: a 60 s cutaway", aim: "prove the bubble reads" })])]);
    expect(r.code, r.err).toBe(0);
    expect((await boards(night))[0]).toMatchObject({ use: "video: a 60 s cutaway", aim: "prove the bubble reads" });
  });

  it("refuses an episode in the wrong state, naming the state, and one the store does not hold - nothing written", async () => {
    use([ep("F1-02", "made", "2026-10-25/c-03")]);
    const night = await open([], DRY);
    const made = await cli(["storyboard", night, "--json", file([brief({ fromEpisode: "F1-02" })])]);
    expect(made.code).toBe(1);
    expect(made.err).toContain("storyboard 1: fromEpisode: F1-02 is made (2026-10-25/c-03); only an episode whose outline is kept and that no night has taken is made");
    const none = await cli(["storyboard", night, "--json", file([brief({ fromEpisode: "F1-09" })])]);
    expect(none.err).toContain("storyboard 1: fromEpisode: no episode F1-09 in the channel store");
    expect(await boards(night)).toEqual([]);
  });

  it("a live night: in production at the launch, made at the render", async () => {
    use([ep("F1-03")]);
    const night = await open(["--live"], LIVE);
    const r = await cli(["storyboard", night, "--json", file([brief({ fromEpisode: "F1-03" })])], { env: LIVE, ports: engine() });
    expect(r.code, r.err).toBe(0);
    expect((await boards(night))[0]).toMatchObject({ status: "rendered", fromEpisode: "F1-03" });
    expect(fake.moves).toEqual([
      ["F1-03", "in-production", `${night}/c-01`],
      ["F1-03", "made"],
    ]);
    expect(fake.state("F1-03")).toMatchObject({ state: "made", candidate: `${night}/c-01` });
  });

  it("a live storyboard that draws nothing fails: its episode goes back to outline-kept, and the failed one frees it", async () => {
    use([ep("F1-04")]);
    const night = await open(["--live"], LIVE);
    const r = await cli(["storyboard", night, "--json", file([brief({ fromEpisode: "F1-04" })])], { env: LIVE, ports: engine(true) });
    expect(r.code, r.err).toBe(0);
    expect((await boards(night))[0]?.status).toBe("failed");
    expect(fake.moves).toEqual([
      ["F1-04", "in-production", `${night}/c-01`],
      ["F1-04", "outline-kept"],
    ]);
    const again = await cli(["storyboard", night, "--json", file([brief({ fromEpisode: "F1-04" })])], { env: LIVE, ports: engine() });
    expect(again.code, again.err).toBe(0);
    expect(fake.state("F1-04")).toMatchObject({ state: "made", candidate: `${night}/c-02` });
  });
});

/* ── reel ─────────────────────────────────────────────────────────────────── */

const REAL = { years: [1990, 2000, 2010], series: [{ name: "Brazil", values: [1.5, 2.1, 2.9] }, { name: "Vietnam", values: [0.1, 0.9, 1.2] }] };
const TABLE = { kind: "table" as const, title: "List of countries by coffee production (Wikipedia)", url: "https://en.wikipedia.org/wiki/List_of_countries_by_coffee_production" };
const CUT = ["Brazil leads", "Vietnam climbs", "the gap closes"];
const SHAPE = { case: "stat-coffee-belt", title: "The coffee belt", hook: "Who grows the world's cup?", unit: "Mt", kind: "level-race" };
const APPROACH = { name: "Bean race", medium: "svg", grammar: "reflow", density: "mid", direction: "Roasted browns, one accent for the leader.", falsifier: "A race nobody overtakes reads as a list." };
const ask = (o: Record<string, unknown> = {}) => ({ fromEpisode: "D1-04", brief: SHAPE, approach: APPROACH, source: TABLE, data: REAL, cut: CUT, ...o });

const ctxOf = (k: Kernel): ActContext => ({ store: k.store, location: LOC, actor: { kind: "operator", id: "op-test" }, dryOnly: false, live: true, detach: false, say: () => {} });

const refusal = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
  } catch (e) {
    if (e instanceof Refusal) return e.message;
    throw e;
  }
  throw new Error("not refused");
};

function fakeEngines(): { seen: Record<string, unknown>[]; engines: ReelEngines } {
  const seen: Record<string, unknown>[] = [];
  const done: AgentResult = { outcome: "completed", final: "", turns: 1, durationMs: 5, exitCode: 0, errors: [], costUsd: 0.5 };
  return {
    seen,
    engines: {
      seat: async (input: RunAgentInput) => {
        const b = JSON.parse(readFileSync(path.join(input.cwd, "inputs", "brief.json"), "utf8")) as Record<string, unknown>;
        seen.push(b);
        if (!existsSync(path.join(input.cwd, "inputs", "feedback.md"))) writeFileSync(path.join(input.cwd, "out", "strip.html"), standInPage("stat", b["data"]));
        writeFileSync(path.join(input.cwd, "out", "style.json"), "{}");
        return done;
      },
      frame: async () => Buffer.from("89504e47", "hex"),
      render: async () => undefined,
    },
  };
}

async function withKernel<T>(fn: (k: Kernel) => Promise<T>): Promise<T> {
  const k = openKernel(LOC);
  if (!k.ok) throw k.error;
  try {
    return await fn(k.value);
  } finally {
    k.value.close();
  }
}

let day = 0;
const reelNight = async (): Promise<string> => (await createNight({ dry: false, day: `2027-01-${String(++day).padStart(2, "0")}` })).id;

describe("reel from an episode", () => {
  it("the door: brief and approach are required and held to the reels schemas; exactly one of fromIdea and fromEpisode", () => {
    const why = (raw: unknown): string => {
      const r = parseReelAsks(raw);
      return r.ok ? "ok" : r.error.message;
    };
    expect(why([ask()])).toBe("ok");
    const { brief: _b, ...noBrief } = ask();
    expect(why([noBrief])).toMatch(/^reel 1: brief: /);
    const { approach: _a, ...noApproach } = ask();
    expect(why([noApproach])).toMatch(/^reel 1: approach: /);
    expect(why([ask({ brief: { ...SHAPE, kind: "pie" } })])).toMatch(/^reel 1: brief: kind: /);
    expect(why([ask({ brief: { ...SHAPE, illustrative: true } })])).toMatch(/^reel 1: brief: /);
    expect(why([ask({ approach: { ...APPROACH, falsifier: "" } })])).toMatch(/^reel 1: approach: falsifier: /);
    expect(why([ask({ fromIdea: "2026-12-01/c-01" })])).toBe("reel 1: an ask names exactly one of fromIdea (a kept stats idea) and fromEpisode (a reel channel's episode)");
    expect(why([ask(), ask()])).toBe("reel 2: D1-04 is already in this batch");
  });

  it("refuses a storyboard channel's episode and one in the wrong state - nothing written", async () => {
    await withKernel(async (k) => {
      use([ep("F1-06"), ep("D1-05", "kept", "2026-10-20/c-02")]);
      const night = await reelNight();
      expect(await refusal(reelAct(ctxOf(k), night, [ask({ fromEpisode: "F1-06" })]))).toBe("reel 1: fromEpisode: F1-06 is channel F1's, made as a storyboard; only a reel channel's episode is a reel");
      expect(await refusal(reelAct(ctxOf(k), night, [ask({ fromEpisode: "D1-05" })]))).toMatch(/^reel 1: fromEpisode: D1-05 is kept \(2026-10-20\/c-02\)/);
      expect((await readNight(night)).candidates).toEqual([]);
    });
  });

  it("makes the reel from the seat's brief and approach on the real numbers, lends the channel's use and aim, and moves the episode", async () => {
    await withKernel(async (k) => {
      use([ep("D1-04")]);
      const night = await reelNight();
      const fakes = fakeEngines();
      const r = await reelAct(ctxOf(k), night, [ask()], { engines: fakes.engines });
      expect(r.outcome).toBe("done");
      const c = (await readNight(night)).candidates[0] as ReelCandidate;
      expect(c).toMatchObject({ kind: "reel", status: "rendered", fromEpisode: "D1-04", title: "The coffee belt", use: "Came From Nowhere: Title of D1-04", aim: "every overtake has a dated event" });
      expect(c).not.toHaveProperty("fromIdea");
      expect(fakes.seen[0]).toMatchObject({ ...SHAPE, data: REAL, cut: CUT, source: { kind: "table", name: "Source: List of countries by coffee production (Wikipedia)" } });
      expect(JSON.parse(readFileSync(path.join(ROOT, "scout", night, c.files.approach), "utf8"))).toEqual(APPROACH);
      expect(fake.moves).toEqual([
        ["D1-04", "in-production", `${night}/${c.id}`],
        ["D1-04", "made"],
      ]);
      // A second reel of it: the store says made (and the night holds it).
      expect(await refusal(reelAct(ctxOf(k), night, [ask()]))).toMatch(/^reel 1: fromEpisode: D1-04 is made/);
    });
  });
});

/* ── the verdict, derived ─────────────────────────────────────────────────── */

const committedNight = (o: { dry?: boolean; kept: string[]; rejected: string[] }): Night => ({
  id: "2026-10-30",
  startedAt: "2026-10-30T00:00:00.000Z",
  ceilingUsd: 15,
  target: 20,
  clipCap: 2,
  dry: o.dry ?? false,
  state: "committed",
  stop: "target",
  sources: [],
  jobs: [],
  candidates: [
    { id: "c-01", kind: "storyboard", sourceIds: [], status: "rendered", fromEpisode: "F1-07", title: "t", paragraph: "p", bullets: ["a", "b", "c"], panels: ["x"], images: ["storyboards/c-01/panel-1.png"] },
    { id: "c-02", kind: "reel", sourceIds: [], status: "rendered", fromEpisode: "D1-07", title: "r", source: TABLE, cut: CUT, files: { brief: "b.json", approach: "a.json" } },
  ],
  committed: { at: "2026-10-31T08:00:00.000Z", by: "operator", kept: o.kept, rejected: o.rejected, reasons: {}, notes: {}, dry: o.dry ?? false },
});

describe("followNight - the packet's verdict ends the episode", () => {
  it("kept and thrown, once: a second follow moves nothing; a dry night nothing at all", async () => {
    use([ep("F1-07", "made", "2026-10-30/c-01"), ep("D1-07", "made", "2026-10-30/c-02")]);
    const n = committedNight({ kept: ["c-01/words"], rejected: ["c-02/reel"] });
    await followNight(n);
    expect(fake.moves).toEqual([
      ["F1-07", "kept"],
      ["D1-07", "thrown"],
    ]);
    await followNight(n);
    expect(fake.moves).toHaveLength(2);
    use([ep("F1-07", "made", "2026-10-30/c-01"), ep("D1-07", "made", "2026-10-30/c-02")]);
    await followNight(committedNight({ dry: true, kept: ["c-01/words"], rejected: ["c-02/reel"] }));
    expect(fake.moves).toEqual([]);
  });

  it("walks a step a crash missed, leaves an episode another candidate holds, and never throws on a refusing store", async () => {
    use([ep("F1-07"), ep("D1-07", "in-production", "2026-10-29/c-09")]);
    await followNight(committedNight({ kept: ["c-01/words", "c-02/reel"], rejected: [] }));
    expect(fake.moves).toEqual([
      ["F1-07", "in-production", "2026-10-30/c-01"],
      ["F1-07", "made"],
      ["F1-07", "kept"],
    ]);
    setEpisodeDoorForTests({ episodeOf: async () => ({ channel: F1, episode: ep("F1-07", "made", "2026-10-30/c-01") }), setEpisodeState: async () => Promise.reject(new Refusal("episodes: the store is read-only")) });
    await expect(followNight(committedNight({ kept: ["c-01/words"], rejected: [] }))).resolves.toBeUndefined();
  });

  it("movesTo: the machine's path, nothing past an ending, nothing for another candidate", () => {
    expect(movesTo({ state: "outline-kept" }, "made", "n/c-01")).toEqual(["in-production", "made"]);
    expect(movesTo({ state: "made", candidate: "n/c-01" }, "thrown", "n/c-01")).toEqual(["thrown"]);
    expect(movesTo({ state: "kept", candidate: "n/c-01" }, "thrown", "n/c-01")).toEqual([]);
    expect(movesTo({ state: "in-production", candidate: "n/c-02" }, "outline-kept", "n/c-01")).toEqual([]);
    expect(movesTo({ state: "in-production", candidate: "n/c-02" }, "made", "n/c-01")).toEqual([]);
    expect(movesTo({ state: "made", candidate: "n/c-01" }, "made", "n/c-01")).toEqual([]);
  });
});

/* ── taste ────────────────────────────────────────────────────────────────── */

describe("the taste brief's ## Episodes due", () => {
  it("per channel its id, name and medium, then each episode: id · title, the logline, the five beats numbered, the spec", () => {
    expect(episodesSection([{ channel: F1, episodes: [ep("F1-01")] }, { channel: D1, episodes: [] }])).toEqual([
      "## Episodes due",
      "",
      "### F1 While It Works · storyboard",
      "",
      "- F1-01 · Title of F1-01",
      "  logline of F1-01",
      "  1. the kettle sits cold",
      "  2. the element glows",
      "  3. bubbles nucleate",
      "  4. the whistle",
      "  5. steam rolls",
      "  spec: spec of F1-01",
      "",
    ]);
    expect(episodesSection([])).toEqual(["## Episodes due", "", "- none", ""]);
  });

  it("stands first after the title", async () => {
    expect(await episodesFirst("# Taste\n\n## Seeds to develop\n", [{ channel: D1, episodes: [ep("D1-01")] }])).toMatch(/^# Taste\n\n## Episodes due\n\n### D1 Came From Nowhere · reel\n\n- D1-01 · Title of D1-01\n[\s\S]*\n  spec: spec of D1-01\n\n## Seeds to develop\n$/);
  });
});
