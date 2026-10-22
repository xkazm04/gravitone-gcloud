import { JPEG, disposeRoot, fakeWeb, png, resolve, stubTools } from "./scout-cli-harness.ts";

import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ingestSource, pagePictures } from "../../lib/foundry/scout/ingest.ts";
import { createNight, mutateNight, nightDir, readNight } from "../../lib/foundry/scout/store.ts";
import type { ScoutSource, SourceKind } from "../../lib/foundry/scout/types.ts";

// The ingest engine over stub tools and a fake web: a video becomes gated
// keyframes with their timestamps and its download is deleted; a failing tool
// fails the source with the tool's own sentence; a picture and a page go through
// safeFetch (its checks run against a fake resolver - never a weakened guard).

afterAll(disposeRoot);
afterEach(() => vi.unstubAllGlobals());

async function nightWith(url: string, kind: SourceKind): Promise<string> {
  const n = await createNight({ dry: true, day: "2026-10-01" });
  const src: ScoutSource = { id: "s-01", url, kind, title: "t", why: "w", found: "search", rights: "reference-only", status: "pending", files: [] };
  await mutateNight(n.id, (x) => ({ ...x, sources: [src] }));
  return n.id;
}

describe("a video", () => {
  it("is cut into gated keyframes with their `at`, the media is deleted, and the source is ingested, reference-only", async () => {
    const id = await nightWith("https://www.youtube.com/watch?v=abc123", "video");
    const t = stubTools();
    const r = await ingestSource(id, "s-01", t.deps);
    expect(r).toEqual({ ok: true, value: { status: "ingested", files: 2 } });
    const s = (await readNight(id)).sources[0];
    // FRAMES: a shot (kept), a fade (blank), the shot again (duplicate), a smear (no-detail), a second shot (kept).
    expect(s?.files).toEqual(["sources/s-01/k-001.jpg", "sources/s-01/k-002.jpg"]);
    expect(s?.at).toEqual({ "sources/s-01/k-001.jpg": 1, "sources/s-01/k-002.jpg": 9.75 });
    expect(s?.durationS).toBe(95.5);
    expect(s?.rights).toBe("reference-only");
    expect(s?.status).toBe("ingested");
    expect(s?.error).toBeUndefined();
    const dir = path.join(nightDir(id), "sources", "s-01");
    expect(readdirSync(dir).sort()).toEqual(["k-001.jpg", "k-002.jpg"]);
    expect(existsSync(path.join(dir, ".media"))).toBe(false);
    // The python's flags, kept: <=1080p, one video, never a playlist; the scene filter with showinfo.
    const dl = t.calls.find((c) => c.bin === "yt-dlp" && !c.args.includes("--skip-download"));
    expect(dl?.args).toEqual(expect.arrayContaining(["--no-playlist", "bestvideo[height<=1080]/best[height<=1080]"]));
    expect(t.calls.find((c) => c.bin === "ffmpeg" && c.args.includes("-vsync"))?.args).toContain("select='gt(scene,0.3)',showinfo,scale='min(1280,iw)':-2");
  });

  it("a failing tool fails the source with its stderr verbatim, and still deletes the download", async () => {
    const id = await nightWith("https://www.youtube.com/watch?v=def456", "video");
    const said = "[mov,mp4] moov atom not found | Error opening input file x.mp4.";
    const r = await ingestSource(id, "s-01", stubTools({ fail: "ffmpeg", stderr: said }).deps);
    expect(r.ok && r.value.status).toBe("failed");
    const s = (await readNight(id)).sources[0];
    expect(s?.status).toBe("failed");
    expect(s?.error).toBe(`ffmpeg: ${said}`);
    expect(s?.files).toEqual([]);
    expect(existsSync(path.join(nightDir(id), "sources", "s-01", ".media"))).toBe(false);
  });

  it("a video over twenty minutes is refused with its length, before anything is downloaded", async () => {
    const id = await nightWith("https://youtu.be/long1", "video");
    const t = stubTools({ durationS: 3725 });
    await ingestSource(id, "s-01", t.deps);
    expect((await readNight(id)).sources[0]?.error).toBe("the video runs 62m05s; a night takes at most 20m00s");
    expect(t.calls.filter((c) => c.bin === "yt-dlp")).toHaveLength(1);
  });

  it("a source already ingested is answered as it stands, never fetched again", async () => {
    const id = await nightWith("https://youtu.be/again", "video");
    const t = stubTools();
    await ingestSource(id, "s-01", t.deps);
    const n = t.calls.length;
    expect((await ingestSource(id, "s-01", t.deps)).ok).toBe(true);
    expect(t.calls.length).toBe(n);
  });
});

describe("a picture and a page", () => {
  it("a picture is fetched through safeFetch, sniffed by its bytes and written", async () => {
    const id = await nightWith("https://art.example/look.png", "image");
    vi.stubGlobal("fetch", fakeWeb({ "https://art.example/look.png": { body: png(800, 600), type: "image/png" } }));
    const r = await ingestSource(id, "s-01", stubTools().deps);
    expect(r).toEqual({ ok: true, value: { status: "ingested", files: 1 } });
    expect((await readNight(id)).sources[0]?.files).toEqual(["sources/s-01/p-001.png"]);
  });

  it("a host that resolves to a private address is refused by safeFetch's own check", async () => {
    const id = await nightWith("https://intranet.example/x.png", "image");
    vi.stubGlobal("fetch", fakeWeb({ "https://intranet.example/x.png": { body: png(800, 600), type: "image/png" } }));
    const t = stubTools();
    await ingestSource(id, "s-01", { ...t.deps, resolve: async () => [{ address: "10.0.0.7" }] });
    expect((await readNight(id)).sources[0]?.error).toMatch(/private address 10\.0\.0\.7/);
  });

  it("a body that is not a picture fails with what it was", async () => {
    const id = await nightWith("https://art.example/fake.png", "image");
    vi.stubGlobal("fetch", fakeWeb({ "https://art.example/fake.png": { body: "<html>", type: "text/html" } }));
    await ingestSource(id, "s-01", stubTools().deps);
    expect((await readNight(id)).sources[0]?.error).toBe("https://art.example/fake.png is not a PNG, JPEG or WebP (text/html)");
  });

  it("a page gives its og:image and its <img> srcs, made absolute; an icon is skipped", async () => {
    const html = `<html><head><meta content="/og.jpg" property="og:image"></head><body><img src="a.png"><img src='https://cdn.example/b.png'><img src="data:image/png;base64,AA"><img src="icon.png"></body></html>`;
    const id = await nightWith("https://studio.example/work/", "page");
    vi.stubGlobal(
      "fetch",
      fakeWeb({
        "https://studio.example/work/": { body: html, type: "text/html; charset=utf-8" },
        "https://studio.example/og.jpg": { body: JPEG, type: "image/jpeg" },
        "https://studio.example/work/a.png": { body: png(1200, 900), type: "image/png" },
        "https://cdn.example/b.png": { body: png(640, 640), type: "image/png" },
        "https://studio.example/work/icon.png": { body: png(32, 32), type: "image/png" },
      }),
    );
    expect(pagePictures(html, "https://studio.example/work/")).toEqual(["https://studio.example/og.jpg", "https://studio.example/work/a.png", "https://cdn.example/b.png", "https://studio.example/work/icon.png"]);
    await ingestSource(id, "s-01", { ...stubTools().deps, resolve });
    // og.jpg is the harness's 64x48 JPEG: under the 160px short side, skipped like the icon.
    expect((await readNight(id)).sources[0]?.files).toEqual(["sources/s-01/p-001.png", "sources/s-01/p-002.png"]);
  });
});
