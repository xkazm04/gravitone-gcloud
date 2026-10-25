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

import { promptFile } from "../../lib/sound/hunt.ts";
import { ensureDraftJob, sentenceStand } from "../../lib/sound/suno/draft.ts";
import { proposeFromSentence, proposeSuno, sentencePrompt, type ReasonFn, type SunoFacets } from "../../lib/sound/suno/propose.ts";

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

// A PREPARED SONG (spark scout-vision): a scout music seed's facets ride beside its sentence as the prompt file's
// `facets` section - layered style words (genre and era, mood, instruments, tempo in bpm) and the vocals fenced on
// both sides; no facets and the sentence turn's prompt is exactly the one it always was. No vendor: the turn is captured.
describe("suno sentence turn - a prepared song", () => {
  const SONG: SunoFacets = { genre: "neoclassical", subgenre: "chamber waltz", mood: "melancholic", instruments: ["nylon guitar", "cello"], tempo: 92, vocals: "instrumental" };
  // The prompt file is read as checked out (CRLF on a Windows clone): line ends are not what is asserted.
  const lf = (t: string): string => t.replace(/\r\n/g, "\n");

  it("without facets the prompt reads as it did before the slot existed", async () => {
    const sections = await promptFile("SUNO-PROPOSE-PROMPT.md");
    const before = { ...sections, sentence: (sections.sentence ?? "").replace("{{SENTENCE}}{{FACETS}}", "{{SENTENCE}}") };
    const now = sentencePrompt(sections, "A bed that holds a minute", LANE, ["x"]);
    expect(now).toBe(sentencePrompt(before, "A bed that holds a minute", LANE, ["x"]));
    expect(now).not.toContain("{{");
    expect(now).not.toContain("already prepared");
  });

  it("with facets: the layers in order, tempo in bpm, the vocals in style AND in exclude", async () => {
    const sections = await promptFile("SUNO-PROPOSE-PROMPT.md");
    const t = lf(sentencePrompt(sections, "A slow waltz for an empty ballroom", LANE, [], SONG));
    expect(t).toContain("A slow waltz for an empty ballroom\n\nThe song is already prepared.");
    expect(t).toContain("- genre and era: neoclassical, chamber waltz\n- mood: melancholic\n- instrumentation: nylon guitar, cello\n- tempo: 92 bpm");
    expect(t).toContain('put "instrumental" in `style`, "[Instrumental]" as `lyrics`, and "vocals, singing" in `exclude`');
    expect(t).not.toContain("{{");
    const sung = lf(sentencePrompt(sections, "A slow waltz", LANE, [], { ...SONG, vocals: "female" }));
    expect(sung).toContain('put "female vocals" in `style`, short lyrics for a female lead as `lyrics`, and "male vocals" in `exclude`');
  });

  it("a live draft sends them through the turn; a dry draft asks no turn and stands the sentence in, as before", async () => {
    const live = capture();
    await ensureDraftJob("sj-song-live", { kind: "sentence", text: "A slow waltz for an empty ballroom", facets: SONG }, { dry: false, now: 1, reason: live.reason });
    expect(lf(live.prompts[0] ?? "")).toContain("- tempo: 92 bpm");
    const dry = capture();
    const job = await ensureDraftJob("sj-song-dry", { kind: "sentence", text: "A slow waltz for an empty ballroom", facets: SONG }, { dry: true, now: 1, reason: dry.reason });
    expect(dry.prompts).toEqual([]);
    expect(job.fields).toEqual(sentenceStand("A slow waltz for an empty ballroom"));
  });
});
