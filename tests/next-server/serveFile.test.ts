import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { etagOf, parseRange, serveFile } from "../../app/_server/serveFile.ts";

// Every edge case v1's four range copies handled, and the ones none did.

const dir = mkdtempSync(path.join(tmpdir(), "gt-serve-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const TEN = path.join(dir, "ten.bin");
writeFileSync(TEN, "0123456789");
const EMPTY = path.join(dir, "empty.bin");
writeFileSync(EMPTY, "");
const BIG = path.join(dir, "big.bin");
const bigBytes = new Uint8Array(200 * 1024).map((_, i) => i % 251);
writeFileSync(BIG, bigBytes);

const get = (file: string, headers: Record<string, string> = {}, method = "GET") =>
  serveFile(new Request("http://127.0.0.1/api/f", { method, headers }), file, { mime: "video/mp4" });

describe("parseRange", () => {
  it.each([
    ["bytes=0-3", 10, { kind: "part", start: 0, end: 3 }],
    ["bytes=4-", 10, { kind: "part", start: 4, end: 9 }],
    ["bytes=-3", 10, { kind: "part", start: 7, end: 9 }],
    ["bytes=-30", 10, { kind: "part", start: 0, end: 9 }],
    ["bytes=5-99", 10, { kind: "part", start: 5, end: 9 }],
    ["bytes=2-3, 6-7", 10, { kind: "part", start: 2, end: 3 }],
    ["bytes=10-", 10, { kind: "unsatisfiable" }],
    ["bytes=-0", 10, { kind: "unsatisfiable" }],
    ["bytes=0-0", 0, { kind: "unsatisfiable" }],
    ["bytes=-5", 0, { kind: "unsatisfiable" }],
    ["bytes=-", 10, { kind: "whole" }],
    ["bytes=5-2", 10, { kind: "whole" }],
    ["items=0-3", 10, { kind: "whole" }],
    ["bytes=a-b", 10, { kind: "whole" }],
  ] as const)("%s over %i bytes", (h, size, want) => {
    expect(parseRange(h, size)).toEqual(want);
  });
  it("no header is the whole file", () => expect(parseRange(null, 10)).toEqual({ kind: "whole" }));
});

describe("serveFile", () => {
  it("serves the whole file with its validators and Accept-Ranges", async () => {
    const r = await get(TEN);
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("0123456789");
    expect(r.headers.get("content-length")).toBe("10");
    expect(r.headers.get("accept-ranges")).toBe("bytes");
    expect(r.headers.get("etag")).toMatch(/^"[0-9a-f]+-[0-9a-f]+"$/);
    expect(r.headers.get("cache-control")).toBe("private, max-age=3600");
  });

  it("answers a range with 206, the bytes, and a Content-Range", async () => {
    const r = await get(TEN, { range: "bytes=2-5" });
    expect(r.status).toBe(206);
    expect(await r.text()).toBe("2345");
    expect(r.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(r.headers.get("content-length")).toBe("4");
    const suffix = await get(TEN, { range: "bytes=-2" });
    expect(await suffix.text()).toBe("89");
  });

  it("answers an unsatisfiable range 416 with bytes */size, an empty file included", async () => {
    const past = await get(TEN, { range: "bytes=10-" });
    expect(past.status).toBe(416);
    expect(past.headers.get("content-range")).toBe("bytes */10");
    const empty = await get(EMPTY, { range: "bytes=0-" });
    expect(empty.status).toBe(416);
    expect(empty.headers.get("content-range")).toBe("bytes */0");
    const whole = await get(EMPTY);
    expect(whole.status).toBe(200);
    expect(await whole.text()).toBe("");
  });

  it("ignores a malformed Range and serves the whole file", async () => {
    const r = await get(TEN, { range: "bytes=-" });
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("0123456789");
  });

  it("If-Range: a range against a changed file gets the new file whole", async () => {
    const first = await get(TEN);
    const tag = first.headers.get("etag") ?? "";
    const held = await get(TEN, { range: "bytes=0-1", "if-range": tag });
    expect(held.status).toBe(206);
    const stale = await get(TEN, { range: "bytes=0-1", "if-range": '"0-0"' });
    expect(stale.status).toBe(200);
    expect(await stale.text()).toBe("0123456789");
    const byDate = await get(TEN, { range: "bytes=0-1", "if-range": first.headers.get("last-modified") ?? "" });
    expect(byDate.status).toBe(206);
  });

  it("the ETag moves when the file changes", async () => {
    const f = path.join(dir, "moving.bin");
    writeFileSync(f, "aaaa");
    utimesSync(f, 1_700_000_000, 1_700_000_000);
    const a = (await get(f)).headers.get("etag");
    writeFileSync(f, "aaaa");
    utimesSync(f, 1_700_000_100, 1_700_000_100);
    expect((await get(f)).headers.get("etag")).not.toBe(a);
    expect(etagOf(4, 1_700_000_000_000)).not.toBe(etagOf(5, 1_700_000_000_000));
  });

  it("streams a large range in chunks rather than one buffer", async () => {
    const r = await get(BIG, { range: "bytes=1000-" });
    expect(r.status).toBe(206);
    const reader = r.body?.getReader();
    let chunks = 0;
    let total = 0;
    let sum = 0;
    for (;;) {
      const next = await reader?.read();
      if (next === undefined || next.done) break;
      chunks++;
      total += next.value.byteLength;
      for (const b of next.value) sum += b;
    }
    expect(total).toBe(bigBytes.length - 1000);
    expect(chunks).toBeGreaterThan(1);
    expect(sum).toBe(bigBytes.subarray(1000).reduce((a, b) => a + b, 0));
  });

  it("HEAD answers the headers and no body", async () => {
    const r = await get(TEN, { range: "bytes=0-1" }, "HEAD");
    expect(r.status).toBe(206);
    expect(r.headers.get("content-length")).toBe("2");
    expect(r.body).toBeNull();
  });

  it("a missing file is not-found, and the path stays on the server", async () => {
    const r = await get(path.join(dir, "nope.bin"));
    expect(r.status).toBe(404);
    const body = await r.text();
    expect(body).toContain('"code":"not-found"');
    expect(body).not.toContain(dir.replace(/\\/g, "\\\\"));
    expect(body).not.toContain("nope.bin");
    expect((await get(dir)).status).toBe(404);
  });
});
