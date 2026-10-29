import { describe, expect, it } from "vitest";

import { foldTaste, parseStudioListen, parseTasteEvent, tasteEventKey, type TasteEventData } from "../src/audio.suno.schema.ts";

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
