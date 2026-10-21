// composeMusic's fetch catch (lib/music/elevenlabs.ts): a vendor call that rejects with something
// that is not an Error - a bare string, an abort-like plain object - maps to a typed MusicError
// ("failed" / "timeout") and never escapes as a TypeError from reading `.name` or `.message`.

import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-elevenlabs-nonerror-"));
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  process.env["GRAVITONE_DRY_ONLY"] = "1";
  process.env["ELEVENLABS_API_KEY"] = "test-key-not-real";
  return dir;
});

import { rmSync } from "node:fs";

import { closeProcessKernel } from "@gt/kernel/process";

import { composeMusic } from "../lib/music/elevenlabs.ts";
import { MusicError } from "../lib/music/errors.ts";
import type { MusicPlan } from "../lib/music/types.ts";

const plan = {
  sections: [{ name: "intro", durationMs: 5_000, positiveStyles: ["ambient"], negativeStyles: [] }],
} as unknown as MusicPlan;

const rejectWith = (value: unknown) => vi.stubGlobal("fetch", () => Promise.reject(value));

const caught = async (): Promise<unknown> => {
  try {
    await composeMusic(plan);
  } catch (e) {
    return e;
  }
  throw new Error("composeMusic resolved; a rejecting fetch should have thrown");
};

afterEach(() => vi.unstubAllGlobals());
afterAll(() => {
  closeProcessKernel();
  rmSync(ROOT, { recursive: true, force: true });
});

describe("composeMusic with a non-Error fetch rejection", () => {
  it("maps a string rejection to MusicError kind failed", async () => {
    rejectWith("socket hang up");
    const e = await caught();
    expect(e).not.toBeInstanceOf(TypeError);
    expect(e).toBeInstanceOf(MusicError);
    expect((e as MusicError).kind).toBe("failed");
    expect((e as MusicError).message).toContain("socket hang up");
  });

  it("maps null and undefined rejections to MusicError kind failed", async () => {
    for (const v of [null, undefined]) {
      rejectWith(v);
      const e = await caught();
      expect(e).not.toBeInstanceOf(TypeError);
      expect((e as MusicError).kind).toBe("failed");
    }
  });

  it("maps an abort-like plain object to MusicError kind timeout", async () => {
    rejectWith({ name: "AbortError" });
    const e = await caught();
    expect(e).not.toBeInstanceOf(TypeError);
    expect(e).toBeInstanceOf(MusicError);
    expect((e as MusicError).kind).toBe("timeout");
  });
});
