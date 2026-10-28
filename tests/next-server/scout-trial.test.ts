// A GENRE'S TRIALS (spark scout-vision S2 WP3) - `pipeline/scout.mts storyboard` with `genre`, end to end over temp
// nights and a temp kernel: the door (a live genre only - never unknown, retired or publishable; TRIALS_PER_GENRE a night,
// refused past them naming the numbers; trials first from the cap, so a plain batch cannot take a live genre's unused
// slot; one trial per idea per genre, never refused by a plain storyboard of the idea), a dry trial's words only, and
// the trial's clip step on a live night - one clip per drawn panel over its own still, `clips` by index, a failed clip
// that panel's alone (the frames and the other clips stand). Then genres.ts trialSlots and piecesDue (pure). No
// ComfyUI, no vendor, no network: fetch throws, and the frame and clip engines are fakes.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// Every case drives the CLI and a kernel job end to end; a loaded box (the whole suite at once) needs more than 5 s.
vi.setConfig({ testTimeout: 60_000 });

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-scout-trial-"));
  process.env["SCOUT_STORE_DIR"] = path.join(dir, "scout");
  process.env["SCOUT_MUSE_STORE_DIR"] = path.join(dir, "scout-muse");
  process.env["EXTRACT_STORE_DIR"] = path.join(dir, "extract");
  process.env["MESH_STORE_DIR"] = path.join(dir, "mesh");
  process.env["FOUNDRY_DIR"] = path.join(dir, "catalogue");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  process.env["AI_REGISTRY_DIR"] = path.join(dir, "no-registry");
  fs.mkdirSync(path.join(dir, "catalogue"), { recursive: true });
  fs.writeFileSync(path.join(dir, "catalogue", "styles.json"), JSON.stringify({ styles: [] }), "utf8");
  return dir;
});

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { TRIALS_PER_GENRE, type Genre } from "@gt/domain/genre";
import { closeProcessKernel, processKernel } from "@gt/kernel/process";
import type { Store } from "@gt/kernel/store";
import { bornGenre, retireGenre } from "@gt/kernel/ventures/store";

import { runCli, type CliPorts } from "../../pipeline/scout.mts";
import { piecesDue, trialSlots } from "../../lib/foundry/scout/genres.ts";
import { parseStoryboards } from "../../lib/foundry/scout/storyboard.ts";
import { readNight, resolveInNight } from "../../lib/foundry/scout/store.ts";
import type { Candidate, IdeaCandidate, Night, NightCommit, PieceCandidate, StoryboardCandidate } from "../../lib/foundry/scout/types.ts";
import { clipSeed } from "../../lib/producers/scoutStoryboard.ts";
import { panelStillOf } from "../../lib/producers/scoutStoryboardActs.ts";

const DRY = { ...process.env, GRAVITONE_DRY_ONLY: "1" };
const LIVE = (() => {
  const { GRAVITONE_DRY_ONLY: _pin, ...rest } = process.env;
  return rest;
})();
const KEPT = "2026-09-20";
const PUB = "2026-09-21";
const OPERATOR = { kind: "operator" as const, id: "op-test" };

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9]);
const MP4 = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 1]);
const idea = (id: string): IdeaCandidate => ({ id, kind: "idea", sourceIds: [], status: "rendered", title: `idea ${id}`, target: "scene", prompt: `prompt of ${id}`, anchor: { kind: "free", ref: "" }, image: `ideas/${id}.png` });
const commit = (kept: string[], o: Partial<NightCommit> = {}): NightCommit => ({ at: "2026-09-22T08:00:00.000Z", by: "operator", kept, rejected: [], reasons: {}, notes: {}, dry: false, ...o });
const nightOf = (id: string, candidates: Candidate[], o: Partial<Night> = {}): Night => ({ id, startedAt: `${id}T00:00:00.000Z`, ceilingUsd: 15, target: 20, clipCap: 2, dry: false, state: "committed", stop: "target", sources: [], candidates, jobs: [], ...o });

function write(n: Night): void {
  const dir = path.join(ROOT, "scout", n.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "night.json"), JSON.stringify(n));
}

let store: Store;
let live: Genre;
let pub: Genre;
let old: Genre;

const born = (name: string, proposal: string): Genre => {
  const g = store.tx((t) => bornGenre(t, { name, bornFrom: `${KEPT}/c-90`, proposal, use: "short: a 30 s Short", look: "chalk on slate", grammar: ["the question", "the diagram", "the answer"] }, OPERATOR));
  if (!g.ok) throw g.error;
  return g.value;
};

beforeAll(() => {
  const k = processKernel(path.join(ROOT, "kernel.sqlite"));
  if (!k.ok) throw k.error;
  store = k.value.store;
  live = born("Kitchen table science", "2026-09-01/c-01");
  pub = born("Deadpan office satire", "2026-09-01/c-02");
  old = born("Rooftop noir", "2026-09-01/c-03");
  const r = store.tx((t) => retireGenre(t, old.id, OPERATOR));
  if (!r.ok) throw r.error;
  const ideas = ["c-01", "c-02", "c-03", "c-04", "c-05", "c-06", "c-07", "c-08", "c-09", "c-10"].map(idea);
  write(nightOf(KEPT, ideas, { committed: commit(ideas.map((c) => `${c.id}/board`)) }));
  // The publishable genre's kept piece.
  const piece: PieceCandidate = { id: "c-01", kind: "piece", sourceIds: [], status: "rendered", genre: pub.id, fromTrial: `${KEPT}/c-90`, title: "a piece", clips: [] };
  write(nightOf(PUB, [piece], { committed: commit(["c-01/video"]) }));
});
beforeEach(() => {
  vi.stubGlobal("fetch", async (input: string | URL | Request) => {
    throw new Error(`unexpected fetch ${String(input)}`);
  });
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
afterAll(() => {
  closeProcessKernel();
  rmSync(ROOT, { recursive: true, force: true });
});

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
  const p = path.join(ROOT, `boards-${++seq}.json`);
  writeFileSync(p, JSON.stringify(body), "utf8");
  return p;
}

const PANELS = ["a kettle on a kitchen table, a chalk outline beside it", "the chase of bubbles up the chalk diagram", "steam drawing one note in the air"];
const brief = (fromIdea: string, o: Record<string, unknown> = {}) => ({
  fromIdea,
  title: "Why the kettle sings",
  paragraph: "A chalk diagram grows on the kitchen table while the kettle heats.",
  bullets: ["beats: the question, the diagram, the answer", "format: a 30 s Short", "audience: curious adults"],
  panels: PANELS,
  ...o,
});

async function open(args: string[], env: Record<string, string | undefined>): Promise<string> {
  const r = await cli(["open", "--json", ...args], { env });
  expect(r.code, r.err).toBe(0);
  return String(r.doc["night"]);
}

const boardsOf = async (night: string): Promise<StoryboardCandidate[]> => (await readNight(night)).candidates.filter((c): c is StoryboardCandidate => c.kind === "storyboard");

/** Fake engines: a frame for every prompt, a clip for every still but those it is told to refuse. */
function engines(o: { refuseFrame?: (p: string) => boolean; refuseClip?: (p: string) => boolean } = {}) {
  const clipped: { still: Uint8Array; prompt: string; aspect: string; seed: number }[] = [];
  const ports: CliPorts = {
    storyboard: {
      draw: async (prompt, x) => {
        if (o.refuseFrame?.(prompt) === true) throw new Error("ComfyUI SamplerCustomAdvanced (node 11) failed: out of memory");
        return { png: PNG, seed: x.seed ?? 7 };
      },
      clip: async (still, prompt, x) => {
        clipped.push({ still, prompt, aspect: x.aspect, seed: x.seed });
        if (o.refuseClip?.(prompt) === true) throw new Error("ComfyUI LTXVSampler (node 40) failed: out of memory");
        return { bytes: MP4, durationS: 5 };
      },
    },
  };
  return { ports, clipped };
}

describe("the trial door", () => {
  it("parses `genre` as a genre id, and one trial per idea per genre in a batch (a plain storyboard of the idea beside it is fine)", () => {
    const at = (raw: unknown): string => {
      const r = parseStoryboards(raw);
      return r.ok ? "ok" : r.error.message;
    };
    expect(at([brief(`${KEPT}/c-01`, { genre: "kitchen" })])).toBe("storyboard 1: genre: a genre id gn-...");
    expect(at([brief(`${KEPT}/c-01`), brief(`${KEPT}/c-01`, { genre: live.id })])).toBe("ok");
    expect(at([brief(`${KEPT}/c-01`, { genre: live.id }), brief(`${KEPT}/c-01`, { genre: live.id })])).toBe(`storyboard 2: fromIdea: ${KEPT}/c-01 is storyboard 1's too; one trial of ${live.id} per idea`);
  });

  it("refuses an unknown, a retired and a publishable genre before a candidate exists", async () => {
    const night = await open([], DRY);
    const refused = async (genre: string): Promise<string> => {
      const r = await cli(["storyboard", night, "--json", file([brief(`${KEPT}/c-01`, { genre })])]);
      expect(r.code).toBe(1);
      return r.err;
    };
    expect(await refused("gn-no-such-genre")).toContain("storyboard 1: genre: no genre gn-no-such-genre");
    expect(await refused(old.id)).toMatch(new RegExp(`storyboard 1: genre: ${old.id} is retired \\(\\d{4}-\\d{2}-\\d{2}\\); only a perfecting or piece-due genre takes trials`));
    expect(await refused(pub.id)).toContain(`storyboard 1: genre: ${pub.id} is publishable; only a perfecting or piece-due genre takes trials`);
    expect(await boardsOf(night)).toEqual([]);
  });

  it("takes trials within the genre's slots, refuses one past them naming the numbers, and a dry trial is its words alone", async () => {
    const night = await open(["--storyboards", "5"], DRY);
    const two = await cli(["storyboard", night, "--json", file([brief(`${KEPT}/c-02`, { genre: live.id }), brief(`${KEPT}/c-03`, { genre: live.id })])]);
    expect(two.code, two.err).toBe(0);
    const made = await boardsOf(night);
    expect(made.map((c) => [c.id, c.genre, c.status, c.images])).toEqual([
      ["c-01", live.id, "rendered", []],
      ["c-02", live.id, "rendered", []],
    ]);
    // A dry trial draws no frame, so it has no clip step and no `clips`.
    expect(made[0]).not.toHaveProperty("clips");
    const third = await cli(["storyboard", night, "--json", file([brief(`${KEPT}/c-04`, { genre: live.id })])]);
    expect(third.code).toBe(1);
    expect(third.err).toContain(`genre ${live.id} holds 2 of its ${TRIALS_PER_GENRE} trials on night ${night}; 0 left, and the batch has 1 - nothing was drawn`);
    expect(await boardsOf(night)).toHaveLength(2);
  });

  it("trials come first from the cap: a plain batch may not take a place the live genre's unused slots hold", async () => {
    const night = await open(["--storyboards", "3"], DRY);
    const plain = await cli(["storyboard", night, "--json", file([brief(`${KEPT}/c-05`), brief(`${KEPT}/c-06`)])]);
    expect(plain.code).toBe(1);
    expect(plain.err).toContain(`night ${night} holds 0 of its 3 storyboards; 3 left, 2 of them held for genre trials (${live.id} 2), and the batch has 2 plain - nothing was drawn`);
    const one = await cli(["storyboard", night, "--json", file([brief(`${KEPT}/c-05`)])]);
    expect(one.code, one.err).toBe(0);
    // The trials still fit: the cap's last two places were theirs.
    const trials = await cli(["storyboard", night, "--json", file([brief(`${KEPT}/c-07`, { genre: live.id }), brief(`${KEPT}/c-08`, { genre: live.id })])]);
    expect(trials.code, trials.err).toBe(0);
    expect((await boardsOf(night)).map((c) => c.genre ?? "plain")).toEqual(["plain", live.id, live.id]);
  });

  it("one trial per idea per genre across nights; a plain storyboard of the idea does not refuse its trial", async () => {
    const night = await open([], DRY);
    const plain = await cli(["storyboard", night, "--json", file([brief(`${KEPT}/c-09`)])]);
    expect(plain.code, plain.err).toBe(0);
    const trial = await cli(["storyboard", night, "--json", file([brief(`${KEPT}/c-09`, { genre: live.id })])]);
    expect(trial.code, trial.err).toBe(0);
    const other = await open([], DRY);
    const again = await cli(["storyboard", other, "--json", file([brief(`${KEPT}/c-09`, { genre: live.id })])]);
    expect(again.code).toBe(1);
    expect(again.err).toContain(`storyboard 1: idea ${KEPT}/c-09 already has trial ${night}/c-02 of ${live.id} (rendered); one trial per idea per genre, unless that one failed`);
  });
});

describe("a live trial - the clip step", () => {
  it("clips every drawn panel after the frames, over its own still: clip-N files, `clips` by index, seeds from the place", async () => {
    const night = await open(["--live"], LIVE);
    const fake = engines();
    const r = await cli(["storyboard", night, "--json", file([brief(`${KEPT}/c-10`, { genre: live.id })])], { env: LIVE, ports: fake.ports });
    expect(r.code, r.err).toBe(0);
    expect(r.doc).toMatchObject({ ok: true, outcome: "done" });
    const [c] = await boardsOf(night);
    const clip = (k: number) => ({ path: `storyboards/c-01/clip-${k}.mp4`, durationS: 5, from: `storyboards/c-01/panel-${k}.png`, engine: "ltx-local", usd: 0 });
    expect(c).toMatchObject({ status: "rendered", genre: live.id, images: [1, 2, 3].map((k) => `storyboards/c-01/panel-${k}.png`), clips: [clip(1), clip(2), clip(3)] });
    expect(c).not.toHaveProperty("error");
    expect(fake.clipped.map((x) => [x.prompt, x.aspect, x.seed])).toEqual(PANELS.map((p, i) => [p, "16:9", clipSeed({ nightId: night, candidateId: "c-01" }, i + 1)]));
    // Each clip animates its own panel's still: the frame's bytes, read back from the night.
    for (const x of fake.clipped) expect(x.still).toEqual(PNG);
    for (const k of [1, 2, 3]) expect(new Uint8Array(readFileSync(resolveInNight(night, `storyboards/c-01/clip-${k}.mp4`)))).toEqual(MP4);
  });

  it("a clip that fails on panel 2 leaves panels 1 and 3 clipped and the trial judgeable", async () => {
    const night = await open(["--live"], LIVE);
    const fake = engines({ refuseClip: (p) => p.startsWith("the chase") });
    const r = await cli(["storyboard", night, "--json", file([brief(`${KEPT}/c-01`, { genre: live.id })])], { env: LIVE, ports: fake.ports });
    expect(r.code, r.err).toBe(0);
    const [c] = await boardsOf(night);
    expect(c).toMatchObject({ status: "rendered", images: [1, 2, 3].map((k) => `storyboards/c-01/panel-${k}.png`), error: "clip 2: ComfyUI LTXVSampler (node 40) failed: out of memory" });
    expect(c?.clips?.map((x) => x?.path ?? null)).toEqual(["storyboards/c-01/clip-1.mp4", null, "storyboards/c-01/clip-3.mp4"]);
    expect(existsSync(resolveInNight(night, "storyboards/c-01/clip-2.mp4"))).toBe(false);
  });

  it("a panel that drew no frame has nothing to clip: its clip is null with the guard's sentence, the engine never asked", async () => {
    const night = await open(["--live"], LIVE);
    const fake = engines({ refuseFrame: (p) => p.startsWith("steam") });
    const r = await cli(["storyboard", night, "--json", file([brief(`${KEPT}/c-04`, { genre: live.id })])], { env: LIVE, ports: fake.ports });
    expect(r.code, r.err).toBe(0);
    const [c] = await boardsOf(night);
    expect(c?.clips?.map((x) => x?.path ?? null)).toEqual(["storyboards/c-01/clip-1.mp4", "storyboards/c-01/clip-2.mp4", null]);
    expect(c?.error).toBe("panel 3: ComfyUI SamplerCustomAdvanced (node 11) failed: out of memory; clip 3: c-01: panel 3 drew no still; there is nothing to clip");
    expect(fake.clipped).toHaveLength(2);
  });

  it("a plain storyboard on a live night has no clip step", async () => {
    const night = await open(["--live"], LIVE);
    const fake = engines();
    const r = await cli(["storyboard", night, "--json", file([brief(`${KEPT}/c-03`)])], { env: LIVE, ports: fake.ports });
    expect(r.code, r.err).toBe(0);
    const [c] = await boardsOf(night);
    expect(c).toMatchObject({ status: "rendered" });
    expect(c).not.toHaveProperty("clips");
    expect(fake.clipped).toEqual([]);
  });

  it("the guard lets through only the candidate's own panel still - never a source file, never another board's", () => {
    const c: StoryboardCandidate = { id: "c-04", kind: "storyboard", sourceIds: [], status: "rendered", fromIdea: `${KEPT}/c-01`, title: "t", paragraph: "p", bullets: ["a", "b", "c"], panels: ["a", "b", "c"], images: ["storyboards/c-04/panel-1.png", "sources/s-01/k-001.jpg", "storyboards/c-09/panel-3.png"] };
    const night = { sources: [] };
    expect(panelStillOf(night, c, 1)).toEqual({ ok: true, value: "storyboards/c-04/panel-1.png" });
    expect(panelStillOf(night, c, 2)).toMatchObject({ ok: false, error: { message: "c-04: sources/s-01/k-001.jpg is a source file (reference-only); it never reaches a video model" } });
    expect(panelStillOf(night, c, 3)).toMatchObject({ ok: false, error: { message: "c-04: storyboards/c-09/panel-3.png is not its panel 3 still; a clip animates only its own panel" } });
    expect(panelStillOf({ sources: [{ files: ["storyboards/c-04/panel-1.png"] }] as unknown as Night["sources"] }, c, 1)).toMatchObject({ ok: false });
  });
});

/* ── genres.ts - trialSlots and piecesDue (pure) ───────────────────────────── */

const g = (id: string, o: Partial<Genre> = {}): Genre => ({ id, name: id, bornFrom: "x/c-01", proposal: `p/${id}`, use: "short", look: "chalk", grammar: ["a"], bornAt: "2026-09-01T00:00:00.000Z", by: "op", ...o });
const trial = (id: string, genre: string, o: Partial<StoryboardCandidate> = {}): StoryboardCandidate => ({ id, kind: "storyboard", sourceIds: [], status: "rendered", fromIdea: `${KEPT}/c-01`, title: `trial ${id}`, paragraph: "p", bullets: ["a", "b", "c"], panels: ["a", "b"], genre, ...o });

describe("trialSlots", () => {
  it("gives each live genre TRIALS_PER_GENRE minus its trials on the night (a failed one counts); none to a retired or publishable genre", () => {
    const tonight = nightOf("2026-10-02", [trial("c-01", "gn-a"), trial("c-02", "gn-a", { status: "failed" }), trial("c-03", "gn-b")], { state: "open" });
    const pubNight = nightOf("2026-10-01", [{ id: "c-01", kind: "piece", sourceIds: [], status: "rendered", genre: "gn-p", fromTrial: "x/c-01", title: "p", clips: [] }], { committed: commit(["c-01/video"]) });
    const slots = trialSlots([pubNight, tonight], [g("gn-a"), g("gn-b"), g("gn-c"), g("gn-p"), g("gn-r", { retiredAt: "2026-09-02T00:00:00.000Z" })], "2026-10-02");
    expect([...slots]).toEqual([
      ["gn-a", 0],
      ["gn-b", 1],
      ["gn-c", 2],
    ]);
    // A night with no candidates yet - or not on disk - holds none.
    expect(trialSlots([], [g("gn-a")], "2026-10-09").get("gn-a")).toBe(2);
  });
});

describe("piecesDue", () => {
  // Four kept trials of gn-d over two nights; c-02 has the most kept clips, c-05 ties c-03 on the newer night.
  const older = nightOf("2026-10-01", [trial("c-01", "gn-d"), trial("c-02", "gn-d"), trial("c-03", "gn-d")], { committed: commit(["c-01/words", "c-02/words", "c-02/clip-1", "c-02/clip-2", "c-03/clip-1"]) });
  const newer = nightOf("2026-10-02", [trial("c-05", "gn-d")], { committed: commit(["c-05/clip-1"]) });

  it("names a piece-due genre with its best kept trial: the most kept clip cells, ties to the newest", () => {
    expect(piecesDue([older, newer], [g("gn-d")])).toEqual([{ genre: "gn-d", trial: "2026-10-01/c-02" }]);
    const tie = nightOf("2026-10-02", [trial("c-05", "gn-d")], { committed: commit(["c-05/clip-1", "c-05/clip-2"]) });
    expect(piecesDue([older, tie], [g("gn-d")])).toEqual([{ genre: "gn-d", trial: "2026-10-02/c-05" }]);
  });

  it("a clip cell still open on a remainder is not kept", () => {
    const parts = nightOf("2026-10-02", [trial("c-05", "gn-d")], { committed: commit(["c-05/clip-1", "c-05/clip-2", "c-05/clip-3"], { open: ["c-05/clip-2", "c-05/clip-3"], parts: 1 }) });
    // c-05 counts as kept (a cell kept, none rejected) with ONE kept clip; c-02 has two.
    expect(piecesDue([older, parts], [g("gn-d")])).toEqual([{ genre: "gn-d", trial: "2026-10-01/c-02" }]);
  });

  it("not due while perfecting, while a piece is pending or unjudged, nor once publishable; due again after a rejected piece", () => {
    expect(piecesDue([older], [g("gn-d")])).toEqual([]);
    const piece = (status: "pending" | "rendered"): PieceCandidate => ({ id: "c-09", kind: "piece", sourceIds: [], status, genre: "gn-d", fromTrial: "2026-10-01/c-02", title: "p", clips: [] });
    const open = (status: "pending" | "rendered") => nightOf("2026-10-03", [piece(status)], { state: "open" });
    expect(piecesDue([older, newer, open("pending")], [g("gn-d")])).toEqual([]);
    expect(piecesDue([older, newer, open("rendered")], [g("gn-d")])).toEqual([]);
    const judged = (kept: boolean) => nightOf("2026-10-03", [piece("rendered")], { committed: kept ? commit(["c-09/video"]) : commit([], { rejected: ["c-09/video"] }) });
    expect(piecesDue([older, newer, judged(true)], [g("gn-d")])).toEqual([]);
    expect(piecesDue([older, newer, judged(false)], [g("gn-d")])).toEqual([{ genre: "gn-d", trial: "2026-10-01/c-02" }]);
    // A failed piece is not in flight.
    expect(piecesDue([older, newer, nightOf("2026-10-03", [{ ...piece("pending"), status: "failed", error: "x" }], { state: "open" })], [g("gn-d")])).toHaveLength(1);
  });
});
