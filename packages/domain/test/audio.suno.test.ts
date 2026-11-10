import { describe, expect, it } from "vitest";

import { foldTaste, parseStudioListen, parseSunoRead, parseTasteEvent, SUNO_ANSWER_MAX, sunoAnswerFields, tasteEventKey, type TasteEventData } from "../src/audio.suno.schema.ts";

const listen = {
  model: "gemini-3.8-flash", at: "2026-10-29T10:00:00Z", genre: ["synthwave"], mood: ["nocturnal"], bpm: 96, key: "F minor",
  vocals: { heard: true, character: "breathy low male" },
  instruments: [{ name: "analog bass synth", role: "groove", prominence: "lead" }],
  sections: [{ name: "intro", startS: 0, endS: 12.5, says: "pads and a filtered kick" }],
};

describe("the listener's read", () => {
  it("passes a whole read and refuses one with a bad row", () => {
    expect(parseStudioListen(listen).ok).toBe(true);
    expect(parseStudioListen({ ...listen, instruments: [{ name: "bass", role: "groove", prominence: "loud" }] }).ok).toBe(false);
    expect(parseStudioListen({ ...listen, vocals: undefined }).ok).toBe(false);
  });
});

describe("the taste profile", () => {
  const ev = (at: string, data: TasteEventData) => ({ at, data });

  it("folds keeps and drops: the last press per line wins, case and spacing do not split a line", () => {
    const lines = foldTaste([
      ev("2026-10-29T10:00:00Z", { line: "Dry male vocals", lean: "like", op: "keep" }),
      ev("2026-10-29T10:01:00Z", { line: "trap hats", lean: "dislike", op: "keep" }),
      ev("2026-10-29T10:02:00Z", { line: "dry  male vocals", lean: "like", op: "drop" }),
      ev("2026-10-29T10:03:00Z", { line: "dry male vocals", lean: "like", op: "keep" }),
    ]);
    expect(lines).toEqual([
      { line: "trap hats", lean: "dislike", since: "2026-10-29T10:01:00Z" },
      { line: "dry male vocals", lean: "like", since: "2026-10-29T10:03:00Z" },
    ]);
  });

  it("reads an event through its door and keys it without a dot", () => {
    expect(parseTasteEvent({ line: "trap hats", lean: "dislike", op: "keep", session: "night-drive" }).ok).toBe(true);
    expect(parseTasteEvent({ line: "", lean: "dislike", op: "keep" }).ok).toBe(false);
    const key = tasteEventKey("keep", "Trap  Hats!", "2026-10-29T10:01:00.000Z");
    expect(key).toBe("audio-taste:keep-trap-hats--20261029100100000");
    expect(key.split(":")[0]).not.toContain(".");
  });
});

describe("Suno's own read", () => {
  const read = {
    at: "2026-11-10T09:00:00Z", status: "complete", bpm: 99.9, key: "B minor", timeSignature: 4,
    sections: [{ label: "A", startS: 0, endS: 18.2 }, { label: "B", startS: 18.2, endS: 44 }],
    terms: ["song", "female vocals", "piano"], labels: [{ label: "genre:electronic", p: 0.93 }],
    answer: "Progressive house music.", genre: ["progressive house"], words: 0,
  };
  const block = (json: string, prose = "Progressive house."): string => `${prose}\n\`\`\`json\n${json}\n\`\`\``;

  it("holds a complete read, and one still processing with nothing in it", () => {
    expect(parseSunoRead(read).ok).toBe(true);
    expect(parseSunoRead({ at: read.at, status: "processing", sections: [], terms: [], labels: [], listenId: "ls-1" }).ok).toBe(true);
  });

  it("refuses a status it does not know, a probability past 1 and an answer past its cap", () => {
    expect(parseSunoRead({ ...read, status: "done" }).ok).toBe(false);
    expect(parseSunoRead({ ...read, labels: [{ label: "genre:x", p: 1.2 }] }).ok).toBe(false);
    expect(parseSunoRead({ ...read, answer: "x".repeat(SUNO_ANSWER_MAX + 1) }).ok).toBe(false);
  });

  it("reads the answer's trailing json block into its fields", () => {
    const answer = block('{"genre": ["progressive house", "electronic"], "mood": "driving, bright", "bpm": 99.9, "key": "B minor", "vocals": {"heard": true, "character": "airy female"}, "sections": [{"name": "intro", "start_s": 0}]}');
    expect(sunoAnswerFields(answer)).toEqual({ genre: ["progressive house", "electronic"], mood: ["driving", "bright"], bpm: 99.9, key: "B minor", vocals: { heard: true, character: "airy female" } });
    expect(sunoAnswerFields('An instrumental. {"vocals": false, "bpm": 120}')).toEqual({ bpm: 120, vocals: { heard: false } });
  });

  it("a missing, garbled or wrong-shaped block is no fields, and a bad field is that field absent", () => {
    expect(sunoAnswerFields("Progressive house music.")).toEqual({});
    expect(sunoAnswerFields(block('{"bpm": 99.9,'))).toEqual({});
    expect(sunoAnswerFields(block("[1, 2]"))).toEqual({});
    expect(sunoAnswerFields(block('{"bpm": "fast", "key": "", "genre": [3], "mood": ["calm"]}'))).toEqual({ mood: ["calm"] });
    expect(sunoAnswerFields(`${block('{"bpm": 1}')} and later ${block('{"bpm": 98}', "")}`)).toEqual({ bpm: 98 });
  });
});
