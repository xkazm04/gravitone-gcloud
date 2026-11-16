import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { notModified, serveFile } from "../../app/_server/serveFile.ts";

// Conditional GET on the one file server: a client that already holds the bytes revalidates
// for a 304, every door that serves through serveFile included.

const dir = mkdtempSync(path.join(tmpdir(), "gt-serve-cond-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const TEN = path.join(dir, "ten.bin");
writeFileSync(TEN, "0123456789");
const MTIME_S = 1_700_000_000;
utimesSync(TEN, MTIME_S, MTIME_S);

const get = (headers: Record<string, string> = {}, method = "GET") =>
  serveFile(new Request("http://127.0.0.1/api/f", { method, headers }), TEN, { mime: "image/png", cache: "no-cache" });

const firstTag = async (): Promise<string> => (await get()).headers.get("etag") ?? "";

describe("notModified", () => {
  const tag = '"a-1"';
  it.each([
    ['"a-1"', true],
    ['W/"a-1"', true],
    ['"zz", W/"a-1"', true],
    ['"zz","a-1"', true],
    ["*", true],
    [' * ', true],
    ['"a-2"', false],
    ["a-1", false],
    ["", false],
  ] as const)("If-None-Match %s", (h, want) => {
    expect(notModified(h, null, tag, 0)).toBe(want);
  });

  it("a weak tag on the server matches the client's strong spelling (weak comparison)", () => {
    expect(notModified('"a-1"', null, 'W/"a-1"', 0)).toBe(true);
  });

  it("If-Modified-Since is read only when If-None-Match is absent, at one-second grain", () => {
    const at = MTIME_S * 1000 + 700;
    const lm = new Date(MTIME_S * 1000).toUTCString();
    expect(notModified(null, lm, tag, at)).toBe(true);
    expect(notModified(null, new Date((MTIME_S + 60) * 1000).toUTCString(), tag, at)).toBe(true);
    expect(notModified(null, new Date((MTIME_S - 1) * 1000).toUTCString(), tag, at)).toBe(false);
    expect(notModified(null, "not a date", tag, at)).toBe(false);
    // A present If-None-Match that misses wins over a date that would hold.
    expect(notModified('"other"', lm, tag, at)).toBe(false);
    expect(notModified(null, null, tag, at)).toBe(false);
  });
});

describe("serveFile, conditionally", () => {
  it("If-None-Match that matches: 304, validators and cache policy, no body - GET and HEAD", async () => {
    const tag = await firstTag();
    for (const method of ["GET", "HEAD"]) {
      const r = await get({ "if-none-match": tag }, method);
      expect(r.status).toBe(304);
      expect(r.body).toBeNull();
      expect(r.headers.get("etag")).toBe(tag);
      expect(r.headers.get("cache-control")).toBe("no-cache");
      expect(r.headers.get("last-modified")).toBe(new Date(MTIME_S * 1000).toUTCString());
      expect(r.headers.get("content-length")).toBeNull();
    }
  });

  it("a weak spelling of the tag and `*` both hold", async () => {
    const tag = await firstTag();
    expect((await get({ "if-none-match": `W/${tag}` })).status).toBe(304);
    expect((await get({ "if-none-match": "*" })).status).toBe(304);
  });

  it("a mismatch is the whole file, 200", async () => {
    const r = await get({ "if-none-match": '"0-0"' });
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("0123456789");
  });

  it("If-Modified-Since alone: 304 when not newer, 200 when it is", async () => {
    const lm = (await get()).headers.get("last-modified") ?? "";
    expect((await get({ "if-modified-since": lm })).status).toBe(304);
    const before = await get({ "if-modified-since": new Date((MTIME_S - 3600) * 1000).toUTCString() });
    expect(before.status).toBe(200);
    expect(await before.text()).toBe("0123456789");
  });

  it("If-Modified-Since is ignored when If-None-Match is present and misses", async () => {
    const lm = (await get()).headers.get("last-modified") ?? "";
    const r = await get({ "if-none-match": '"0-0"', "if-modified-since": lm });
    expect(r.status).toBe(200);
  });

  it("a range with a failing conditional still ranges", async () => {
    const r = await get({ "if-none-match": '"0-0"', range: "bytes=2-5" });
    expect(r.status).toBe(206);
    expect(await r.text()).toBe("2345");
    expect(r.headers.get("content-range")).toBe("bytes 2-5/10");
  });

  it("a range with a holding conditional is a 304: revalidation comes before Range", async () => {
    const tag = await firstTag();
    const r = await get({ "if-none-match": tag, range: "bytes=2-5" });
    expect(r.status).toBe(304);
    expect(r.headers.get("content-range")).toBeNull();
  });
});
