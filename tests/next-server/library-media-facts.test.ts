import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { LibraryItemInput } from "@gt/domain/libraryItem";
import { blobStore, type BlobStore } from "@gt/kernel/blob";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { libraryDetail } from "@gt/kernel/library/detail";
import { queryLibrary } from "@gt/kernel/library/query";
import { factsMissing, upsertItems } from "@gt/kernel/library/write";
import { err } from "@gt/domain/errors";
import { probeMissing, type MediaProbe } from "@gt/producers/media-facts/run";

import { ffmpegProbe } from "../../lib/producers/media-facts.ts";

// MEDIA FACTS AT INGEST, ON THIS BOX'S ffprobe/ffmpeg (COMMON decision 6): real
// files made by ffmpeg itself - a black still, a mid-gray still, a two-second
// clip, and bytes that only claim to be an mp4 - put into a temp blob store,
// pointed at by Library items, probed, and read back as the attention facet, the
// cover and the detail's facts. Nothing in the real stores is touched.

let dir: string;
let k: Kernel;
let blobs: BlobStore;
const shas: Record<string, string> = {};

function make(name: string, args: readonly string[]): Uint8Array {
  const file = path.join(dir, name);
  execFileSync("ffmpeg", ["-v", "error", "-y", ...args, file], { windowsHide: true });
  return new Uint8Array(readFileSync(file));
}

const item = (id: string, kind: "plate" | "motion", sha: string, mime: string): LibraryItemInput =>
  kind === "plate"
    ? { kind, id, title: id, state: "unjudged", collections: [], origin: "forge", rights: { use: "unknown" }, source: "fixture", lineage: [], vocabulary: { station: "forge" }, media: { sha256: sha, bytes: 1, mime } }
    : { kind, id, title: id, state: "unjudged", collections: [], origin: "strips", rights: { use: "unknown" }, source: "fixture", lineage: [], vocabulary: { subject: "tides", format: "clip" }, media: { sha256: sha, bytes: 1, mime } };

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "gt-l49-facts-"));
  const opened = openKernel(":memory:");
  if (!opened.ok) throw opened.error;
  k = opened.value;
  blobs = blobStore(path.join(dir, "blobs"));
  const files: Record<string, [Uint8Array, string]> = {
    black: [make("black.png", ["-f", "lavfi", "-i", "color=c=black:s=64x36", "-frames:v", "1"]), "image/png"],
    gray: [make("gray.png", ["-f", "lavfi", "-i", "color=c=0x808080:s=64x36", "-frames:v", "1"]), "image/png"],
    clip: [make("clip.mp4", ["-f", "lavfi", "-i", "color=c=0xc0c0c0:s=64x36:d=2", "-pix_fmt", "yuv420p"]), "video/mp4"],
    junk: [new TextEncoder().encode("this is not an mp4, whatever its name says"), "video/mp4"],
  };
  for (const [name, [bytes, mime]] of Object.entries(files)) {
    const ref = await blobs.put(bytes, mime);
    if (!ref.ok) throw ref.error;
    shas[name] = ref.value.sha256;
  }
  const s = (n: string): string => shas[n] ?? "";
  const up = upsertItems(
    k.store,
    [
      { item: item("black", "plate", s("black"), "image/png"), meta: "", extras: {}, feed: "t" },
      { item: item("gray", "plate", s("gray"), "image/png"), meta: "", extras: {}, feed: "t" },
      { item: item("clip", "motion", s("clip"), "video/mp4"), meta: "", extras: {}, feed: "t" },
      { item: item("junk", "motion", s("junk"), "video/mp4"), meta: "", extras: {}, feed: "t" },
    ],
    { styleOf: () => undefined },
  );
  if (!up.ok) throw up.error;
}, 60_000);
afterAll(() => {
  k.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("probeMissing on ffprobe/ffmpeg", () => {
  it("measures every blob once: decodable, size, duration, a poster blob, mean luma, near-black", async () => {
    const r = await probeMissing(k.store, blobs, ffmpegProbe(), { limit: 10, now: () => new Date("2026-10-17T00:00:00.000Z") });
    if (!r.ok) throw r.error;
    expect(r.value).toMatchObject({ probed: 4, undecodable: 1, failed: [] });
    const missing = factsMissing(k.store, 10);
    expect(missing.ok && missing.value).toEqual([]);

    const facts = (id: string) => {
      const d = libraryDetail(k.store, id);
      if (!d.ok) throw d.error;
      return d.value.media;
    };
    expect(facts("black")).toMatchObject({ decodable: true, w: 64, h: 36, durationS: null, nearBlack: true });
    expect(facts("black")?.meanLuma).toBeLessThan(16);
    expect(facts("gray")).toMatchObject({ decodable: true, nearBlack: false });
    expect(facts("gray")?.meanLuma).toBeGreaterThan(100);
    const clip = facts("clip");
    expect(clip).toMatchObject({ decodable: true, w: 64, h: 36, nearBlack: false });
    expect(clip?.durationS).toBeCloseTo(2, 0);
    expect(clip?.posterSha).toMatch(/^[0-9a-f]{64}$/);
    const poster = blobs.pathOf({ sha256: clip?.posterSha ?? "", bytes: 0, mime: "image/jpeg" });
    expect(poster.ok && existsSync(poster.value)).toBe(true);
    expect(facts("junk")).toMatchObject({ decodable: false, posterSha: null, meanLuma: null });
    expect(facts("junk")?.error).toBeTruthy();
  }, 60_000);

  it("turns the facts into the attention facet and the cover, as queries", () => {
    const p = queryLibrary(k.store, { kind: "motion", limit: 10 });
    if (!p.ok) throw p.error;
    expect(p.value.items.map((i) => [i.id, i.attention ?? null])).toEqual([
      ["clip", null],
      ["junk", "unreadable"],
    ]);
    const clip = p.value.items[0];
    expect(clip?.cover).toMatchObject({ mime: "image/jpeg", nearBlack: false });
    expect(clip?.cover.blobSha).not.toBe(shas["clip"]);
    const plates = queryLibrary(k.store, { kind: "plate", limit: 10 });
    if (!plates.ok) throw plates.error;
    expect(plates.value.items.find((i) => i.id === "black")?.cover.nearBlack).toBe(true);
  });
});

describe("probeMissing when the tool did not run", () => {
  it("writes no fact for a probe that was never run: the blobs stay missing and are reported failed", async () => {
    const d = mkdtempSync(path.join(tmpdir(), "gt-facts-unavail-"));
    const opened = openKernel(":memory:");
    if (!opened.ok) throw opened.error;
    const kk = opened.value;
    try {
      const bs = blobStore(path.join(d, "blobs"));
      const inputs = [];
      for (let i = 0; i < 4; i++) {
        const ref = await bs.put(new TextEncoder().encode(`frame ${i}`), "image/png");
        if (!ref.ok) throw ref.error;
        inputs.push({ item: item(`n${i}`, "plate", ref.value.sha256, "image/png"), meta: "", extras: {}, feed: "t" });
      }
      const up = upsertItems(kk.store, inputs, { styleOf: () => undefined });
      if (!up.ok) throw up.error;
      // ffprobe absent: the binding answers ENOENT and says the tool did not run.
      const absent = { ok: false, error: "spawn ffprobe ENOENT", unavailable: true } as unknown as Awaited<ReturnType<MediaProbe["probe"]>>;
      const probe: MediaProbe = { probe: async () => absent, poster: async () => err("unavailable", "no ffmpeg"), luma: async () => err("unavailable", "no ffmpeg") };
      const r = await probeMissing(kk.store, bs, probe, { limit: 10, now: () => new Date("2026-10-25T00:00:00.000Z") });
      if (!r.ok) throw r.error;
      expect(r.value.failed).toHaveLength(4);
      expect(r.value.undecodable).toBe(0);
      const missing = factsMissing(kk.store, 10);
      expect(missing.ok && missing.value).toHaveLength(4);
    } finally {
      kk.close();
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("the binding flags an absent ffprobe as unavailable", async () => {
    const was = process.env["FFPROBE"];
    process.env["FFPROBE"] = path.join(tmpdir(), "gt-no-such-ffprobe-binary");
    try {
      const r = await ffmpegProbe().probe(path.join(tmpdir(), "whatever.png"));
      expect(r).toMatchObject({ ok: false, unavailable: true });
    } finally {
      if (was === undefined) delete process.env["FFPROBE"];
      else process.env["FFPROBE"] = was;
    }
  });
});
