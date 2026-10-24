// THE TWO SERVER READS THAT DRAW SIGNED LESSONS, AND WHAT EACH SAYS WHEN A STORE WILL NOT READ.
//   · the hunt's lesson part (app/(studio)/audio/_hunt/read.ts `readHunt`): an unreadable lesson
//     ledger is named, never read as "this hunt has no lesson" - which offered "Draft the lesson"
//     on a hunt that already carries one;
//   · the lessons section (app/(studio)/audio/_lessons/read.ts `readLessons`): an unreadable hunt
//     store is named, never a silent row of lessons whose hunts all lost their idea.
// The stores stand in through their readers; the kernel is a temp file.

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const gate = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-audio-lessons-read-"));
  process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
  process.env["SOUND_LEDGER_PATH"] = path.join(dir, "ledger.json");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  return { dir, ledgerFail: false, huntsFail: false };
});

const HUNT = { id: "hn-1", kind: "music", idea: "a drone that never resolves", createdAt: "2026-10-20T00:00:00.000Z", nodes: [], draftedBy: null, lessonId: "ls-1" };
const LESSON = {
  id: "ls-1",
  kind: "music",
  source: "hunt",
  provider: null,
  huntId: "hn-1",
  claim: "when a drone, brief no resolution, because the ear waits for one",
  technique: [],
  evidence: { n: 3, keepRate: 0.67, meanScore: null, takeIds: [] },
  confirmedAt: "2026-10-21T00:00:00.000Z",
};

vi.mock("../../lib/sound/store.ts", async (orig) => ({
  ...(await orig<object>()),
  readHunts: async () => {
    if (gate.huntsFail) throw new Error("hunts.json: Unexpected token");
    return { version: 1, hunts: [HUNT] };
  },
  readTakes: async () => ({ version: 1, takes: [] }),
  readLedger: async () => {
    if (gate.ledgerFail) throw new Error("ledger.json: Unexpected end of JSON input");
    return { verdicts: [], lessons: [LESSON] };
  },
}));

import { rmSync } from "node:fs";

import { readHunt } from "../../app/(studio)/audio/_hunt/read.ts";
import { readLessons } from "../../app/(studio)/audio/_lessons/read.ts";
import { closeKernel } from "../../lib/kernelStore.ts";

afterAll(() => {
  closeKernel();
  rmSync(gate.dir, { recursive: true, force: true });
});

describe("the hunt's lesson part", () => {
  it("draws the hunt's signed lesson", async () => {
    const v = await readHunt("music", "hn-1");
    expect(v.open?.ok && v.open.value.lesson?.id).toBe("ls-1");
    expect(v.lessonError).toBeNull();
  });

  it("an unreadable lesson ledger is named, not read as no lesson", async () => {
    gate.ledgerFail = true;
    const v = await readHunt("music", "hn-1");
    gate.ledgerFail = false;
    expect(v.open?.ok).toBe(true);
    expect(v.lessonError).toBe("lessons: ledger.json: Unexpected end of JSON input");
  });
});

describe("the lessons section", () => {
  it("each lesson names the hunt it came from", async () => {
    const v = await readLessons("music");
    expect(v.lessons.ok && v.lessons.value.map((l) => l.hunt)).toEqual([{ id: "hn-1", idea: "a drone that never resolves" }]);
    expect(v.hunts).toBeNull();
  });

  it("an unreadable hunt store is named; the lessons still read", async () => {
    gate.huntsFail = true;
    const v = await readLessons("music");
    gate.huntsFail = false;
    expect(v.lessons.ok && v.lessons.value.map((l) => l.id)).toEqual(["ls-1"]);
    expect(v.hunts).toBe("hunts: hunts.json: Unexpected token");
  });
});
