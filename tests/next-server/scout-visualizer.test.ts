// A NIGHT'S VISUALIZERS (spark scout-decision-graph WP-S3) - lib/foundry/scout/visualizer.ts `visualizerAct` over
// a kept track clip: refused for a clip that is not a kept cell of a live committed night, a second visualizer of
// one clip and a full night, before anything is written; a kept idea artboard under the same seed copied in as the
// still (no studio credits: the mv record's `stillFrom`), else the studio's still collected beside the video; the
// music-video producer's own job driven on fake engines (tests/next-server/producer-mv-fakes.ts) and its video
// collected into the night; a detached one collected by `visualizer <night> --collect`. No browser, no ffmpeg, no
// vendor: every store is a temp directory set below before any lib/ module loads.

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-scout-visualizer-"));
  process.env["SCOUT_STORE_DIR"] = path.join(dir, "scout");
  process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
  process.env["SOUND_LEDGER_PATH"] = path.join(dir, "ledger.json");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  delete process.env["LEONARDO_STUDIO_CDP"];
  return dir;
});

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { closeProcessKernel, processKernel } from "@gt/kernel/process";

import { runCli } from "../../pipeline/scout.mts";
import { driveMv } from "../../lib/producers/mv.ts";
import { readMv } from "../../lib/sound/mv/store.ts";
import { withSuno } from "../../lib/sound/suno/store.ts";
import type { ActContext } from "../../lib/foundry/scout/acts.ts";
import { createSeedBatch } from "../../lib/foundry/scout/seedStore.ts";
import { createNight, readNight, saveNight } from "../../lib/foundry/scout/store.ts";
import type { IdeaCandidate, Night, TrackCandidate, VisualizerCandidate } from "../../lib/foundry/scout/types.ts";
import { parseTrackRef, stillOf, visualizerAct } from "../../lib/foundry/scout/visualizer.ts";
import { mvFakes } from "./producer-mv-fakes.ts";

const LOC = path.join(ROOT, "kernel.sqlite");
const BATCH = "2026-10-20";
const TRACKS = "2026-10-21";
const PNG = Buffer.from("png: the kept idea's artboard, ours");

afterAll(() => {
  closeProcessKernel();
  rmSync(ROOT, { recursive: true, force: true });
});

function ctxOf(o: { readonly detach?: boolean } = {}): ActContext {
  const k = processKernel(LOC);
  if (!k.ok) throw k.error;
  return { store: k.value.store, location: LOC, actor: { kind: "operator", id: "scout-test" }, dryOnly: false, live: false, detach: o.detach ?? false, say: () => undefined };
}

const clip = (part: string, clipId: string, title: string): TrackCandidate["clips"][number] => ({ part, path: `tracks/c-01/${part}.mp3`, model: "v6", title, durationS: 182, clipId });

/**
 * The world a visualizer is asked in: a live night that made two tracks - c-01 from sd-001 (a1, a3 and a4 kept, a2
 * rejected for its craft) and c-02 from sd-002 (a1 kept) - and drew an idea under sd-001 it kept; suno.json holding
 * every clip with its audio.
 */
const world = (async () => {
  await createSeedBatch(BATCH, (id) => ({
    id,
    createdAt: `${BATCH}T08:00:00.000Z`,
    dry: false,
    seeds: [
      { id: "sd-001", sentence: "A darksynth instrumental for a night drive", genre: "synthwave", subgenre: "darksynth", type: "music video", audience: "adult", format: "video" },
      { id: "sd-002", sentence: "A lo-fi loop for a rainy study session", genre: "lo-fi", subgenre: "chillhop", type: "music video", audience: "family", format: "video" },
    ],
    committed: { at: `${BATCH}T09:00:00.000Z`, by: "operator", kept: ["sd-001", "sd-002"], rejected: [], reasons: {}, notes: {}, dry: false },
  }));
  const idea: IdeaCandidate = { id: "c-03", kind: "idea", sourceIds: [], status: "rendered", title: "Rain-lit overpass", target: "scene", prompt: "a rain-lit overpass at night", anchor: { kind: "free", ref: "" }, image: "ideas/c-03.png", fromSeed: `${BATCH}/sd-001` };
  const tracks: Night = {
    id: TRACKS,
    startedAt: `${TRACKS}T00:00:00.000Z`,
    ceilingUsd: 15,
    target: 20,
    clipCap: 2,
    dry: false,
    state: "committed",
    sources: [],
    jobs: [],
    candidates: [
      { id: "c-01", kind: "track", sourceIds: [], status: "rendered", sentence: "A darksynth instrumental for a night drive", fromSeed: `${BATCH}/sd-001`, clips: [clip("a1", "sc-a1", "Rain Drive"), clip("a2", "sc-a2", "Rain Drive b"), clip("a3", "sc-a3", "Rain Drive (wild)"), clip("a4", "sc-a4", "Rain Drive (wild) b")] },
      { id: "c-02", kind: "track", sourceIds: [], status: "rendered", sentence: "A lo-fi loop for a rainy study session", fromSeed: `${BATCH}/sd-002`, clips: [clip("a1", "sc-b1", "Study Loop")] },
      idea,
    ],
    committed: { at: `${TRACKS}T09:00:00.000Z`, by: "operator", kept: ["c-01/a1", "c-01/a3", "c-01/a4", "c-02/a1", "c-03/board"], rejected: ["c-01/a2"], reasons: { "c-01/a2": ["craft"] }, notes: {}, dry: false },
  };
  mkdirSync(path.join(ROOT, "scout", TRACKS, "ideas"), { recursive: true });
  await saveNight(tracks);
  writeFileSync(path.join(ROOT, "scout", TRACKS, "ideas", "c-03.png"), PNG);
  await withSuno((f) => {
    for (const [id, title] of [["sc-a1", "Rain Drive"], ["sc-a2", "Rain Drive b"], ["sc-a3", "Rain Drive (wild)"], ["sc-a4", "Rain Drive (wild) b"], ["sc-b1", "Study Loop"]] as const)
      f.clips.push({ id, songId: `song-${id}`, url: `https://suno.com/song/${id}`, audioUrl: `https://cdn1.suno.ai/${id}.mp3`, imageUrl: null, title, durationS: 182, origin: "queue", jobId: "sj-scout-2026-10-21-c-01", model: "v6", createdAt: 1, verdict: null });
  });
})();

let day = 0;
async function night(o: { readonly visualizerCap?: number } = {}): Promise<Night> {
  day++;
  return createNight({ dry: false, day: `2026-11-${String(day).padStart(2, "0")}`, ...(o.visualizerCap === undefined ? {} : { visualizerCap: o.visualizerCap }) });
}

const visualizerOf = async (id: string, cid: string): Promise<VisualizerCandidate> => {
  const c = (await readNight(id)).candidates.find((x) => x.id === cid);
  if (c?.kind !== "visualizer") throw new Error(`no visualizer ${cid}`);
  return c;
};

describe("the visualizer act's doors", () => {
  it("refuses a clip that is not a kept cell of a live committed night, before anything is written", async () => {
    await world;
    const n = await night();
    await expect(visualizerAct(ctxOf(), n.id, `${TRACKS}/c-01/a2`)).rejects.toThrow(`${TRACKS}/c-01/a2 was rejected (craft); only a kept track clip gets a visualizer`);
    await expect(visualizerAct(ctxOf(), n.id, `${TRACKS}/c-01/a9`)).rejects.toThrow(`${TRACKS}/c-01/a9 was not kept on night ${TRACKS}; only a kept track clip gets a visualizer`);
    await expect(visualizerAct(ctxOf(), n.id, `${TRACKS}/c-01`)).rejects.toThrow(`not a track clip: ${TRACKS}/c-01 (want <night>/<c-id>/<aN>)`);
    await expect(visualizerAct(ctxOf(), n.id, `${n.id}/c-01/a1`)).rejects.toThrow(`${n.id}/c-01/a1 is not decided yet: night ${n.id} is open`);
    expect((await readNight(n.id)).candidates).toEqual([]);
    expect(parseTrackRef("2026-10-21-2/c-101/a12")).toEqual({ night: "2026-10-21-2", candidate: "c-101", part: "a12" });
  });
});

describe("a visualizer of a kept clip", () => {
  it("plays over the kept idea artboard under the same seed, and collects the video into the night", async () => {
    await world;
    const n = await night();
    const { calls, engines } = mvFakes();
    const r = await visualizerAct(ctxOf(), n.id, `${TRACKS}/c-01/a1`, { mv: engines });
    expect(r.outcome).toBe("done");
    const c = r.candidate;
    expect(c).toMatchObject({ id: "c-01", kind: "visualizer", status: "rendered", track: `${TRACKS}/c-01/a1`, fromSeed: `${BATCH}/sd-001`, use: "a music video: synthwave › darksynth", still: "visualizers/c-01/still.png", video: "visualizers/c-01/visualizer.mp4", durationS: 95 });
    expect(stillOf(c)).toBe("idea");
    // Our picture, copied - no studio still bought.
    const dir = path.join(ROOT, "scout", n.id, "visualizers", "c-01");
    expect(readFileSync(path.join(dir, "still.png")).equals(PNG)).toBe(true);
    expect(calls.still).toBe(0);
    expect(readFileSync(path.join(dir, "visualizer.mp4"), "utf8")).toBe("video #1");
    expect(existsSync(path.join(dir, "visualizer - youtube.txt"))).toBe(true);
    const rec = (await readMv()).jobs.find((j) => j.id === c.mvId);
    expect(rec).toMatchObject({ source: { kind: "clip", id: "sc-a1", title: "Rain Drive" }, stillFrom: path.join(dir, "still.png"), state: "done" });
    expect((await readNight(n.id)).jobs).toEqual([c.jobId]);
    // One clip, one visualizer - on this night or any other.
    await expect(visualizerAct(ctxOf(), n.id, `${TRACKS}/c-01/a1`)).rejects.toThrow(`${TRACKS}/c-01/a1 already plays in a visualizer; one clip, one visualizer`);
    const other = await night();
    await expect(visualizerAct(ctxOf(), other.id, `${TRACKS}/c-01/a1`)).rejects.toThrow("already plays in a visualizer");
  });

  it("with no kept idea under its seed the studio buys the still, collected beside the video", async () => {
    await world;
    const n = await night({ visualizerCap: 1 });
    const { calls, engines } = mvFakes();
    const c = (await visualizerAct(ctxOf(), n.id, `${TRACKS}/c-02/a1`, { mv: engines })).candidate;
    expect(calls.still).toBe(1);
    expect(c).toMatchObject({ status: "rendered", still: "visualizers/c-01/studio.jpg", use: "a music video: lo-fi › chillhop" });
    expect(stillOf(c)).toBe("studio");
    expect(readFileSync(path.join(ROOT, "scout", n.id, "visualizers", "c-01", "studio.jpg"), "utf8")).toMatch(/^jpeg #1$/);
    await expect(visualizerAct(ctxOf(), n.id, `${TRACKS}/c-01/a3`)).rejects.toThrow(`night ${n.id} rendered 1 of its 1 visualizer(s); nothing launched`);
  });

  it("a detached visualizer waits pending; `visualizer <night> --collect` brings its video in once the job is done", async () => {
    await world;
    const n = await night();
    const r = await visualizerAct(ctxOf({ detach: true }), n.id, `${TRACKS}/c-01/a3`);
    expect([r.outcome, r.candidate.status, r.candidate.video]).toEqual(["detached", "pending", undefined]);
    await driveMv([r.candidate.jobId ?? ""], { engines: mvFakes().engines, dryOnly: false });
    const out: string[] = [];
    const code = await runCli(["visualizer", n.id, "--collect"], { env: { ...process.env }, out: (s) => out.push(s), err: (s) => out.push(s) });
    expect([code, out]).toEqual([0, ["c-01 visualizer rendered"]]);
    expect((await visualizerOf(n.id, "c-01")).video).toBe("visualizers/c-01/visualizer.mp4");
  });

  it("a failed music-video job keeps the visualizer failed with its sentence verbatim", async () => {
    await world;
    const n = await night();
    const { engines } = mvFakes();
    const broken = { ...engines, render: async () => Promise.reject(new Error("ffmpeg exited 1: Invalid data found when processing input")) };
    const c = (await visualizerAct(ctxOf(), n.id, `${TRACKS}/c-01/a4`, { mv: broken })).candidate;
    expect(c.status).toBe("failed");
    expect(c.error).toContain("ffmpeg exited 1: Invalid data found when processing input");
  });
});
