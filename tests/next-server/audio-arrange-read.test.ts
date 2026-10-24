// THE ARRANGE BOARD'S SERVER READ (app/(studio)/audio/_audio/arrangeRead.ts) over the real sound
// store in a temp dir: "each part fails on its own". A groups file that will not parse is the
// rows' line, and the kept takes still reach the board, which draws the rows the cards name
// (@gt/ui arrange.ts rowsFor: undeclared groups become orphan rows). Before the fix the two reads
// shared one try, so the groups file's error came back as `takes: …` and the board drew nothing.

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-arrange-read-"));
  process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
  process.env["SOUND_LEDGER_PATH"] = path.join(dir, "ledger.json");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  return dir;
});

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { readArrange } from "../../app/(studio)/audio/_audio/arrangeRead.ts";
import { closeKernel } from "../../lib/kernelStore.ts";

const SOUND = path.join(ROOT, "sound");

afterAll(() => {
  closeKernel();
  rmSync(ROOT, { recursive: true, force: true });
});

const kept = (id: string, group: string) => ({
  id,
  kind: "music",
  title: `Take ${id}`,
  provider: "suno",
  op: "manual",
  origin: "lab",
  technique: [],
  prompt: "",
  negative: null,
  terms: { genre: [], mood: [], instrument: [], sfxCategory: null },
  tempoBpm: null,
  key: null,
  durationS: 30,
  loop: null,
  file: null,
  peaks: null,
  measured: null,
  ratings: {},
  verdict: "kept",
  reasons: [],
  note: null,
  stage: "pending",
  group,
  label: null,
  parentId: null,
  createdAt: "2026-10-10T00:00:00.000Z",
  judgedAt: "2026-10-10T00:00:00.000Z",
  finalizedAt: null,
});

function seed(groupsFile: string): void {
  rmSync(SOUND, { recursive: true, force: true });
  mkdirSync(SOUND, { recursive: true });
  writeFileSync(path.join(SOUND, "takes.json"), JSON.stringify({ version: 1, takes: [kept("a", "drone"), kept("b", "ambient")] }));
  writeFileSync(path.join(SOUND, "groups.json"), groupsFile);
}

describe("readArrange", () => {
  it("reads the takes and the declared rows", async () => {
    seed(JSON.stringify({ version: 1, groups: { music: ["drone"], sfx: [] } }));
    const v = await readArrange("music");
    expect(v.takes.ok && v.takes.value.map((t) => t.id).sort()).toEqual(["a", "b"]);
    expect([v.groups, v.rows]).toEqual([["drone"], null]);
  });

  it("a groups file that will not read is the rows' line; the takes still reach the board", async () => {
    seed("{ not json");
    const v = await readArrange("music");
    expect(v.takes.ok && v.takes.value.map((t) => t.id).sort()).toEqual(["a", "b"]);
    expect(v.groups).toEqual([]);
    expect(v.rows).toContain("is not valid JSON");
  });
});
