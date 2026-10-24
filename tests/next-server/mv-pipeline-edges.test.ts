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

import { mkdtempSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import { closeProcessKernel } from "@gt/kernel/process";

import { resolveDir } from "../../lib/sound/mv/batch.ts";
import { importFolder } from "../../lib/sound/mv/importFolder.ts";
import { isLookId, MV_LOOK_IDS } from "../../lib/sound/mv/looks.ts";
import { writeMetadata } from "../../lib/sound/mv/metadata.ts";
import { treatmentInput, writeTreatment } from "../../lib/sound/mv/treatment.ts";
import type { MvAnalysis } from "../../lib/sound/mv/types.ts";
import type { TextRequest, TextResult } from "../../lib/text/types.ts";

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

const ANALYSIS: MvAnalysis = {
  durationS: 95,
  tempoBpm: [120, 60],
  energyShape: [0.2, 0.3, 0.5, 0.6, 0.8, 0.9, 0.7, 0.5, 0.3, 0.1],
  sections: [
    { startS: 0, label: "intro" },
    { startS: 20, label: "verse" },
    { startS: 50, label: "chorus" },
  ],
};

/** A text engine that answers each mv turn with a valid shape and keeps what it was asked. */
function fakeReason(asked: TextRequest[]) {
  return async (req: TextRequest): Promise<TextResult> => {
    asked.push(req);
    const json = req.turn === "mv-metadata"
      ? { title: "Porch Light · an ambient visualizer", description: "A slow track.", tags: ["ambient"] }
      : { prompt: "a dusk valley in matte paint", motion: { particleDensity: 0.5, particleHue: 200, pulseStrength: 0.5 }, rationale: "quiet" };
    return { text: JSON.stringify(json), json, provenance: { provider: "claude-cli" } as TextResult["provenance"] };
  };
}

describe("the text turns' prompt files", () => {
  it("are read from the checkout, whatever directory the process runs in", async () => {
    const home = process.cwd();
    const away = mkdtempSync(path.join(ROOT, "elsewhere-"));
    const asked: TextRequest[] = [];
    const input = treatmentInput("Porch Light", ANALYSIS);
    process.chdir(away);
    try {
      const t = await writeTreatment(input, { reason: fakeReason(asked) });
      const m = await writeMetadata(input, { rationale: t.rationale, reason: fakeReason(asked) });
      expect(t.prompt).toContain("dusk valley");
      expect(m.title.startsWith("Porch Light")).toBe(true);
    } finally {
      process.chdir(home);
    }
    expect(asked.map((r) => r.turn)).toEqual(["mv-treatment", "mv-metadata"]);
    // The prompt documents' own words reached the turns, not an empty template.
    for (const r of asked) expect(r.prompt).toContain("Porch Light");
  });
});

describe("an album folder spelled from home", () => {
  it("expands a leading ~ followed by this platform's own separator, in the plan and the import alike", async () => {
    const own = `~${path.sep}Music${path.sep}Misu`;
    expect(resolveDir(own)).toBe(path.join(homedir(), "Music", "Misu"));
    expect(resolveDir("~/Music")).toBe(path.join(homedir(), "Music"));
    expect(resolveDir("~")).toBe(homedir());
    // The import resolves the same spelling to the same folder: its refusal names it.
    await expect(importFolder(`~${path.sep}gt-no-such-album-${process.pid}`)).rejects.toThrow(path.join(homedir(), `gt-no-such-album-${process.pid}`));
  });
});
