// A REAL REEL IN MOTION (spark scout-vision S5) - the reel's 8 s strip rendered whole beside its still: the reel act's
// render seam (a counted fake), a render that fails keeping the still and its sentence, the Board's cell carrying the
// mp4 under the same id, group and reason order, and the `reel-motion` backfill (--dry, idempotence, a failure retried,
// a dry night). Every store is a temp directory set below before any lib/ module loads; no browser, no encoder.

import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-scout-reel-motion-"));
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

import { reasonsOf, reasonVocabulary } from "@gt/domain/source";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { closeProcessKernel } from "@gt/kernel/process";
import { categoryOf, tabOf } from "@gt/ui/board/runs";

import type { AgentResult, RunAgentInput } from "../../lib/agent/cliSeam.ts";
import { build } from "../../lib/decision/v1/sources/scoutPlan.ts";
import type { ActContext } from "../../lib/foundry/scout/acts.ts";
import { reelAct } from "../../lib/foundry/scout/reel.ts";
import { createNight, mutateNight, readNight, resolveInNight } from "../../lib/foundry/scout/store.ts";
import type { IdeaCandidate, Night, ReelCandidate } from "../../lib/foundry/scout/types.ts";
import { standInPage } from "../../lib/foundry/strips/author.ts";
import { runCli } from "../../pipeline/scout.mts";
import { reelFiles } from "../../lib/producers/scoutReel.ts";
import type { ReelEngines } from "../../lib/producers/scoutReelActs.ts";
import { realReelFiles } from "../../lib/producers/scoutReelKinds.ts";
import { reelMotion, type Render } from "../../lib/producers/scoutReelMotion.ts";

const LOC = path.join(ROOT, "kernel.sqlite");
const OP = { kind: "operator" as const, id: "op-test" };

afterEach(() => {
  vi.restoreAllMocks();
  closeProcessKernel();
});
afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true });
});

const REAL = { years: [1990, 2000, 2010], series: [{ name: "Brazil", values: [1.5, 2.1, 2.9] }] };
const TABLE = { kind: "table" as const, title: "List of countries by coffee production (Wikipedia)", url: "https://en.wikipedia.org/wiki/List_of_countries_by_coffee_production" };
const CUT = ["Brazil leads", "Vietnam climbs"];
const BRIEF = { case: "stat-coffee-belt", title: "The coffee belt", hook: "Who grows the cup?", unit: "Mt", kind: "level-race", data: { years: [2000, 2001], series: [{ name: "N", values: [3, 5] }] }, illustrative: true };
const APPROACH = { name: "Bean race", medium: "svg", grammar: "reflow", density: "mid", direction: "Roasted browns.", falsifier: "A race nobody overtakes reads as a list." };

let day = 0;
const nextDay = (): string => `2027-01-${String(++day).padStart(2, "0")}`;

/** A committed live night holding kept stats idea c-01. */
async function keptIdeaNight(): Promise<string> {
  const n = await createNight({ dry: false, day: nextDay() });
  const f = reelFiles("c-01");
  mkdirSync(path.dirname(resolveInNight(n.id, f.brief)), { recursive: true });
  writeFileSync(resolveInNight(n.id, f.brief), JSON.stringify(BRIEF));
  writeFileSync(resolveInNight(n.id, f.approach), JSON.stringify(APPROACH));
  const idea: IdeaCandidate = { id: "c-01", kind: "idea", sourceIds: [], status: "rendered", title: "The coffee belt", target: "stats", prompt: "a race", anchor: { kind: "free", ref: "" }, image: "ideas/c-01.png", reel: { ...f } };
  await mutateNight(n.id, (x) => ({ ...x, state: "committed", candidates: [idea], committed: { at: "2027-01-01T08:00:00.000Z", by: "operator", kept: ["c-01/board"], rejected: [], reasons: {}, notes: {}, dry: false } }));
  return n.id;
}

const done: AgentResult = { outcome: "completed", final: "", turns: 1, durationMs: 5, exitCode: 0, errors: [], costUsd: 0.5 };

/** Engines whose render is `render` (absent: none is bound). */
function engines(render: ReelEngines["render"]): ReelEngines {
  return {
    seat: async (input: RunAgentInput) => {
      writeFileSync(path.join(input.cwd, "out", "strip.html"), standInPage("stat", REAL));
      writeFileSync(path.join(input.cwd, "out", "style.json"), "{}");
      return done;
    },
    frame: async () => Buffer.from("89504e47", "hex"),
    ...(render === undefined ? {} : { render }),
  };
}

type Call = { readonly html: string; readonly frames: number; readonly outDir: string };
const writer =
  (calls: Call[]): Render =>
  async (html, _lane, frames, outDir) => {
    calls.push({ html, frames, outDir });
    mkdirSync(outDir, { recursive: true });
    writeFileSync(path.join(outDir, "strip.mp4"), "mp4");
  };

async function withKernel<T>(fn: (k: Kernel) => Promise<T>): Promise<T> {
  const k = openKernel(LOC);
  if (!k.ok) throw k.error;
  try {
    return await fn(k.value);
  } finally {
    k.value.close();
  }
}
const ctxOf = (k: Kernel): ActContext => ({ store: k.store, location: LOC, actor: OP, dryOnly: false, live: true, detach: false, say: () => {} });

/** A reel c-01 made on a fresh night through the real act over `e`. */
async function madeReel(e: ReelEngines): Promise<{ night: string; c: ReelCandidate }> {
  const from = await keptIdeaNight();
  const night = (await createNight({ dry: false, day: nextDay() })).id;
  await withKernel((k) => reelAct(ctxOf(k), night, [{ fromIdea: `${from}/c-01`, source: TABLE, data: REAL, cut: CUT }], { engines: e }));
  return { night, c: (await readNight(night)).candidates[0] as ReelCandidate };
}

/* ── The reel act ─────────────────────────────────────────────────────────── */

describe("a reel's job renders its whole strip", () => {
  it("renders 240 frames into the strip's own directory, keeps the still as the tile and records the mp4", async () => {
    const calls: Call[] = [];
    const { night, c } = await madeReel(engines(writer(calls)));
    expect(calls).toHaveLength(1);
    expect(calls[0]?.frames).toBe(240);
    expect(calls[0]?.outDir).toBe(path.dirname(resolveInNight(night, c.files.strip ?? "")));
    expect(c).toMatchObject({ status: "rendered", image: `reels/${c.id}.png`, video: `reels/${c.id}/strip.mp4` });
    expect(c.videoError).toBeUndefined();
    expect(existsSync(resolveInNight(night, `reels/${c.id}.png`))).toBe(true);
  });

  it("a render that throws keeps the reel: the still stands, the candidate is rendered and carries the sentence", async () => {
    const { night, c } = await madeReel(
      engines(async () => {
        throw new Error("window.STRIP.frames is 900, this render takes 240");
      }),
    );
    expect(c).toMatchObject({ status: "rendered", image: `reels/${c.id}.png`, videoError: "window.STRIP.frames is 900, this render takes 240" });
    expect(c.video).toBeUndefined();
    expect(c.error).toBeUndefined();
    expect(existsSync(resolveInNight(night, `reels/${c.id}.png`))).toBe(true);
  });

  it("a render that returns without an mp4 is a sentence too", async () => {
    const { c } = await madeReel(engines(async () => {}));
    expect(c.video).toBeUndefined();
    expect(c.videoError).toBe("the render finished and wrote no strip.mp4");
  });

  it("an engine with no renderer leaves the reel as it was: a still, no video, no sentence", async () => {
    const { c } = await madeReel(engines(undefined));
    expect(c).toMatchObject({ status: "rendered", image: `reels/${c.id}.png` });
    expect([c.video, c.videoError]).toEqual([undefined, undefined]);
  });
});

/* ── The Board ────────────────────────────────────────────────────────────── */

const blob = (mime: string) => ({ sha256: "a".repeat(64), bytes: 3, mime });
const reelOf = (o: Partial<ReelCandidate> = {}): ReelCandidate => ({ id: "c-02", kind: "reel", sourceIds: [], status: "rendered", fromIdea: "2026-11-02/c-01", title: "The coffee belt", source: TABLE, cut: CUT, files: realReelFiles("c-02"), image: "reels/c-02.png", ...o });
function board(c: ReelCandidate, media: Record<string, ReturnType<typeof blob>>) {
  const night: Night = { id: "2027-02-01", startedAt: "2027-02-01T00:00:00.000Z", ceilingUsd: 15, target: 20, clipCap: 2, dry: false, state: "closed", sources: [], candidates: [c], jobs: [] };
  return build({ night, styles: {}, assets: {}, media, knowledge: {}, at: { scout: "s", knowledge: "k", mesh: "m" } });
}
const STILL = { "reels/c-02.png": blob("image/png") };
const MOVING = { ...STILL, "reels/c-02/strip.mp4": blob("video/mp4") };

describe("the Board's reel cell", () => {
  it("carries the mp4 as the cell's media under the same id and group, the still as the row's poster", () => {
    const b = board(reelOf({ video: "reels/c-02/strip.mp4" }), MOVING);
    expect(b.cells).toHaveLength(1);
    expect([b.cells[0]?.id, b.cells[0]?.kind, b.cells[0]?.media.mime]).toEqual(["c-02/reel", "reel", "video/mp4"]);
    expect(b.cells[0]?.url).toContain(encodeURIComponent("reels/c-02/strip.mp4"));
    expect(b.rows[0]).toMatchObject({ id: "c-02", group: "reels" });
    expect(b.rows[0]?.poster).toContain(encodeURIComponent("reels/c-02.png"));
    expect(b.rows[0]?.ref).toBeUndefined();
  });

  it("a reel without a video is exactly as it was: the still, no poster ref, no sentence", () => {
    const b = board(reelOf(), STILL);
    expect([b.cells[0]?.id, b.cells[0]?.media.mime]).toEqual(["c-02/reel", "image/png"]);
    expect(b.rows[0]?.ref).toBeUndefined();
    expect(b.cells[0]?.words.meta).toBe("Source: List of countries by coffee production (Wikipedia) · idea 2026-11-02/c-01 · 2 beats");
  });

  it("a video the packet's disk list does not hold leaves the still, and a failed render says so on the cell", () => {
    expect(board(reelOf({ video: "reels/c-02/strip.mp4" }), STILL).cells[0]?.media.mime).toBe("image/png");
    const c = board(reelOf({ videoError: "ffmpeg exited 1" }), STILL).cells[0];
    expect(c?.media.mime).toBe("image/png");
    expect(c?.words.meta).toMatch(/ · video: ffmpeg exited 1$/);
  });

  it("a video mime changes neither the tab nor the reasons: both read the row's group", () => {
    const b = board(reelOf({ video: "reels/c-02/strip.mp4" }), MOVING);
    const run = { group: b.rows[0]?.group } as never;
    for (const mime of ["image/png", "video/mp4"]) {
      expect(categoryOf(run, mime)).toBe("reels");
      expect(tabOf(categoryOf(run, mime))).toBe("images");
    }
    const v = reasonVocabulary("scout");
    expect(reasonsOf(v, "reels")).toEqual(v.list);
  });
});

/* ── The backfill ─────────────────────────────────────────────────────────── */

/** A night holding rendered reels c-01..c-0n with a strip each; `without` have no strip on disk. */
async function backfillNight(n: number, o: { dry?: boolean; without?: readonly string[] } = {}): Promise<string> {
  const night = await createNight({ dry: o.dry ?? false, day: nextDay() });
  const cands: ReelCandidate[] = [];
  for (let k = 1; k <= n; k++) {
    const id = `c-0${k}`;
    const f = realReelFiles(id);
    if (!o.without?.includes(id)) {
      mkdirSync(path.dirname(resolveInNight(night.id, f.strip)), { recursive: true });
      writeFileSync(resolveInNight(night.id, f.strip), standInPage("stat", REAL));
    }
    cands.push(reelOf({ id, files: f, image: `reels/${id}.png` }));
  }
  await mutateNight(night.id, (x) => ({ ...x, candidates: cands }));
  return night.id;
}
const reelsOf = async (night: string): Promise<ReelCandidate[]> => (await readNight(night)).candidates as ReelCandidate[];

describe("reel-motion, the backfill", () => {
  it("--dry lists what it would render and writes nothing: no render, no mp4, the manifest byte for byte", async () => {
    const night = await backfillNight(2, { without: ["c-02"] });
    const before = readFileSync(resolveInNight(night, "night.json"), "utf8");
    const calls: Call[] = [];
    const r = await reelMotion(night, writer(calls), "stat", { dry: true });
    expect(r.rows).toEqual([{ id: "c-01", state: "would-render" }]);
    expect(calls).toEqual([]);
    expect(existsSync(resolveInNight(night, "reels/c-01/strip.mp4"))).toBe(false);
    expect(readFileSync(resolveInNight(night, "night.json"), "utf8")).toBe(before);
  });

  it("renders in place beside the strip at 240 frames, records each on its candidate, and a second run renders nothing", async () => {
    const night = await backfillNight(2);
    const calls: Call[] = [];
    const first = await reelMotion(night, writer(calls), "stat", { dry: false });
    expect(first.rows.map((x) => [x.id, x.state, x.video])).toEqual([
      ["c-01", "rendered", "reels/c-01/strip.mp4"],
      ["c-02", "rendered", "reels/c-02/strip.mp4"],
    ]);
    expect(calls.map((x) => x.frames)).toEqual([240, 240]);
    expect((await reelsOf(night)).map((c) => c.video)).toEqual(["reels/c-01/strip.mp4", "reels/c-02/strip.mp4"]);
    const again = await reelMotion(night, writer(calls), "stat", { dry: false });
    expect(again.rows).toEqual([]);
    expect(calls).toHaveLength(2);
  });

  it("a failed render is recorded as its sentence and tried again by the next run; the others are not held up", async () => {
    const night = await backfillNight(2);
    const flaky: Render = async (html, lane, frames, outDir) => {
      if (outDir.endsWith("c-01")) throw new Error("page error at load: boom");
      await writer([])(html, lane, frames, outDir);
    };
    const first = await reelMotion(night, flaky, "stat", { dry: false });
    expect(first.rows.map((x) => [x.id, x.state])).toEqual([
      ["c-01", "failed"],
      ["c-02", "rendered"],
    ]);
    expect((await reelsOf(night))[0]).toMatchObject({ videoError: "page error at load: boom" });
    const calls: Call[] = [];
    const second = await reelMotion(night, writer(calls), "stat", { dry: false });
    expect(second.rows.map((x) => [x.id, x.state])).toEqual([["c-01", "rendered"]]);
    expect(calls).toHaveLength(1);
    const c = (await reelsOf(night))[0];
    expect([c?.video, c?.videoError]).toEqual(["reels/c-01/strip.mp4", undefined]);
  });

  it("an mp4 an earlier run left unrecorded is recorded as it stands, not rendered again", async () => {
    const night = await backfillNight(1);
    mkdirSync(path.dirname(resolveInNight(night, "reels/c-01/strip.mp4")), { recursive: true });
    writeFileSync(resolveInNight(night, "reels/c-01/strip.mp4"), "mp4");
    const calls: Call[] = [];
    const r = await reelMotion(night, writer(calls), "stat", { dry: false });
    expect(r.rows.map((x) => x.state)).toEqual(["rendered"]);
    expect(calls).toEqual([]);
    expect((await reelsOf(night))[0]?.video).toBe("reels/c-01/strip.mp4");
  });

  it("a dry night holds stand-in strips and renders nothing", async () => {
    const night = await backfillNight(1, { dry: true });
    const calls: Call[] = [];
    const r = await reelMotion(night, writer(calls), "stat", { dry: false });
    expect([r.dryNight, r.rows, calls]).toEqual([true, [], []]);
  });

  it("the verb: --dry lists, then it renders through the cli's renderer port and says each reel", async () => {
    const night = await backfillNight(1);
    const calls: Call[] = [];
    const out: string[] = [];
    const run = (argv: string[]) => runCli(argv, { env: { ...process.env, GRAVITONE_DRY_ONLY: "1" }, out: (s) => out.push(s), err: (s) => out.push(s), ports: { reelMotion: writer(calls) } });
    expect(await run(["reel-motion", night, "--dry"])).toBe(0);
    expect(out.join("\n")).toContain("c-01 would-render");
    expect(calls).toEqual([]);
    expect(await run(["reel-motion", night])).toBe(0);
    expect(out.join("\n")).toContain("c-01 rendered · reels/c-01/strip.mp4");
    expect(calls).toHaveLength(1);
  });
});
