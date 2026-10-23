import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { serveFile } from "../../app/_server/serveFile.ts";

// serveFile has no 304 path (If-None-Match is not read), so the answers it can give are
// 200, 206, 416 and HEAD; each carries nosniff, and the `ranges: false` spelling too.

const dir = mkdtempSync(path.join(tmpdir(), "gt-nosniff-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const FILE = path.join(dir, "ten.bin");
writeFileSync(FILE, "0123456789");

const serve = (headers: Record<string, string> = {}, method = "GET", ranges = true) =>
  serveFile(new Request("http://127.0.0.1/api/f", { method, headers }), FILE, { mime: "application/octet-stream", ranges });

describe("serveFile nosniff", () => {
  it.each([
    ["full", {}, "GET", true, 200],
    ["ranged", { range: "bytes=2-4" }, "GET", true, 206],
    ["unsatisfiable", { range: "bytes=50-60" }, "GET", true, 416],
    ["head", {}, "HEAD", true, 200],
    ["ranges off", { range: "bytes=2-4" }, "GET", false, 200],
  ] as const)("%s answer", async (_name, headers, method, ranges, status) => {
    const r = await serve({ ...headers }, method, ranges);
    expect(r.status).toBe(status);
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
