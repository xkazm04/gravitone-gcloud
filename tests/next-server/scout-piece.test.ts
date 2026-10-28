// A GENRE'S PIECE (spark scout-vision S2 WP3) - `pipeline/scout.mts piece` end to end over temp nights and a temp
// kernel: the best kept trial chosen, ONLY its rejected (or failed) clips re-made through a fake LTX engine over the
// trial's own panel stills, the kept ones reused, and every clip cut in panel order through a fake cut; a failed re-make
// is that clip's alone; a cut that fails fails the piece; --genre refused with the genre's state; a dry night's piece is
// words only and holds nothing up; --detach and collect. Then the cut itself: ffmpeg's argument list for three clips,
// literally, and one real cut of three tiny generated clips when FFMPEG resolves. No ComfyUI, no vendor: fetch throws.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// Every case drives the CLI and a kernel job end to end; a loaded box (the whole suite at once) needs more than 5 s.
vi.setConfig({ testTimeout: 60_000 });

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-scout-piece-"));
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

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { Genre } from "@gt/domain/genre";
import { openKernel } from "@gt/kernel/kernel";
import { closeProcessKernel, processKernel } from "@gt/kernel/process";
import type { Store } from "@gt/kernel/store";
import { bornGenre } from "@gt/kernel/ventures/store";

import { runCli, type CliPorts } from "../../pipeline/scout.mts";
import { collectPieces, type PieceEngines } from "../../lib/foundry/scout/piece.ts";
import { binsFrom, realSpawn } from "../../lib/foundry/scout/ingest.ts";
import { mutateNight, readNight, resolveInNight, withCandidate } from "../../lib/foundry/scout/store.ts";
import type { Candidate, Night, NightCommit, PieceCandidate, SceneClip, StoryboardCandidate } from "../../lib/foundry/scout/types.ts";
import { producers } from "../../lib/producers/registry.ts";
import { drivePiece, pieceClipSeed, pieceClipsOf } from "../../lib/producers/scoutPiece.ts";
import { cutArgs, ffmpegCut } from "../../lib/producers/scoutPieceActs.ts";

const DRY = { ...process.env, GRAVITONE_DRY_ONLY: "1" };
const LIVE = (() => {
  const { GRAVITONE_DRY_ONLY: _pin, ...rest } = process.env;
  return rest;
})();
const LOC = path.join(ROOT, "kernel.sqlite");
const TRIALS = "2026-09-20";
const OPERATOR = { kind: "operator" as const, id: "op-test" };

const PANEL = (k: number) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, k]);
const TRIAL_CLIP = (k: number) => new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x70 + k]);
const REMADE = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0xee]);
const PROMPTS = ["a kettle on a kitchen table", "bubbles climb the chalk diagram", "steam draws one note"];

const commit = (kept: string[], rejected: string[] = []): NightCommit => ({ at: "2026-09-21T08:00:00.000Z", by: "operator", kept, rejected, reasons: {}, notes: {}, dry: false });

function writeFile(night: string, rel: string, bytes: Uint8Array): void {
  const abs = path.join(ROOT, "scout", night, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, bytes);
}

/** A trial of `genre` with its three panels drawn and its clips (null where one failed), every file on disk. */
function trial(id: string, genre: string, clipped: readonly boolean[]): StoryboardCandidate {
  const images = [1, 2, 3].map((k) => `storyboards/${id}/panel-${k}.png`);
  images.forEach((f, i) => writeFile(TRIALS, f, PANEL(i + 1)));
  const clips = clipped.map((on, i): SceneClip | null => (on ? { path: `storyboards/${id}/clip-${i + 1}.mp4`, durationS: 5, from: images[i] ?? "", engine: "ltx-local", usd: 0 } : null));
  clips.forEach((c, i) => c !== null && writeFile(TRIALS, c.path, TRIAL_CLIP(i + 1)));
  return { id, kind: "storyboard", sourceIds: [], status: "rendered", fromIdea: `2026-09-01/${id}`, title: `Trial ${id}`, paragraph: "p", bullets: ["a", "b", "c"], panels: PROMPTS, images, clips, genre, use: "short: a chalk explainer", fromSeed: "2026-09-01/sd-002" };
}

let store: Store;
let due: Genre;
let early: Genre;
let best: StoryboardCandidate;

beforeAll(() => {
  const k = processKernel(LOC);
  if (!k.ok) throw k.error;
  store = k.value.store;
  const born = (name: string, proposal: string): Genre => {
    const g = store.tx((t) => bornGenre(t, { name, bornFrom: `${TRIALS}/c-01`, proposal, use: "short: a 30 s Short", look: "chalk on slate", grammar: ["the question", "the answer"] }, OPERATOR));
    if (!g.ok) throw g.error;
    return g.value;
  };
  due = born("Kitchen table science", "2026-09-01/c-10");
  early = born("Rooftop noir", "2026-09-01/c-11");
  // Four kept trials of the due genre. c-02 is the best: two kept clips; its clip 2 was REJECTED and clip 3 failed.
  best = trial("c-02", due.id, [true, true, false]);
  const candidates: Candidate[] = [trial("c-01", due.id, [true, true, true]), best, trial("c-03", due.id, [true, true, true]), trial("c-04", due.id, [true, true, true])];
  const n: Night = { id: TRIALS, startedAt: `${TRIALS}T00:00:00.000Z`, ceilingUsd: 15, target: 20, clipCap: 2, dry: false, state: "committed", stop: "target", sources: [], candidates, jobs: [], committed: commit(["c-01/words", "c-01/clip-1", "c-02/words", "c-02/clip-1", "c-02/clip-3", "c-03/words", "c-04/words"], ["c-02/clip-2"]) };
  writeFileSync(path.join(ROOT, "scout", TRIALS, "night.json"), JSON.stringify(n));
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

async function open(args: string[], env: Record<string, string | undefined>): Promise<string> {
  const r = await cli(["open", "--json", ...args], { env });
  expect(r.code, r.err).toBe(0);
  return String(r.doc["night"]);
}

const piecesOf = async (night: string): Promise<PieceCandidate[]> => (await readNight(night)).candidates.filter((c): c is PieceCandidate => c.kind === "piece");

/** Retire a night's pieces from flight (failed), so the next case's genre is due again. */
async function clear(night: string): Promise<void> {
  await mutateNight(night, (n) => n.candidates.reduce((m, c) => (c.kind === "piece" ? withCandidate(m, { ...c, status: "failed", error: "cleared by the test" }) : m), n));
}

/** Fake engines: a clip of every still but the prompts it refuses; a cut that writes its output and reports 15 s. */
function engines(o: { refuseClip?: (p: string) => boolean; refuseCut?: boolean } = {}) {
  const clipped: { still: Uint8Array; prompt: string; seed: number }[] = [];
  const cuts: { clips: readonly string[]; out: string }[] = [];
  const piece: PieceEngines = {
    clip: async (still, prompt, seed) => {
      clipped.push({ still, prompt, seed });
      if (o.refuseClip?.(prompt) === true) throw new Error("ComfyUI LTXVSampler (node 40) failed: out of memory");
      return { bytes: REMADE, durationS: 5 };
    },
    cut: async (clips, out) => {
      cuts.push({ clips, out });
      if (o.refuseCut === true) throw new Error("ffmpeg: Invalid data found when processing input");
      writeFileSync(out, "cut");
      return { durationS: 15 };
    },
  };
  return { ports: { piece } satisfies CliPorts, piece, clipped, cuts };
}

describe("the plan - only what the operator rejected is made again", () => {
  it("reuses a kept or undecided clip, re-makes a rejected or failed one, with the piece's own seeds", () => {
    const t = { nightId: "2026-10-01", candidateId: "c-07" };
    const n = { committed: commit([], ["c-02/clip-2"]) };
    expect(pieceClipsOf(n, best, t)).toEqual([
      { k: 1, still: "storyboards/c-02/panel-1.png", prompt: PROMPTS[0], seed: pieceClipSeed(t, 1), remake: false, reuse: "storyboards/c-02/clip-1.mp4" },
      { k: 2, still: "storyboards/c-02/panel-2.png", prompt: PROMPTS[1], seed: pieceClipSeed(t, 2), remake: true },
      { k: 3, still: "storyboards/c-02/panel-3.png", prompt: PROMPTS[2], seed: pieceClipSeed(t, 3), remake: true },
    ]);
    // A rejection still open on a remainder is not a rejection; another board's rejection is not this one's.
    expect(pieceClipsOf({ committed: { ...commit([], ["c-02/clip-1", "c-09/clip-3"]), open: ["c-02/clip-1"] } }, trial("c-02", due.id, [true, true, true]), t).map((c) => c.remake)).toEqual([false, false, false]);
  });
});

describe("the piece act", () => {
  it("refuses --genre with the genre's state: unknown, perfecting", async () => {
    const night = await open([], DRY);
    const unknown = await cli(["piece", night, "--genre", "gn-nothing"]);
    expect(unknown.code).toBe(1);
    expect(unknown.err).toContain("no genre gn-nothing");
    const perfecting = await cli(["piece", night, "--genre", early.id]);
    expect(perfecting.err).toContain(`genre ${early.id} is perfecting (kept trials 0/4); no piece is due`);
    expect(await piecesOf(night)).toEqual([]);
  });

  it("a dry night writes the piece as words only, launches nothing, and holds nothing up", async () => {
    const night = await open([], DRY);
    const r = await cli(["piece", night, "--json"]);
    expect(r.code, r.err).toBe(0);
    expect(r.doc).toMatchObject({ ok: true, jobIds: [], dry: true });
    expect(await piecesOf(night)).toEqual([{ id: "c-01", kind: "piece", sourceIds: [], status: "rendered", genre: due.id, fromTrial: `${TRIALS}/c-02`, title: "Trial c-02", clips: [], fromSeed: "2026-09-01/sd-002", use: "short: a chalk explainer" }]);
    // A second run on the same night writes no second piece of the genre.
    const again = await cli(["piece", night, "--json"]);
    expect(again.doc).toMatchObject({ candidates: [] });
  });

  it("live: re-makes ONLY the rejected and the failed clip over the trial's own stills, reuses the kept one, cuts all three in order", async () => {
    const night = await open(["--live"], LIVE);
    const fake = engines();
    const r = await cli(["piece", night, "--json"], { env: LIVE, ports: fake.ports });
    expect(r.code, r.err).toBe(0);
    const jobId = `job:scout-piece:${night}:c-01`;
    expect(r.doc).toMatchObject({ ok: true, jobIds: [jobId], outcome: "done" });
    expect(r.err).toContain(`receipt (live): piece c-01 of ${due.id} · 2 clip(s) re-made + one cut on gpu.local · $0 (free: local)`);
    const t = { nightId: night, candidateId: "c-01" };
    expect(fake.clipped.map((c) => [c.prompt, c.seed, [...c.still]])).toEqual([
      [PROMPTS[1], pieceClipSeed(t, 2), [...PANEL(2)]],
      [PROMPTS[2], pieceClipSeed(t, 3), [...PANEL(3)]],
    ]);
    expect(fake.cuts).toEqual([{ clips: [1, 2, 3].map((k) => resolveInNight(night, `pieces/c-01/clip-${k}.mp4`)), out: resolveInNight(night, "pieces/c-01/piece.mp4") }]);
    const [p] = await piecesOf(night);
    expect(p).toMatchObject({ status: "rendered", jobId, video: "pieces/c-01/piece.mp4", durationS: 15 });
    expect(p).not.toHaveProperty("error");
    expect(p?.clips).toEqual([
      { path: "pieces/c-01/clip-1.mp4", durationS: 5, from: `${TRIALS}/storyboards/c-02/panel-1.png`, engine: "ltx-local", usd: 0 },
      { path: "pieces/c-01/clip-2.mp4", durationS: 5, from: `${TRIALS}/storyboards/c-02/panel-2.png`, engine: "ltx-local", usd: 0 },
      { path: "pieces/c-01/clip-3.mp4", durationS: 5, from: `${TRIALS}/storyboards/c-02/panel-3.png`, engine: "ltx-local", usd: 0 },
    ]);
    // The kept clip is the trial's own file, copied; the re-made ones are the new takes.
    expect(new Uint8Array(readFileSync(resolveInNight(night, "pieces/c-01/clip-1.mp4")))).toEqual(TRIAL_CLIP(1));
    for (const k of [2, 3]) expect(new Uint8Array(readFileSync(resolveInNight(night, `pieces/c-01/clip-${k}.mp4`)))).toEqual(REMADE);
    // The trial is untouched.
    expect(new Uint8Array(readFileSync(resolveInNight(TRIALS, "storyboards/c-02/clip-2.mp4")))).toEqual(TRIAL_CLIP(2));

    // The rendered piece, unjudged, is in flight: no second piece of the genre anywhere.
    const other = await open([], DRY);
    const blocked = await cli(["piece", other, "--genre", due.id]);
    expect(blocked.err).toContain(`genre ${due.id} already has piece ${night}/c-01 (rendered) waiting on its verdict`);
    await clear(night);
  });

  it("a re-make that fails is that clip's: the cut goes on with the other two", async () => {
    const night = await open(["--live"], LIVE);
    const fake = engines({ refuseClip: (p) => p === PROMPTS[1] });
    const r = await cli(["piece", night, "--json"], { env: LIVE, ports: fake.ports });
    expect(r.code, r.err).toBe(0);
    const [p] = await piecesOf(night);
    expect(p).toMatchObject({ status: "rendered", video: "pieces/c-01/piece.mp4", error: "clip 2: ComfyUI LTXVSampler (node 40) failed: out of memory" });
    expect(p?.clips.map((c) => c?.path ?? null)).toEqual(["pieces/c-01/clip-1.mp4", null, "pieces/c-01/clip-3.mp4"]);
    expect(fake.cuts[0]?.clips).toEqual([1, 3].map((k) => resolveInNight(night, `pieces/c-01/clip-${k}.mp4`)));
    expect(existsSync(resolveInNight(night, "pieces/c-01/clip-2.mp4"))).toBe(false);
    await clear(night);
  });

  it("a cut ffmpeg refuses fails the piece with its sentence", async () => {
    const night = await open(["--live"], LIVE);
    const r = await cli(["piece", night, "--json"], { env: LIVE, ports: engines({ refuseCut: true }).ports });
    expect(r.code).toBe(1);
    const [p] = await piecesOf(night);
    expect(p).toMatchObject({ status: "failed" });
    expect(p?.error).toContain("the cut of 3 clip(s) failed: ffmpeg: Invalid data found when processing input");
    expect(p).not.toHaveProperty("video");
  });

  it("--detach leaves the job queued; the worker's drive cuts it, and collect settles what is still pending", async () => {
    const night = await open(["--live"], LIVE);
    const r = await cli(["piece", night, "--detach", "--json"], { env: LIVE });
    expect(r.code, r.err).toBe(0);
    expect(r.doc).toMatchObject({ outcome: "detached" });
    const jobId = `job:scout-piece:${night}:c-01`;
    expect((await piecesOf(night))[0]).toMatchObject({ status: "pending", jobId });
    // The CLI closed the process kernel; the worker holds its own.
    const k = openKernel(LOC);
    if (!k.ok) throw k.error;
    try {
      const d = await drivePiece(k.value.store, LOC, jobId, { dryOnly: false, engines: engines().piece });
      expect(d.ok && d.value.outcome).toBe("done");
      // The night as if the drive's ending had not been written: collect tells it from the kernel's record.
      await mutateNight(night, (n) => {
        const c = n.candidates.find((x): x is PieceCandidate => x.id === "c-01" && x.kind === "piece");
        return c === undefined ? n : withCandidate(n, { ...c, status: "pending" });
      });
      const got = await collectPieces(night, { store: k.value.store });
      expect(got.map((c) => [c.id, c.status, c.video])).toEqual([["c-01", "rendered", "pieces/c-01/piece.mp4"]]);
      expect(await collectPieces(night, { store: k.value.store })).toEqual([]);
    } finally {
      k.value.close();
    }
    await clear(night);
  });

  it("is bound on gpu.local with the comfy engine", () => {
    const bound = producers();
    expect(bound.ok && bound.value.get("scout-piece@gpu.local" as never)?.engine).toBe("comfy");
  });
});

/* ── The cut ───────────────────────────────────────────────────────────────── */

describe("the cut", () => {
  it("normalises size, fps and audio so concat cannot meet two shapes: three clips, one silent, literally", () => {
    const args = cutArgs(
      [
        { path: "a.mp4", audio: true, durationS: 5 },
        { path: "b.mp4", audio: false, durationS: 4.5 },
        { path: "c.mp4", audio: true, durationS: 5 },
      ],
      "out.mp4",
      { width: 960, height: 576 },
    );
    const leg = (i: number, a: number, d: string) =>
      `[${i}:v]scale=960:576:force_original_aspect_ratio=decrease,pad=960:576:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24,format=yuv420p[v${i}];[${a}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=0:${d},asetpts=N/SR/TB[a${i}]`;
    expect(args).toEqual([
      "-hide_banner", "-loglevel", "error", "-y",
      "-i", "a.mp4", "-i", "b.mp4", "-i", "c.mp4",
      "-f", "lavfi", "-t", "4.500", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
      "-filter_complex", `${leg(0, 0, "5.000")};${leg(1, 3, "4.500")};${leg(2, 2, "5.000")};[v0][a0][v1][a1][v2][a2]concat=n=3:v=1:a=1[v][a]`,
      "-map", "[v]", "-map", "[a]",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart",
      "out.mp4",
    ]);
  });

  const bins = binsFrom(process.env);
  const hasFfmpeg = spawnSync(bins.ffmpeg, ["-version"], { windowsHide: true }).status === 0 && spawnSync(bins.ffprobe, ["-version"], { windowsHide: true }).status === 0;

  it.skipIf(!hasFfmpeg)("cuts three tiny generated clips for real - two sizes, one silent - into one video with audio (skipped when FFMPEG does not resolve)", async () => {
    const dir = path.join(ROOT, "real-cut");
    mkdirSync(dir, { recursive: true });
    const make = (name: string, size: string, audio: boolean): string => {
      const out = path.join(dir, name);
      const a = audio ? ["-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-c:a", "aac"] : [];
      const r = spawnSync(bins.ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", `testsrc=size=${size}:rate=24:duration=1`, ...a, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-shortest", out], { windowsHide: true });
      expect(r.status, r.stderr?.toString()).toBe(0);
      return out;
    };
    const clips = [make("a.mp4", "128x72", true), make("b.mp4", "96x96", false), make("c.mp4", "128x72", true)];
    const out = path.join(dir, "piece.mp4");
    const got = await ffmpegCut({ spawn: realSpawn, bins })(clips, out);
    expect(got.durationS).toBeGreaterThan(2.5);
    expect(got.durationS).toBeLessThan(3.6);
    const probe = spawnSync(bins.ffprobe, ["-v", "error", "-show_entries", "stream=codec_type,width,height", "-of", "json", out], { windowsHide: true });
    const streams = (JSON.parse(probe.stdout.toString()) as { streams: { codec_type: string; width?: number; height?: number }[] }).streams;
    expect(streams.map((s) => s.codec_type).sort()).toEqual(["audio", "video"]);
    expect(streams.find((s) => s.codec_type === "video")).toMatchObject({ width: 128, height: 72 });
  }, 60_000);

  it.skipIf(hasFfmpeg)("no ffmpeg on this box: the real cut is skipped", () => {
    expect(hasFfmpeg).toBe(false);
  });
});
