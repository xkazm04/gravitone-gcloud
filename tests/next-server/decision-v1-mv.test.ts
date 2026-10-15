// THE MUSIC-VIDEO DECISION ADAPTER (lib/decision/v1/sources/mv.ts): finished
// videos with no verdict as a keep | drop cull. The upgrade under test: v1
// deleted a dropped video's render files at the keypress; here the preview
// names every file the commit deletes, nothing is deleted before the commit,
// and the apply deletes through v1's own patchMv (record first, files after).

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-dv1-mv-"));
  process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
  process.env["SOUND_LEDGER_PATH"] = path.join(dir, "ledger.json");
  return dir;
});

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { mvAdapter } from "../../lib/decision/v1/sources/mv.ts";
import type { MvJob } from "../../lib/sound/mv/types.ts";
import { must, openFlow } from "./decision-v1-harness.ts";

const SOUND = path.join(ROOT, "sound");
const blobDir = path.join(ROOT, "blobs");
afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

const T = Date.parse("2026-10-15T09:00:00.000Z");
const files = (id: string): MvJob["files"] => ({ audio: `mv/${id}/audio.mp3`, still: `mv/${id}/still.png`, video: `mv/${id}/video.mp4`, envelope: `mv/${id}/envelope.json` });
const job = (id: string, over: Partial<MvJob> = {}): MvJob => ({
  id,
  source: { kind: "take", id: `st-${id}`, title: `03_${id} Instrumental` },
  state: "done",
  files: files(id),
  verdict: null,
  look: "siren-rain",
  metadata: { title: `Video ${id}`, description: "d", tags: [], chapters: [] },
  treatment: { prompt: "p", motion: { particleDensity: 0.5, particleHue: 200, pulseStrength: 0.4 }, rationale: `why ${id}` },
  analysis: { durationS: 181.6, tempoBpm: [90], energyShape: [], sections: [] },
  enqueuedAt: T - 10_000,
  startedAt: T - 9_000,
  endedAt: T,
  ...over,
});

const JOBS: MvJob[] = [
  job("mj-a"),
  job("mj-b", { look: undefined, endedAt: T + 1000 }),
  job("mj-novideo", { files: { envelope: "mv/mj-novideo/envelope.json" } }),
  job("mj-kept", { verdict: "keep" }),
  job("mj-run", { state: "active", endedAt: undefined }),
  job("mj-late", { endedAt: T + 60_000 }),
];
const RUN = `mv/settled/${T + 1000}`;

function seed(jobs: readonly MvJob[] = JOBS): void {
  rmSync(SOUND, { recursive: true, force: true });
  for (const j of jobs) {
    mkdirSync(path.join(SOUND, "mv", j.id), { recursive: true });
    for (const rel of Object.values(j.files)) writeFileSync(path.join(SOUND, rel), `bytes of ${rel}`);
  }
  writeFileSync(path.join(SOUND, "mv.json"), JSON.stringify({ version: 1, queue: { running: false }, jobs, imports: [], progress: {} }));
}
const onDisk = (): MvJob[] => (JSON.parse(readFileSync(path.join(SOUND, "mv.json"), "utf8")) as { jobs: MvJob[] }).jobs;
const has = (rel: string): boolean => existsSync(path.join(SOUND, rel));

describe("packet (pure)", () => {
  it("finished, unjudged videos up to the cutoff, a row per look; a job with no video file is named and left", async () => {
    seed();
    expect(must(await mvAdapter.read({ runId: "mv/settled" })).runId).toBe(`mv/settled/${T + 60_000}`);
    const plan = must(mvAdapter.packet(must(await mvAdapter.read({ runId: RUN }))));
    expect(plan.packet).toMatchObject({ id: `pkt:mv:${RUN}`, source: "mv", lane: "video", mode: "matrix-cull", runId: RUN });
    expect(plan.packet.items.map((c) => [c.id, c.row])).toEqual([["mj-a", "siren-rain"], ["mj-b", "no look"]]);
    expect(plan.packet.items[0]?.media.mime).toBe("video/mp4");
    expect(plan.losses).toEqual([{ candidate: "mj-novideo", grade: "dropped", reason: "the job finished with no video file; it stays unjudged in Settled" }]);
    expect(plan.urls["mj-a"]).toBe("/api/sound/mv/jobs/mj-a/file?kind=video");
    expect(plan.present.items["mj-a"]).toMatchObject({ label: "Video mj-a", meta: "siren-rain · 182 s", prompt: "why mj-a" });
  });
});

describe("the drop is a decision until the commit", () => {
  async function decided() {
    seed();
    const flow = await openFlow(mvAdapter, RUN, blobDir);
    flow.patch([
      { candidate: "mj-a", verdict: "reject" },
      { candidate: "mj-b", verdict: "keep" },
    ]);
    return flow;
  }

  it("the preview lists every file the drop deletes - the envelope stays - and nothing is gone yet", async () => {
    const flow = await decided();
    const c = must(flow.preview()).consequence;
    expect(c.deletes.map((d) => d.target)).toEqual(["mv/mj-a/audio.mp3", "mv/mj-a/still.png", "mv/mj-a/video.mp4"]);
    expect(c.promotions.map((p) => p.candidate)).toEqual(["mj-b"]);
    expect(c.writes.map((w) => [w.target, w.detail])).toEqual([
      ["mv.json jobs mj-a", "drop"],
      ["mv.json jobs mj-b", "keep"],
    ]);
    expect(has("mv/mj-a/video.mp4")).toBe(true);
  });

  it("a video regenerated or judged since moves the token or is refused", async () => {
    const flow = await decided();
    const before = must(flow.preview()).consequence.token;
    const regenerated = { ...flow.v1, jobs: flow.v1.jobs.map((j) => (j.id === "mj-b" ? { ...j, endedAt: T + 5000 } : j)) };
    expect(must(flow.preview(regenerated)).consequence.token).not.toBe(before);
    const judged = { ...flow.v1, jobs: flow.v1.jobs.map((j) => (j.id === "mj-b" ? { ...j, verdict: "drop" as const } : j)) };
    const r = flow.preview(judged);
    expect(r.ok ? "ok" : r.error.code).toBe("conflict");
  });

  it("apply marks through patchMv, deletes the dropped files, and a second delivery changes nothing", async () => {
    const flow = await decided();
    must(flow.commit());
    expect(has("mv/mj-a/video.mp4")).toBe(true);
    const claim = flow.claim();
    must(await mvAdapter.apply(claim));
    const byId = new Map(onDisk().map((j) => [j.id, j]));
    expect(byId.get("mj-a")?.verdict).toBe("drop");
    expect(byId.get("mj-a")?.files).toEqual({ envelope: "mv/mj-a/envelope.json" });
    expect(byId.get("mj-b")?.verdict).toBe("keep");
    expect(["mv/mj-a/audio.mp3", "mv/mj-a/still.png", "mv/mj-a/video.mp4"].map(has)).toEqual([false, false, false]);
    expect(has("mv/mj-a/envelope.json")).toBe(true);
    expect(has("mv/mj-b/video.mp4")).toBe(true);
    const bytes = readFileSync(path.join(SOUND, "mv.json"), "utf8");
    must(await mvAdapter.apply(claim));
    expect(readFileSync(path.join(SOUND, "mv.json"), "utf8")).toBe(bytes);
  });

  it("a video marked otherwise in Settled since is refused and its files stand", async () => {
    const flow = await decided();
    must(flow.commit());
    const claim = flow.claim();
    const jobs = onDisk().map((j) => (j.id === "mj-a" ? { ...j, verdict: "keep" as const } : j));
    writeFileSync(path.join(SOUND, "mv.json"), JSON.stringify({ version: 1, queue: { running: false }, jobs, imports: [], progress: {} }));
    const r = await mvAdapter.apply(claim);
    expect(r.ok ? "ok" : r.error.code).toBe("refused");
    expect(has("mv/mj-a/video.mp4")).toBe(true);
  });
});
