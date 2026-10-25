// The audio desk's insight parts (Phase 6, L66): the strengths table's evidence floor and its
// sort, the rubric's dimensions, mean and door, brief vs measured with the octave rule, and the
// operator batch's envelope-first brief - pure functions over literal data, the components
// through react-dom/server.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { BATCH_LIMITS, batchBrief, batchProblem, batchSeconds, blankBatch, composeSfxPrompt, priceSeconds } from "../../src/components/audio/batch.ts";
import { BatchForm } from "../../src/components/audio/BatchForm.tsx";
import { briefCheck, briefWords } from "../../src/components/audio/brief.ts";
import { BriefDelta } from "../../src/components/audio/BriefDelta.tsx";
import { RubricCard } from "../../src/components/audio/Rubric.tsx";
import { checkRatings, dimsFor, isProven, readRubric, rubricMean, scoreOfKey } from "../../src/components/audio/rubric.ts";
import { StrengthTable } from "../../src/components/audio/Strengths.tsx";
import { cellView, claimDraft, coverage, evidenceFor, MIN_N, pivot, providerColumns, sortRows, type EvidenceTake, type StrengthCell } from "../../src/components/audio/strengths.ts";

const cell = (p: Partial<StrengthCell>): StrengthCell => ({ kind: "music", provider: "elevenlabs", facet: "genre", value: "synthwave", n: 0, kept: 0, rejected: 0, meanScore: null, topDefect: null, ...p });
const ev = (id: string, p: Partial<EvidenceTake> = {}): EvidenceTake => ({
  id,
  provider: "suno",
  verdict: "kept",
  origin: "lab",
  technique: [],
  terms: { genre: ["lo-fi"], mood: [], instrument: [], sfxCategory: null },
  mean: null,
  ...p,
});

describe("strengths: the evidence floor", () => {
  test("under n=3 a cell has no rate and no mean - its shape has nowhere to put one", () => {
    expect(cellView(null)).toEqual({ state: "empty" });
    expect(cellView(cell({ n: 0 }))).toEqual({ state: "empty" });
    for (const n of [1, 2]) {
      const v = cellView(cell({ n, kept: n, meanScore: 9.5 }));
      expect(v).toEqual({ state: "insufficient", n, need: MIN_N - n });
      expect(Object.keys(v).sort()).toEqual(["n", "need", "state"]);
    }
    expect(cellView(cell({ n: 3, kept: 2, rejected: 1, meanScore: 6.666, topDefect: "off-brief" }))).toMatchObject({ state: "measured", keepPct: "67%", mean: "6.7", heat: 1 });
    expect(cellView(cell({ n: 4, kept: 0 }))).toMatchObject({ keepPct: "0%", heat: -2 });
  });

  test("a missing rate sorts below every real one in both directions; cells are never summed across providers", () => {
    const cells = [cell({ value: "a", n: 4, kept: 1 }), cell({ value: "b", n: 2, kept: 2 }), cell({ value: "c", n: 5, kept: 4 }), cell({ value: "d", provider: "suno", n: 3, kept: 3 })];
    const rows = pivot(cells, "genre");
    const desc = sortRows(rows, { key: "keep", provider: "elevenlabs", dir: "desc" }).map((r) => r.value);
    const asc = sortRows(rows, { key: "keep", provider: "elevenlabs", dir: "asc" }).map((r) => r.value);
    expect(desc.slice(0, 2)).toEqual(["c", "a"]);
    expect(asc.slice(0, 2)).toEqual(["a", "c"]);
    expect(desc.slice(2).sort()).toEqual(["b", "d"]);
    expect(asc.slice(2).sort()).toEqual(["b", "d"]);
    // One row per value, a cell per provider: the suno cell is not folded into elevenlabs'.
    const both = pivot([cell({ n: 3, kept: 3 }), cell({ provider: "suno", n: 3, kept: 0 })], "genre");
    expect(both).toHaveLength(1);
    expect(cellView(both[0]?.cells.elevenlabs)).toMatchObject({ keepPct: "100%" });
    expect(cellView(both[0]?.cells.suno)).toMatchObject({ keepPct: "0%" });
    expect(coverage(cells, "genre")).toEqual({ measured: 3, of: 4 });
    expect(providerColumns([])).toEqual(["elevenlabs", "suno"]);
    expect(providerColumns([cell({ provider: "local", n: 1 })])).toEqual(["elevenlabs", "suno", "local"]);
  });

  test("a lesson's evidence comes from the judged takes behind the cell, and the draft states it", () => {
    const takes = [
      ev("k1", { mean: 8 }),
      ev("k2", { mean: 7, terms: { genre: [" Lo-Fi "], mood: [], instrument: [], sfxCategory: null } }),
      ev("r1", { verdict: "rejected" }),
      ev("other", { provider: "elevenlabs" }),
      ev("open", { verdict: "unjudged" }),
      ev("demo", { origin: "fixture" }),
    ];
    const c = cell({ provider: "suno", value: "lo-fi", n: 3, kept: 2, rejected: 1, meanScore: 7.5 });
    // The unscored reject leaves the mean, it does not lower it.
    expect(evidenceFor(takes, c)).toEqual({ n: 3, keepRate: 0.667, meanScore: 7.5, takeIds: ["k1", "k2", "r1"] });
    expect(claimDraft(c)).toBe("When the brief's genre is lo-fi, send it to Suno, because it kept 2 of 3 (mean 7.5).");
    expect(claimDraft(cell({ facet: "technique", value: "tag-list", n: 4, kept: 1, topDefect: "smeared-transients" }))).toMatch(/avoid the tag-list technique.*smeared transients/);
  });

  test("the table draws a waiting cell as pips and the word, never a figure", () => {
    const html = renderToStaticMarkup(
      h(StrengthTable, { kind: "music", cells: [cell({ n: 2, kept: 2, meanScore: 9 }), cell({ value: "ambient", n: 4, kept: 3, meanScore: 7.25 })], facet: "genre", sort: { key: "keep", provider: "elevenlabs", dir: "desc" }, picked: null, onFacet: () => {}, onSort: () => {}, onPick: () => {} }),
    );
    expect(html).toContain("waiting");
    expect(html).toContain("ElevenLabs on synthwave: 2 judged, 1 more before a rate");
    expect(html).not.toContain("100%");
    expect(html).toContain("75%");
    expect(html).toContain("ElevenLabs on ambient: kept 75% of 4, mean 7.3");
  });

  test("a facet nobody judged keeps the table's column heads, every one named, n included", () => {
    const heads = (cells: readonly StrengthCell[]) =>
      [...renderToStaticMarkup(h(StrengthTable, { kind: "music", cells, facet: "mood", sort: { key: "n", provider: null, dir: "desc" }, picked: null, onFacet: () => {}, onSort: () => {}, onPick: () => {} })).matchAll(/<span role="columnheader"[^>]*>(.*?)<\/span>/g)].map((m) => (m[1] ?? "").replace(/<[^>]+>/g, "").replace(/\s*[↑↓]$/, ""));
    expect(heads([])).toEqual(["mood", "ElevenLabs", "Suno", "n"]);
    expect(heads([cell({ facet: "mood", value: "calm", n: 1 })])).toEqual(["mood", "ElevenLabs", "Suno", "n"]);
  });
});

describe("rubric", () => {
  test("a one-shot effect has no seam; the mean is the ledger's and absent is never zero", () => {
    expect(dimsFor({ kind: "sfx", loop: false })).toEqual(["event_match", "sound_quality"]);
    expect(dimsFor({ kind: "sfx", loop: true })).toEqual(["event_match", "sound_quality", "loop_seam"]);
    expect(rubricMean("music", {})).toBeNull();
    expect(rubricMean("music", { melody: 6, instrument_choice: null, instrument_quality: 8 })).toBe(7);
    // A bag scored before the sfx rubric existed averages what it has (lib/sound/ledger.ts).
    expect(rubricMean("sfx", { melody: 4 })).toBe(4);
    expect(isProven({ kind: "music", verdict: "kept", ratings: { melody: 7 } })).toBe(true);
    expect(isProven({ kind: "music", verdict: "kept", ratings: {} })).toBe(false);
    expect(isProven({ kind: "music", verdict: "rejected", ratings: { melody: 9 } })).toBe(false);
    const r = readRubric({ kind: "music", loop: null, verdict: "kept", ratings: { melody: 8 } });
    expect([r.scored, r.of, r.mean, r.dims.map((d) => d.value)]).toEqual([1, 3, 8, [8, null, null]]);
    expect(scoreOfKey("0")).toBe(10);
    expect(scoreOfKey("k")).toBeNull();
  });

  test("the door takes whole scores on the take's own dimensions, and null to clear", () => {
    expect(checkRatings({ kind: "music", loop: null }, { melody: 7, instrument_quality: null }).ok).toBe(true);
    expect(checkRatings({ kind: "sfx", loop: false }, { loop_seam: 5 })).toEqual({ ok: false, error: "loop seam is not scored on a one-shot effect" });
    expect(checkRatings({ kind: "music", loop: null }, { melody: 7.5 })).toEqual({ ok: false, error: "melody is scored 1-10, not 7.5" });
    expect(checkRatings({ kind: "music", loop: null }, { melody: 0 }).ok).toBe(false);
    expect(checkRatings({ kind: "music", loop: null }, {}).ok).toBe(false);
  });

  test("the card draws every dimension, scored or a dash, with the mean's coverage", () => {
    const html = renderToStaticMarkup(
      h(RubricCard, {
        take: { id: "t", title: "Take", provider: "suno", verdict: "kept", src: null, rubric: readRubric({ kind: "music", loop: null, verdict: "kept", ratings: { melody: 7, instrument_choice: 7 } }), brief: briefCheck("music", { tempoBpm: null, key: null, durationS: null }, null) },
        focused: false,
        dim: 0,
        playing: false,
        busy: [],
        onFocus: () => {},
        onPlay: () => {},
        onScore: () => {},
      }),
    );
    expect(html).toContain("proven");
    expect(html).toContain("scored 2 of 3");
    expect(html).toContain("—");
    expect(html).toContain('aria-pressed="true" aria-label="melody 7"');
  });
});

describe("brief vs measured", () => {
  const asked = { tempoBpm: 120, key: "A minor", durationS: 30 };
  test("a miss names its delta; a clean double or half is the tracker's octave, not a miss", () => {
    const off = briefCheck("music", asked, { tempoBpm: 98.5, key: "a min", durationS: 30.6 });
    expect(off.missed).toBe(1);
    expect(off.axes.map((a) => a.verdict)).toEqual(["missed", "held", "held"]);
    expect(briefWords(off)).toBe("tempo 120 bpm → 98.5 bpm −22 bpm");
    const half = briefCheck("music", asked, { tempoBpm: 60, key: "C major", durationS: 45 });
    expect(half.axes.map((a) => a.verdict)).toEqual(["octave", "missed", "missed"]);
    expect(half.missed).toBe(2);
    expect(briefWords(briefCheck("music", asked, { tempoBpm: 121, key: "A minor", durationS: 29 }))).toBeNull();
  });

  test("unasked, unmeasured and held stay apart; an effect is briefed by length alone", () => {
    expect(briefCheck("music", { tempoBpm: null, key: null, durationS: 30 }, null).axes.map((a) => a.verdict)).toEqual(["unasked", "unasked", "unmeasured"]);
    const fx = briefCheck("sfx", { tempoBpm: 120, key: "A", durationS: 2 }, { tempoBpm: 90, key: "C", durationS: 4.5 });
    expect(fx.axes.map((a) => [a.axis, a.verdict, a.delta])).toEqual([["length", "missed", "+2.5s"]]);
    // Under ten seconds the floor is a second: a 2 s effect at 2.9 s held.
    expect(briefCheck("sfx", { tempoBpm: null, key: null, durationS: 2 }, { tempoBpm: null, key: null, durationS: 2.9 }).missed).toBe(0);
    const html = renderToStaticMarkup(h(BriefDelta, { check: fx, label: "take" }));
    expect(html).toContain('aria-label="take: 1 missed"');
    expect(html).toContain("length asked 2s, measured 4.5s, +2.5s");
    expect(renderToStaticMarkup(h(BriefDelta, { check: briefCheck("music", { tempoBpm: null, key: null, durationS: null }, null), label: "t" }))).toBe("");
  });

  test("a key is held whatever its spelling: enharmonic, abbreviated, flat glyph; a real miss stays a miss", () => {
    // The tracker spells keys as lib/sound/measure.ts NOTES does ("C#", "Eb", "Ab", "Bb"); a brief is typed.
    const held = (askedKey: string, measuredKey: string): string | undefined => briefCheck("music", { tempoBpm: null, key: askedKey, durationS: null }, { tempoBpm: null, key: measuredKey, durationS: null }).axes[1]?.verdict;
    expect([held("Db major", "C# major"), held("G# minor", "Ab minor"), held("Am", "A minor"), held("A♭ major", "Ab major"), held("F#m", "F# minor"), held("Cmaj", "C major"), held("Bb", "Bb major")]).toEqual(["held", "held", "held", "held", "held", "held", "held"]);
    expect([held("A minor", "C major"), held("A major", "A minor"), held("C# minor", "D minor")]).toEqual(["missed", "missed", "missed"]);
  });
});

describe("the operator batch", () => {
  test("one brief for every take; effects envelope-first; unknown techniques dropped", () => {
    const f = { ...blankBatch("music"), prompt: "slow synthwave", technique: ["tag-list", "not-a-technique"], genre: "synthwave, retro", count: 3 };
    const b = batchBrief("music", f);
    expect(b).toMatchObject({ kind: "music", prompt: "slow synthwave", loop: null, promptInfluence: null, technique: ["tag-list"] });
    expect(b.terms.genre).toEqual(["synthwave", "retro"]);
    const s = { ...blankBatch("sfx"), event: "door slam", material: "oak", space: "stone hall", loop: true, sfxCategory: "impact", promptInfluence: 0.7 };
    expect(composeSfxPrompt(s)).toBe("door slam, oak, stone hall. seamless loop");
    expect(batchBrief("sfx", s)).toMatchObject({ kind: "sfx", loop: true, tempoBpm: null, key: null, promptInfluence: 0.7, technique: ["envelope-first-briefing"], terms: { genre: [], mood: [], instrument: [], sfxCategory: "impact" } });
    expect(batchBrief("music", { ...f, promptInfluence: 0.7 }).promptInfluence).toBeNull();
  });

  test("the form names its own problem before anything is priced", () => {
    expect(batchProblem("music", blankBatch("music"))).toBe("no prompt");
    expect(batchProblem("sfx", blankBatch("sfx"))).toBe("no event");
    const s = { ...blankBatch("sfx"), event: "slam" };
    expect(batchProblem("sfx", { ...s, durationS: 31 })).toBe("length 0.5–30s");
    expect(batchProblem("sfx", { ...s, count: 7 })).toBe("1–6 takes");
    expect(batchProblem("sfx", { ...s, count: 2.5 })).toBe("1–6 takes");
    expect(batchProblem("sfx", { ...s, promptInfluence: 1.4 })).toBe("influence 0–1");
    expect(batchProblem("sfx", s)).toBeNull();
  });

  test("every free-text cap the door holds is named before anything is priced", () => {
    const m = { ...blankBatch("music"), prompt: "a tune" };
    expect(batchProblem("music", m)).toBeNull();
    expect(batchProblem("music", { ...m, prompt: "x".repeat(BATCH_LIMITS.prompt + 1) })).toBe("prompt over 2000 characters");
    expect(batchProblem("music", { ...m, key: "k".repeat(BATCH_LIMITS.key + 1) })).toBe("key over 40 characters");
    expect(batchProblem("music", { ...m, key: "k".repeat(BATCH_LIMITS.key) })).toBeNull();
    for (const field of Object.keys(BATCH_LIMITS) as (keyof typeof BATCH_LIMITS)[]) {
      const over = "x".repeat(BATCH_LIMITS[field] + 1);
      const f = field === "prompt" ? { ...m, prompt: over } : { ...m, [field]: over };
      expect(batchProblem("music", f), field).toBe(`${field} over ${BATCH_LIMITS[field]} characters`);
    }
  });

  test("seconds of audio are priced to the tenth under ten seconds", () => {
    expect(priceSeconds(1.5)).toBe(1.5);
    expect(priceSeconds(9.96)).toBe(10);
    expect(priceSeconds(12.4)).toBe(12);
    expect(batchSeconds({ durationS: 1.5, count: 3 })).toBe(4.5);
    const html = renderToStaticMarkup(h(BatchForm, { kind: "sfx", form: blankBatch("sfx"), onForm: () => {}, problem: "no event", engine: null, busy: false, onPrice: () => {} }));
    expect(html).toContain("no event");
    expect(html).toContain('aria-disabled="true"');
  });
});
