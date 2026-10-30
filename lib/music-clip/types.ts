// THE /music-clip WIRE TYPES - the one contract the analysis (WP1), the CLI and
// boards (WP2) and the skill's prompts (WP3) all read. Committed by the Director
// before the fan-out so the packages share no file.
//
// ABSENT-VALUE CONVENTION: an unknown value OMITS its key. Never `null`, never
// `0` for "unknown". A lyric line with no per-line time carries
// `confidence: "section-only"` and its section's span.
//
// The map follows the registry's music-video-production/track-map-before-treatment:
// sections, a beat list (not a tempo), an energy curve, and a vocal activity map
// that says out loud it is unconfirmed (no stems on this box).

export const CLIP_FPS = 30;

export type SectionLabel = "intro" | "verse" | "prechorus" | "chorus" | "bridge" | "breakdown" | "outro";
export type LyricConfidence = "high" | "medium" | "low" | "section-only";
export type VoiceKind = "sung" | "synthetic" | "none";

export interface TimelineTrack {
  file: string;
  sha1: string;
  durationS: number;
  sampleRate: number;
}

export interface TimelineTempo {
  /** The BPM named in the style prompt, a PRIOR only - detection decides. */
  bpmPrior?: number;
  bpmGlobal: number;
  /** Local tempo through the track, one point per bar or so. */
  curve: { t: number; bpm: number }[];
}

export interface TimelineBeat {
  t: number;
  bar: number;
  beat: 1 | 2 | 3 | 4;
  downbeat: boolean;
}

/** Per-frame arrays at `fps`, each value 0..1. */
export interface TimelineBands {
  low: number[];
  mid: number[];
  high: number[];
  rms: number[];
}

export interface TimelineSection {
  id: string;
  label: SectionLabel;
  startS: number;
  endS: number;
  /** 0..1 mean intensity of the section. */
  intensity: number;
  /** Cuts per bar the section earns (cut-rate-follows-the-section). */
  cutsPerBar: number;
  /** The tag in the lyrics file this section was matched to, e.g. "Chorus". */
  lyricTag?: string;
}

export interface TimelineLyric {
  id: string;
  /** TimelineSection.id */
  section: string;
  text: string;
  startS: number;
  endS: number;
  confidence: LyricConfidence;
  source: "gemini+snap" | "section";
}

export interface TimelineVoice {
  startS: number;
  endS: number;
  kind: VoiceKind;
  /** Always false: no stems, derived from line times and vocal-band energy. */
  confirmed: false;
}

export interface TimelineV1 {
  v: 1;
  track: TimelineTrack;
  fps: typeof CLIP_FPS;
  tempo: TimelineTempo;
  beats: TimelineBeat[];
  bands: TimelineBands;
  onsets: number[];
  /** Per frame, 0..1, smoothed to the bar. */
  intensity: number[];
  sections: TimelineSection[];
  lyrics: TimelineLyric[];
  voice: TimelineVoice[];
  warnings: string[];
}

export type ClipStage = "analyzed" | "board-a" | "picked-a" | "board-b" | "picked-b" | "proof" | "bakeoff" | "final";
export type ClipStack = "kernel" | "hyperframes" | "remotion";

export interface StateV1 {
  v: 1;
  stage: ClipStage;
  trackSha1: string;
  picks: { a?: string; b?: string; stack?: ClipStack };
  updatedAt: string;
}

export interface Direction {
  id: string;
  name: string;
  animation: string;
  palette: string[];
  type: string;
  story: string;
  transitions: string[];
  risk: string;
}

export interface DirectionsV1 {
  v: 1;
  directions: Direction[];
}

export const MAX_DIRECTIONS = 10;

/** What `analyze` is handed once the folder is read; WP2's folder.ts builds it. */
export interface AnalyzeInput {
  audioPath: string;
  lyricsText: string;
  styleText: string;
  /** Dry: no vendor call; lyric times fall back to section-only. */
  dry: boolean;
}
