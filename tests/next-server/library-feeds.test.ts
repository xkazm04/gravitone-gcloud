import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { blobStore } from "@gt/kernel/blob";
import { enqueue, list } from "@gt/kernel/job";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { queryLibrary } from "@gt/kernel/library/query";
import { putMediaFacts } from "@gt/kernel/library/write";
import { err } from "@gt/domain/errors";
import { liveEffects } from "@gt/kernel/effects";
import { runJob } from "@gt/kernel/job-run";
import { mediaFactsProducer, queueFacts, type MediaProbe } from "@gt/producers/media-facts/run";

import { stripsFeed } from "../../lib/library/feeds/foundry.ts";
import { KERNEL_BLOB_CAP, kernelFeed } from "../../lib/library/feeds/kernel.ts";
import { sunoFeed, takesFeed } from "../../lib/library/feeds/sound.ts";
import { clipsFeed, exportsFeed } from "../../lib/library/feeds/studio.ts";
import type { FeedItem } from "../../lib/library/feeds/types.ts";
import { syncLibrary } from "../../lib/library/project.ts";

// THE FEEDS L49 LEFT (L53) and the facts as a queued job. Every v1 store is pointed at a temp
// directory and every kernel is in memory: nothing here reads foundry-out/ or opens the
// operator's store. Each feed is checked for what it admits, what it leaves out and SAYS, and
// (kernel) for finding a blob ref by its shape wherever a step put it.

let dir = "";
const kernels: Kernel[] = [];
const ENV = ["SOUND_STORE_DIR", "CLIP_STORE_DIR", "PUBLISH_EXPORTS_DIR", "AD_EXPORT_DIR", "STRIPS_STORE_DIR"] as const;
const saved = new Map<string, string | undefined>();

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "gt-l53-feeds-"));
  for (const v of ENV) {
    saved.set(v, process.env[v]);
    process.env[v] = path.join(dir, v.toLowerCase());
    mkdirSync(process.env[v] ?? "", { recursive: true });
  }
});
afterEach(() => {
  for (const k of kernels.splice(0)) k.close();
  for (const v of ENV) {
    const was = saved.get(v);
    if (was === undefined) delete process.env[v];
    else process.env[v] = was;
  }
  rmSync(dir, { recursive: true, force: true });
});

function kernel(): Kernel {
  const k = openKernel(":memory:");
  if (!k.ok) throw k.error;
  kernels.push(k.value);
  return k.value;
}

const ctx = { universe: "fixture" as const };
const byId = (items: readonly FeedItem[]) => new Map(items.map((i) => [i.item.id, i]));
const write = (file: string, data: unknown) => writeFileSync(file, JSON.stringify(data));

describe("sunoFeed", () => {
  it("lists the clips no take was returned from, and says which it cannot list yet", async () => {
    const sound = process.env["SOUND_STORE_DIR"] ?? "";
    write(path.join(sound, "takes.json"), { version: 1, takes: [{ id: "t-1", kind: "music", origin: "suno-return", songId: "song-back", terms: { genre: [], mood: [], instrument: [] } }] });
    const clip = (id: string, songId: string, over: object = {}) => ({ id, songId, url: `https://suno.com/song/${songId}`, audioUrl: `https://cdn/${songId}.mp3`, imageUrl: null, title: `Clip ${id}`, durationS: 121.4, origin: "queue", jobId: "sj-1", model: "v5", createdAt: Date.parse("2026-10-01T00:00:00Z"), verdict: null, prompt: { style: "tense strings, pulse" }, ...over });
    write(path.join(sound, "suno.json"), {
      version: 1,
      jobs: [{ id: "sj-1", lane: { axis: "group", value: "risers" }, clipIds: [] }],
      clips: [clip("sc-back", "song-back"), clip("sc-kept", "song-kept", { verdict: "keep" }), clip("sc-wait", "song-wait", { durationS: null })],
    });
    const r = await sunoFeed.read(ctx);
    expect(r.items.map((i) => i.item.id)).toEqual(["audio:suno:sc-kept"]);
    const kept = r.items[0];
    expect(kept?.item).toMatchObject({ kind: "audio", state: "ratified", origin: "suno", vocabulary: { provider: "suno", durationS: 121.4, group: "risers" } });
    expect(kept?.extras.audio).toMatchObject({ prompt: "tense strings, pulse", src: "https://cdn/song-kept.mp3" });
    expect(kept?.file).toBeUndefined();
    expect(r.skipped).toEqual([{ id: "sc-wait", reason: "Suno has not reported its length yet" }]);
  });
});

describe("takesFeed", () => {
  it("admits a take with a length and names the one it cannot draw without one", async () => {
    const sound = process.env["SOUND_STORE_DIR"] ?? "";
    const take = (id: string, over: object = {}) => ({
      ...{ id, kind: "music", title: id, provider: "local", origin: "studio", prompt: "warm pad", negative: null, terms: { genre: [], mood: [], instrument: [] }, tempoBpm: null, key: null, durationS: null },
      ...{ file: null, peaks: null, measured: null, verdict: "unjudged", reasons: [], stage: null, group: null, label: null, parentId: null, huntId: null, projectId: null, songId: null, createdAt: "2026-10-01T00:00:00.000Z" },
      ...over,
    });
    write(path.join(sound, "takes.json"), { version: 1, takes: [take("t-long", { durationS: 30 }), take("t-none")] });
    const r = await takesFeed.read(ctx);
    expect(r.items.map((i) => i.item.id)).toEqual(["audio:t-long"]);
    expect(r.skipped).toEqual([{ id: "t-none", reason: "the take has no length, asked or measured" }]);
  });
});

describe("stripsFeed", () => {
  it("holds a listed run whose verdicts cannot be read: named in the report, its items not pruned", async () => {
    const k = kernel();
    const blobs = blobStore(path.join(dir, "blobs"));
    const run = path.join(process.env["STRIPS_STORE_DIR"] ?? "", "2026-10-01-edu");
    mkdirSync(run, { recursive: true });
    write(path.join(run, "run.json"), { id: "2026-10-01-edu", at: "2026-10-01T00:00:00.000Z", status: "done", cards: [{ id: "c1", lane: "edu", case: "tides", approach: "diagram", status: "rendered", files: { poster: "poster.png" } }] });
    write(path.join(run, "verdicts.json"), {});
    const one = await syncLibrary(k.store, blobs, [stripsFeed], ctx);
    if (!one.ok) throw one.error;
    expect(one.value.feeds[0]).toMatchObject({ feed: "strips", items: 1, inserted: 1 });
    writeFileSync(path.join(run, "verdicts.json"), "{ torn");
    const two = await syncLibrary(k.store, blobs, [stripsFeed], ctx);
    if (!two.ok) throw two.error;
    expect(two.value.feeds[0]).toMatchObject({ feed: "strips", items: 0, pruned: 0, skipped: [{ id: "2026-10-01-edu" }] });
    const p = queryLibrary(k.store, { limit: 5 });
    expect(p.ok && p.value.items.map((i) => i.id)).toEqual(["motion:strips:2026-10-01-edu:c1:poster"]);
  });

  it("holds a run whose run.json cannot be read: named in the report, its items not pruned", async () => {
    const k = kernel();
    const blobs = blobStore(path.join(dir, "blobs"));
    const run = path.join(process.env["STRIPS_STORE_DIR"] ?? "", "2026-10-03-edu");
    mkdirSync(run, { recursive: true });
    write(path.join(run, "run.json"), { id: "2026-10-03-edu", at: "2026-10-03T00:00:00.000Z", status: "done", cards: [{ id: "c1", lane: "edu", case: "tides", approach: "diagram", status: "rendered", files: { poster: "poster.png" } }] });
    write(path.join(run, "verdicts.json"), {});
    const one = await syncLibrary(k.store, blobs, [stripsFeed], ctx);
    if (!one.ok) throw one.error;
    expect(one.value.feeds[0]).toMatchObject({ feed: "strips", items: 1, inserted: 1 });
    writeFileSync(path.join(run, "run.json"), "{ torn");
    const two = await syncLibrary(k.store, blobs, [stripsFeed], ctx);
    if (!two.ok) throw two.error;
    expect(two.value.feeds[0]).toMatchObject({ feed: "strips", items: 0, pruned: 0, skipped: [{ id: "2026-10-03-edu" }] });
    const p = queryLibrary(k.store, { limit: 5 });
    expect(p.ok && p.value.items.map((i) => i.id)).toEqual(["motion:strips:2026-10-03-edu:c1:poster"]);
  });

  it("reads a card's verdict as its state: keep is ratified, reject is rejected, none is unjudged", async () => {
    const run = path.join(process.env["STRIPS_STORE_DIR"] ?? "", "2026-10-02-edu");
    mkdirSync(run, { recursive: true });
    const card = (id: string) => ({ id, lane: "edu", case: "tides", approach: "diagram", status: "rendered", files: { poster: "poster.png" } });
    write(path.join(run, "run.json"), { id: "2026-10-02-edu", at: "2026-10-02T00:00:00.000Z", status: "done", cards: [card("k"), card("r"), card("n")] });
    write(path.join(run, "verdicts.json"), { k: { verdict: "keep", at: "2026-10-02T01:00:00.000Z" }, r: { verdict: "reject", at: "2026-10-02T01:00:00.000Z" } });
    const r = await stripsFeed.read(ctx);
    expect(r.items.map((i) => [i.item.id.split(":")[3], i.item.state])).toEqual([
      ["k", "ratified"],
      ["r", "rejected"],
      ["n", "unjudged"],
    ]);
  });

  it("says its run cap: the runs past the newest 200 are named in the report, not silently left out", async () => {
    const root = process.env["STRIPS_STORE_DIR"] ?? "";
    for (let i = 0; i < 201; i++) {
      const id = `2026-01-01-r${String(i).padStart(3, "0")}`;
      mkdirSync(path.join(root, id), { recursive: true });
      write(path.join(root, id, "run.json"), { id, at: new Date(Date.parse("2026-01-01T00:00:00Z") + i * 60_000).toISOString(), status: "done", cards: [] });
    }
    const r = await stripsFeed.read(ctx);
    expect(r.skipped).toEqual([{ id: "strips", reason: "1 of 201 runs, older than the newest 200, are not read" }]);
  });
});

describe("clipsFeed and exportsFeed", () => {
  it("admits a finished clip over its mp4 and reports a done clip whose file is gone", async () => {
    const clips = process.env["CLIP_STORE_DIR"] ?? "";
    const rec = (clipId: string, status: string) => ({ clipId, projectId: "p-1", status, model: "hailuo-03", durationS: 5, aspect: "16:9", motion: "slow push in on the harbor", vendorJobId: null, costUsd: null, costBasis: "none", error: null, createdAt: 1, finishedAt: 2 });
    write(path.join(clips, "clip-aaaaaa1.json"), rec("clip-aaaaaa1", "done"));
    writeFileSync(path.join(clips, "clip-aaaaaa1.mp4"), "mp4");
    write(path.join(clips, "clip-bbbbbb2.json"), rec("clip-bbbbbb2", "done"));
    write(path.join(clips, "clip-cccccc3.json"), rec("clip-cccccc3", "rendering"));
    const r = await clipsFeed.read(ctx);
    expect(r.items.map((i) => i.item.id)).toEqual(["video:clip:clip-aaaaaa1"]);
    expect(r.items[0]).toMatchObject({ item: { kind: "video", title: "slow push in on the harbor", collections: [{ kind: "project", id: "p-1" }] }, file: { mime: "video/mp4" } });
    expect(r.skipped).toEqual([{ id: "clip-bbbbbb2", reason: "done, but its mp4 is not on disk" }]);
  });

  it("names an export's format by where it sits and what its sidecar says", async () => {
    const mv = process.env["PUBLISH_EXPORTS_DIR"] ?? "";
    const ads = process.env["AD_EXPORT_DIR"] ?? "";
    writeFileSync(path.join(mv, "mv-1.mp4"), "mp4");
    writeFileSync(path.join(mv, "cut-1.mp4"), "mp4");
    write(path.join(mv, "cut-1.json"), { projectId: "p-1" });
    writeFileSync(path.join(mv, "cut-1.vtt"), "WEBVTT");
    writeFileSync(path.join(ads, "ad-1.mp4"), "mp4");
    const r = byId((await exportsFeed.read(ctx)).items);
    expect(r.get("video:export:mv-1")?.item).toMatchObject({ vocabulary: { format: "music-video", captions: "none" }, collections: [] });
    expect(r.get("video:export:cut-1")?.item).toMatchObject({ vocabulary: { format: "film", captions: "vtt" }, collections: [{ kind: "project", id: "p-1" }] });
    expect(r.get("video:export:ad-1")?.item).toMatchObject({ vocabulary: { format: "ad" } });
  });
});

describe("kernelFeed", () => {
  it("finds blob refs by shape in part records and job outputs, one item per blob", async () => {
    const k = kernel();
    const plate = { sha256: "a".repeat(64), bytes: 12, mime: "image/png" };
    const clip = { sha256: "b".repeat(64), bytes: 30, mime: "video/mp4" };
    const job = enqueue(k.store, { id: "job:run:r-1", of: { kind: "run", id: "r-1" }, producer: "frames", lane: "box.render" }, { kind: "agent", id: "t" });
    if (!job.ok) throw job.error;
    const w = k.store.tx((t) => {
      t.run("INSERT INTO projects (id, rev, listed, updated_at, record) VALUES ('p-1', 1, 1, '2026-10-01T00:00:00.000Z', '{}')");
      t.run("INSERT INTO part_records (project_id, key, part_id, rev, data) VALUES ('p-1', 'frames', 'p-1/frames', 1, ?)", JSON.stringify({ units: [{ id: "u1", plate: { state: "ready", blob: plate } }], note: { sha256: "not-a-sha", mime: "image/png" } }));
      t.run("INSERT INTO job_outputs (job_id, step, output, fence, at) VALUES ('job:run:r-1', 'u1', ?, 1, '2026-10-02T00:00:00.000Z')", JSON.stringify({ made: plate, clip }));
    });
    if (!w.ok) throw w.error;
    const r = await kernelFeed.read({ ...ctx, store: k.store });
    const items = byId(r.items);
    expect([...items.keys()].sort()).toEqual([`image:kernel:${plate.sha256}`, `video:kernel:${clip.sha256}`]);
    expect(items.get(`image:kernel:${plate.sha256}`)?.item).toMatchObject({
      kind: "image",
      media: plate,
      collections: [{ kind: "project", id: "p-1" }],
      lineage: [
        { kind: "job", id: "job:run:r-1" },
        { kind: "project", id: "p-1" },
      ],
      at: "2026-10-02T00:00:00.000Z",
    });
    // Without a store the feed says so instead of reading nothing silently.
    expect((await kernelFeed.read(ctx)).skipped).toEqual([{ id: "kernel", reason: "no kernel store in this sync" }]);
  });

  it("says its cap in refs, and the refs past it are the same ones on the next read", async () => {
    const k = kernel();
    const units = Array.from({ length: KERNEL_BLOB_CAP + 1 }, (_, i) => ({ blob: { sha256: i.toString(16).padStart(64, "0"), bytes: 1, mime: "image/png" } }));
    const w = k.store.tx((t) => {
      t.run("INSERT INTO projects (id, rev, listed, updated_at, record) VALUES ('p-1', 1, 1, '2026-10-01T00:00:00.000Z', '{}')");
      t.run("INSERT INTO part_records (project_id, key, part_id, rev, data) VALUES ('p-1', 'frames', 'p-1/frames', 1, ?)", JSON.stringify({ units }));
    });
    if (!w.ok) throw w.error;
    const one = await kernelFeed.read({ ...ctx, store: k.store });
    expect(one.items).toHaveLength(KERNEL_BLOB_CAP);
    expect(one.skipped).toEqual([{ id: "kernel", reason: `more than ${KERNEL_BLOB_CAP} blob refs; the refs past the cap are not read` }]);
    const two = await kernelFeed.read({ ...ctx, store: k.store });
    expect(two.items.map((i) => i.item.id)).toEqual(one.items.map((i) => i.item.id));
  });
});

describe("queueFacts", () => {
  it("queues ONE media-facts job for blobs without facts, leaves it alone while it is open, and queues nothing when none are missing", async () => {
    const k = kernel();
    const blobs = blobStore(path.join(dir, "blobs"));
    const item = (id: string, sha: string): FeedItem => ({
      item: { kind: "image", id, title: id, state: "reference", collections: [], origin: "studio", rights: { use: "publishable" }, source: "fixture", lineage: [], vocabulary: { styles: [] }, media: { sha256: sha, bytes: 1, mime: "image/png" } },
      meta: "",
      extras: {},
    });
    const feeds = [{ id: "t", read: async () => ({ items: [item("i1", "c".repeat(64))], skipped: [] }) }];
    const at = () => new Date("2026-10-16T12:00:00.000Z");
    const queue = (s: Parameters<typeof queueFacts>[0]) => queueFacts(s, { kind: "machine", id: "library-sync" }, at);
    const one = await syncLibrary(k.store, blobs, feeds, ctx, { queue });
    if (!one.ok) throw one.error;
    expect(one.value.facts).toEqual({ queue: { kind: "queued", jobId: "job:run:library-facts-20261016120000000" } });
    const two = await syncLibrary(k.store, blobs, feeds, ctx, { queue });
    if (!two.ok) throw two.error;
    expect(two.value.facts).toEqual({ queue: { kind: "open", jobId: "job:run:library-facts-20261016120000000", state: "queued" } });
    const jobs = list(k.store, { lane: "box.render" });
    if (!jobs.ok) throw jobs.error;
    expect(jobs.value.map((j) => [j.producer, j.mode.kind, j.state])).toEqual([["media-facts", "dry", "queued"]]);
    const f = putMediaFacts(k.store, [{ sha: "c".repeat(64), decodable: true, mime: "image/png", w: 1, h: 1, durationS: null, posterSha: null, meanLuma: 100, nearBlack: false, probedAt: at().toISOString(), error: null }]);
    if (!f.ok) throw f.error;
    expect(queue(k.store)).toEqual({ ok: true, value: { kind: "none-missing" } });
    // The index is untouched by the queueing: the item is still there, now with its facts.
    const p = queryLibrary(k.store, { limit: 5 });
    expect(p.ok && p.value.items.map((i) => i.id)).toEqual(["i1"]);
  });
});

describe("the media-facts job", () => {
  it("drains the facts the sync queued it for, on box.render, free, and the sinking item is flagged", async () => {
    const k = kernel();
    const blobs = blobStore(path.join(dir, "blobs"));
    const good = await blobs.put(new TextEncoder().encode("still"), "image/png");
    const bad = await blobs.put(new TextEncoder().encode("not an mp4"), "video/mp4");
    if (!good.ok || !bad.ok) throw new Error("blob put");
    const item = (id: string, media: { sha256: string; bytes: number; mime: string }, kind: "image" | "video"): FeedItem => ({
      item:
        kind === "image"
          ? { kind, id, title: id, state: "reference", collections: [], origin: "studio", rights: { use: "publishable" }, source: "fixture", lineage: [], vocabulary: { styles: [] }, media }
          : { kind, id, title: id, state: "unjudged", collections: [], origin: "studio", rights: { use: "publishable" }, source: "fixture", lineage: [], vocabulary: { format: "film", captions: "none" }, media },
      meta: "",
      extras: {},
    });
    const feeds = [{ id: "t", read: async () => ({ items: [item("i1", good.value, "image"), item("v1", bad.value, "video")], skipped: [] }) }];
    const queued = await syncLibrary(k.store, blobs, feeds, ctx, { queue: (s) => queueFacts(s, { kind: "machine", id: "library-sync" }, () => new Date("2026-10-16T12:00:00.000Z")) });
    if (!queued.ok || queued.value.facts === undefined || !("queue" in queued.value.facts) || queued.value.facts.queue.kind !== "queued") throw new Error("not queued");
    // A recorded probe: the still is a 640x400 image at luma 120; the mp4 does not decode.
    const stillAt = blobs.pathOf(good.value);
    if (!stillAt.ok) throw stillAt.error;
    const probe: MediaProbe = {
      probe: async (file) => (file === stillAt.value ? { ok: true, json: JSON.stringify({ streams: [{ codec_type: "video", width: 640, height: 400 }] }) } : { ok: false, error: "moov atom not found" }),
      poster: async () => err("unavailable", "ffmpeg poster: no frame"),
      luma: async () => ({ ok: true, value: new Uint8Array([120]) }),
    };
    const run = await runJob(liveEffects(k.store, blobs), mediaFactsProducer({ store: k.store, blobs, probe }), queued.value.facts.queue.jobId);
    if (!run.ok) throw run.error;
    expect(run.value.outcome).toBe("done");
    expect(run.value.job?.spend.usd).toBe(0);
    const page = queryLibrary(k.store, { limit: 5 });
    if (!page.ok) throw page.error;
    expect(page.value.items.map((i) => [i.id, i.attention ?? null])).toEqual([
      ["i1", null],
      ["v1", "unreadable"],
    ]);
    expect(queueFacts(k.store, { kind: "machine", id: "library-sync" }, () => new Date())).toEqual({ ok: true, value: { kind: "none-missing" } });
  });
});
