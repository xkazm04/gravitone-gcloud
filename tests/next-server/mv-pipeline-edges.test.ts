// THE MUSIC-VIDEO PIPELINE'S EDGES (lib/sound/mv) - the rules a folder, a look
// name, a prompt file or a clip URL reach the pipeline through, each pinned on
// the input that broke it. A temp sound store and a temp kernel store; no
// browser, no ffmpeg, no model, no vendor, no credits.

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-mv-edges-"));
  process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
  process.env["SOUND_LEDGER_PATH"] = path.join(dir, "ledger.json");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  process.env["GRAVITONE_DRY_ONLY"] = "1";
  return dir;
});

import { rmSync } from "node:fs";

import { closeProcessKernel } from "@gt/kernel/process";

import { isLookId, MV_LOOK_IDS } from "../../lib/sound/mv/looks.ts";

afterAll(() => {
  closeProcessKernel();
  rmSync(ROOT, { recursive: true, force: true });
});

describe("a look's name", () => {
  it("is one of the looks, and never a name every object answers to", () => {
    for (const id of MV_LOOK_IDS) expect(isLookId(id)).toBe(true);
    // mv-album.json's "look" and the CLI's --look are read through this guard;
    // MV_LOOKS[name] and MV_LOOK_NOTES[name] are then used as a look and a sentence.
    const inherited = Object.getOwnPropertyNames(Object.prototype);
    expect(inherited.filter((n) => isLookId(n))).toEqual([]);
    expect(isLookId("garage-blue")).toBe(false);
    expect(isLookId(undefined)).toBe(false);
  });
});
