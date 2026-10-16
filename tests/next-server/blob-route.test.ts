// GET /api/blob/<sha> (L39): the kernel's content-addressed blobs served by their address,
// through the one ranged file server - a Range is honoured, a caller with no credential is
// refused before anything is read, a malformed address is refused, and a blob can never be served
// as a page on this origin (only media types are served as themselves; the rest is an octet
// stream with nosniff).

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-blob-route-"));
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  process.env["IMAGING_ACCESS_SECRET"] = "blob-route-secret";
  delete process.env["NEXT_PUBLIC_DEV_AUTH"];
  return dir;
});

import { rmSync } from "node:fs";

import { blobStore } from "@gt/kernel/blob";
import { closeProcessKernel } from "@gt/kernel/process";

import { GET, HEAD } from "../../app/api/blob/[sha]/route.ts";
import { kernel } from "../../lib/kernelStore.ts";
import { blobRootOf } from "../../lib/parts/gates.ts";

afterAll(() => {
  closeProcessKernel();
  rmSync(ROOT, { recursive: true, force: true });
});

let ip = 0;
const call = (handler: typeof GET, sha: string, opts: { type?: string; range?: string; auth?: boolean } = {}) => {
  const q = opts.type === undefined ? "" : `?type=${encodeURIComponent(opts.type)}`;
  const headers: Record<string, string> = {
    "x-forwarded-for": `10.39.${++ip}.1`,
    ...(opts.auth === false ? {} : { authorization: "Bearer blob-route-secret" }),
    ...(opts.range === undefined ? {} : { range: opts.range }),
  };
  return handler(new Request(`http://localhost/api/blob/${sha}${q}`, { headers }), { params: Promise.resolve({ sha }) });
};

async function put(bytes: Uint8Array, mime: string) {
  const k = kernel();
  if (!k.ok) throw k.error;
  const r = await blobStore(blobRootOf(k.value.store)).put(bytes, mime);
  if (!r.ok) throw r.error;
  return r.value;
}

describe("the blob route", () => {
  it("serves a plate by its address, whole and by range, immutable", async () => {
    const ref = await put(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2]), "image/png");
    const whole = await call(GET, ref.sha256, { type: "image/png" });
    expect(whole.status).toBe(200);
    expect(whole.headers.get("content-type")).toBe("image/png");
    expect(whole.headers.get("cache-control")).toContain("immutable");
    expect(whole.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await whole.arrayBuffer())).toEqual(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2]));
    const part = await call(GET, ref.sha256, { type: "image/png", range: "bytes=8-" });
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe("bytes 8-9/10");
    expect(new Uint8Array(await part.arrayBuffer())).toEqual(new Uint8Array([1, 2]));
    const head = await call(HEAD, ref.sha256, { type: "image/png" });
    expect(head.status).toBe(200);
  });

  it("never serves a blob as a page: a non-media type answers as an octet stream", async () => {
    const ref = await put(new TextEncoder().encode("<script>alert(1)</script>"), "text/html");
    const r = await call(GET, ref.sha256, { type: "text/html" });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/octet-stream");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("refuses a caller with no credential, a malformed address, and answers an unknown blob not-found", async () => {
    const ref = await put(new Uint8Array([1]), "image/png");
    expect((await call(GET, ref.sha256, { auth: false })).status).toBe(401);
    expect((await call(GET, "../../etc/passwd")).status).toBe(400);
    expect((await call(GET, "A".repeat(64))).status).toBe(400);
    expect((await call(GET, "b".repeat(64))).status).toBe(404);
  });
});
