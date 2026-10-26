// A KEPT STATS IDEA ON REAL DATA, AND ITS FULL CUT (spark scout-vision S5 WP-E) - the reel and reel-cut doors over temp
// nights and a temp kernel, every store a temp directory set below before any lib/ module loads: the source door (each
// kind, each refusal, no "public dataset" anywhere), the reel act's refusals and its brief (the source line verbatim, the
// kept idea's shape with the real numbers), the reelCap shared with the night's stats ideas, the frame count as a
// parameter (240 by default, 900 for 30 s), the cut's refusal of an unkept reel, a cut re-authored at its frames and
// handed to the render, the taste brief's `## Reels to cut` and the Board cells. No seat, no render, no network: the
// engines are counted fakes.

import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-scout-reel-real-"));
  process.env["SCOUT_STORE_DIR"] = path.join(dir, "scout");
  process.env["SCOUT_MUSE_STORE_DIR"] = path.join(dir, "scout-muse");
  process.env["SCOUT_SEED_STORE_DIR"] = path.join(dir, "seeds");
  process.env["EXTRACT_STORE_DIR"] = path.join(dir, "extract");
  process.env["MESH_STORE_DIR"] = path.join(dir, "mesh");
  process.env["STRIPS_STORE_DIR"] = path.join(dir, "strips");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  process.env["AI_REGISTRY_DIR"] = path.join(dir, "no-registry");
  process.env["SPEND_STORE"] = "memory";
  return dir;
});

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { closeProcessKernel } from "@gt/kernel/process";

import type { AgentResult, RunAgentInput } from "../../lib/agent/cliSeam.ts";
import { build } from "../../lib/decision/v1/sources/scoutPlan.ts";
import { Refusal, type ActContext } from "../../lib/foundry/scout/acts.ts";
import { reelsUsed } from "../../lib/foundry/scout/idea.ts";
import { collectReels, reelAct, reelCutAct } from "../../lib/foundry/scout/reel.ts";
import { cutBrief, parseReelSource } from "../../lib/foundry/scout/reelDoor.ts";
import { reelsToCut, sourceLine } from "../../lib/foundry/scout/reelTaste.ts";
import { createNight, mutateNight, readNight, resolveInNight } from "../../lib/foundry/scout/store.ts";
import type { IdeaCandidate, Night, ReelBrief, ReelCandidate, ReelCutCandidate } from "../../lib/foundry/scout/types.ts";
import { standInPage } from "../../lib/foundry/strips/author.ts";
import { lintStrip } from "../../lib/foundry/strips/lint.ts";
import { reelFiles } from "../../lib/producers/scoutReel.ts";
import { reelLint, type ReelEngines } from "../../lib/producers/scoutReelActs.ts";
import { realReelFiles, reelCutPoster, reelCutVideo } from "../../lib/producers/scoutReelKinds.ts";

const LOC = path.join(ROOT, "kernel.sqlite");
const OP = { kind: "operator" as const, id: "op-test" };

afterEach(() => {
  vi.restoreAllMocks();
  closeProcessKernel();
});
afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true });
});

/* ── The kept idea and the night ──────────────────────────────────────────── */

const ILLUSTRATIVE = { years: [2000, 2001], series: [{ name: "North", values: [3, 5] }] };
const REAL = { years: [1990, 2000, 2010], series: [{ name: "Brazil", values: [1.5, 2.1, 2.9] }, { name: "Vietnam", values: [0.1, 0.9, 1.2] }] };
const TABLE = { kind: "table" as const, title: "List of countries by coffee production (Wikipedia)", url: "https://en.wikipedia.org/wiki/List_of_countries_by_coffee_production" };
const WHAT_IF = { kind: "what-if" as const, title: "Coffee on Mars", premise: "a Martian colony grows coffee from 2040 at 3% a year" };
const CUT = ["Brazil leads", "Vietnam climbs", "the gap closes"];

const brief: ReelBrief = {
  brief: { case: "stat-coffee-belt", title: "The coffee belt", hook: "Who grows the world's cup?", unit: "Mt", kind: "level-race", data: ILLUSTRATIVE, illustrative: true },
  approach: { name: "Bean race", medium: "svg", grammar: "reflow", density: "mid", direction: "Roasted browns, one accent for the leader.", falsifier: "A race nobody overtakes reads as a list." },
};

let day = 0;
const nextDay = (): string => `2026-12-${String(++day).padStart(2, "0")}`;

/** A committed live night holding stats idea c-01 (kept unless `kept` is false; target `stats` unless said). */
async function keptIdeaNight(o: { kept?: boolean; dry?: boolean; target?: IdeaCandidate["target"] } = {}): Promise<string> {
  const n = await createNight({ dry: o.dry ?? false, day: nextDay() });
  const f = reelFiles("c-01");
  mkdirSync(path.dirname(resolveInNight(n.id, f.brief)), { recursive: true });
  writeFileSync(resolveInNight(n.id, f.brief), JSON.stringify(brief.brief));
  writeFileSync(resolveInNight(n.id, f.approach), JSON.stringify(brief.approach));
  const idea: IdeaCandidate = { id: "c-01", kind: "idea", sourceIds: [], status: "rendered", title: "The coffee belt", target: o.target ?? "stats", prompt: "a race", anchor: { kind: "free", ref: "" }, image: "ideas/c-01.png", reel: { ...f }, use: "short: coffee", fromSeed: "2026-11-01/sd-001" };
  const kept = o.kept === false ? [] : ["c-01/board"];
  await mutateNight(n.id, (x) => ({ ...x, state: "committed", candidates: [idea], committed: { at: "2026-12-01T08:00:00.000Z", by: "operator", kept, rejected: o.kept === false ? ["c-01/board"] : [], reasons: {}, notes: {}, dry: o.dry ?? false } }));
  return n.id;
}

const open = async (reelCap?: number): Promise<string> => (await createNight({ dry: false, day: nextDay(), ...(reelCap === undefined ? {} : { reelCap }) })).id;

/* ── The fakes ────────────────────────────────────────────────────────────── */

type Seen = { readonly brief: Record<string, unknown>; readonly styleRef: boolean };

function fakeEngines(): { seen: Seen[]; renders: { frames: number; outDir: string }[]; engines: ReelEngines } {
  const seen: Seen[] = [];
  const renders: { frames: number; outDir: string }[] = [];
  const done: AgentResult = { outcome: "completed", final: "", turns: 1, durationMs: 5, exitCode: 0, errors: [], costUsd: 0.5 };
  return {
    seen,
    renders,
    engines: {
      seat: async (input: RunAgentInput) => {
        const b = JSON.parse(readFileSync(path.join(input.cwd, "inputs", "brief.json"), "utf8")) as Record<string, unknown>;
        seen.push({ brief: b, styleRef: existsSync(path.join(input.cwd, "inputs", "style-reference", "strip.html")) });
        if (!existsSync(path.join(input.cwd, "inputs", "feedback.md"))) writeFileSync(path.join(input.cwd, "out", "strip.html"), standInPage("stat", b["data"], typeof b["frames"] === "number" ? b["frames"] : undefined));
        writeFileSync(path.join(input.cwd, "out", "style.json"), "{}");
        return done;
      },
      frame: async () => Buffer.from("89504e47", "hex"),
      render: async (_html, _lane, frames, outDir) => {
        renders.push({ frames, outDir });
        mkdirSync(outDir, { recursive: true });
        writeFileSync(path.join(outDir, "strip.mp4"), "mp4");
        writeFileSync(path.join(outDir, "poster.jpg"), "jpg");
      },
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

const ctxOf = (k: Kernel, detach = false): ActContext => ({ store: k.store, location: LOC, actor: OP, dryOnly: false, live: true, detach, say: () => {} });

const refusal = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
  } catch (e) {
    if (e instanceof Refusal) return e.message;
    throw e;
  }
  throw new Error("not refused");
};

/* ── The source door ──────────────────────────────────────────────────────── */

describe("the reel's source", () => {
  it("takes one wiki table, an article quoted verbatim, and a what-if with no url - nothing asks for a public dataset", () => {
    expect(parseReelSource(TABLE).ok).toBe(true);
    expect(parseReelSource({ kind: "article", title: "Coffee prices hit a record", url: "https://example.com/coffee", quote: "Arabica futures rose 70% this year." }).ok).toBe(true);
    expect(parseReelSource(WHAT_IF).ok).toBe(true);
    expect(parseReelSource({ ...WHAT_IF, url: "https://example.com/derived-from" }).ok).toBe(true);
  });

  it("refuses a table or an article with no https page, an article with no quote, a what-if with no premise, and the bounds", () => {
    const why = (raw: unknown): string => {
      const r = parseReelSource(raw);
      return r.ok ? "" : r.error.message;
    };
    expect(why({ kind: "table", title: "t" })).toMatch(/url/);
    expect(why({ ...TABLE, url: "http://en.wikipedia.org/wiki/x" })).toMatch(/https/);
    expect(why({ kind: "article", title: "t", url: "https://example.com/a" })).toMatch(/quote/);
    expect(why({ kind: "article", title: "t", url: "https://example.com/a", quote: "x".repeat(401) })).toMatch(/quote/);
    expect(why({ kind: "what-if", title: "t" })).toMatch(/premise/);
    expect(why({ ...WHAT_IF, premise: "x".repeat(401) })).toMatch(/premise/);
    expect(why({ ...TABLE, title: "x".repeat(201) })).toMatch(/title/);
    expect(why({ ...TABLE, kind: "dataset" })).toMatch(/kind/);
  });

  it("writes the source line verbatim: Source: <title>, or What if: <premise> (fiction)", () => {
    expect(sourceLine(TABLE)).toBe("Source: List of countries by coffee production (Wikipedia)");
    expect(sourceLine(WHAT_IF)).toBe("What if: a Martian colony grows coffee from 2040 at 3% a year (fiction)");
  });
});

/* ── The frame count ──────────────────────────────────────────────────────── */

describe("the frame count, a parameter", () => {
  it("240 stays the default: a page that declares none or 240 passes, and the stand-in is unchanged", () => {
    expect(lintStrip(standInPage("stat"))).toEqual([]);
    expect(standInPage("stat", ILLUSTRATIVE)).toBe(standInPage("stat", ILLUSTRATIVE, 240));
    expect(reelLint(standInPage("stat", ILLUSTRATIVE).replace("height: 1920 }", "height: 1920, frames: 240 }"))).toEqual([]);
  });

  it("900 for 30 s: the cut's brief says it, its page must declare it, and a 240-frame page fails it", () => {
    const b = cutBrief({ ...brief.brief, illustrative: undefined, source: { kind: "table", name: sourceLine(TABLE) }, cut: CUT } as never, 30);
    expect([b.frames, b.seconds]).toEqual([900, 30]);
    const long = standInPage("stat", REAL, 900);
    expect(long).toContain("frames: 900");
    expect(reelLint(long, 900)).toEqual([]);
    expect(reelLint(long)).toEqual(["frames: window.STRIP.frames is 240 for this brief — declared 900"]);
    expect(reelLint(standInPage("stat", REAL), 900)).toEqual(["frames: window.STRIP.frames is 900 for this brief — not declared (read as 240)"]);
  });
});

/* ── reel ─────────────────────────────────────────────────────────────────── */

describe("scout reel", () => {
  it("refuses an idea not kept, a dry night's idea, an idea that is not stats, and a malformed batch - nothing written", async () => {
    await withKernel(async (k) => {
      const night = await open();
      const unkept = await keptIdeaNight({ kept: false });
      const dry = await keptIdeaNight({ dry: true });
      const scene = await keptIdeaNight({ target: "scene" });
      const ask = (ref: string) => [{ fromIdea: `${ref}/c-01`, source: TABLE, data: REAL, cut: CUT }];
      expect(await refusal(reelAct(ctxOf(k), night, ask(unkept)))).toMatch(new RegExp(`^reel 1: idea ${unkept}/c-01: night ${unkept} rejected c-01/board`));
      expect(await refusal(reelAct(ctxOf(k), night, ask(dry)))).toMatch(/dry night/);
      expect(await refusal(reelAct(ctxOf(k), night, ask(scene)))).toBe(`reel 1: ${scene}/c-01 is a scene idea, not a stats idea; only a stats idea is a reel`);
      expect(await refusal(reelAct(ctxOf(k), night, [{ fromIdea: `${scene}/c-01`, source: TABLE, data: REAL, cut: [] }]))).toMatch(/cut/);
      expect(await refusal(reelAct(ctxOf(k), night, [{ fromIdea: `${scene}/c-01`, source: TABLE, data: REAL, cut: Array.from({ length: 13 }, (_, i) => `beat ${i}`) }]))).toMatch(/cut/);
      expect((await readNight(night)).candidates).toEqual([]);
    });
  });

  it("makes a reel from the kept idea's shape with the real numbers and the source line, authors it, and refuses a second", async () => {
    await withKernel(async (k) => {
      const from = await keptIdeaNight();
      const night = await open();
      const fakes = fakeEngines();
      const r = await reelAct(ctxOf(k), night, [{ fromIdea: `${from}/c-01`, source: TABLE, data: REAL, cut: CUT }], { engines: fakes.engines });
      expect(r.outcome).toBe("done");
      const c = (await readNight(night)).candidates[0] as ReelCandidate;
      const f = realReelFiles(c.id);
      expect(c).toMatchObject({ kind: "reel", status: "rendered", fromIdea: `${from}/c-01`, title: "The coffee belt", source: TABLE, cut: CUT, files: f, image: `reels/${c.id}.png`, fromSeed: "2026-11-01/sd-001", use: "short: coffee" });
      // The seat read the kept idea's shape, the real numbers, the source line verbatim and the beats - and no illustrative flag.
      const seen = fakes.seen[0]?.brief;
      expect(seen).toMatchObject({ case: "stat-coffee-belt", title: "The coffee belt", kind: "level-race", data: REAL, cut: CUT, source: { kind: "table", name: "Source: List of countries by coffee production (Wikipedia)", url: TABLE.url } });
      expect(seen?.["illustrative"]).toBeUndefined();
      expect(JSON.parse(readFileSync(resolveInNight(night, f.approach), "utf8"))).toEqual(brief.approach);
      expect(await refusal(reelAct(ctxOf(k), night, [{ fromIdea: `${from}/c-01`, source: WHAT_IF, data: REAL, cut: CUT }]))).toBe(`reel 1: ${from}/c-01 already has its real reel ${night}/${c.id} (rendered)`);
    });
  });

  it("a what-if's brief says it is fiction; detached, the reel waits for the worker and --collect leaves a queued job alone", async () => {
    await withKernel(async (k) => {
      const from = await keptIdeaNight();
      const night = await open();
      const r = await reelAct(ctxOf(k, true), night, [{ fromIdea: `${from}/c-01`, source: WHAT_IF, data: REAL, cut: CUT }]);
      expect(r.outcome).toBe("detached");
      const c = (await readNight(night)).candidates[0] as ReelCandidate;
      expect(c.status).toBe("pending");
      expect(JSON.parse(readFileSync(resolveInNight(night, c.files.brief), "utf8")).source.name).toBe("What if: a Martian colony grows coffee from 2040 at 3% a year (fiction)");
      expect(await collectReels(night, { store: k.store })).toEqual([{ id: c.id, status: "pending" }]);
    });
  });

  it("counts against the night's reelCap with its stats ideas, and a batch over it writes nothing", async () => {
    await withKernel(async (k) => {
      const a = await keptIdeaNight();
      const b = await keptIdeaNight();
      const night = await open(1);
      const ask = (ref: string) => ({ fromIdea: `${ref}/c-01`, source: TABLE, data: REAL, cut: CUT });
      expect(await refusal(reelAct(ctxOf(k, true), night, [ask(a), ask(b)]))).toBe(`night ${night} holds 0 of its 1 stats reels; 1 left, and the batch has 2 - nothing was made`);
      expect((await readNight(night)).candidates).toEqual([]);
      await reelAct(ctxOf(k, true), night, [ask(a)]);
      expect(reelsUsed(await readNight(night))).toBe(1);
    });
  });
});

/* ── reel-cut ─────────────────────────────────────────────────────────────── */

/** A committed live night holding a rendered real reel c-01 with its strip, kept unless `kept` is false. */
async function keptReelNight(kept = true): Promise<string> {
  const n = await createNight({ dry: false, day: nextDay() });
  const f = realReelFiles("c-01");
  const b = { ...brief.brief, illustrative: undefined, data: REAL, source: { kind: "table", name: sourceLine(TABLE), url: TABLE.url }, cut: CUT };
  mkdirSync(path.dirname(resolveInNight(n.id, f.brief)), { recursive: true });
  writeFileSync(resolveInNight(n.id, f.brief), JSON.stringify(b));
  writeFileSync(resolveInNight(n.id, f.approach), JSON.stringify(brief.approach));
  writeFileSync(resolveInNight(n.id, f.strip), standInPage("stat", REAL));
  const reel: ReelCandidate = { id: "c-01", kind: "reel", sourceIds: [], status: "rendered", fromIdea: "2026-11-02/c-01", title: "The coffee belt", source: TABLE, cut: CUT, files: f, image: "reels/c-01.png" };
  await mutateNight(n.id, (x) => ({ ...x, state: "committed", candidates: [reel], committed: { at: "2026-12-01T08:00:00.000Z", by: "operator", kept: kept ? ["c-01/reel"] : [], rejected: kept ? [] : ["c-01/reel"], reasons: {}, notes: {}, dry: false } }));
  return n.id;
}

describe("scout reel-cut", () => {
  it("refuses a reel not kept, seconds outside 30-120, and an idea's ref - nothing written", async () => {
    await withKernel(async (k) => {
      const night = await open();
      const rejected = await keptReelNight(false);
      expect(await refusal(reelCutAct(ctxOf(k), night, [{ fromReel: `${rejected}/c-01`, seconds: 30 }]))).toBe(`cut 1: reel ${rejected}/c-01 is not kept (rejected); only a kept reel is cut in full`);
      const kept = await keptReelNight();
      expect(await refusal(reelCutAct(ctxOf(k), night, [{ fromReel: `${kept}/c-01`, seconds: 20 }]))).toMatch(/seconds/);
      expect(await refusal(reelCutAct(ctxOf(k), night, [{ fromReel: `${kept}/c-01`, seconds: 121 }]))).toMatch(/seconds/);
      const idea = await keptIdeaNight();
      expect(await refusal(reelCutAct(ctxOf(k), night, [{ fromReel: `${idea}/c-01`, seconds: 30 }]))).toBe(`cut 1: night ${idea} has no reel c-01`);
      expect((await readNight(night)).candidates).toEqual([]);
    });
  });

  it("re-authors the kept reel at seconds * 30 frames with its strip as the style reference, and hands the render that count", async () => {
    await withKernel(async (k) => {
      const from = await keptReelNight();
      const night = await open();
      const fakes = fakeEngines();
      const r = await reelCutAct(ctxOf(k), night, [{ fromReel: `${from}/c-01`, seconds: 30 }], { engines: fakes.engines });
      expect(r.outcome).toBe("done");
      const c = (await readNight(night)).candidates[0] as ReelCutCandidate;
      expect(c).toMatchObject({ kind: "reel-cut", status: "rendered", fromReel: `${from}/c-01`, seconds: 30, frames: 900, video: reelCutVideo(c.id), image: reelCutPoster(c.id) });
      expect(fakes.seen[0]).toMatchObject({ styleRef: true, brief: { frames: 900, seconds: 30, data: REAL, source: { name: sourceLine(TABLE) } } });
      expect(fakes.renders.map((x) => x.frames)).toEqual([900]);
      expect(await refusal(reelCutAct(ctxOf(k), night, [{ fromReel: `${from}/c-01`, seconds: 60 }]))).toBe(`cut 1: ${from}/c-01 already has its cut ${night}/${c.id} (rendered)`);
    });
  });

  it("on a dry night the cut is a stand-in strip at its frames: no seat, no render, no video", async () => {
    await withKernel(async (k) => {
      const from = await keptReelNight();
      const night = (await createNight({ dry: true, day: nextDay() })).id;
      const fakes = fakeEngines();
      const r = await reelCutAct({ ...ctxOf(k), live: false, dryOnly: true }, night, [{ fromReel: `${from}/c-01`, seconds: 45 }], { engines: fakes.engines });
      expect([r.outcome, r.dry]).toEqual(["done", true]);
      const c = (await readNight(night)).candidates[0] as ReelCutCandidate;
      expect(c).toMatchObject({ status: "rendered", frames: 1350 });
      expect(c.video).toBeUndefined();
      expect([fakes.seen.length, fakes.renders.length]).toEqual([0, 0]);
      expect(reelLint(readFileSync(resolveInNight(night, c.files.strip ?? ""), "utf8"), 1350)).toEqual([]);
    });
  });
});

/* ── The taste brief and the Board ────────────────────────────────────────── */

describe("a kept reel, read back", () => {
  it("is listed under ## Reels to cut until a cut of it exists", async () => {
    const from = await keptReelNight();
    const n = await readNight(from);
    const lines = reelsToCut([n]);
    expect(lines.slice(0, 4)).toEqual(["## Reels to cut", "", `- ${from}/c-01 · The coffee belt · ${sourceLine(TABLE)} · from 2026-11-02/c-01`, `  cut: ${CUT.join(" / ")}`]);
    const cut: ReelCutCandidate = { id: "c-01", kind: "reel-cut", sourceIds: [], status: "pending", fromReel: `${from}/c-01`, title: "The coffee belt", source: TABLE, seconds: 30, frames: 900, files: { brief: "b", approach: "a" } };
    const other: Night = { ...n, id: "2026-12-30", candidates: [cut], committed: undefined, state: "open" };
    expect(reelsToCut([n, other])).toEqual(["## Reels to cut", "", "- none", ""]);
  });

  it("the Board draws a reel as one image cell under reels and a cut as one video cell under reel cuts", async () => {
    const reel: ReelCandidate = { id: "c-02", kind: "reel", sourceIds: [], status: "rendered", fromIdea: "2026-11-02/c-01", title: "The coffee belt", source: TABLE, cut: CUT, files: realReelFiles("c-02"), image: "reels/c-02.png" };
    const cut: ReelCutCandidate = { id: "c-03", kind: "reel-cut", sourceIds: [], status: "rendered", fromReel: "2026-11-03/c-01", title: "The coffee belt", source: WHAT_IF, seconds: 30, frames: 900, files: { brief: "cuts/c-03/brief.json", approach: "cuts/c-03/approach.json" }, video: "cuts/c-03/strip.mp4" };
    const night: Night = { id: "2026-12-31", startedAt: "2026-12-31T00:00:00.000Z", ceilingUsd: 15, target: 20, clipCap: 2, dry: false, state: "closed", sources: [], candidates: [reel, cut], jobs: [] };
    const blob = (mime: string) => ({ sha256: "a".repeat(64), bytes: 3, mime });
    const b = build({ night, styles: {}, assets: {}, media: { "reels/c-02.png": blob("image/png"), "cuts/c-03/strip.mp4": blob("video/mp4") }, knowledge: {}, at: { scout: "s", knowledge: "k", mesh: "m" } });
    expect(b.cells.map((c) => [c.id, c.kind, c.media.mime, c.words.meta])).toEqual([
      ["c-02/reel", "reel", "image/png", `${sourceLine(TABLE)} · idea 2026-11-02/c-01 · 3 beats`],
      ["c-03/video", "reel-cut", "video/mp4", `${sourceLine(WHAT_IF)} · reel 2026-11-03/c-01 · 30s`],
    ]);
    expect(b.rows.map((r) => [r.id, r.group])).toEqual([
      ["c-02", "reels"],
      ["c-03", "reel cuts"],
    ]);
    expect(b.losses).toEqual([]);
  });
});
