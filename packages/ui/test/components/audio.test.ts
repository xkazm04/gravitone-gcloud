// The audio parts (Phase 5, L52): the measured-vs-asked cells, the recipe model the composer
// and the Suno door share, the one-axis variations, the reference grading, and the markup the
// Library detail's three audio components speak - pure functions over literal data, the
// components through react-dom/server.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { disagreements, energyBand, fmtDur, measureCells, type AudioFacts } from "../../src/components/audio/audio.ts";
import { AudioMeasures } from "../../src/components/audio/AudioMeasures.tsx";
import { AudioPreview, mediaErrorWords } from "../../src/components/audio/AudioPreview.tsx";
import { AudioPrompt } from "../../src/components/audio/AudioPrompt.tsx";
import { DraftList } from "../../src/components/audio/DraftList.tsx";
import { SeedComposer } from "../../src/components/audio/SeedComposer.tsx";
import { BLANK_SEED, addTo, avoidFloats, compose, fitTo, handsOf, preferredFloats, removeFrom, sortTerms, sunoCut, sunoFieldsOf, termId, type Seed, type Term } from "../../src/components/audio/recipe.ts";
import { conceptFor, keyRelation, tempoError, variationsOfSeed } from "../../src/components/audio/variations.ts";

const term = (facet: Term["facet"], t: string, n: number, kept: number, over: Partial<Term> = {}): Term => ({
  id: termId(facet, t),
  term: t,
  facet,
  n,
  kept,
  rejected: n - kept,
  keepRate: n === 0 ? null : kept / n,
  stance: null,
  phrase: "",
  topDefect: null,
  ...over,
});

const SEED: Seed = { genres: ["chamber"], moods: ["light"], instruments: ["pizzicato", "kazoo"], bpm: 108, key: "G major", avoid: [] };

describe("measured beside asked", () => {
  const facts = (m: Partial<NonNullable<AudioFacts["measured"]>> | null): AudioFacts => ({
    asked: { tempoBpm: 120, key: "A minor", durationS: 60 },
    measured: m === null ? null : { tempoBpm: null, key: null, durationS: null, lufs: null, truePeakDb: null, energy: null, ...m },
  });

  test("a half-time read is a disagreement that names what was asked; within 3 % is agreement", () => {
    const half = measureCells(facts({ tempoBpm: 60, key: "a minor", durationS: 60.6 }));
    expect(half.find((c) => c.key === "bpm")).toEqual({ key: "bpm", label: "bpm", value: "60", from: "measured", asked: "120" });
    // Key is compared by name, not by case; a length within a second agrees.
    expect(half.find((c) => c.key === "key")?.asked).toBeUndefined();
    expect(half.find((c) => c.key === "length")).toMatchObject({ value: "1:01", from: "measured" });
    expect(half.find((c) => c.key === "length")?.asked).toBeUndefined();
    expect(disagreements(half)).toBe(1);
    expect(measureCells(facts({ tempoBpm: 123.5 })).find((c) => c.key === "bpm")?.asked).toBeUndefined();
    expect(measureCells(facts({ tempoBpm: 124 })).find((c) => c.key === "bpm")?.asked).toBe("120");
  });

  test("nothing measured draws the brief, marked as asked; nothing at all is a dash", () => {
    const cells = measureCells(facts(null));
    expect(cells.map((c) => [c.key, c.value, c.from])).toEqual([
      ["bpm", "120", "asked"],
      ["key", "A minor", "asked"],
      ["length", "1:00", "asked"],
      ["lufs", "—", "none"],
      ["peak", "—", "none"],
      ["energy", "—", "none"],
    ]);
  });

  test("loudness, peak and energy are the bytes' alone; energy carries its band word", () => {
    const cells = measureCells(facts({ lufs: -15.64, truePeakDb: -3.92, energy: 0.1357 }));
    expect(cells.slice(3).map((c) => c.value)).toEqual(["-15.6", "-3.9 dB", "0.14 medium"]);
    expect([energyBand(0.21), energyBand(0.2), energyBand(0.09), energyBand(0.05)]).toEqual(["high", "medium", "low", "low"]);
    expect([fmtDur(0), fmtDur(59.6), fmtDur(3725), fmtDur(null), fmtDur(-1)]).toEqual(["0:00", "1:00", "62:05", "—", "—"]);
  });

  test("the grid speaks each cell and marks a disagreement in words", () => {
    const html = renderToStaticMarkup(h(AudioMeasures, { facts: facts({ tempoBpm: 60 }) }));
    expect(html).toContain("asked 120");
    expect(html.match(/<dt/g)).toHaveLength(6);
  });
});

describe("the recipe", () => {
  const terms = [term("instrument", "pizzicato", 6, 5, { phrase: "plucked strings" }), term("mood", "light", 4, 1, { stance: "avoid" })];

  test("Suno's form from a seed: the style line in order, the hand's phrasing, instrumental, the fence as exclude", () => {
    const f = sunoFieldsOf({ ...SEED, avoid: ["vocals"] }, handsOf(terms), "Whisper network");
    expect(f).toEqual({ title: "Whisper network", style: "chamber, light, plucked strings, kazoo, 108 bpm, G major", lyrics: "[Instrumental]", exclude: "vocals" });
    expect(sunoFieldsOf(BLANK_SEED, {})).toBeNull();
  });

  test("a style line over Suno's 200 is cut at a separator, never mid-tag", () => {
    const long = { ...BLANK_SEED, instruments: Array.from({ length: 40 }, (_, i) => `instrument-${i}`) };
    const style = sunoFieldsOf(long, {})?.style ?? "";
    expect(style.length).toBeLessThanOrEqual(200);
    expect(style.endsWith(",")).toBe(false);
    expect(style.split(", ").every((t) => /^instrument-\d+$/.test(t))).toBe(true);
    expect(fitTo("a b c", 3)).toBe("a b");
  });

  test("the two dialects (v1 compose), each phrased through the hand", () => {
    const hands = handsOf(terms);
    expect(compose(SEED, "elevenlabs", hands)).toBe("Light chamber instrumental, 108 BPM, G major. Built on plucked strings and kazoo.");
    expect(compose({ ...SEED, avoid: ["brass"] }, "suno", hands).split("\n")).toEqual(["Style: chamber, light, plucked strings, kazoo, 108 bpm, G major", "Exclude: brass", "", "[Instrumental]"]);
  });

  test("the Suno prompt drawn is the form sent: the same style line and fence, cut to the same limits", () => {
    const hands = handsOf(terms);
    const long = { ...SEED, instruments: Array.from({ length: 40 }, (_, i) => `instrument-${i}`), avoid: Array.from({ length: 40 }, (_, i) => `fence-${i}`) };
    for (const seed of [SEED, { ...SEED, avoid: ["brass"] }, long]) {
      const f = sunoFieldsOf(seed, hands);
      const lines = compose(seed, "suno", hands).split("\n");
      expect(lines[0]).toBe(`Style: ${f?.style ?? ""}`);
      expect(lines.find((l) => l.startsWith("Exclude: "))).toBe(f?.exclude === undefined ? undefined : `Exclude: ${f.exclude}`);
    }
    // A seed of fences alone still draws its fence, though there is no style to send.
    expect(compose({ ...BLANK_SEED, avoid: ["vocals"] }, "suno", {}).split("\n")).toEqual(["Style: ", "Exclude: vocals", "", "[Instrumental]"]);
  });

  test("a word is added once and removed by name; the keep rate is smoothed", () => {
    expect(addTo(addTo(SEED, "moods", "tense"), "moods", "tense").moods).toEqual(["light", "tense"]);
    expect(addTo(SEED, "moods", "  ").moods).toEqual(["light"]);
    expect(removeFrom(SEED, "instruments", "kazoo").instruments).toEqual(["pizzicato"]);
    // The same word in another case is the same term (termId lower-cases): never a second chip, never a second float.
    expect(addTo(SEED, "instruments", "Kazoo ").instruments).toEqual(["pizzicato", "kazoo"]);
    expect(addTo({ ...SEED, avoid: ["Vocals"] }, "avoid", "vocals").avoid).toEqual(["Vocals"]);
    const piano = term("instrument", "piano", 5, 4, { stance: "prefer" });
    const vox = term("instrument", "vocals", 5, 0, { stance: "avoid" });
    expect([preferredFloats([piano], "instrument", ["Piano"]), avoidFloats([vox], ["Vocals"])]).toEqual([[], []]);
    const one = term("genre", "solo", 1, 1);
    const nine = term("genre", "steady", 10, 9);
    expect(sortTerms([one, nine], "rate").map((t) => t.term)).toEqual(["steady", "solo"]);
  });
});

describe("variations and references", () => {
  const terms = [
    term("instrument", "kazoo", 5, 0),
    term("instrument", "pizzicato", 6, 5),
    term("instrument", "cello", 4, 4, { stance: "prefer" }),
    term("instrument", "theremin", 6, 1),
    term("mood", "light", 4, 1),
    term("mood", "tense", 3, 3),
  ];

  test("one axis each: the weakest instrument and mood swapped for the strongest unused, ±6 BPM, the relative key, a fence", () => {
    const v = variationsOfSeed(SEED, terms);
    expect(v.map((x) => [x.axis, x.diff.join(" ")])).toEqual([
      ["swap", "−kazoo +cello"],
      ["mood", "−light +tense"],
      ["tempo", "-6 BPM"],
      ["tempo", "+6 BPM"],
      ["key", "G major → E minor"],
      ["fence", "no theremin"],
    ]);
    expect(v[0]?.seed.instruments).toEqual(["pizzicato", "cello"]);
    // Every other axis is left as it was.
    expect(v[4]?.seed).toEqual({ ...SEED, key: "E minor" });
  });

  test("a term judged once is not evidence for a swap", () => {
    const thin = [term("instrument", "kazoo", 5, 0), term("instrument", "cello", 1, 1)];
    expect(variationsOfSeed(SEED, thin).some((x) => x.axis === "swap")).toBe(false);
  });

  test("the kind of tempo error a method made, and the key relation", () => {
    expect(tempoError(57.5, 115).kind).toBe("half-time error");
    expect(tempoError(117.5, 115)).toMatchObject({ ok: true, kind: "within 2.2%" });
    expect(tempoError(69.8, 88).kind).toBe("21% off");
    expect([keyRelation("A minor", "A minor"), keyRelation("D minor", "F major"), keyRelation("G minor", "F major")]).toEqual(["exact", "relative", "wrong"]);
  });

  test("every key the tracker can write has its relative, and a relative in another spelling is still relative", () => {
    // lib/sound/measure.ts NOTES x major/minor: the 24 keys a measured reference or take can carry.
    const notes = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
    const keys = notes.flatMap((n) => [`${n} major`, `${n} minor`]);
    const withRelative = keys.filter((k) => variationsOfSeed({ ...SEED, key: k }, []).some((x) => x.axis === "key"));
    expect(withRelative).toEqual(keys);
    expect(variationsOfSeed({ ...SEED, key: "F# minor" }, []).find((x) => x.axis === "key")?.seed.key).toBe("A major");
    expect(variationsOfSeed({ ...SEED, key: "E major" }, []).find((x) => x.axis === "key")?.seed.key).toBe("C# minor");
    expect([keyRelation("F# minor", "A major"), keyRelation("C# major", "Db major"), keyRelation("Bb minor", "Db major"), keyRelation("A minor", "E minor")]).toEqual(["relative", "exact", "relative", "wrong"]);
  });

  test("a reference's concept: proven counts double, a rejection counts against", () => {
    const t = (verdict: "kept" | "rejected", proven: boolean, genre: string[]) => ({ referenceTrackId: "ref-a", verdict, proven, terms: { genre, mood: [], instrument: [] } });
    const c = conceptFor("ref-a", { tempo: 112.3, key: "G minor" }, [t("kept", true, ["house"]), t("kept", false, ["disco"]), t("rejected", false, ["disco", "trance"]), { ...t("kept", true, ["polka"]), referenceTrackId: "other" }]);
    expect(c).toEqual({ genres: ["house"], moods: [], instruments: [], bpm: 112.3, key: "G minor", avoid: [] });
  });
});

describe("the detail components' markup", () => {
  test("a preview with no file offers no play control and says so", () => {
    const none = renderToStaticMarkup(h(AudioPreview, { src: null, peaks: [0.2, 0.8], title: "Salt", durationS: 154 }));
    expect(none).not.toContain("<button");
    expect(none).not.toContain("<audio");
    expect(none).toContain("Salt, no file");
    const file = renderToStaticMarkup(h(AudioPreview, { src: "/api/sound/takes/st-1/file", peaks: [0.2], title: "Salt", durationS: 154 }));
    expect(file).toContain('aria-label="play Salt"');
    expect(file).toContain('aria-label="seek Salt"');
    expect(file).toContain("2:34");
  });

  test("a media error reads in the element's own code", () => {
    expect(mediaErrorWords(4, "/api/sound/takes/st-1/file?k=secret")).toBe("MEDIA_ERR_SRC_NOT_SUPPORTED · /api/sound/takes/st-1/file");
    expect(mediaErrorWords(undefined, "/x")).toBe("MEDIA_ERR · /x");
  });

  test("the prompt whole, the exclusions, the defect codes verbatim", () => {
    const html = renderToStaticMarkup(h(AudioPrompt, { prompt: "Pizzicato caper at 108 BPM.", negative: "vocals", reasons: ["tempo-instability", "broken-ending"] }));
    expect(html).toContain("Pizzicato caper at 108 BPM.");
    expect(html).toContain("vocals");
    expect(html).toContain("tempo-instability");
    expect(html).toContain("broken-ending");
    expect(renderToStaticMarkup(h(AudioPrompt, { prompt: "", reasons: [] }))).toContain("no prompt recorded");
  });

  test("a draft's returns link to the triage that judges them; nothing here keeps or rejects", () => {
    const html = renderToStaticMarkup(
      h(DraftList, {
        triageHref: "/board",
        drafts: [{ id: "sp-1", title: "Harbor glass", style: "strings", origin: "custom", state: "done", at: "2026-10-16T09:00:00.000Z", clips: [{ id: "sc-1", title: "Harbor glass", model: "v6", verdict: null }] }],
      }),
    );
    expect(html).toContain('href="/board"');
    expect(html).toContain("returned");
    expect(html).not.toMatch(/>\s*(Keep|Reject)\s*</);
  });
});

describe("the composer's markup", () => {
  const props = { terms: [], hands: {}, from: "blank", onSeed: () => {}, onSend: () => {}, busy: false, onCopy: () => {}, keys: [] };
  test("a seed past Suno's limits says how many of its words the form drops", () => {
    const long = { ...SEED, instruments: Array.from({ length: 40 }, (_, i) => `instrument-${i}`) };
    const n = sunoCut(long, {});
    // 40 instruments of ~13 chars against 200: most of them, plus the tempo and key after them.
    expect(n).toBeGreaterThan(20);
    expect(sunoFieldsOf(long, {})?.style.split(", ").length).toBe(long.genres.length + long.moods.length + long.instruments.length + 2 - n);
    expect(/>cut<b[^>]*>(\d+)<\/b>/.exec(renderToStaticMarkup(h(SeedComposer, { ...props, seed: long })))?.[1]).toBe(String(n));
    expect(sunoCut(SEED, {})).toBe(0);
    expect(renderToStaticMarkup(h(SeedComposer, { ...props, seed: SEED }))).not.toContain(">cut<");
  });

  test("a tempo the batch would refuse is refused here too: Send waits and says why, and no variation steps past it", () => {
    const send = (seed: Seed): string => /<button[^>]*>Send to Suno[\s\S]*?<\/button>/.exec(renderToStaticMarkup(h(SeedComposer, { ...props, seed })))?.[0] ?? "";
    expect(send({ ...SEED, bpm: 999 })).toContain('aria-disabled="true"');
    expect(send({ ...SEED, bpm: 999 })).toContain("tempo 40–220");
    expect(send({ ...SEED, bpm: 120 })).not.toContain('aria-disabled="true"');
    const bpms = [218, 42, 220, 40].flatMap((bpm) => variationsOfSeed({ ...SEED, bpm }, []).filter((v) => v.axis === "tempo").map((v) => v.seed.bpm ?? 0));
    expect(bpms.filter((b) => b < 40 || b > 220)).toEqual([]);
    expect(variationsOfSeed({ ...SEED, bpm: 218 }, []).filter((v) => v.axis === "tempo").map((v) => v.diff[0])).toEqual(["-6 BPM"]);
  });
});
