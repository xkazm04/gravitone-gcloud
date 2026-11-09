// GET /api/blob/<sha>?w=<320|640|1280>: an image blob at a grid's width, a WebP made once and kept
// beside the store - and everything that is not that request answers exactly as before.

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-blob-thumb-"));
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  process.env["IMAGING_ACCESS_SECRET"] = "blob-thumb-secret";
  delete process.env["NEXT_PUBLIC_DEV_AUTH"];
  return dir;
});

import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";

import sharp from "sharp";

import { blobStore } from "@gt/kernel/blob";
import { closeProcessKernel } from "@gt/kernel/process";

import { GET, HEAD } from "../../app/api/blob/[sha]/route.ts";
import { serveFile } from "../../app/_server/serveFile.ts";
import { kernel } from "../../lib/kernelStore.ts";
import { forgetVariantVerdicts, thumbRootOf, variant, variantPathOf, writeAtomic, type Resize } from "../../lib/media/thumb/variant.ts";
import { blobRootOf } from "../../lib/parts/gates.ts";

afterAll(() => {
  closeProcessKernel();
  rmSync(ROOT, { recursive: true, force: true });
});

let ip = 0;
const call = (handler: typeof GET, sha: string, q: string, headers: Record<string, string> = {}) =>
  handler(
    new Request(`http://localhost/api/blob/${sha}${q}`, { headers: { "x-forwarded-for": `10.41.${++ip}.1`, authorization: "Bearer blob-thumb-secret", ...headers } }),
    { params: Promise.resolve({ sha }) },
  );

const root = (): string => {
  const k = kernel();
  if (!k.ok) throw k.error;
  return blobRootOf(k.value.store);
};

async function put(bytes: Uint8Array, mime: string) {
  const r = await blobStore(root()).put(bytes, mime);
  if (!r.ok) throw r.error;
  return r.value;
}

const png = async (width: number, height: number): Promise<Uint8Array> =>
  new Uint8Array(await sharp({ create: { width, height, channels: 3, background: { r: 200, g: 40, b: 90 } } }).png().toBuffer());

const sizeOf = async (bytes: ArrayBuffer) => sharp(Buffer.from(bytes)).metadata();

describe("the blob route with ?w=", () => {
  it("answers a WebP no wider than w, immutable, under its own ETag - from disk the second time", async () => {
    const ref = await put(await png(1600, 900), "image/png");
    const r = await call(GET, ref.sha256, "?type=image%2Fpng&w=640");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/webp");
    expect(r.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
    expect(r.headers.get("vary")).toBeNull();
    const meta = await sizeOf(await r.arrayBuffer());
    expect(meta.format).toBe("webp");
    expect([meta.width, meta.height]).toEqual([640, 360]);
    const original = await call(GET, ref.sha256, "?type=image%2Fpng");
    expect(r.headers.get("etag")).not.toBe(original.headers.get("etag"));

    const cached = variantPathOf(thumbRootOf(root()), ref.sha256, 640);
    expect(cached.startsWith(ROOT)).toBe(true);
    const before = statSync(cached).mtimeMs;
    const again = await call(GET, ref.sha256, "?type=image%2Fpng&w=640");
    expect(again.status).toBe(200);
    expect(again.headers.get("etag")).toBe(r.headers.get("etag"));
    expect(statSync(cached).mtimeMs).toBe(before);
    // ...and the variant revalidates like any served file.
    const held = await call(GET, ref.sha256, "?type=image%2Fpng&w=640", { "if-none-match": r.headers.get("etag") ?? "" });
    expect(held.status).toBe(304);
  });

  it("never enlarges: a source narrower than w comes back at its own width", async () => {
    const ref = await put(await png(200, 100), "image/png");
    const meta = await sizeOf(await (await call(GET, ref.sha256, "?type=image%2Fpng&w=1280")).arrayBuffer());
    expect([meta.width, meta.height]).toEqual([200, 100]);
  });

  it("sniffs a blob asked for with no type", async () => {
    const ref = await put(await png(900, 900), "image/png");
    const r = await call(GET, ref.sha256, "?w=320");
    expect(r.headers.get("content-type")).toBe("image/webp");
    expect((await sizeOf(await r.arrayBuffer())).width).toBe(320);
  });

  it("refuses a width off the list with the route's 400 envelope", async () => {
    const ref = await put(await png(10, 10), "image/png");
    for (const w of ["641", "0640", "640px", ""]) {
      const r = await call(GET, ref.sha256, `?type=image%2Fpng&w=${w}`);
      expect(r.status).toBe(400);
      const body = (await r.json()) as { code: string };
      expect(body.code).toBe("invalid");
    }
  });

  it("answers a non-image exactly as without w: original bytes, original type", async () => {
    const audio = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 9]);
    const ref = await put(audio, "audio/mpeg");
    for (const q of ["?type=audio%2Fmpeg&w=640", "?w=640"]) {
      const r = await call(GET, ref.sha256, q);
      expect(r.status).toBe(200);
      expect(new Uint8Array(await r.arrayBuffer())).toEqual(audio);
    }
    expect((await call(GET, ref.sha256, "?type=audio%2Fmpeg&w=640")).headers.get("content-type")).toBe("audio/mpeg");
    // An image type over bytes that are not a raster (an svg, a corrupt png): the original too.
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900"/>');
    const s = await put(svg, "image/svg+xml");
    const r = await call(GET, s.sha256, "?type=image%2Fsvg%2Bxml&w=320");
    expect(r.headers.get("content-type")).toBe("application/octet-stream");
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(svg);
  });

  it("no w is byte for byte and header for header the plain file server", async () => {
    const bytes = await png(300, 300);
    const ref = await put(bytes, "image/png");
    const at = path.join(root(), ref.sha256.slice(0, 2), ref.sha256.slice(2));
    for (const [handler, method] of [[GET, "GET"], [HEAD, "HEAD"]] as const) {
      const viaRoute = await call(handler, ref.sha256, "?type=image%2Fpng");
      const base = await serveFile(new Request("http://localhost/x", { method }), at, { mime: "image/png", cache: "private, max-age=31536000, immutable" });
      expect(viaRoute.status).toBe(base.status);
      for (const h of ["content-type", "content-length", "cache-control", "etag", "last-modified", "accept-ranges", "x-content-type-options"]) {
        expect(viaRoute.headers.get(h), h).toBe(base.headers.get(h));
      }
      if (method === "GET") expect(new Uint8Array(await viaRoute.arrayBuffer())).toEqual(bytes);
    }
  });
});

describe("variant()", () => {
  const thumbs = path.join(ROOT, "unit-thumbs");
  const src = path.join(ROOT, "unit-src.png");

  it("resizes once across two requests, and once across two CONCURRENT first requests", async () => {
    await sharp({ create: { width: 50, height: 50, channels: 3, background: "#123456" } }).png().toFile(src);
    const resize = vi.fn<Resize>(async () => new Uint8Array([1, 2, 3]));
    const sha = "c".repeat(64);
    const [a, b] = await Promise.all([variant(src, thumbs, sha, 320, resize), variant(src, thumbs, sha, 320, resize)]);
    expect(a).toEqual(b);
    expect(resize).toHaveBeenCalledTimes(1);
    await variant(src, thumbs, sha, 320, resize);
    expect(resize).toHaveBeenCalledTimes(1);
    // Width is part of the key: one source at another width is another derivation.
    await variant(src, thumbs, sha, 640, resize);
    expect(resize).toHaveBeenCalledTimes(2);
  });

  it("remembers a not-a-raster verdict, and remembers nothing for a missing source", async () => {
    forgetVariantVerdicts();
    const resize = vi.fn<Resize>(async () => null);
    const sha = "d".repeat(64);
    expect(await variant(src, thumbs, sha, 320, resize)).toEqual({ ok: true, value: null });
    expect(await variant(src, thumbs, sha, 640, resize)).toEqual({ ok: true, value: null });
    expect(resize).toHaveBeenCalledTimes(1);
    const missing = vi.fn<Resize>(async () => new Uint8Array([9]));
    expect(await variant(path.join(ROOT, "absent"), thumbs, "e".repeat(64), 320, missing)).toEqual({ ok: true, value: null });
    expect(missing).not.toHaveBeenCalled();
  });

  it("writes atomically: racing writers leave one whole file and no temp files", async () => {
    const file = path.join(thumbs, "race", "x.webp");
    const bytes = new Uint8Array(256 * 1024).fill(7);
    await Promise.all(Array.from({ length: 8 }, () => writeAtomic(file, bytes)));
    expect(statSync(file).size).toBe(bytes.byteLength);
    expect(readdirSync(path.dirname(file))).toEqual(["x.webp"]);
    expect(existsSync(`${file}.tmp`)).toBe(false);
  });
});
