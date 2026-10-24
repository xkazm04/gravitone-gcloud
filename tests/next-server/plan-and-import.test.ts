// THE PLAN, THE RECEIPT AND THE IMPORT, THEIR REQUEST POSTURE. These are client islands and the
// Node lane has no DOM to press them in, so what is held here is (a) the pure waits and gates the
// islands go through, driven directly, and (b) a comment-stripped source ratchet that each island
// actually goes through them.
//
// A Server Action whose round trip fails REJECTS rather than answering `ok: false`; an island
// that only awaits it without a settle leaves the busy flag it raised up until a reload.

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { settledOutcome } from "../../app/(studio)/projects/_plan/receipt.tsx";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const PROJECTS = path.join(ROOT, "app", "(studio)", "projects");
// Full-line comments only: these islands' prose is all `//` lines and block headers.
const code = (rel: string): string =>
  readFileSync(path.join(PROJECTS, rel), "utf8")
    .split(/\r?\n/)
    .filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l))
    .join("\n");

describe("the receipt flow - every await settles", () => {
  it("a confirm's answer is its answer", async () => {
    expect(await settledOutcome(Promise.resolve({ kind: "done" as const, note: "launched" }))).toEqual({ kind: "done", note: "launched" });
  });

  it("a confirm whose round trip rejects is an error with its words, never a rejection", async () => {
    const r = await settledOutcome(Promise.reject(new Error("Failed to fetch"))).catch((e: unknown) => ({ rejected: String(e) }));
    expect(r).toEqual({ kind: "error", message: "the studio did not answer: Failed to fetch" });
  });

  it("useReceipt's two reads and its confirm go through a settle", () => {
    const src = code("_plan/receipt.tsx");
    expect(src.length).toBeGreaterThan(1000);
    expect(src.match(/await (st\.)?spec\.(read|confirm)\(/g) ?? []).toEqual([]);
    expect(src.match(/await settled\((st\.)?spec\.read\(/g) ?? []).toHaveLength(2);
    expect(src.match(/await settledOutcome\(st\.spec\.confirm\(/g) ?? []).toHaveLength(1);
  });
});
