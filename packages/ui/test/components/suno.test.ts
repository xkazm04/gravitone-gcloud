// The Suno vocabulary's arithmetic (spark suno-advisor, packages/ui/src/components/suno/suno.ts): what
// Copy all puts on the clipboard, the taste dislikes merged into `exclude` at copy time, a field's
// count against its cap, a verdict and its words, a picked file's fault, and where a listener's tempo
// or key disagrees with the measurement - plus the prompt card and take facts drawn once each.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { StudioNodeOf } from "@gt/domain/audio.studio";
import type { StudioListen, StudioTakeFacts, StudioTasteLine } from "@gt/domain/audio.suno";

import { SunoPromptCard } from "../../src/components/suno/SunoPromptCard.tsx";
import { TakeFacts } from "../../src/components/suno/TakeFacts.tsx";
import {
  attachFault, bpmAltWords, clock, copyAllText, countOf, disagreement, fileSize, keyClass, listenView, measuredRows, mergedExclude, NEW_TAB_FEATURES, SUNO_CREATE_URL, tasteExcludes, usd, verdictOf, verdictText,
} from "../../src/components/suno/suno.ts";

const taste: readonly StudioTasteLine[] = [
  { line: "heavy autotune", lean: "dislike", since: "2026-10-21T00:00:00Z" },
  { line: "analog synth bass", lean: "like", since: "2026-10-22T00:00:00Z" },
  { line: "EDM Drop", lean: "dislike", since: "2026-10-23T00:00:00Z" },
  { line: "Heavy Autotune ", lean: "dislike", since: "2026-10-24T00:00:00Z" },
];

describe("copy", () => {
  test("Copy all: each present field labelled, style then lyrics then exclude, a blank line between", () => {
    expect(copyAllText({ style: "synthwave, 112 bpm", lyrics: "[Verse]\nline one\nline two", exclude: "trap hi-hats" })).toBe(
      "Style:\nsynthwave, 112 bpm\n\nLyrics:\n[Verse]\nline one\nline two\n\nExclude:\ntrap hi-hats",
    );
  });

  test("Copy all leaves out an absent or empty field (an instrumental has no lyrics block)", () => {
    expect(copyAllText({ style: " lo-fi ", lyrics: "", exclude: "  " })).toBe("Style:\nlo-fi");
    expect(copyAllText({ style: "lo-fi", exclude: "vocals" })).toBe("Style:\nlo-fi\n\nExclude:\nvocals");
  });

  test("taste dislikes join exclude once each, skipping likes and terms the prompt already fences out", () => {
    expect(tasteExcludes(taste, "trap hi-hats, edm drop")).toEqual(["heavy autotune"]);
    expect(tasteExcludes(taste, undefined)).toEqual(["heavy autotune", "EDM Drop"]);
    expect(tasteExcludes([], "x")).toEqual([]);
  });

  test("the merged exclude: the prompt's own terms, then each chip still in", () => {
    expect(mergedExclude("trap hi-hats, EDM drop", ["heavy autotune"])).toBe("trap hi-hats, EDM drop, heavy autotune");
    expect(mergedExclude("trap hi-hats", [])).toBe("trap hi-hats");
    expect(mergedExclude(undefined, ["a", "b"])).toBe("a, b");
    expect(mergedExclude(undefined, [])).toBe("");
  });

  test("a field's count against its cap: at the cap is in, one past is over", () => {
    expect(countOf("x".repeat(1000), "style")).toEqual({ n: 1000, limit: 1000, over: false });
    expect(countOf("x".repeat(1001), "exclude")).toEqual({ n: 1001, limit: 1000, over: true });
    expect(countOf("abc", "lyrics")).toEqual({ n: 3, limit: 5000, over: false });
  });

  test("Open Suno names the create form and a tab with no opener and no referrer", () => {
    expect(SUNO_CREATE_URL).toBe("https://suno.com/create");
    expect(NEW_TAB_FEATURES).toBe("noopener,noreferrer");
  });
});

describe("verdict", () => {
  test("undecided keep and empty off are omitted; off follows VERDICT_OFF's order", () => {
    expect(verdictOf("p1", "a", undefined, new Set())).toEqual({ promptId: "p1", clip: "a" });
    expect(verdictOf("p1", "both", false, new Set(["vocals", "tempo"] as const))).toEqual({ promptId: "p1", clip: "both", keep: false, off: ["tempo", "vocals"] });
  });

  test("the words are the draft when there is one, else the verdict said plainly", () => {
    const v = verdictOf("p1", "a", false, new Set(["tempo", "vocals"] as const));
    expect(verdictText(v, "  it rushes  ")).toBe("it rushes");
    expect(verdictText(v, " ")).toBe("take a, drop; off: tempo, vocals");
    expect(verdictText(verdictOf("p2", "both", true, new Set()), "")).toBe("both takes, keep");
    expect(verdictText(verdictOf("p2", "b", undefined, new Set()), "")).toBe("take b");
  });

  test("a picked file is a take when it is audio (by type, or by name when the type is blank) and not empty", () => {
    expect(attachFault({ name: "a.mp3", type: "audio/mpeg", size: 10 })).toBeNull();
    expect(attachFault({ name: "a.mp3", type: "", size: 10 })).toBeNull();
    expect(attachFault({ name: "notes.txt", type: "text/plain", size: 10 })).toBe("notes.txt is not an audio file");
    expect(attachFault({ name: "a.mp3", type: "", size: 0 })).toBe("a.mp3 is empty");
    expect(fileSize(812 * 1024)).toBe("812 KB");
    expect(fileSize(4.2 * 1024 * 1024)).toBe("4.2 MB");
  });
});

const listened: StudioListen = {
  model: "gemini-3.8-flash", at: "2026-10-28T18:03:40Z", genre: ["synthwave"], mood: ["wistful"], bpm: 62, key: "F major",
  vocals: { heard: true, character: "breathy female lead" }, instruments: [{ name: "analog bass arpeggio", role: "bass", prominence: "lead" }],
  sections: [{ name: "intro", startS: 0, endS: 14, says: "pads alone" }],
};
const facts: StudioTakeFacts = {
  takeId: "t1", name: "Neon Overpass (a).mp3", durationS: 167.4, href: "/a", clip: "a",
  measured: { bpm: 124, bpmAlt: [62, 248], key: "D minor", keyStrength: 0.71, lufs: -9.6, truePeakDb: -0.8, lra: 5.4 },
};

describe("take facts", () => {
  test("measured rows: tempo with its octave neighbours, key with strength, loudness, peak, range, length", () => {
    expect(measuredRows(facts)).toEqual([
      { term: "bpm", value: "124", aside: "or 62 / 248" },
      { term: "key", value: "D minor", aside: "strength 0.71" },
      { term: "loudness", value: "-9.6 LUFS" },
      { term: "true peak", value: "-0.8 dBTP" },
      { term: "range", value: "5.4 LU" },
      { term: "length", value: "2:47" },
    ]);
    expect(measuredRows({ measured: {}, durationS: 61 })).toEqual([{ term: "length", value: "1:01" }]);
    expect(bpmAltWords([])).toBeNull();
    expect(clock(0)).toBe("0:00");
  });

  test("a heard tempo or key that disagrees with the measurement is marked; one that agrees is not", () => {
    expect(disagreement(facts.measured, listened)).toEqual({ bpm: true, key: true });
    expect(disagreement(facts.measured, { ...listened, bpm: 121, key: "Dm" })).toEqual({ bpm: false, key: false });
    expect(disagreement(facts.measured, { ...listened, bpm: 118 })).toMatchObject({ bpm: true });
    expect(disagreement({ key: "C# minor" }, { ...listened, key: "Db min" })).toMatchObject({ key: false });
    expect(disagreement({ key: "A minor" }, { ...listened, key: "A major" })).toMatchObject({ key: true });
    const { bpm: _b, key: _k, ...bare } = listened;
    expect(disagreement(facts.measured, bare)).toEqual({ bpm: false, key: false });
  });

  test("key names read as pitch class and mode", () => {
    expect(keyClass("F# minor")).toEqual({ pc: 6, minor: true });
    expect(keyClass("Gbm")).toEqual({ pc: 6, minor: true });
    expect(keyClass("C")).toEqual({ pc: 0, minor: false });
    expect(keyClass("B major")).toEqual({ pc: 11, minor: false });
    expect(keyClass("modal")).toBeNull();
  });

  test("the Listen control: done once heard, working while pressed, else priced or unpriced", () => {
    expect(listenView({ listened }, { kind: "idle" })).toBe("done");
    expect(listenView({ listenUsd: 0.006 }, { kind: "working" })).toBe("working");
    expect(listenView({ listenUsd: 0.006 }, { kind: "refused", reason: "x" })).toBe("priced");
    expect(listenView({}, { kind: "idle" })).toBe("unpriced");
    expect(usd(0.0062)).toBe("$0.0062");
    expect(usd(0.25)).toBe("$0.25");
  });
});

const prompt: StudioNodeOf<"suno_prompt"> = {
  id: "p1", kind: "suno_prompt", promptId: "p1", name: "Neon Overpass", style: "synthwave, 112 bpm", lyrics: "[Verse]\nline", exclude: "trap hi-hats",
  instrumental: false, model: "v6", settings: { weirdness: 35, variety: 0 },
};
const none = async (): Promise<string | null> => null;

describe("drawn once", () => {
  test("the prompt card shows each field with its count, the taste chip, an unset slider as not set", () => {
    const html = renderToStaticMarkup(h(SunoPromptCard, { node: prompt, taste, copy: none }));
    expect(html).toContain("18/1000");
    expect(html).toContain("trap hi-hats, heavy autotune, EDM Drop");
    expect(html).toContain("not set");
    expect(html).toContain("Copy all");
  });

  test("take facts: the heard column only with a listen, a disagreement marked with the measured value", () => {
    const bare = renderToStaticMarkup(h(TakeFacts, { facts: { ...facts, listenUsd: 0.0062 }, onListen: none }));
    expect(bare).not.toContain("unconfirmed");
    expect(bare).toContain("$0.0062");
    const heard = renderToStaticMarkup(h(TakeFacts, { facts: { ...facts, listened: { ...listened, standIn: true } }, onListen: none }));
    expect(heard).toContain("unconfirmed");
    expect(heard).toContain("measured 124");
    expect(heard).toContain("stand-in");
    const refused = renderToStaticMarkup(h(TakeFacts, { facts, onListen: none, seed: { kind: "refused", reason: "listen: the quote failed" } }));
    expect(refused).toContain("listen: the quote failed");
    expect(refused).toContain("unpriced");
  });
});
