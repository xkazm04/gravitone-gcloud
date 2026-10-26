// A STAGED FILE DOES NOT OUTLIVE ITS OWN FAILED WRITE (lib/sound/mv steps.ts still, fetchAudio.ts take and clip):
// the write puts half the bytes down and throws ENOSPC; nothing named `*.partial.*` may be left in mv/<id>/.

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-mv-staged-"));
  process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
  process.env["SOUND_LEDGER_PATH"] = path.join(dir, "ledger.json");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  process.env["GRAVITONE_DRY_ONLY"] = "1";
  return dir;
});

// Half a file lands, then the disk is full.
vi.mock("node:fs/promises", async (orig) => {
  const actual = await orig<typeof import("node:fs/promises")>();
  const full = (): never => {
    throw Object.assign(new Error("ENOSPC: no space left on device, write"), { code: "ENOSPC" });
  };
  return {
    ...actual,
    writeFile: async (file: string, data: unknown, ...rest: unknown[]) => {
      if (String(file).includes(".partial.")) {
        await actual.writeFile(file, "half");
        return full();
      }
      return (actual.writeFile as (...a: unknown[]) => Promise<void>)(file, data, ...rest);
    },
    copyFile: async (from: string, to: string, ...rest: unknown[]) => {
      if (String(to).includes(".partial.")) {
        await actual.writeFile(to, "half");
        return full();
      }
      return (actual.copyFile as (...a: unknown[]) => Promise<void>)(from, to, ...rest);
    },
  };
});
vi.mock("../../lib/sound/takes.ts", () => ({ getTake: async () => ({ file: { path: "takes/t.mp3" } }) }));
vi.mock("../../lib/sound/suno/store.ts", () => ({ readSuno: async () => ({ clips: [{ id: "c1", title: "Clip", audioUrl: "https://cdn.example/c1.mp3" }] }) }));

import { readdirSync } from "node:fs";

import { fetchAudio } from "../../lib/sound/mv/fetchAudio.ts";
import { runStep } from "../../lib/sound/mv/steps.ts";
import { filePathAbs } from "../../lib/sound/store.ts";
import { jobDirRel } from "../../lib/sound/mv/store.ts";

afterAll(() => {
  const fs = process.getBuiltinModule("node:fs");
  fs.rmSync(ROOT, { recursive: true, force: true });
});

const litter = (id: string): string[] => readdirSync(filePathAbs(jobDirRel(id))).filter((n) => n.includes(".partial."));

describe("a failed write leaves no staged file", () => {
  it("the still step", async () => {
    const job = { id: "job-still", treatment: { prompt: "p", motion: {} }, files: {}, source: { kind: "take", id: "t", title: "T" } };
    const eng = { still: async () => ({ bytes: new Uint8Array([1, 2, 3]), mime: "image/png" }) };
    await expect(runStep("still", job as never, eng as never)).rejects.toThrow(/ENOSPC/);
    expect(litter("job-still")).toEqual([]);
  });

  it("a take's audio copy", async () => {
    await expect(fetchAudio("job-take", { kind: "take", id: "t", title: "T" } as never, async () => new Uint8Array())).rejects.toThrow(/ENOSPC/);
    expect(litter("job-take")).toEqual([]);
  });

  it("a Suno clip's audio download", async () => {
    await expect(fetchAudio("job-clip", { kind: "suno", id: "c1", title: "Clip" } as never, async () => new Uint8Array([1, 2, 3]))).rejects.toThrow(/ENOSPC/);
    expect(litter("job-clip")).toEqual([]);
  });
});
