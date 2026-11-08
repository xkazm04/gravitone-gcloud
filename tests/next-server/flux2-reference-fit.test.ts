// A reference is held to 1024 px on its long side before it is uploaded (lib/imaging/local/refResize.ts): a bigger
// one is downscaled and named by the SMALLER bytes, a smaller one goes up byte-identical, and bytes that are not an
// image are refused as before.

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { drawFlux, type FluxFetch } from "../../lib/imaging/local/flux2.ts";
import { fitReference } from "../../lib/imaging/local/refResize.ts";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9]);
const solid = (w: number, h: number, fmt: "png" | "jpeg" | "webp" = "png"): Promise<Uint8Array> =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 90, g: 60, b: 30 } } })
    [fmt]()
    .toBuffer()
    .then((b) => new Uint8Array(b));

function comfy(): { f: FluxFetch; uploads: { name: string; bytes: Uint8Array }[] } {
  const uploads: { name: string; bytes: Uint8Array }[] = [];
  const f: FluxFetch = async (url, init) => {
    const u = new URL(url);
    if (u.pathname === "/system_stats") return Response.json({});
    if (u.pathname === "/upload/image") {
      const file = (init?.body as FormData).get("image") as File;
      uploads.push({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
      return Response.json({ name: file.name, subfolder: "gravitone", type: "input" });
    }
    if (u.pathname === "/prompt") return Response.json({ prompt_id: "p-1" });
    if (u.pathname === "/history/p-1") return Response.json({ "p-1": { status: { status_str: "success", completed: true }, outputs: { "13": { images: [{ filename: "a.png", subfolder: "", type: "output" }] } } } });
    if (u.pathname === "/view") return new Response(PNG);
    return new Response("no", { status: 404 });
  };
  return { f, uploads };
}

describe("a reference's long side", () => {
  it("over 1024 px is downscaled inside it, in its own format, before the upload is named", async () => {
    const big = await solid(3000, 1500);
    const c = comfy();
    await drawFlux({ prompt: "p", seed: 1, refs: [big] }, { fetch: c.f, base: "http://comfy.test" });
    const up = c.uploads[0];
    expect(up).toBeDefined();
    const meta = await sharp(up?.bytes).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([1024, 512, "png"]);
    expect(up?.bytes.byteLength).toBeLessThan(big.byteLength);
    const { createHash } = await import("node:crypto");
    expect(up?.name).toBe(`ref-${createHash("sha256").update(up?.bytes ?? new Uint8Array()).digest("hex").slice(0, 16)}.png`);
    const tall = await fitReference(await solid(800, 2000, "jpeg"));
    expect(await sharp(tall).metadata()).toMatchObject({ width: 410, height: 1024, format: "jpeg" });
  });

  it("at or under 1024 px goes up byte-identical", async () => {
    const small = await solid(1024, 700);
    const c = comfy();
    await drawFlux({ prompt: "p", seed: 1, refs: [small] }, { fetch: c.f, base: "http://comfy.test" });
    expect(Buffer.compare(c.uploads[0]?.bytes ?? new Uint8Array(), small)).toBe(0);
    expect(await fitReference(small)).toBe(small);
  });

  it("a byte string that is not an image is refused as before; a truncated PNG is left to the engine", async () => {
    const c = comfy();
    await expect(drawFlux({ prompt: "p", refs: [new Uint8Array([1, 2, 3])] }, { fetch: c.f })).rejects.toThrow("reference 1 is not a PNG, JPEG or WebP");
    expect(c.uploads).toEqual([]);
    expect(await fitReference(PNG)).toBe(PNG);
  });
});
