// THE CUT'S SOUNDTRACK, AS A FILTER GRAPH — what lib/cutExport.ts mixes, pure.
//
// Two buses, because they are two different kinds of sound with two different
// jobs (registry media-generation/video-assembly; the explainer's narration,
// spark audio-postproduction-research WP4):
//
//   MUSIC  every sound-store take segment, trimmed to its span and delayed to
//          its dialled start, then mixed. Without narration this is the whole
//          soundtrack and it is EXACTLY the graph the export ran before
//          narration existed (the string is held by
//          tests/golden-path/cut-document.probe.spec.ts): no loudnorm, no
//          compressor. A film nobody narrated sounds as it did.
//
//   VOICE  every voice segment (a narration take's blob, cutDocument.ts), on
//          the same trim-and-delay branch at its line's offset, mixed with
//          `normalize=0` so two lines that never overlap keep their own level
//          instead of each being halved by amix's 1/N.
//
// When both are present the music is SIDE-CHAIN DUCKED under the voice: the
// voice bus is split, one copy keys `sidechaincompress` on the music bus, the
// other is mixed over the ducked music. Then the single loudness step for the
// delivered file - lib/adRender.ts AD_LOUDNORM's target and range (-14 LUFS,
// LRA 11, single pass: ±0.5 LU per its header, inside the youtube profile's ±1)
// - and back to 48 kHz, because loudnorm resamples to 192 kHz internally. Voice
// alone goes straight to that same step.
//
// THE CEILING IS -1.5, NOT AD_LOUDNORM'S -1, AND THAT IS A MEASUREMENT. The
// youtube profile holds the DELIVERED file to -1 dBTP, and the delivered file
// is AAC. Speech-shaped narration alone (pink noise gated at 4 Hz, 2026-10-24,
// this box's ffmpeg 2025-02-17) through `loudnorm=...:TP=-1` measured -0.9 dBTP
// as PCM and -0.8 dBTP after the 192k AAC encode: the limiter lands a hair over
// its own line and the codec adds ~0.2 dB. At TP=-1.5 the same file measured
// -1.2 dBTP / -14.8 LUFS delivered (the test's run: -1.3 / -14.7); at -2,
// -1.8 / -15.0 (the loudness edge). A crest no single pass can bring in (4 ms
// bursts over a quiet tone) lands at -16.5 LUFS and the verdict says so.
// So -1.5: the half-dB codec margin the -1 dBTP recommendation assumes, taken
// on the limiter because nothing after the encode can take it.
//
// THE DUCK, AND WHY THESE NUMBERS. The brief's start was threshold 0.05 /
// ratio 8 / attack 20 ms / release 300 ms / makeup 1. Threshold is the one that
// moved, measured (2026-10-24, a 150 Hz bed at -12 dBFS RMS keyed by a 1 kHz
// line; the -21 dBFS case is tests/next-server/cut-export-narration.test.ts):
// the compressor reads the KEY's level, and a narration take may sit anywhere
// in the voice-take profile's usable range (-28..-10 LUFS,
// @gt/domain/audio.accept). At 0.05 (-26 dBFS) a -21 dBFS line ducked the bed
// 3.8 dB - under the 6 dB the export is held to - and a -29 dBFS line 0.1 dB.
// At 0.02 (-34 dBFS): 10.7 dB and 3.8 dB; a hot -12 dBFS line 18.5 dB, which
// ratio 8 keeps from burying the bed outright. Attack 20 ms catches a consonant's onset without clicking;
// release 300 ms lets the bed swell back between sentences rather than pump on
// every syllable. Makeup stays 1: the bed outside narration is untouched, the
// final loudnorm sets the delivered level.
//
// THE TAP. `tap` ends the same graph at the voice bus or at the ducked music
// bus (before loudnorm), so a test can render the one stem it measures and the
// export cannot be one graph while its measurement is another.

import { AD_LOUDNESS_TARGET_LUFS } from "../adRender";
import type { AudioSegment, CutDocument } from "./cutDocument";

/** AD_LOUDNORM (lib/adRender.ts) with the AAC margin on its ceiling - see the header. */
export const EXPORT_LOUDNORM = `loudnorm=I=${AD_LOUDNESS_TARGET_LUFS}:TP=-1.5:LRA=11`;

export const DUCK = { threshold: 0.02, ratio: 8, attackMs: 20, releaseMs: 300, makeup: 1 } as const;

export const DUCK_FILTER = `sidechaincompress=threshold=${DUCK.threshold}:ratio=${DUCK.ratio}:attack=${DUCK.attackMs}:release=${DUCK.releaseMs}:makeup=${DUCK.makeup}`;

/** Where the graph ends: the delivered soundtrack, the voice bus, or the ducked music bus. */
export type AudioTap = "mix" | "voice" | "music";

/** The files the server resolved: bytes per music take (by takeId), per voice blob (by sha256). */
export interface AudioFiles {
  takes: Readonly<Record<string, string>>;
  voices: Readonly<Record<string, string>>;
}

export interface AudioGraph {
  /** ffmpeg input arguments, in input order. */
  inputArgs: string[];
  /** How many inputs `inputArgs` opens. */
  inputs: number;
  /** Filter chains; the soundtrack is the `[a]` pad. */
  graph: string[];
  /** Voice lines mixed in. 0 = no narration: the pre-narration graph, untouched. */
  narrated: number;
  /** Whether a music bus was ducked under the voice. */
  ducked: boolean;
}

/** Seconds as ffmpeg reads them, to the millisecond, no trailing zeros. */
export const sec = (s: number) => String(Math.round(s * 1000) / 1000);

/** One segment on the clock: trimmed to its span, at its dialled start. */
function branch(input: number, a: AudioSegment, label: string): string {
  // A block nudged before zero starts late into its own take instead.
  const skip = Math.max(0, -a.startS);
  const delayMs = Math.round(Math.max(0, a.startS) * 1000);
  return `[${input}:a]atrim=start=${sec(skip)}:duration=${sec(Math.max(0, a.durS - skip))},asetpts=PTS-STARTPTS,aresample=48000,adelay=${delayMs}:all=1[${label}]`;
}

const mixOf = (labels: string[]) => (labels.length === 1 ? labels[0] : `${labels.join("")}amix=inputs=${labels.length}:normalize=0:duration=longest,`);

/**
 * The soundtrack's inputs and filter chains, starting at ffmpeg input `first`.
 * A segment whose file the server did not resolve adds nothing — the caller
 * reports it as unreachable.
 */
export function cutAudioGraph(doc: CutDocument, files: AudioFiles, first: number, tap: AudioTap = "mix"): AudioGraph {
  const inputArgs: string[] = [];
  const graph: string[] = [];
  let n = first;
  const total = sec(doc.totalS);

  const voice: string[] = [];
  for (const a of doc.audio) {
    if (a.kind !== "voice") continue;
    const file = files.voices[a.sha256];
    if (!file) continue;
    inputArgs.push("-i", file);
    graph.push(branch(n++, a, `v${voice.length}`));
    voice.push(`[v${voice.length}]`);
  }

  // The voice bus does not depend on the music, so its tap opens no music input.
  const music: string[] = [];
  for (const a of tap === "voice" ? [] : doc.audio) {
    if (a.kind !== "take") continue;
    const file = files.takes[a.takeId];
    if (!file) continue;
    inputArgs.push("-i", file);
    graph.push(branch(n++, a, `a${music.length}`));
    music.push(`[a${music.length}]`);
  }

  if (voice.length === 0) {
    if (music.length === 0) {
      inputArgs.push("-f", "lavfi", "-t", total, "-i", "anullsrc=r=48000:cl=stereo");
      graph.push(`[${n++}:a]anull[a]`);
    } else {
      // Pad then cut: the soundtrack is exactly the ruler, never the longest take.
      graph.push(`${mixOf(music)}apad,atrim=duration=${total}[a]`);
    }
    return { inputArgs, inputs: n - first, graph, narrated: 0, ducked: false };
  }

  // One format for both buses: the compressor and the final amix want matching
  // rates and layouts, and a narration take is often mono (and may be 8 kHz).
  const bus = `aformat=sample_rates=48000:channel_layouts=stereo,apad,atrim=duration=${total}`;
  const finish = `${EXPORT_LOUDNORM},aresample=48000,atrim=duration=${total}`;
  graph.push(`${mixOf(voice)}${bus}[voice]`);
  const narrated = voice.length;

  if (tap === "voice") {
    graph.push("[voice]anull[a]");
    return { inputArgs, inputs: n - first, graph, narrated, ducked: false };
  }
  if (music.length === 0) {
    graph.push(tap === "music" ? `[voice]volume=0[a]` : `[voice]${finish}[a]`);
    return { inputArgs, inputs: n - first, graph, narrated, ducked: false };
  }

  graph.push(`${mixOf(music)}${bus}[music]`);
  if (tap === "music") {
    graph.push(`[music][voice]${DUCK_FILTER}[a]`);
  } else {
    graph.push("[voice]asplit=2[vkey][vmix]");
    graph.push(`[music][vkey]${DUCK_FILTER}[ducked]`);
    graph.push(`[ducked][vmix]amix=inputs=2:normalize=0:duration=first,${finish}[a]`);
  }
  return { inputArgs, inputs: n - first, graph, narrated, ducked: true };
}

/** The soundtrack alone, as a WAV — the stem a measurement renders (see THE TAP). */
export function cutAudioArgs(doc: CutDocument, files: AudioFiles, outPath: string, tap: AudioTap): string[] {
  const g = cutAudioGraph(doc, files, 0, tap);
  return ["-hide_banner", "-loglevel", "error", "-y", ...g.inputArgs, "-filter_complex", g.graph.join(";"), "-map", "[a]", "-c:a", "pcm_s16le", "-ar", "48000", "-t", sec(doc.totalS), outPath];
}
