// A NIGHT'S STATS-REEL IDEAS (spark stats-reels WP-R2) - the `ideas` door and act for target `stats`,
// end to end through `pipeline/scout.mts`, every store a temp directory set below before any lib/
// module loads: the reel's door (required on stats, refused elsewhere, illustrative or nothing), the
// batch split into the studio job and ONE reels launch, the brief and approach written where the
// reel job reads them, the reel cap apart from the idea cap, `open --reels`, the doctor's chromium
// note, and the packet's tile and meta. The reels launcher is a fake (lib/producers/scoutReel.ts is
// WP-R1's); no seat, no vendor, no browser, no network.

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-scout-reel-ideas-"));
  process.env["SCOUT_STORE_DIR"] = path.join(dir, "scout");
  process.env["EXTRACT_STORE_DIR"] = path.join(dir, "extract");
  process.env["MESH_STORE_DIR"] = path.join(dir, "mesh");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  process.env["AI_REGISTRY_DIR"] = path.join(dir, "no-registry");
  process.env["SPEND_STORE"] = "memory";
  process.env["IMAGING_ENV"] = "dev";
  process.env["LOCAL_BINARIES"] = "off";
  for (const k of ["LEONARDO_API_KEY", "GOOGLE_AI_API_KEY", "OLLAMA_HOST", "LEONARDO_STUDIO_CDP"]) delete process.env[k];
  return dir;
});

import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { BlobRef } from "@gt/domain/blob";
import { err, ok } from "@gt/domain/errors";
import type { Receipt } from "@gt/domain/produce";
import { closeProcessKernel } from "@gt/kernel/process";

import { runCli, type CliPorts } from "../../pipeline/scout.mts";
import { blocking, doctor, doctorLine } from "../../lib/foundry/scout/doctor.ts";
import { parseIdeas } from "../../lib/foundry/scout/idea.ts";
import { nightDir, readNight, resolveInNight } from "../../lib/foundry/scout/store.ts";
import type { IdeaCandidate, Night } from "../../lib/foundry/scout/types.ts";
import { build } from "../../lib/decision/v1/sources/scoutPlan.ts";
import { reelsJobId, type ReelsTarget, type launchReels } from "../../lib/producers/scoutReel.ts";
import { __resetBudget } from "../../lib/imaging/budget.ts";
import { resetFakeLeonardoStudio } from "../../lib/imaging/providers/leonardoStudio.ts";

const DRY = { ...process.env, GRAVITONE_DRY_ONLY: "1" };

beforeEach(() => {
  resetFakeLeonardoStudio();
  __resetBudget();
  process.env["LEONARDO_STUDIO_DRIVER"] = "fake";
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
afterAll(() => {
  delete process.env["LEONARDO_STUDIO_DRIVER"];
  rmSync(ROOT, { recursive: true, force: true });
});

type Call = { readonly target: ReelsTarget; readonly token?: string; readonly mode: string };

/** The reels launcher, faked: a receipt without a token, a launch with one; every call recorded. */
function fakeReels(o: { refuse?: string } = {}): { calls: Call[]; launch: typeof launchReels } {
  const calls: Call[] = [];
  const receipt = (t: ReelsTarget, mode: "dry" | "live"): Receipt =>
    ({ token: `tok-${t.candidateIds.join(",")}`, mode, lines: t.candidateIds.map((c) => ({ key: c, lane: "seat.text", provider: "claude-seat", seconds: 900 })), totals: { seconds: 900 * t.candidateIds.length, usd: 0, unpriced: t.candidateIds.length } }) as unknown as Receipt;
  const launch: typeof launchReels = async (_store, target, opts) => {
    calls.push({ target, mode: opts.mode, ...(opts.token === undefined ? {} : { token: opts.token }) });
    if (o.refuse !== undefined) return err("unavailable", o.refuse);
    const rc = receipt(target, opts.mode);
    return ok(opts.token === undefined ? { kind: "receipt", receipt: rc } : { kind: "launched", jobId: reelsJobId(target), receipt: rc });
  };
  return { calls, launch };
}

const NEVER_STUDIO = async (): Promise<never> => {
  throw new Error("a dry ideas job called the studio");
};

async function cli(argv: string[], ports?: CliPorts): Promise<{ code: number; err: string; doc: Record<string, unknown> }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(argv, { env: DRY, out: (s) => out.push(s), err: (s) => err.push(s), ...(ports === undefined ? {} : { ports }) });
  let doc: Record<string, unknown> = {};
  try {
    doc = JSON.parse(out.join("\n")) as Record<string, unknown>;
  } catch {
    /* not a --json call */
  }
  return { code, err: err.join("\n"), doc };
}

let seq = 0;
function batch(body: unknown): string {
  const p = path.join(ROOT, `reels-${++seq}.json`);
  writeFileSync(p, JSON.stringify(body), "utf8");
  return p;
}

async function open(args: string[] = []): Promise<string> {
  const r = await cli(["open", "--json", ...args]);
  expect(r.code, r.err).toBe(0);
  return String(r.doc["night"]);
}

const studio = (title: string) => ({ title, target: "scene", prompt: `A rough artboard: ${title.toLowerCase()}, loose gouache thumbnail.`, anchor: { kind: "watch", ref: "- tag: gouache thumbnails" } });

const reel = (k: number, brief: Record<string, unknown> = {}) => ({
  brief: {
    case: `container-ports-${k}`,
    title: "Busiest container ports, 2000-2024",
    hook: "Which port moves the most boxes?",
    unit: "million TEU",
    kind: "level-race",
    data: { series: [{ name: "Port A", values: [[2000, 18.1], [2024, 49.0]] }, { name: "Port B", values: [[2000, 17.0], [2024, 39.9]] }] },
    steps: ["2008: the crash dents every line at once"],
    illustrative: true,
    ...brief,
  },
  approach: { name: "Harbour ledger", medium: "svg", grammar: "race", density: "medium", direction: "Cranes as bars; the year a tide line rising up the frame.", falsifier: "Reads as a bar chart with boats drawn on it." },
});

const stats = (title: string, k: number, o: Record<string, unknown> = {}) => ({ title, target: "stats", prompt: "Container throughput as a tide: each port a crane whose arm lengthens with the year; 2008 the one ebb.", anchor: { kind: "free", ref: "" }, use: "a logistics explainer's cold open", reel: reel(k), ...o });

const ideasOf = async (night: string): Promise<IdeaCandidate[]> => (await readNight(night)).candidates.filter((c): c is IdeaCandidate => c.kind === "idea");

describe("the reel's door", () => {
  const at = (raw: unknown): string => {
    const r = parseIdeas(raw);
    return r.ok ? "ok" : r.error.message;
  };

  it("a stats idea needs its reel, and no other target carries one", () => {
    expect(at([studio("a"), stats("b", 1)])).toBe("ok");
    const { reel: _none, ...bare } = stats("b", 1);
    expect(at([studio("a"), bare])).toBe("idea 2: reel: a stats idea carries its reel: {brief, approach}");
    expect(at([{ ...studio("a"), reel: reel(1) }])).toBe("idea 1: reel: only a stats idea carries a reel");
  });

  it("the brief is illustrative or it is refused; its data is required and the reel is bounded", () => {
    expect(at([stats("b", 1, { reel: reel(1, { illustrative: false }) })])).toMatch(/^idea 1: reel\.brief\.illustrative: a night's stats brief is illustrative/);
    const { illustrative: _i, ...unmarked } = reel(1).brief;
    expect(at([stats("b", 1, { reel: { ...reel(1), brief: unmarked } })])).toMatch(/^idea 1: reel\.brief\.illustrative: /);
    expect(at([stats("b", 1, { reel: reel(1, { data: null }) })])).toMatch(/^idea 1: reel\.brief\.data: the brief's numbers/);
    expect(at([stats("b", 1, { reel: reel(1, { kind: "pie" }) })])).toMatch(/^idea 1: reel\.brief\.kind: /);
    expect(at([stats("b", 1, { reel: reel(1, { case: "Not A Slug" }) })])).toMatch(/^idea 1: reel\.brief\.case: /);
    expect(at([stats("b", 1, { reel: reel(1, { hook: "h".repeat(201) }) })])).toMatch(/^idea 1: reel\.brief\.hook: /);
    expect(at([stats("b", 1, { reel: { ...reel(1), approach: { ...reel(1).approach, colour: "red" } } })])).toMatch(/^idea 1: reel\.approach: /);
    expect(at([stats("b", 1, { reel: reel(1, { data: { values: Array(20_000).fill(12.5) } }) })])).toMatch(/^idea 1: reel: a reel is at most 60 KB of JSON/);
  });
});

describe("a mixed batch", () => {
  it("2 studio + 2 stats: four candidates, the studio job drawn, ONE reels batch launched with the stats ids, their inputs on disk", async () => {
    const night = await open();
    const fake = fakeReels();
    const input = [studio("Lantern fishers"), stats("Ports as tides", 1), studio("Salt flats"), stats("Ports as cranes", 2)];
    const r = await cli(["ideas", night, "--json", batch(input)], { ideas: { generate: NEVER_STUDIO, launchReels: fake.launch } });
    expect(r.code, r.err).toBe(0);
    expect(r.doc["jobId"]).toBe(`job:scout-ideas:${night}:c-01`);
    expect(r.doc["reelsJobId"]).toBe(`job:scout-reels:${night}:c-02`);
    expect(r.doc["outcome"]).toBe("done");
    expect(r.doc["ideas"]).toEqual({ used: 2, cap: 25 });
    expect(r.doc["reels"]).toEqual({ used: 2, cap: 6 });
    expect(r.err).toMatch(/receipt \(dry\): ideas c-01\.\.c-03 · 2 artboard\(s\)/);
    expect(r.err).toMatch(/receipt \(dry\): reels c-02\.\.c-04 · 2 strip\(s\) on seat\.text · claude seat · ~30 min/);

    // One batch: its receipt, then its one confirm, both with the two stats ids.
    expect(fake.calls.map((c) => [c.target.candidateIds, c.token !== undefined, c.mode])).toEqual([
      [["c-02", "c-04"], false, "dry"],
      [["c-02", "c-04"], true, "dry"],
    ]);
    const ideas = await ideasOf(night);
    expect(ideas.map((c) => [c.id, c.target, c.status])).toEqual([
      ["c-01", "scene", "rendered"],
      ["c-02", "stats", "pending"],
      ["c-03", "scene", "rendered"],
      ["c-04", "stats", "pending"],
    ]);
    expect(ideas[1]?.reel).toEqual({ brief: "ideas/c-02/brief.json", approach: "ideas/c-02/approach.json" });
    expect(ideas[0]?.reel).toBeUndefined();
    for (const [cid, k] of [["c-02", 1], ["c-04", 2]] as const) {
      expect(JSON.parse(readFileSync(resolveInNight(night, `ideas/${cid}/brief.json`), "utf8"))).toEqual(reel(k).brief);
      expect(JSON.parse(readFileSync(resolveInNight(night, `ideas/${cid}/approach.json`), "utf8"))).toEqual(reel(k).approach);
    }
    const status = await cli(["status", night, "--json"]);
    expect(status.doc["reels"]).toEqual({ used: 2, cap: 6 });
  });

  it("a refused reels launch fails only the stats ideas, with its sentence; the studio job is still queued", async () => {
    const night = await open();
    const fake = fakeReels({ refuse: "the seat lane is closed tonight" });
    const r = await cli(["ideas", night, "--json", batch([studio("Lantern fishers"), stats("Ports as tides", 1)])], { ideas: { generate: NEVER_STUDIO, launchReels: fake.launch } });
    expect(r.code).toBe(1);
    expect(r.err.split("\n").at(-1)).toBe(`reels c-02: the seat lane is closed tonight; job:scout-ideas:${night}:c-01 launched`);
    expect((await ideasOf(night)).map((c) => [c.id, c.status, c.error])).toEqual([
      ["c-01", "pending", undefined],
      ["c-02", "failed", "the seat lane is closed tonight"],
    ]);
  });
});

describe("the reel cap", () => {
  it("reelCap 2 refuses three stats ideas with the numbers and writes nothing", async () => {
    const night = await open(["--reels", "2"]);
    const fake = fakeReels();
    const r = await cli(["ideas", night, "--json", batch([stats("a", 1), stats("b", 2), stats("c", 3)])], { ideas: { generate: NEVER_STUDIO, launchReels: fake.launch } });
    expect(r.code).toBe(1);
    expect(r.err).toBe(`night ${night} holds 0 of its 2 stats reels; 2 left, and the batch has 3 - nothing was drawn`);
    expect((await readNight(night)).candidates).toEqual([]);
    expect(existsSync(path.join(nightDir(night), "ideas"))).toBe(false);
    expect(fake.calls).toEqual([]);
  });

  it("stats ideas never consume the idea cap, nor studio ideas the reel cap", async () => {
    const night = await open(["--ideas", "1", "--reels", "3"]);
    const fake = fakeReels();
    const r = await cli(["ideas", night, "--json", batch([studio("a"), stats("b", 1), stats("c", 2), stats("d", 3)]), "--detach"], { ideas: { generate: NEVER_STUDIO, launchReels: fake.launch } });
    expect(r.code, r.err).toBe(0);
    expect(r.doc["outcome"]).toBe("detached");
    expect(r.doc["ideas"]).toEqual({ used: 1, cap: 1 });
    expect(r.doc["reels"]).toEqual({ used: 3, cap: 3 });
    expect(readdirSync(path.join(nightDir(night), "ideas")).sort()).toEqual(["c-02", "c-03", "c-04"]);
    const more = await cli(["ideas", night, "--json", batch([stats("e", 4)])], { ideas: { generate: NEVER_STUDIO, launchReels: fake.launch } });
    expect(more.err).toBe(`night ${night} holds 3 of its 3 stats reels; 0 left, and the batch has 1 - nothing was drawn`);
  });

  it("a stats-only batch launches no studio job and is detached", async () => {
    const night = await open();
    const fake = fakeReels();
    const r = await cli(["ideas", night, "--json", batch([stats("a", 1)])], { ideas: { generate: NEVER_STUDIO, launchReels: fake.launch } });
    expect(r.code, r.err).toBe(0);
    expect(r.doc["jobId"]).toBeUndefined();
    expect(r.doc).toMatchObject({ reelsJobId: `job:scout-reels:${night}:c-01`, outcome: "detached" });
  });
});

describe("open --reels", () => {
  it("records the reel cap, defaults it, and refuses one over the maximum", async () => {
    const r = await cli(["open", "--json", "--reels", "4"]);
    expect(r.code, r.err).toBe(0);
    expect(r.doc["reelCap"]).toBe(4);
    expect((await readNight(String(r.doc["night"]))).reelCap).toBe(4);
    expect((await cli(["open", "--json"])).doc["reelCap"]).toBe(6);
    expect((await cli(["open", "--reels", "13"])).code).toBe(2);
    expect((await cli(["open", "--reels", "2.5"])).code).toBe(2);
  });
});

describe("doctor, chromium", () => {
  const base = { env: {}, storePath: ":memory:", scoutRoot: path.join(ROOT, "scout"), dry: false, spawn: async () => ({ ok: true as const, stdout: Buffer.from("tool 9.9"), stderr: "" }), keyFetch: async () => ({ ok: true, status: 200, text: async () => "{}" }), studio: async () => ({ ok: true }) };
  const line = async (chromium: () => Promise<string>) => {
    const checks = await doctor({ ...base, chromium });
    const c = checks.find((x) => x.name === "chromium");
    return { line: c === undefined ? "absent" : doctorLine(c), blocked: blocking(checks).some((x) => x.name === "chromium") };
  };

  it("reads ok with the executable's path when installed, and a note - never a failure - when not", async () => {
    const exe = path.join(ROOT, "chrome.exe");
    writeFileSync(exe, "");
    expect(await line(async () => exe)).toEqual({ line: `ok   chromium            ${exe}`, blocked: false });
    const gone = await line(async () => path.join(ROOT, "no-chrome.exe"));
    expect(gone.line).toMatch(/^note chromium +not installed \(.*no-chrome\.exe\) -> the night's stats reels are drawn in it: npx playwright install chromium$/);
    expect(gone.blocked).toBe(false);
    const broken = await line(async () => {
      throw new Error("playwright is not installed");
    });
    expect(broken).toEqual({ line: "note chromium            playwright is not installed -> the night's stats reels are drawn in it: npx playwright install chromium", blocked: false });
  });
});

describe("the packet", () => {
  it("a rendered stats idea is one tile with its target and anchor as the meta; a pending one is not judged", () => {
    const tile = { sha256: "a".repeat(64), mime: "image/png", bytes: 10 } as unknown as BlobRef;
    const base = { sourceIds: [], prompt: "Container throughput as a tide.", anchor: { kind: "free" as const, ref: "" }, reel: { brief: "ideas/c-01/brief.json", approach: "ideas/c-01/approach.json" } };
    const night: Night = {
      id: "2026-10-23",
      startedAt: "2026-10-23T20:00:00.000Z",
      ceilingUsd: 15,
      target: 20,
      clipCap: 2,
      dry: false,
      state: "closed",
      sources: [],
      jobs: [],
      candidates: [
        { ...base, id: "c-01", kind: "idea", status: "rendered", title: "Ports as tides", target: "stats", image: "ideas/c-01.png", jobId: "job:scout-reels:2026-10-23:c-01" },
        { ...base, id: "c-02", kind: "idea", status: "pending", title: "Ports as cranes", target: "stats" },
      ],
    };
    const b = build({ night, styles: {}, assets: {}, media: { "ideas/c-01.png": tile }, knowledge: {}, at: { scout: "foundry-out/scout", knowledge: "knowledge", mesh: "foundry-out/mesh" } });
    expect(b.cells.map((c) => [c.id, c.kind, c.words.meta, c.jobId])).toEqual([["c-01/board", "idea", "stats reel · free", "job:scout-reels:2026-10-23:c-01"]]);
    expect(b.rows).toEqual([{ id: "c-01", label: "Ports as tides", group: "ideas", aim: "Container throughput as a tide." }]);
    expect(b.losses).toEqual([{ candidate: "c-02", grade: "dropped", reason: "pending when the night closed: nothing to judge" }]);
  });
});
