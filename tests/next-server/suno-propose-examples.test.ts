// A Floor sentence's Suno prompt and a lane draft read ONE examples rule: the lane's proposals,
// newest first, then the lane's job styles. A job keeps its own snapshot of fields and outlives
// a deleted proposal, so a lane whose rendered prompts were cleared from Proposed still shows
// them to both turns.

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-suno-examples-"));
  process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
  fs.mkdirSync(process.env["SOUND_STORE_DIR"], { recursive: true });
  fs.writeFileSync(
    path.join(process.env["SOUND_STORE_DIR"], "suno.json"),
    JSON.stringify({
      version: 1,
      queue: { running: false },
      proposals: [],
      jobs: [
        {
          id: "sj-1",
          proposalId: "sp-gone",
          fields: { style: "rendered-then-cleared dub techno" },
          lane: { axis: "mood", value: "calm" },
          state: "done",
          models: [],
          enqueuedAt: 1,
          clipIds: [],
        },
      ],
      clips: [],
    }),
  );
  return dir;
});

import { rmSync } from "node:fs";

import { proposeFromSentence, proposeSuno, type ReasonFn } from "../../lib/sound/suno/propose.ts";

afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

const LANE = { axis: "mood", value: "calm" } as never;

function capture(): { reason: ReasonFn; prompts: string[] } {
  const prompts: string[] = [];
  const reason: ReasonFn = async (req) => {
    prompts.push(req.prompt);
    return { json: { proposals: [{ style: "x", title: "t" }] } } as never;
  };
  return { reason, prompts };
}

describe("suno examples", () => {
  it("a sentence turn and a lane draft both show a lane job whose proposal is gone", async () => {
    const lane = capture();
    await proposeSuno({ lane: LANE, count: 1 }, lane.reason);
    const sentence = capture();
    await proposeFromSentence("A bed that holds a minute", LANE, sentence.reason);
    expect(lane.prompts[0]).toContain("rendered-then-cleared dub techno");
    expect(sentence.prompts[0]).toContain("rendered-then-cleared dub techno");
  });
});
