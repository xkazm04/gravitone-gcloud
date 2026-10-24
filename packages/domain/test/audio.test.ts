import { describe, expect, it } from "vitest";

import { expectedSecondsOf, judgeAcceptance, type AudioMeasureFull } from "../src/audio.accept.ts";
import { fxChainSchema } from "../src/audio.fx.ts";
import { chainLabel } from "../src/audio.fx.label.ts";
import { accept, refuse } from "./_records.ts";

const clean: AudioMeasureFull = { integratedLufs: -18, truePeakDb: -3, lra: 4, clippedSamples: 0, leadSilenceS: 0.1, tailSilenceS: 0.3, durationS: 4 };

describe("judgeAcceptance", () => {
  it("passes a usable narration take", () => {
    expect(judgeAcceptance(clean, "voice-take", 4)).toEqual({ profile: "voice-take", verdict: "pass", reasons: [] });
  });

  it("holds the delivered file to the platform target, not the take's range", () => {
    expect(judgeAcceptance(clean, "youtube", null).reasons).toEqual(["loudness -18.0 LUFS outside -15..-13"]);
  });

  it("fails what was not measured instead of passing it", () => {
    const r = judgeAcceptance({ ...clean, integratedLufs: null, truePeakDb: null }, "voice-take", null);
    expect(r.verdict).toBe("fail");
    expect(r.reasons).toEqual(["loudness not measured", "true peak not measured"]);
  });

  it("names every defect it found", () => {
    const r = judgeAcceptance({ ...clean, truePeakDb: 0.4, clippedSamples: 12, tailSilenceS: 2.2, durationS: 9 }, "voice-take", 4);
    expect(r.reasons).toEqual(["true peak 0.4 dBTP over -1", "clipped 12 samples", "silent tail 2.2 s", "length 9.0 s vs expected 4.0 s"]);
  });

  it("checks length only when a length was committed", () => {
    expect(judgeAcceptance({ ...clean, durationS: 60 }, "voice-take", null).verdict).toBe("pass");
    expect(expectedSecondsOf("five words make one line")).toBe(2);
    expect(expectedSecondsOf("  ")).toBeNull();
  });
});

describe("fxChainSchema", () => {
  const ghost = { v: 1, stages: [{ kind: "pitch", semitones: -3 }, { kind: "chorus", rateHz: 0.4, depth: 0.6, mix: 0.5 }, { kind: "reverb", roomSize: 0.9, damping: 0.3, wet: 0.6, dry: 0.5, width: 1 }] };

  it("accepts a bounded chain and labels it in signal order", () => {
    expect(chainLabel(accept(fxChainSchema, ghost))).toBe("pitch -3 · chorus · reverb");
  });

  it("refuses an out-of-bounds parameter with its path, never clamping it", () => {
    refuse(fxChainSchema, { v: 1, stages: [{ kind: "pitch", semitones: -24 }] }, "stages.0.semitones");
  });

  it("refuses an unknown stage, an unknown key, an empty chain and a long one", () => {
    refuse(fxChainSchema, { v: 1, stages: [{ kind: "flanger" }] }, "stages.0");
    refuse(fxChainSchema, { v: 1, stages: [{ kind: "gsm", extra: 1 }] }, "stages.0");
    refuse(fxChainSchema, { v: 1, stages: [] }, "stages");
    refuse(fxChainSchema, { v: 1, stages: Array.from({ length: 9 }, () => ({ kind: "gsm" })) }, "stages");
  });
});
