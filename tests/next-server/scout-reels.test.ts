// A NIGHT'S STATS REELS (spark stats-reels WP-R1) - the scout-reels job end to end over a temp night and a
// temp kernel, every store a temp directory set below before any lib/ module loads: the author turn on a
// counted fake seat, the lint and the data-block rule with their one fix turn, the cold frame 120 as the
// idea's tile, one idea's failure kept to that idea, a seat that never served failing the rest with its
// one sentence, a retried job that never re-authors a booked idea, a dry job that never enters the seat,
// and renderFrame on a real headless Chromium drawing the same bytes twice. No vendor, no seat, no network.

import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-scout-reels-"));
  process.env["SCOUT_STORE_DIR"] = path.join(dir, "scout");
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

import { parseAt } from "@gt/domain/door";
import { jobIdSchema } from "@gt/domain/ids";
import { retry } from "@gt/kernel/job";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { closeProcessKernel } from "@gt/kernel/process";
import { reelsPlan, type ReelsRequest } from "@gt/producers/scout-reels/define";
import { chromium } from "playwright";

import type { AgentResult, RunAgentInput } from "../../lib/agent/cliSeam.ts";
import { standInPage } from "../../lib/foundry/strips/author.ts";
import { createNight, mutateNight, readNight, resolveInNight } from "../../lib/foundry/scout/store.ts";
import type { IdeaCandidate, ReelBrief } from "../../lib/foundry/scout/types.ts";
import { producers } from "../../lib/producers/registry.ts";
import { driveReels, launchReels, reelFiles, reelsJobId, reelTile, REEL_TILE_FRAME } from "../../lib/producers/scoutReel.ts";
import { approachOf, reelLint, type ReelEngines } from "../../lib/producers/scoutReelActs.ts";
import { launchHeadless, renderFrame } from "../../pipeline/strips/render.mts";

const LOC = path.join(ROOT, "kernel.sqlite");
const OP = { kind: "operator" as const, id: "op-test" };

afterEach(() => {
  vi.restoreAllMocks();
  closeProcessKernel();
});
afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true });
});

/* ── The night and its stats ideas ────────────────────────────────────────── */

const DATA = { years: [2000, 2001, 2002], series: [{ name: "North", values: [3, 5, 4] }, { name: "South", values: [4, 4, 6] }] };
const reel = (title: string): ReelBrief => ({
  brief: { case: `stat-${title.toLowerCase().replace(/\W+/g, "-")}`, title, hook: "Who leads when the season turns?", unit: "points", kind: "level-race", data: DATA, illustrative: true },
  approach: { name: "Ledger race", medium: "svg", grammar: "reflow", density: "mid", direction: "Ink on paper, one accent for the leader.", falsifier: "Two lines that never cross read as a winners list." },
});

let day = 0;
/** A night holding `n` stats ideas c-01..c-0n, their inputs written where the ideas door writes them. */
async function nightWith(n: number, dry = false): Promise<string> {
  const night = await createNight({ dry, day: `2026-11-${String(++day).padStart(2, "0")}` });
  const ideas: IdeaCandidate[] = [];
  for (let k = 1; k <= n; k++) {
    const id = `c-0${k}`;
    const r = reel(`Reel ${k}`);
    const f = reelFiles(id);
    mkdirSync(path.dirname(resolveInNight(night.id, f.brief)), { recursive: true });
    writeFileSync(resolveInNight(night.id, f.brief), JSON.stringify(r.brief));
    writeFileSync(resolveInNight(night.id, f.approach), JSON.stringify(r.approach));
    ideas.push({ id, kind: "idea", sourceIds: [], status: "pending", title: r.brief.title, target: "stats", prompt: r.brief.hook, anchor: { kind: "free", ref: "" }, reel: { brief: f.brief, approach: f.approach } });
  }
  await mutateNight(night.id, (x) => ({ ...x, candidates: [...x.candidates, ...ideas] }));
  return night.id;
}

const ideasOf = async (night: string): Promise<IdeaCandidate[]> => (await readNight(night)).candidates.filter((c): c is IdeaCandidate => c.kind === "idea");

/* ── The fakes ────────────────────────────────────────────────────────────── */

type Act = "good" | "no-data" | "errored" | "dead";
type Call = { readonly cid: string; readonly fix: boolean; readonly prompt: string; readonly reelMd: boolean };

/** A counted seat: each idea's author turn acts as `script` says; a fix turn writes a passing page. */
function fakeSeat(script: Readonly<Record<string, Act>> = {}): { calls: Call[]; seat: ReelEngines["seat"] } {
  const calls: Call[] = [];
  const done = (o: Partial<AgentResult> = {}): AgentResult => ({ outcome: "completed", final: "", turns: 1, durationMs: 5, exitCode: 0, errors: [], costUsd: 0.5, ...o });
  const silent = (o: Partial<AgentResult>): AgentResult => ({ outcome: "unavailable", final: "", turns: 0, durationMs: 1, exitCode: null, errors: [], ...o });
  return {
    calls,
    seat: async (input: RunAgentInput) => {
      const cid = path.basename(input.cwd);
      const fix = existsSync(path.join(input.cwd, "inputs", "feedback.md"));
      calls.push({ cid, fix, prompt: input.prompt, reelMd: existsSync(path.join(input.cwd, "inputs", "REEL.md")) });
      const out = path.join(input.cwd, "out", "strip.html");
      const act = fix ? "good" : (script[cid] ?? "good");
      if (act === "dead") return silent({ errors: ["claude is not signed in"] });
      if (act === "errored") return done({ outcome: "errored", errors: ["the agent exited 1"] });
      writeFileSync(out, act === "no-data" ? standInPage("stat") : standInPage("stat", DATA));
      return done();
    },
  };
}

const TILE = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
function fakeFrame(): { calls: { html: string; i: number }[]; frame: ReelEngines["frame"] } {
  const calls: { html: string; i: number }[] = [];
  return { calls, frame: async (html, _lane, i) => (calls.push({ html, i }), TILE) };
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

/** Receipt, confirm, drive: the job's id and the drive's outcome. */
async function run(night: string, cids: string[], engines: ReelEngines, mode: "dry" | "live" = "live"): Promise<{ jobId: string; outcome: string }> {
  return withKernel(async (k) => {
    const target = { nightId: night, candidateIds: cids };
    const r = await launchReels(k.store, target, { mode, actor: OP, dryOnly: false });
    if (!r.ok || r.value.kind !== "receipt") throw new Error(`no receipt: ${r.ok ? r.value.kind : r.error.message}`);
    const l = await launchReels(k.store, target, { mode, actor: OP, dryOnly: false, token: r.value.receipt.token });
    if (!l.ok || l.value.kind !== "launched") throw new Error(`not launched: ${JSON.stringify(l)}`);
    const d = await driveReels(k.store, LOC, l.value.jobId, { dryOnly: mode === "dry", engines });
    if (!d.ok) throw d.error;
    return { jobId: l.value.jobId, outcome: d.value.outcome };
  });
}

/* ── The tests ────────────────────────────────────────────────────────────── */

describe("the reel's card and lint", () => {
  it("maps the seat's approach onto the strips card, and names a word the harness cannot draw", () => {
    const a = approachOf({ ...reel("x").approach, medium: " SVG " }, "stat-x");
    expect(a.ok && a.value).toMatchObject({ id: "REEL", lane: "stat", case: "stat-x", medium: "svg", grammar: "reflow", density: "mid", leonardo: "none" });
    const gl = approachOf({ ...reel("x").approach, medium: "webgl" }, "stat-x");
    expect(gl.ok ? "" : gl.error.message).toBe('approach.medium "webgl" is not one the strips harness draws (svg, canvas, dom, css3d)');
  });

  it("the dry stand-in passes the data rule with numbers, and is the strips page byte for byte without", () => {
    expect(reelLint(standInPage("stat", DATA))).toEqual([]);
    expect(reelLint(standInPage("stat"))).toEqual(['data: exactly one <script id="strip-data"> block holds the numbers — found 0']);
    expect(standInPage("stat")).not.toMatch(/strip-data|STRIP_DATA/);
  });

  it("a resumed job plans only the reels it has not booked", () => {
    const req: ReelsRequest = { nightId: "2026-11-30", reels: [1, 2, 3].map((k) => ({ candidateId: `c-0${k}` })), estimates: { reel: { seconds: 1770, usd: 6.4 } }, by: "op" };
    expect(reelsPlan(req, new Map([["reel:1", { step: "reel:1", value: {}, at: "2026-11-30T00:00:00.000Z" }]])).map((s) => s.name)).toEqual(["reel:2", "reel:3"]);
  });
});

describe("a live batch, on a fake seat", () => {
  it("author -> lint fails (no data block) -> one fix turn -> lint passes -> frame 120 -> the idea rendered with its tile and strip", async () => {
    const night = await nightWith(1);
    const seat = fakeSeat({ "c-01": "no-data" });
    const frame = fakeFrame();
    const r = await run(night, ["c-01"], { seat: seat.seat, frame: frame.frame });
    expect(r).toEqual({ jobId: reelsJobId({ nightId: night, candidateIds: ["c-01"] }), outcome: "done" });
    expect(seat.calls.map((c) => [c.cid, c.fix, c.reelMd])).toEqual([
      ["c-01", false, true],
      ["c-01", true, true],
    ]);
    expect(seat.calls.every((c) => c.prompt.endsWith("Then read inputs/REEL.md: it is this strip's addendum to the contract, and it wins where the two differ."))).toBe(true);
    const f = reelFiles("c-01");
    expect(frame.calls).toEqual([{ html: resolveInNight(night, f.strip), i: REEL_TILE_FRAME }]);
    const [c] = await ideasOf(night);
    expect(c).toMatchObject({ status: "rendered", image: reelTile("c-01"), reel: f, jobId: r.jobId });
    expect(c?.error).toBeUndefined();
    expect(readFileSync(resolveInNight(night, reelTile("c-01")))).toEqual(TILE);
    expect(reelLint(readFileSync(resolveInNight(night, f.strip), "utf8"))).toEqual([]);
    // The seat's dollars are booked against the job and attributed to the seat, which the night's ceiling does not cap.
    await withKernel(async (k) => {
      const rows = k.store.read((x) => x.all("SELECT axes, usd FROM spend_rows WHERE job_id = ?", r.jobId));
      if (!rows.ok) throw rows.error;
      expect(rows.value.map((row) => [JSON.parse(String(row["axes"]))["model"], row["usd"]])).toEqual([
        ["claude-seat/claude-opus-5", 0.5],
        ["claude-seat/claude-opus-5", 0.5],
      ]);
    });
  });

  it("an idea whose turn fails is failed with the sentence; the one before stays rendered and the job ends done", async () => {
    const night = await nightWith(2);
    const seat = fakeSeat({ "c-02": "errored" });
    const r = await run(night, ["c-01", "c-02"], { seat: seat.seat, frame: fakeFrame().frame });
    expect(r.outcome).toBe("done");
    expect((await ideasOf(night)).map((c) => [c.status, c.error])).toEqual([
      ["rendered", undefined],
      ["failed", "errored: the agent exited 1"],
    ]);
  });

  it("a seat that never served fails the rest with its one sentence, asked once; the retry authors only what was never booked", async () => {
    const night = await nightWith(3);
    const dead = fakeSeat({ "c-02": "dead" });
    const r = await run(night, ["c-01", "c-02", "c-03"], { seat: dead.seat, frame: fakeFrame().frame });
    expect(r.outcome).toBe("failed");
    expect(dead.calls.map((c) => c.cid)).toEqual(["c-01", "c-02"]);
    expect((await ideasOf(night)).map((c) => [c.status, c.error])).toEqual([
      ["rendered", undefined],
      ["failed", "claude is not signed in"],
      ["failed", "claude is not signed in"],
    ]);
    const back = fakeSeat();
    await withKernel(async (k) => {
      const id = parseAt("job id", jobIdSchema, r.jobId);
      if (!id.ok) throw id.error;
      const q = retry(k.store, id.value, OP);
      if (!q.ok) throw q.error;
      const d = await driveReels(k.store, LOC, r.jobId, { dryOnly: false, engines: { seat: back.seat, frame: fakeFrame().frame } });
      expect(d.ok && d.value.outcome).toBe("done");
    });
    expect(back.calls.map((c) => c.cid)).toEqual(["c-02", "c-03"]);
    expect((await ideasOf(night)).map((c) => c.status)).toEqual(["rendered", "rendered", "rendered"]);
  });

  it("a second launch of the batch answers with its job, never a second", async () => {
    const night = await nightWith(1);
    const r = await run(night, ["c-01"], { seat: fakeSeat().seat, frame: fakeFrame().frame });
    await withKernel(async (k) => {
      const again = await launchReels(k.store, { nightId: night, candidateIds: ["c-01"] }, { mode: "live", actor: OP, dryOnly: false });
      expect(again.ok && again.value).toEqual({ kind: "existing", jobId: r.jobId, state: "done" });
    });
  });
});

describe("a dry batch", () => {
  it("walks every idea on stand-ins: the seat and the browser are never entered", async () => {
    const night = await nightWith(2, true);
    const seat = fakeSeat();
    const frame = fakeFrame();
    const r = await run(night, ["c-01", "c-02"], { seat: seat.seat, frame: frame.frame }, "dry");
    expect(r.outcome).toBe("done");
    expect(seat.calls).toEqual([]);
    expect(frame.calls).toEqual([]);
    const ideas = await ideasOf(night);
    expect(ideas.map((c) => [c.status, c.image])).toEqual([
      ["rendered", "ideas/c-01.png"],
      ["rendered", "ideas/c-02.png"],
    ]);
    for (const c of ideas) expect(readFileSync(resolveInNight(night, c.image ?? "")).subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(reelLint(readFileSync(resolveInNight(night, reelFiles("c-01").strip), "utf8"))).toEqual([]);
    const bound = producers();
    expect(bound.ok && bound.value.has("scout-reels@seat.text")).toBe(true);
  });
});

describe("renderFrame, cold", () => {
  it.skipIf(!existsSync(chromium.executablePath()))("draws the same bytes twice from a fixture strip", async () => {
    const html = path.join(ROOT, "fixture", "strip.html");
    mkdirSync(path.dirname(html), { recursive: true });
    writeFileSync(html, standInPage("stat", DATA));
    const browser = await launchHeadless();
    try {
      const a = await renderFrame({ browser, htmlPath: html, lane: "stat", i: REEL_TILE_FRAME });
      const b = await renderFrame({ browser, htmlPath: html, lane: "stat", i: REEL_TILE_FRAME });
      expect(a.subarray(1, 4).toString("ascii")).toBe("PNG");
      expect(a.length).toBeGreaterThan(100);
      expect(b.equals(a)).toBe(true);
    } finally {
      await browser.close();
    }
  }, 60_000);
});
