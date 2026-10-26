import { createHash } from "node:crypto";
import { readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { blobStore } from "../src/blob.ts";
import { must, scratch } from "./helpers.ts";

// An fs seam for the two paths no real disk produces on demand: an EPERM on the
// cleanup rm (a held temp on Windows) and a stat error that is not ENOENT.
const faults = vi.hoisted(() => ({ rename: false, rm: false, stat: false }));
vi.mock("node:fs/promises", async (orig) => {
  const real = await orig<typeof import("node:fs/promises")>();
  const fail = (code: string) => Object.assign(new Error(code), { code });
  return {
    ...real,
    rename: (...a: Parameters<typeof real.rename>) => (faults.rename ? Promise.reject(fail("EXDEV")) : real.rename(...a)),
    rm: (...a: Parameters<typeof real.rm>) => (faults.rm ? Promise.reject(fail("EPERM")) : real.rm(...a)),
    stat: (...a: Parameters<typeof real.stat>) => (faults.stat ? Promise.reject(fail("EACCES")) : real.stat(...a)),
  };
});

const tmp = scratch("blob");
afterAll(() => tmp.dispose());
let n = 0;
const fresh = () => blobStore(path.join(tmp.dir, `root-${++n}`));
const bytes = (s: string) => new TextEncoder().encode(s);

/** Every file under a directory, relative, including hidden temp files. */
function walk(dir: string, rel = ""): string[] {
  return readdirSync(path.join(dir, rel), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(dir, path.join(rel, e.name)) : [path.join(rel, e.name).split(path.sep).join("/")],
  );
}

describe("blob store", () => {
  it("addresses bytes by their sha256 under a two-digit fan-out directory", async () => {
    const b = fresh();
    const ref = must(await b.put(bytes("hello"), "text/plain"));
    const sha = createHash("sha256").update("hello").digest("hex");
    expect(ref).toEqual({ sha256: sha, bytes: 5, mime: "text/plain" });
    expect(walk(b.root)).toEqual([`${sha.slice(0, 2)}/${sha.slice(2)}`]);
    expect(new TextDecoder().decode(must(await b.read(ref)))).toBe("hello");
  });

  it("is idempotent: the same bytes give the same ref and are not rewritten", async () => {
    const b = fresh();
    const first = must(await b.put(bytes("same"), "image/png"));
    const file = must(b.pathOf(first));
    const before = statSync(file).mtimeMs;
    await new Promise((r) => setTimeout(r, 20));
    const second = must(await b.put(bytes("same"), "image/png"));
    expect(second).toEqual(first);
    expect(statSync(file).mtimeMs).toBe(before);
    expect(walk(b.root)).toHaveLength(1);
  });

  it("leaves no temp file behind, even when several writers race on the same bytes", async () => {
    const b = fresh();
    const refs = await Promise.all(Array.from({ length: 8 }, () => b.put(bytes("raced"), "text/plain")));
    expect(new Set(refs.map((r) => must(r).sha256)).size).toBe(1);
    expect(walk(b.root)).toHaveLength(1);
  });

  it("refuses to return damaged bytes", async () => {
    const b = fresh();
    const ref = must(await b.put(bytes("original"), "text/plain"));
    writeFileSync(must(b.pathOf(ref)), "tampered");
    const r = await b.read(ref);
    expect(!r.ok && r.error.code).toBe("internal");
  });

  it("put resolves to the write's error when the cleanup rm also fails", async () => {
    const b = fresh();
    faults.rename = faults.rm = true;
    try {
      const r = await b.put(bytes("doomed"), "text/plain");
      expect(!r.ok && r.error.code).toBe("unavailable");
    } finally {
      faults.rename = faults.rm = false;
    }
  });

  it("put and has resolve to a Result and a boolean when stat fails", async () => {
    const b = fresh();
    const ref = must(await b.put(bytes("held"), "text/plain"));
    faults.stat = true;
    try {
      expect(await b.has(ref)).toBe(false);
      const r = await b.put(bytes("held"), "text/plain");
      expect(!r.ok && r.error.code).toBe("unavailable");
    } finally {
      faults.stat = false;
    }
  });

  it("refuses a ref that is not a digest, rather than resolve a path from it", async () => {
    const b = fresh();
    const r = await b.read({ sha256: "../../etc/passwd", bytes: 1, mime: "text/plain" });
    expect(!r.ok && r.error.code).toBe("invalid");
  });

  it("refuses a mime the domain's BlobRef schema would refuse", async () => {
    const r = await fresh().put(bytes("x"), "Image/PNG; charset=binary");
    expect(!r.ok && r.error.code).toBe("invalid");
  });

  it("a missing blob is not-found", async () => {
    const b = fresh();
    const r = await b.read({ sha256: "a".repeat(64), bytes: 1, mime: "text/plain" });
    expect(!r.ok && r.error.code).toBe("not-found");
    expect(await b.has({ sha256: "a".repeat(64), bytes: 1, mime: "text/plain" })).toBe(false);
  });
});
