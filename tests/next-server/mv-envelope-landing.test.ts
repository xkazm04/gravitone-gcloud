// THE ENVELOPE LANDS LIKE EVERY OTHER MV FILE (lib/sound/mv/render.ts writeAtomically): a rename Windows refuses for
// a moment (EPERM while a reader holds envelope.json) is retried, two writers of one target never share a
// staging file, and a failed write leaves no staged file behind.

import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const fsx = vi.hoisted(() => ({ renameFails: 0, renames: 0 }));
vi.mock("node:fs/promises", async (orig) => {
  const actual = await orig<typeof import("node:fs/promises")>();
  return {
    ...actual,
    rename: async (from: string, to: string) => {
      fsx.renames++;
      // Both writers' staged files exist before either rename runs, and the renames run one after the other.
      await new Promise((r) => setTimeout(r, 15 * fsx.renames));
      if (fsx.renameFails > 0) {
        fsx.renameFails--;
        throw Object.assign(new Error("EPERM: operation not permitted, rename"), { code: "EPERM" });
      }
      return actual.rename(from, to);
    },
  };
});
// The headless machinery is not under test; the module only needs to load.
vi.mock("@/lib/export/headless", () => ({ ExportError: class extends Error {}, assertCanSpawn: () => undefined, cleanUpExport: async () => undefined, landExport: async () => undefined, launchHeadless: async () => undefined, makeWorkDir: async () => "", partialPath: () => "", run: async () => undefined }));
vi.mock("@/lib/musicVideoExport", () => ({ bakeEnvelopeInPage: async () => undefined, captureFrameSequence: async () => undefined, muxFrameSequence: async () => undefined, setUpRenderPage: async () => undefined }));

const { writeAtomically } = await import("../../lib/sound/mv/render.ts");

const dir = mkdtempSync(path.join(os.tmpdir(), "gt-mv-envelope-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
beforeEach(() => {
  fsx.renameFails = 0;
  fsx.renames = 0;
});

describe("writeAtomically", () => {
  it("retries a rename the OS refuses once, and lands the file whole", async () => {
    const target = path.join(dir, "a", "envelope.json");
    fsx.renameFails = 1;
    await writeAtomically(target, '{"fps":30}');
    expect(readFileSync(target, "utf8")).toBe('{"fps":30}');
    expect(fsx.renames).toBe(2);
    expect(readdirSync(path.join(dir, "a"))).toEqual(["envelope.json"]);
  });

  it("two concurrent writers of one target leave one whole file and no staging litter", async () => {
    const target = path.join(dir, "b", "envelope.json");
    await Promise.all([writeAtomically(target, "x".repeat(4096)), writeAtomically(target, "y".repeat(4096))]);
    const body = readFileSync(target, "utf8");
    expect(body === "x".repeat(4096) || body === "y".repeat(4096)).toBe(true);
    expect(readdirSync(path.join(dir, "b"))).toEqual(["envelope.json"]);
  });

  it("a rename that never clears throws and removes its staged file", async () => {
    const target = path.join(dir, "c", "envelope.json");
    fsx.renameFails = 1000;
    await expect(writeAtomically(target, "z")).rejects.toThrow(/EPERM/);
    expect(readdirSync(path.join(dir, "c"))).toEqual([]);
  }, 20_000);
});
