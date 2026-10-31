// A HAND-MADE TIMELINE for the CLI and board tests: 30 s at 120 BPM, four
// sections, every value a closed-form function of the frame index, so two runs
// write the same bytes and a test can name the exact numbers it expects.
//
// It is not an analysis of anything. The tests that need a track beside it make
// a 30 s tone with ffmpeg and hand its sha1 in, so the fixture agrees with the
// file the folder actually holds.

import { CLIP_FPS, type TimelineLyric, type TimelineSection, type TimelineV1 } from "../types";

const DURATION_S = 30;
const BPM = 120;

const SECTIONS: TimelineSection[] = [
  { id: "s1", label: "intro", startS: 0, endS: 8, intensity: 0.25, cutsPerBar: 0.5 },
  { id: "s2", label: "verse", startS: 8, endS: 16, intensity: 0.5, cutsPerBar: 1, lyricTag: "Verse 1" },
  { id: "s3", label: "chorus", startS: 16, endS: 24, intensity: 0.9, cutsPerBar: 2, lyricTag: "Chorus" },
  { id: "s4", label: "outro", startS: 24, endS: 30, intensity: 0.35, cutsPerBar: 0.5 },
];

const LYRICS: TimelineLyric[] = [
  { id: "l1", section: "s2", text: "Iron wakes beneath the floor", startS: 8.5, endS: 11.9, confidence: "high", source: "gemini+snap" },
  { id: "l2", section: "s2", text: "Count the pulses, break the door", startS: 12, endS: 15.6, confidence: "medium", source: "gemini+snap" },
  { id: "l3", section: "s3", text: "Break the sequence", startS: 16, endS: 24, confidence: "section-only", source: "section" },
  { id: "l4", section: "s3", text: "Burn the code", startS: 16, endS: 24, confidence: "section-only", source: "section" },
];

const round = (x: number) => Math.round(x * 1000) / 1000;

export function fixtureTimeline(sha1 = "0".repeat(40), file = "fixture.mp3"): TimelineV1 {
  const frames = DURATION_S * CLIP_FPS;
  const beatS = 60 / BPM;
  const beats = Array.from({ length: Math.round(DURATION_S / beatS) }, (_, i) => {
    const beat = ((i % 4) + 1) as 1 | 2 | 3 | 4;
    return { t: round(i * beatS), bar: Math.floor(i / 4) + 1, beat, downbeat: beat === 1 };
  });
  const sectionAt = (t: number) => SECTIONS.find((s) => t >= s.startS && t < s.endS) ?? (SECTIONS[SECTIONS.length - 1] as TimelineSection);
  const curve = (f: number, k: number) => {
    const t = f / CLIP_FPS;
    const pulse = Math.exp(-((t % beatS) / beatS) * 4);
    return round(Math.min(1, sectionAt(t).intensity * (0.6 + 0.4 * pulse) * (0.85 + 0.15 * Math.sin(t * k))));
  };
  const idx = Array.from({ length: frames }, (_, f) => f);
  return {
    v: 1,
    track: { file, sha1, durationS: DURATION_S, sampleRate: 48000 },
    fps: CLIP_FPS,
    tempo: { bpmPrior: BPM, bpmGlobal: BPM, curve: Array.from({ length: DURATION_S / 2 }, (_, i) => ({ t: i * 2, bpm: BPM })) },
    beats,
    bands: { low: idx.map((f) => curve(f, 1.1)), mid: idx.map((f) => curve(f, 2.3)), high: idx.map((f) => curve(f, 5.7)), rms: idx.map((f) => curve(f, 0.7)) },
    onsets: beats.filter((b) => b.beat % 2 === 1).map((b) => b.t),
    intensity: idx.map((f) => round(sectionAt(f / CLIP_FPS).intensity)),
    sections: SECTIONS.map((s) => ({ ...s })),
    lyrics: LYRICS.map((l) => ({ ...l })),
    voice: [
      { startS: 8.5, endS: 15.6, kind: "sung", confirmed: false },
      { startS: 16, endS: 24, kind: "synthetic", confirmed: false },
    ],
    warnings: [],
  };
}
