// THE FOUNDRY READ CACHE (lib/foundry/runStore.ts readJson): a run's JSON is read from disk again
// only when the file's own stat moved, so the Floor's and Runs' refreshes stop re-reading every
// manifest. What it must never do is serve a file as it was: these cases rewrite a file IN PLACE
// (a directory's mtime does not move for that) and read it back, and hold the cache to its bounds.
import { mkdirSync, mkdtempSync, openSync, writeSync, closeSync, ftruncateSync, utimesSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import { READ_CACHE_ENTRIES, clearReadCache, readCacheStats, readJson, writeJsonAtomic } from "../../lib/foundry/runStore.ts";

const HOUR_AGO = (): Date => new Date(Date.now() - 3_600_000);
const settle = (file: string, at: Date = HOUR_AGO()): void => utimesSync(file, at, at);

/** Rewrite a file's bytes in place: same inode, no rename. */
function rewriteInPlace(file: string, text: string): void {
  const fd = openSync(file, "r+");
  try {
    ftruncateSync(fd, 0);
    writeSync(fd, text, 0, "utf8");
  } finally {
    closeSync(fd);
  }
}

const tempRoot = (): string => mkdtempSync(path.join(tmpdir(), "gt-read-cache-"));

beforeEach(() => clearReadCache());

describe("the foundry read cache", () => {
  it("serves a settled file from cache, and a fresh object each time", async () => {
    const file = path.join(tempRoot(), "run.json");
    writeFileSync(file, JSON.stringify({ id: "a", n: 1 }));
    settle(file);
    const first = await readJson<{ id: string; n: number }>(file);
    const second = await readJson<{ id: string; n: number }>(file);
    expect(second).toEqual({ id: "a", n: 1 });
    expect(readCacheStats().hits).toBe(1);
    // A caller that mutates its copy cannot reach the next reader's.
    expect(second).not.toBe(first);
    if (second !== null) second.n = 99;
    expect(await readJson(file)).toEqual({ id: "a", n: 1 });
  });

  it("an in-place rewrite with a different size is read fresh, mtime pinned to the same second", async () => {
    const file = path.join(tempRoot(), "run.json");
    writeFileSync(file, JSON.stringify({ status: "running" }));
    const at = HOUR_AGO();
    settle(file, at);
    expect(await readJson(file)).toEqual({ status: "running" });
    expect(readCacheStats().entries).toBe(1);
    rewriteInPlace(file, JSON.stringify({ status: "done", kept: 3 }));
    // The worst case a coarse clock allows: the rewrite carries the very mtime the cache saw.
    settle(file, at);
    expect(statSync(file).mtimeMs).toBe(at.getTime());
    expect(await readJson(file)).toEqual({ status: "done", kept: 3 });
  });

  it("an in-place rewrite with the SAME size and the same mtime is still read fresh (ctime moves)", async () => {
    const file = path.join(tempRoot(), "verdicts.json");
    writeFileSync(file, JSON.stringify({ c1: "keep" }));
    const at = HOUR_AGO();
    settle(file, at);
    expect(await readJson(file)).toEqual({ c1: "keep" });
    // ctime is the kernel's clock and has a tick of its own; wait past one so the rewrite moves it.
    await new Promise((r) => setTimeout(r, 20));
    rewriteInPlace(file, JSON.stringify({ c1: "cut!" }));
    settle(file, at);
    expect(await readJson(file)).toEqual({ c1: "cut!" });
  });

  it("a file written moments ago is not kept: the racy window reads the disk until it settles", async () => {
    const file = path.join(tempRoot(), "run.json");
    writeFileSync(file, JSON.stringify({ v: 1 }));
    expect(await readJson(file)).toEqual({ v: 1 });
    expect(readCacheStats().entries).toBe(0);
    rewriteInPlace(file, JSON.stringify({ v: 2 }));
    expect(await readJson(file)).toEqual({ v: 2 });
  });

  it("an atomic replace (writeJsonAtomic) is read fresh, and a deleted file is the fallback", async () => {
    const file = path.join(tempRoot(), "run.json");
    writeFileSync(file, JSON.stringify({ v: 1 }));
    settle(file);
    expect(await readJson(file)).toEqual({ v: 1 });
    await writeJsonAtomic(file, { v: 1 });
    settle(file);
    expect(await readJson(file)).toEqual({ v: 1 });
    expect(readCacheStats().hits).toBe(0);
    const { rmSync } = await import("node:fs");
    rmSync(file);
    expect(await readJson(file, { gone: true })).toEqual({ gone: true });
    expect(readCacheStats().entries).toBe(0);
  });

  it("two store roots with the same layout never share an entry", async () => {
    const a = tempRoot();
    const b = tempRoot();
    for (const [root, id] of [[a, "from-a"], [b, "from-b"]] as const) {
      mkdirSync(path.join(root, "runs", "r1"), { recursive: true });
      const f = path.join(root, "runs", "r1", "run.json");
      writeFileSync(f, JSON.stringify({ id }));
      settle(f);
    }
    expect(await readJson(path.join(a, "runs", "r1", "run.json"))).toEqual({ id: "from-a" });
    expect(await readJson(path.join(b, "runs", "r1", "run.json"))).toEqual({ id: "from-b" });
    expect(await readJson(path.join(a, "runs", "r1", "run.json"))).toEqual({ id: "from-a" });
    expect(readCacheStats().entries).toBe(2);
  });

  it("does not grow past its entry cap; the coldest file goes first", async () => {
    const root = tempRoot();
    const over = READ_CACHE_ENTRIES + 25;
    const files: string[] = [];
    for (let i = 0; i < over; i++) {
      const f = path.join(root, `f${i}.json`);
      writeFileSync(f, `{"i":${i}}`);
      settle(f);
      files.push(f);
    }
    for (const f of files) await readJson(f);
    const s = readCacheStats();
    expect(s.entries).toBe(READ_CACHE_ENTRIES);
    expect(s.keys).not.toContain(path.resolve(files[0] ?? ""));
    expect(s.keys).toContain(path.resolve(files.at(-1) ?? ""));
  }, 60_000);
});
