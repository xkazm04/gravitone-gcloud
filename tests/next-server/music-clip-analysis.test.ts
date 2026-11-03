// /music-clip ANALYSIS (spark music-clip, WP1): the pure passes over inputs whose
// answer is known. A lyrics sheet whose ids and tags can be counted by hand; a
// click track at 120 BPM and one that slows to 110, where every beat's true
// time is the click that made it; a snap over a hand-placed onset list; and
// Gemini's answer held to the rules through a stand-in fetch - good, out of
// order, out of range, refused. No network, no store.

import { describe, expect, it } from "vitest";

import { crossCheckBoundaries, deriveVoice, lineSections, nearest, sectionOnly, snapLyrics } from "@/lib/music-clip/align";
import { assignBars, bpmFromBeats, refineBeatTimes, trackBeatFrames } from "@/lib/music-clip/beats";
import { pickOnsets, spectrum } from "@/lib/music-clip/dsp";
import { askGeminiForLineTimes, longestIncreasing, validateLineTimes, type FetchLike } from "@/lib/music-clip/gemini";
import { parseLyrics, tagLabel } from "@/lib/music-clip/lyricsParse";
import { alignToUnits, cutsPerBarFor, snapToDownbeat } from "@/lib/music-clip/sections";
import { estimateTempo, parseBpmPrior } from "@/lib/music-clip/tempo";
import type { TimelineSection } from "@/lib/music-clip/types";

const RATE = 22050;

/** Decaying noisy clicks at `times`, deterministic. */
function clickTrack(times: number[], durS: number): Float32Array {
  const pcm = new Float32Array(Math.round(durS * RATE));
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5;
  for (const t of times) {
    const s = Math.round(t * RATE);
    for (let k = 0; k < 400 && s + k < pcm.length; k++) pcm[s + k] += Math.exp(-k / 60) * (Math.sin(k * 0.3) + rnd());
  }
  return pcm;
}

function track(times: number[], durS: number, prior?: number) {
  const sp = spectrum(clickTrack(times, durS), RATE, Math.round(durS * 30));
  const est = estimateTempo(sp.env, sp.envRate, prior);
  const beats = refineBeatTimes(trackBeatFrames(sp.env, sp.envRate, est.bpm), sp.env, sp.envRate);
  return { sp, est, beats };
}

const nearestErr = (beats: number[], t: number) => Math.min(...beats.map((b) => Math.abs(b - t)));

describe("lyricsParse", () => {
  const text = "﻿intro words\n\n[Verse 1]\nfirst line\n   \nsecond line\r\n[Pre-Chorus]\nthird\n[Break]\n[Final Chorus]\n  fourth  \n\n";
  const p = parseLyrics(text);

  it("keeps every non-empty, non-tag line once, in file order, with L-ids", () => {
    expect(p.lines.map((l) => [l.id, l.text])).toEqual([
      ["L001", "intro words"],
      ["L002", "first line"],
      ["L003", "second line"],
      ["L004", "third"],
      ["L005", "fourth"],
    ]);
  });

  it("reads tags with numbers, keeps an empty tag, and files lines under them", () => {
    expect(p.tags.map((t) => [t.tag, t.label, t.lineIds])).toEqual([
      ["Verse 1", "verse", ["L002", "L003"]],
      ["Pre-Chorus", "prechorus", ["L004"]],
      ["Break", "breakdown", []],
      ["Final Chorus", "chorus", ["L005"]],
    ]);
    expect(p.lines[0].tagIndex).toBe(-1);
  });

  it("names section words most-specific first", () => {
    expect(tagLabel("Pre-Chorus")).toBe("prechorus");
    expect(tagLabel("Chorus 2")).toBe("chorus");
    expect(tagLabel("Bridge")).toBe("bridge");
    expect(tagLabel("Guitar Solo")).toBeUndefined();
  });
});

describe("tempo and beats", () => {
  it("parses the style prompt's BPM as a prior", () => {
    expect(parseBpmPrior("driving 125 BPM, downtuned")).toBe(125);
    expect(parseBpmPrior("bpm: 90")).toBe(90);
    expect(parseBpmPrior("no tempo here")).toBeUndefined();
  });

  it("hears a 120 BPM click track: bpm within 1, every beat within 40 ms of its click", () => {
    const clicks = Array.from({ length: 60 }, (_, i) => 0.5 + i * 0.5);
    const { est, beats } = track(clicks, 31);
    expect(Math.abs(est.bpm - 120)).toBeLessThan(1);
    expect(Math.abs(bpmFromBeats(beats)! - 120)).toBeLessThan(1);
    for (const c of clicks.slice(1, -1)) expect(nearestErr(beats, c)).toBeLessThan(0.04);
    expect(beats.length).toBeGreaterThanOrEqual(clicks.length - 2);
  });

  it("follows a click track that slows from 120 to 110 (the grid is a list, not a multiplication)", () => {
    const clicks: number[] = [];
    let t = 0.5;
    for (let i = 0; i < 80; i++) {
      clicks.push(t);
      t += 60 / (120 - 10 * (i / 79));
    }
    const { beats } = track(clicks, t + 0.5);
    for (const c of clicks.slice(1, -1)) expect(nearestErr(beats, c)).toBeLessThan(0.04);
    // A fixed grid at the seed tempo would be more than a beat off by the end.
    const tail = beats.slice(-6);
    const ibi = tail.slice(1).map((b, i) => b - tail[i]);
    expect(60 / (ibi.reduce((a, b) => a + b, 0) / ibi.length)).toBeLessThan(113);
  });

  it("resolves double time toward the prior when the evidence there is strong", () => {
    const clicks = Array.from({ length: 60 }, (_, i) => 0.5 + i * 0.5);
    const { sp } = track(clicks, 31);
    expect(Math.abs(estimateTempo(sp.env, sp.envRate, 60).bpm - 60)).toBeLessThan(1);
  });

  it("puts onsets within 10 ms of the clicks", () => {
    const clicks = Array.from({ length: 20 }, (_, i) => 0.5 + i * 0.37);
    const sp = spectrum(clickTrack(clicks, 8.5), RATE, 255);
    const ons = pickOnsets(sp.env, sp.envRate);
    expect(ons.length).toBe(clicks.length);
    for (const c of clicks) expect(Math.abs(nearest(ons, c)! - c)).toBeLessThan(0.01);
  });

  it("numbers bars from the strongest phase, beats before the first downbeat in bar 0", () => {
    const times = Array.from({ length: 10 }, (_, i) => i * 0.5);
    const beats = assignBars(times, (t) => (Math.round(t / 0.5) % 4 === 2 ? 1 : 0));
    expect(beats.map((b) => `${b.bar}.${b.beat}`)).toEqual(["0.3", "0.4", "1.1", "1.2", "1.3", "1.4", "2.1", "2.2", "2.3", "2.4"]);
    expect(beats.filter((b) => b.downbeat).map((b) => b.t)).toEqual([1, 3]);
  });
});

describe("sections", () => {
  it("snaps a boundary to the nearest downbeat within a second, else leaves it", () => {
    expect(snapToDownbeat(10.4, [8, 9.9, 11.8])).toBe(9.9);
    expect(snapToDownbeat(10.4, [8, 12])).toBe(10.4);
  });

  it("aligns sections to tags by order, splitting a long tag and giving the lead to the intro", () => {
    const units = ["intro", "verse", "chorus", "verse", "chorus"] as const;
    expect(alignToUnits([0.1, 0.5, 0.85, 0.5, 0.9, 0.88], [...units], true)).toEqual([0, 1, 2, 3, 4, 4]);
  });

  it("caps the bridge at one cut a bar", () => {
    expect(cutsPerBarFor(0.9, "chorus")).toBe(2);
    expect(cutsPerBarFor(0.9, "bridge")).toBe(1);
    expect(cutsPerBarFor(0.2, "verse")).toBe(0.25);
  });
});

const SECTIONS: TimelineSection[] = [
  { id: "s01", label: "intro", startS: 0, endS: 10, intensity: 0.1, cutsPerBar: 0.25 },
  { id: "s02", label: "verse", startS: 10, endS: 20, intensity: 0.5, cutsPerBar: 0.5, lyricTag: "Verse" },
  { id: "s03", label: "bridge", startS: 20, endS: 30, intensity: 0.4, cutsPerBar: 0.5, lyricTag: "Bridge" },
];
const LYR = parseLyrics("[Verse]\na\nb\nc\n[Bridge]\nd\n");
const BASE = sectionOnly(LYR, SECTIONS, lineSections(LYR, [[1], [2]]));

describe("snap", () => {
  it("lays every line on its tag's section span before any time is known", () => {
    expect(BASE.map((l) => [l.id, l.section, l.startS, l.endS, l.confidence])).toEqual([
      ["L001", "s02", 10, 20, "section-only"],
      ["L002", "s02", 10, 20, "section-only"],
      ["L003", "s02", 10, 20, "section-only"],
      ["L004", "s03", 20, 30, "section-only"],
    ]);
  });

  it("snaps to the nearest onset: high under 0.15 s, medium under 0.35 s, low past it or out of its window", () => {
    const times = new Map([
      ["L001", { startS: 11.05, endS: 12.5 }], // onset 11.0, 0.05 away: high
      ["L002", { startS: 13.25, endS: 14 }], // onset 13.0, 0.25 away: medium
      ["L003", { startS: 16, endS: 17 }], // nearest onset 13.0: unsnapped, low
      ["L004", { startS: 5, endS: 6 }], // out of order AND outside the bridge window
    ]);
    const out = snapLyrics(BASE, times, [11, 13, 25], SECTIONS);
    expect(out.map((l) => [l.startS, l.confidence, l.source])).toEqual([
      [11, "high", "gemini+snap"],
      [13, "medium", "gemini+snap"],
      [16, "low", "gemini+snap"],
      [16.05, "low", "gemini+snap"],
    ]);
    expect(out[0].endS).toBeCloseTo(12.45, 3);
    for (const l of out) expect(l.endS).toBeGreaterThan(l.startS);
  });

  it("leaves a line Gemini did not time on its section span", () => {
    const out = snapLyrics(BASE, new Map([["L002", { startS: 12.02, endS: 13 }]]), [12], SECTIONS);
    expect(out[0]).toEqual(BASE[0]);
    expect(out[1].confidence).toBe("high");
  });

  it("warns on a Gemini boundary more than 3 s from ours, never moves ours", () => {
    expect(crossCheckBoundaries([{ label: "verse", startS: 11 }, { label: "bridge", startS: 25 }], SECTIONS)).toEqual([
      'sections: gemini hears "bridge" start at 25.0 s; the nearest boundary here is 20.0 s (kept)',
    ]);
  });

  it("marks the bridge synthetic when the style says so, gaps over a second none", () => {
    const flat = new Array<number>(900).fill(0.5);
    const warn: string[] = [];
    const v = deriveVoice(BASE, SECTIONS, "a flat text-to-speech monotone", { mid: flat, high: flat }, 30, warn);
    expect(v.map((x) => [x.kind, x.startS, x.endS])).toEqual([
      ["none", 0, 10],
      ["sung", 10, 20],
      ["synthetic", 20, 30],
    ]);
    expect(v.every((x) => x.confirmed === false)).toBe(true);
    expect(deriveVoice(BASE, SECTIONS, "guttural vocals", { mid: flat, high: flat }, 30, warn).map((x) => x.kind)).toEqual(["none", "sung"]);
  });
});

/** A stand-in for the vendor: answers `answer` as Gemini's text part. */
function standIn(answer: unknown, status = 200): { fetch: FetchLike; calls: { url: string; body: string }[] } {
  const calls: { url: string; body: string }[] = [];
  return {
    calls,
    fetch: async (url, init) => {
      calls.push({ url, body: init.body });
      const text = status === 200 ? JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] }) : `{"error":{"message":"quota"}}`;
      return { ok: status === 200, status, text: async () => text };
    },
  };
}

describe("gemini", () => {
  const ids = ["L001", "L002", "L003", "L004"];
  const ask = (f: FetchLike) =>
    askGeminiForLineTimes({ audio: new Uint8Array([1, 2, 3]), mimeType: "audio/mp3", lines: ids.map((id) => ({ id, text: id })), durationS: 30, apiKey: "test-key", model: "m-test", fetch: f });

  it("asks once, inline, with the schema, the key in the header and the lines in the prompt", async () => {
    const s = standIn({ lines: [], sections: [] });
    const a = await ask(s.fetch);
    expect(a.ok).toBe(true);
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0].url).toContain("/models/m-test:generateContent");
    const body = JSON.parse(s.calls[0].body);
    expect(body.contents[0].parts[0].inlineData.data).toBe("AQID");
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.contents[0].parts[1].text).toContain("L003: L003");
    expect(s.calls[0].body).not.toContain("test-key");
  });

  it("accepts a good answer whole", async () => {
    const good = { lines: ids.map((id, i) => ({ id, startS: 10 + i * 2, endS: 11 + i * 2 })), sections: [{ label: "verse", startS: 10 }] };
    const a = await ask(standIn(good).fetch);
    const v = validateLineTimes(a.ok ? a.value : undefined, ids, 30);
    expect([...v.times.keys()]).toEqual(ids);
    expect(v.dropped).toEqual([]);
    expect(v.sections).toEqual([{ label: "verse", startS: 10 }]);
  });

  it("keeps the longest increasing run of a non-monotone answer and drops the rest", async () => {
    const bad = { lines: [{ id: "L001", startS: 10, endS: 11 }, { id: "L002", startS: 25, endS: 26 }, { id: "L003", startS: 14, endS: 15 }, { id: "L004", startS: 16, endS: 17 }], sections: [] };
    const a = await ask(standIn(bad).fetch);
    const v = validateLineTimes(a.ok ? a.value : undefined, ids, 30);
    expect([...v.times.keys()]).toEqual(["L001", "L003", "L004"]);
    expect(v.dropped).toEqual([{ id: "L002", why: "out of order" }]);
  });

  it("drops out-of-range, inverted, non-numeric and unknown entries, and says why", () => {
    const raw = {
      lines: [
        { id: "L001", startS: -1, endS: 2 },
        { id: "L002", startS: 12, endS: 11 },
        { id: "L003", startS: 20, endS: 40 },
        { id: "L004", startS: "x", endS: 2 },
        { id: "L999", startS: 1, endS: 2 },
      ],
      sections: [{ label: "x", startS: 99 }],
    };
    const v = validateLineTimes(raw, ids, 30);
    expect(v.times.size).toBe(0);
    expect(v.dropped.map((d) => d.id)).toEqual(["L001", "L002", "L003", "L004"]);
    expect(v.sections).toEqual([]);
    expect(validateLineTimes("not an object", ids, 30).dropped.map((d) => d.why)).toEqual(ids.map(() => "not answered"));
  });

  it("turns a refusal into an error, never a throw", async () => {
    const a = await ask(standIn(null, 429).fetch);
    expect(a).toEqual({ ok: false, error: 'gemini m-test answered 429: {"error":{"message":"quota"}}' });
    const thrown = await ask(async () => {
      throw new Error("socket hang up");
    });
    expect(thrown).toEqual({ ok: false, error: "gemini m-test: socket hang up" });
  });

  it("longestIncreasing finds a longest strictly increasing run", () => {
    const xs = [1, 5, 2, 3, 3, 4];
    expect(longestIncreasing(xs).map((i) => xs[i])).toEqual([1, 2, 3, 4]);
    expect(longestIncreasing([])).toEqual([]);
  });
});
