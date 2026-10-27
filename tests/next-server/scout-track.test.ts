// A NIGHT'S TRACKS (spark scout-decision-graph WP-S3) - lib/foundry/scout/track.ts `trackAct` over a kept music
// seed: the seed door's refusals (a rejected seed, a paused branch) and the night's track cap before anything is
// written; a dry night end to end on the Suno producer's own job (no turn, stand-in refs, STAND_MP3 collected as
// `tracks/<c-id>/a<N>.mp3`); a live night on the fake Suno driver, its proposal turn asked of the Claude seat only
// and each clip downloaded through a fake fetch, a clip with no audio named in the error; a Suno failure kept
// verbatim; a detached track collected by `track <night> --collect`; the next night's `## Tracks to visualize`; the
// doctor's Suno line; an mp3 served by the night's file door. No browser, no network, no vendor: every store is a
// temp directory set below before any lib/ module loads.

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-scout-track-"));
  process.env["SCOUT_STORE_DIR"] = path.join(dir, "scout");
  process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
  process.env["SOUND_LEDGER_PATH"] = path.join(dir, "ledger.json");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  process.env["AI_REGISTRY_DIR"] = path.join(dir, "no-registry");
  return dir;
});

import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

import { closeProcessKernel, processKernel } from "@gt/kernel/process";

import { runCli } from "../../pipeline/scout.mts";
import { driveSuno, sunoKernelJobs } from "../../lib/producers/suno.ts";
import { FAKE_SUNO, resetFakeSuno } from "../../lib/sound/suno/fakeDriver.ts";
import { FAKE_SUNO_DRIVER } from "../../lib/sound/suno/drivers.ts";
import { readSuno } from "../../lib/sound/suno/store.ts";
import type { ActContext } from "../../lib/foundry/scout/acts.ts";
import { blocking, doctor, doctorLine, type DoctorInput } from "../../lib/foundry/scout/doctor.ts";
import { createSeedBatch } from "../../lib/foundry/scout/seedStore.ts";
import { pauseBranch } from "../../lib/foundry/scout/steer.ts";
import { createNight, mutateNight, readNight, scoutFileStat } from "../../lib/foundry/scout/store.ts";
import { collectTracks, isScoutSunoJob, STAND_MP3, trackAct, tracksSection } from "../../lib/foundry/scout/track.ts";
import type { Night, TrackCandidate } from "../../lib/foundry/scout/types.ts";
import type { TextRequest, TextResult } from "../../lib/text/types.ts";

const LOC = path.join(ROOT, "kernel.sqlite");
const BATCH = "2026-10-20";
const SEED = `${BATCH}/sd-001`;
const SENTENCE = "A darksynth instrumental for a night drive through a rain-lit city";
const SONGS = "2026-10-21";

afterAll(() => {
  closeProcessKernel();
  rmSync(ROOT, { recursive: true, force: true });
});
beforeEach(() => resetFakeSuno());

let said: string[] = [];
function ctxOf(o: { readonly dryOnly?: boolean; readonly detach?: boolean } = {}): ActContext {
  const k = processKernel(LOC);
  if (!k.ok) throw k.error;
  said = [];
  return { store: k.value.store, location: LOC, actor: { kind: "operator", id: "scout-test" }, dryOnly: o.dryOnly ?? true, live: false, detach: o.detach ?? false, say: (l) => said.push(l) };
}

let day = 0;
/** A fresh night each test: its own day, so ids never collide. */
async function night(o: { readonly dry: boolean; readonly trackCap?: number }): Promise<Night> {
  day++;
  return createNight({ dry: o.dry, day: `2026-11-${String(day).padStart(2, "0")}`, ...(o.trackCap === undefined ? {} : { trackCap: o.trackCap }) });
}

/** sd-001 kept, sd-002 rejected, sd-003 kept and then paused on /scout. */
const seeds = (async () => {
  await createSeedBatch(BATCH, (id) => ({
    id,
    createdAt: `${BATCH}T08:00:00.000Z`,
    dry: false,
    seeds: [
      { id: "sd-001", sentence: SENTENCE, genre: "synthwave", subgenre: "darksynth", type: "music video", audience: "adult", format: "video" },
      { id: "sd-002", sentence: "A lullaby for a sleepy fox cub", genre: "lullaby", subgenre: "music box", type: "music video", audience: "kids", format: "short" },
      { id: "sd-003", sentence: "A brass-band march for a toy parade", genre: "march", subgenre: "brass band", type: "music video", audience: "family", format: "short" },
    ],
    committed: { at: `${BATCH}T09:00:00.000Z`, by: "operator", kept: ["sd-001", "sd-003"], rejected: ["sd-002"], reasons: { "sd-002": ["generic"] }, notes: {}, dry: false },
  }));
  await pauseBranch(`${BATCH}/sd-003`, "operator");
  // Spark scout-vision: a kept seed that is not a music seed, and a music seed carrying its song.
  await createSeedBatch(SONGS, (id) => ({
    id,
    createdAt: `${SONGS}T08:00:00.000Z`,
    dry: false,
    seeds: [
      { id: "sd-001", sentence: "A paper boat races the gutter after a storm", genre: "kids animation", subgenre: "adventure", type: "animated short", audience: "kids", format: "short" },
      { id: "sd-002", sentence: "A slow waltz for an empty ballroom at dawn", genre: "neoclassical", subgenre: "chamber waltz", type: "visualizer", audience: "adult", format: "video", music: { instruments: ["nylon guitar", "cello"], tempo: 92, mood: "melancholic", vocals: "instrumental" } },
    ],
    committed: { at: `${SONGS}T09:00:00.000Z`, by: "operator", kept: ["sd-001", "sd-002"], rejected: [], reasons: {}, notes: {}, dry: false },
  }));
})();

const trackOf = async (id: string, cid: string): Promise<TrackCandidate> => {
  const c = (await readNight(id)).candidates.find((x) => x.id === cid);
  if (c?.kind !== "track") throw new Error(`no track ${cid}`);
  return c;
};

describe("the track act's doors", () => {
  it("refuses a rejected seed, a paused branch and a full night before anything is written", async () => {
    await seeds;
    const n = await night({ dry: true, trackCap: 1 });
    await expect(trackAct(ctxOf(), n.id, `${BATCH}/sd-002`)).rejects.toThrow(`seed ${BATCH}/sd-002 was not kept (rejected: generic)`);
    await expect(trackAct(ctxOf(), n.id, `${BATCH}/sd-003`)).rejects.toThrow(`seed ${BATCH}/sd-003 sits under the paused branch ${BATCH}/sd-003; resume it on /scout first`);
    await expect(trackAct(ctxOf(), n.id, "sd-001")).rejects.toThrow("not a seed ref: sd-001");
    expect((await readNight(n.id)).candidates).toEqual([]);
    await trackAct(ctxOf(), n.id, SEED);
    await expect(trackAct(ctxOf(), n.id, SEED)).rejects.toThrow(`night ${n.id} made 1 of its 1 track(s); nothing launched`);
    expect((await readNight(n.id)).candidates).toHaveLength(1);
  });
});

describe("only a music seed makes a track (spark scout-vision)", () => {
  it("refuses a kept seed whose type is not a music type, before anything is written", async () => {
    await seeds;
    const n = await night({ dry: true });
    await expect(trackAct(ctxOf(), n.id, `${SONGS}/sd-001`)).rejects.toThrow(`seed ${SONGS}/sd-001 is a animated short seed; a track grows only from a music seed (music video, lyric video, visualizer)`);
    expect((await readNight(n.id)).candidates).toEqual([]);
  });

  it("a music seed's song rides into the proposal turn: layered style words and the vocals fenced on both sides", async () => {
    await seeds;
    const n = await night({ dry: false });
    const asked: TextRequest[] = [];
    const r = await trackAct(ctxOf({ dryOnly: false }), n.id, `${SONGS}/sd-002`, { driver: FAKE_SUNO_DRIVER, reason: seat(asked), fetchClip: async () => new Uint8Array(1) });
    expect(r.candidate.fromSeed).toBe(`${SONGS}/sd-002`);
    expect(asked).toHaveLength(1);
    // The prompt file is read as checked out (CRLF on a Windows clone): line ends are not what is asserted.
    const prompt = (asked[0]?.prompt ?? "").replace(/\r\n/g, "\n");
    expect(prompt).toContain("A slow waltz for an empty ballroom at dawn\n\nThe song is already prepared.");
    expect(prompt).toContain("- genre and era: neoclassical, chamber waltz\n- mood: melancholic\n- instrumentation: nylon guitar, cello\n- tempo: 92 bpm");
    expect(prompt).toContain('put "instrumental" in `style`, "[Instrumental]" as `lyrics`, and "vocals, singing" in `exclude`');
    expect(prompt).not.toContain("{{");
  });
});

describe("a dry night", () => {
  it("makes the track on the Suno producer's own job: no turn, stand-in refs, STAND_MP3 for every clip", async () => {
    await seeds;
    const n = await night({ dry: true });
    const asked: TextRequest[] = [];
    const r = await trackAct(ctxOf(), n.id, SEED, { reason: async (req) => (asked.push(req), Promise.reject(new Error("a dry track asked a turn"))) });
    expect(r.outcome).toBe("done");
    const c = r.candidate;
    expect(c).toMatchObject({ id: "c-01", kind: "track", status: "rendered", sentence: SENTENCE, fromSeed: SEED, use: "a video: music video - synthwave › darksynth", sunoJobId: `sj-scout-${n.id}-c-01`, jobId: `job:run:suno.sj-scout-${n.id}-c-01` });
    expect(c.clips.map((x) => [x.part, x.path, x.model, x.durationS])).toEqual([
      ["a1", "tracks/c-01/a1.mp3", "v6", 1],
      ["a2", "tracks/c-01/a2.mp3", "v6", 1],
      ["a3", "tracks/c-01/a3.mp3", "v6-wild", 1],
      ["a4", "tracks/c-01/a4.mp3", "v6-wild", 1],
    ]);
    expect(readFileSync(path.join(ROOT, "scout", n.id, "tracks", "c-01", "a1.mp3")).equals(STAND_MP3)).toBe(true);
    // An MPEG audio frame from the first byte (sync 0xFFE, no tag): what an <audio> plays.
    expect([STAND_MP3.length, STAND_MP3[0], (STAND_MP3[1] ?? 0) & 0xe0]).toEqual([1368, 0xff, 0xe0]);
    // The suno producer's job is THE job, and the night books it; a dry one asks neither the seat nor the browser.
    expect((await readNight(n.id)).jobs).toEqual([c.jobId]);
    expect(sunoKernelJobs().get(c.jobId ?? "")?.mode.kind).toBe("dry");
    expect(asked).toEqual([]);
    expect(FAKE_SUNO.calls).toEqual([]);
    const f = await readSuno();
    expect(f.jobs.find((j) => j.id === c.sunoJobId)?.state).toBe("done");
    expect(c.clips.map((x) => x.clipId)).toEqual(f.jobs.find((j) => j.id === c.sunoJobId)?.clipIds);
    expect(isScoutSunoJob(c.sunoJobId)).toBe(true);
    expect(said[0]).toMatch(/^receipt \(dry\): track c-01 · Suno v6 \+ v6-wild on box\.chrome · queue #\d+ · Suno credits, unpriced · its prompt on the Claude seat$/);
  });

  it("a detached track waits pending; `track <night> --collect` brings its clips in once the job is done", async () => {
    await seeds;
    const n = await night({ dry: true });
    const r = await trackAct(ctxOf({ detach: true }), n.id, SEED);
    expect([r.outcome, r.candidate.status, r.candidate.clips]).toEqual(["detached", "pending", []]);
    // Not done yet: collect leaves it pending.
    expect((await collectTracks(ctxOf(), n.id)).map((c) => c.status)).toEqual(["pending"]);
    await driveSuno([r.candidate.jobId ?? ""], { driver: FAKE_SUNO_DRIVER, dryOnly: true });
    const out: string[] = [];
    const code = await runCli(["track", n.id, "--collect"], { env: { ...process.env, GRAVITONE_DRY_ONLY: "1" }, out: (s) => out.push(s), err: (s) => out.push(s) });
    expect(code).toBe(0);
    expect(out).toEqual(["c-01 track rendered"]);
    expect((await trackOf(n.id, "c-01")).clips).toHaveLength(4);
  });
});

/** The seat's answer to the sentence, as the router would return it. */
function seat(asked: TextRequest[]): (req: TextRequest) => Promise<TextResult> {
  return async (req) => {
    asked.push(req);
    const json = { proposals: [{ title: "Rain Drive", style: "darksynth, rain, analog bass, 92 bpm", lyrics: "[Instrumental]", note: "night drive" }] };
    return { text: JSON.stringify(json), json, provenance: { provider: "claude-cli", model: "seat", transport: "local-subprocess", rung: "preferred", turn: req.turn, schemaEnforcement: "native", durationMs: 1, costBasis: "unpriced", promptChars: req.prompt.length } };
  };
}

describe("a live night, on the fake Suno driver", () => {
  it("asks the proposal of the Claude seat only, downloads each clip, and names a clip with no audio", async () => {
    await seeds;
    const n = await night({ dry: false });
    const asked: TextRequest[] = [];
    const fetched: string[] = [];
    const r = await trackAct(ctxOf({ dryOnly: false }), n.id, SEED, { driver: FAKE_SUNO_DRIVER, reason: seat(asked), fetchClip: async (url) => (fetched.push(url), new Uint8Array(Buffer.from(`ID3 ${url}`))) });
    expect(r.outcome).toBe("done");
    // Pinned to the seat: Gemini is the night's only capped money, and this turn runs before any job could meter it.
    expect(asked.map((q) => [q.turn, q.avoid])).toEqual([["suno-propose", "google"]]);
    expect(FAKE_SUNO.calls).toEqual([
      { style: "darksynth, rain, analog bass, 92 bpm", model: "v6" },
      { style: "darksynth, rain, analog bass, 92 bpm", model: "v6-wild" },
    ]);
    const c = r.candidate;
    // The fake exposes audio on each create's first clip only: a2 and a4 are named, the rest play.
    expect(c.status).toBe("rendered");
    expect(c.clips.map((x) => [x.part, x.title, x.durationS])).toEqual([
      ["a1", "Rain Drive (v6)", 120],
      ["a3", "Rain Drive (v6-wild)", 120],
    ]);
    expect(c.error).toBe('a2: Suno clip "Rain Drive (v6 b)" has no audio URL; a4: Suno clip "Rain Drive (v6-wild b)" has no audio URL');
    expect(fetched).toEqual(["https://cdn1.suno.ai/fake-0001.mp3", "https://cdn1.suno.ai/fake-0003.mp3"]);
    expect(readFileSync(path.join(ROOT, "scout", n.id, "tracks", "c-01", "a3.mp3"), "utf8")).toBe("ID3 https://cdn1.suno.ai/fake-0003.mp3");
    expect(sunoKernelJobs().get(c.jobId ?? "")?.mode.kind).toBe("live");
  });

  it("a Suno failure keeps the track failed with the driver's sentence verbatim", async () => {
    await seeds;
    const n = await night({ dry: false });
    FAKE_SUNO.failWith = (_f, model) => (model === "v6-wild" ? "Suno says: out of credits for v6-wild" : null);
    const r = await trackAct(ctxOf({ dryOnly: false }), n.id, SEED, { driver: FAKE_SUNO_DRIVER, reason: seat([]), fetchClip: async () => new Uint8Array(1) });
    expect(r.outcome).toBe("failed");
    expect([r.candidate.status, r.candidate.error, r.candidate.clips]).toEqual(["failed", "Suno says: out of credits for v6-wild", []]);
  });

  it("a seat that is down fails the track with its sentence; no Gemini is asked in its place", async () => {
    await seeds;
    const n = await night({ dry: false });
    const down = async (req: TextRequest): Promise<TextResult> => Promise.reject(new Error(`no-alternative: ${req.turn} avoids google and claude-cli is unavailable`));
    await expect(trackAct(ctxOf({ dryOnly: false }), n.id, SEED, { driver: FAKE_SUNO_DRIVER, reason: down })).rejects.toThrow("no-alternative: suno-propose avoids google and claude-cli is unavailable");
    expect(await trackOf(n.id, "c-01")).toMatchObject({ status: "failed", error: "no-alternative: suno-propose avoids google and claude-cli is unavailable" });
    expect(FAKE_SUNO.calls).toEqual([]);
  });
});

describe("the next night's brief and the night's file door", () => {
  it("lists every kept clip of a live night no visualizer plays yet, and serves its mp3", async () => {
    await seeds;
    const n = await night({ dry: false });
    await trackAct(ctxOf({ dryOnly: false }), n.id, SEED, { driver: FAKE_SUNO_DRIVER, reason: seat([]), fetchClip: async () => new Uint8Array(Buffer.from("ID3")) });
    const at = "2026-11-30T09:00:00.000Z";
    const committed = await mutateNight(n.id, (x) => ({ ...x, state: "committed", committed: { at, by: "operator", kept: ["c-01/a1", "c-01/a3"], rejected: [], reasons: {}, notes: {}, dry: false } }));
    expect(tracksSection([committed])).toEqual(["## Tracks to visualize", "", `- ${n.id}/c-01/a1 · v6 · 2:00 - ${SENTENCE}`, `- ${n.id}/c-01/a3 · v6-wild · 2:00 - ${SENTENCE}`, ""]);
    // A visualizer that plays a1 (and did not fail) takes it off; a dry night's keeps are never listed.
    const played: Night = { ...committed, id: "2026-12-01", candidates: [{ id: "c-01", kind: "visualizer", sourceIds: [], status: "pending", track: `${n.id}/c-01/a1` }] };
    expect(tracksSection([played, committed])).toEqual(["## Tracks to visualize", "", `- ${n.id}/c-01/a3 · v6-wild · 2:00 - ${SENTENCE}`, ""]);
    expect(tracksSection([{ ...committed, dry: true, committed: { ...committed.committed!, dry: true } }])).toEqual([]);
    const s = await scoutFileStat(n.id, "tracks/c-01/a1.mp3");
    expect([existsSync(s.abs), s.size]).toEqual([true, 3]);
  });
});

describe("doctor, the Suno line", () => {
  const spawn = async (bin: string) => ({ ok: true as const, stdout: Buffer.from(`${bin} version 9.9\n`), stderr: "" });
  const base: DoctorInput = {
    env: { GOOGLE_AI_API_KEY: "set", LEONARDO_API_KEY: "set", SCOUT_CLIP_ENGINE: "hailuo", AI_REGISTRY_DIR: path.join(ROOT, "no-registry") },
    storePath: LOC,
    scoutRoot: path.join(ROOT, "scout"),
    dry: false,
    spawn,
    keyFetch: async () => ({ ok: true, status: 200, text: async () => "{}" }),
    worker: async () => Date.parse("2026-10-23T22:00:00.000Z") - 60_000,
    now: () => Date.parse("2026-10-23T22:00:00.000Z"),
    studio: async () => ({ ok: true }),
    chromium: async () => process.execPath,
  };
  const suno = async (o: Partial<DoctorInput>) => {
    const checks = await doctor({ ...base, ...o });
    return { line: doctorLine(checks.find((c) => c.name === "suno") ?? { name: "suno", ok: false, found: "absent", needed: true }), blocked: blocking(checks).map((c) => c.name) };
  };

  it("blocks a live night that makes tracks when Suno is not signed in; a note otherwise, and no browser asked", async () => {
    const out = await suno({ tracks: 4, suno: async () => ({ ok: false, reason: "not signed in to suno" }) });
    expect(out.line).toBe("FAIL suno                not signed in to suno -> the night's tracks are made there: start the Suno Chrome profile (~/.suno-chrome, remote debugging on 9334) and sign in to suno.com once");
    expect(out.blocked).toEqual(["suno"]);
    expect(await suno({ tracks: 4, suno: async () => ({ ok: true }) })).toEqual({ line: "ok   suno                suno browser on 9334, signed in", blocked: [] });
    let probed = 0;
    const never = async () => (probed++, { ok: false as const, reason: "asked" });
    const dry = await doctor({ ...base, dry: true, tracks: 4 });
    expect(doctorLine(dry.find((c) => c.name === "suno")!)).toBe("note suno                not asked: a dry night's tracks are stand-ins");
    expect((await suno({ tracks: 0, suno: never })).blocked).toEqual([]);
    expect(doctorLine((await doctor(base)).find((c) => c.name === "suno")!)).toBe("note suno                not asked: no track cap named (doctor --tracks N)");
    expect(probed).toBe(1);
  });
});
