// THE ANALYSIS: an mp3, its lyrics and its style prompt in; the TimelineV1 every
// later stage reads out. Order matters and is the order a listener would take:
// how loud and where (spectrum), how fast (tempo), where the beats fall
// (beats), how hard each bar hits (intensity), what the parts are (sections,
// lyrics' tags), when the words are sung (Gemini, held to the onsets), where a
// voice is heard (derived). Every fallback the pass takes is a line in
// `warnings` - a timeline that quietly guessed is worse than one that says so.
//
// SUNO: when the input names its Suno song, Suno's own measurement (suno.ts;
// free calls) takes the beat grid, the tempo, the key, the section boundaries
// and the word timings; the local DSP keeps the bands, onsets, intensity and
// voice, and stands for any part Suno does not answer.
//
// Spend: at most one Gemini call, only when `dry` is false AND a key is
// present AND Suno gave no word timings. The CLI decides `dry` (it asks for --yes before a live call); this
// module never prompts. A Gemini failure is a warning and the section-only
// floor, never a failed analysis.

import { reanchorSections } from "./anchor";
import { crossCheckBoundaries, deriveVoice, lineSections, sectionOnly, snapLyrics } from "./align";
import { assignBars, bpmFromBeats, refineBeatTimes, trackBeatFrames } from "./beats";
import { ANALYSIS_RATE, decodeMono, readTrack } from "./decode";
import { pickOnsets, spectrum } from "./dsp";
import { askGeminiForLineTimes, DEFAULT_GEMINI_MODEL, validateLineTimes, type FetchLike } from "./gemini";
import { intensityCurve } from "./intensity";
import { parseLyrics } from "./lyricsParse";
import { buildSections, sectionsWanted } from "./sections";
import { alignLines, boundaryDisagreement, downbeatDisagreement, liveSunoGrid, sunoBeats, sunoBpm, sunoSections, sunoStarts, sungWords, tempoDisagreement, withSunoLetters, type SunoGrid } from "./suno";
import { estimateTempo, parseBpmPrior, tempoCurve } from "./tempo";
import type { AnalyzeInput, TimelineLyric, TimelineV1 } from "./types";
import { CLIP_FPS } from "./types";

/** Seams for tests and the CLI: the vendor's fetch and key. Optional, so the
 *  committed signature `analyzeTrack(input)` is unchanged. */
export interface AnalyzeSeams {
  fetch?: FetchLike;
  apiKey?: string;
  /** Suno's grid for a song id; the live client by default. */
  sunoGrid?: (id: string) => Promise<SunoGrid>;
}

const MIME: Record<string, string> = { mp3: "audio/mp3", wav: "audio/wav", flac: "audio/flac", ogg: "audio/ogg", m4a: "audio/aac", aac: "audio/aac" };

export async function analyzeTrack(input: AnalyzeInput, seams: AnalyzeSeams = {}): Promise<TimelineV1> {
  const warnings: string[] = [];
  const { track, bytes } = await readTrack(input.audioPath);
  const pcm = await decodeMono(input.audioPath, ANALYSIS_RATE);
  let grid: SunoGrid | undefined;
  if (input.suno && input.dry) warnings.push(`suno: dry run - the Suno grid for ${input.suno.id} was not fetched; the local grid stands`);
  else if (input.suno) {
    grid = await (seams.sunoGrid ?? liveSunoGrid)(input.suno.id);
    warnings.push(...grid.warnings);
  }
  const sa = grid?.analysis;
  const frames = Math.round(track.durationS * CLIP_FPS);
  const sp = spectrum(pcm, ANALYSIS_RATE, frames);
  const onsets = pickOnsets(sp.env, sp.envRate);

  // Tempo: the prior breaks octave ties only; the published figure is the beats'.
  const bpmPrior = parseBpmPrior(input.styleText);
  const est = estimateTempo(sp.env, sp.envRate, bpmPrior);
  warnings.push(...est.warnings);
  const beatTimes = refineBeatTimes(trackBeatFrames(sp.env, sp.envRate, est.bpm), sp.env, sp.envRate);
  const strength = (t: number) => {
    const f = Math.min(frames - 1, Math.max(0, Math.round(t * CLIP_FPS)));
    const e = Math.min(sp.env.length - 1, Math.max(0, Math.round(t * sp.envRate)));
    return (sp.low[f] ?? 0) + sp.env[e] / 4;
  };
  let beats = assignBars(beatTimes, strength);
  let bpmGlobal = bpmFromBeats(beatTimes) ?? Math.round(est.bpm * 100) / 100;
  // Suno's grid, where it gave one, replaces the tracked beats; the disagreement is said.
  const sb = sa ? sunoBeats(sa) : undefined;
  const sunoTimes = (sa?.beats ?? []).map((b) => b.time_s).sort((a, b) => a - b);
  let fromSuno = false;
  if (sa && sb && sunoTimes.length > 0) {
    warnings.push(...sb.warnings);
    const local = { beats, bpm: bpmGlobal };
    beats = sb.beats ?? assignBars(sunoTimes, strength);
    bpmGlobal = sunoBpm(sa) ?? bpmFromBeats(sunoTimes) ?? bpmGlobal;
    fromSuno = true;
    warnings.push(...tempoDisagreement(bpmGlobal, local.bpm));
    warnings.push(...downbeatDisagreement(beats.filter((b) => b.downbeat).map((b) => b.t), local.beats.filter((b) => b.downbeat).map((b) => b.t)));
  } else if (sa) warnings.push("beats: suno's analysis carries no beats; the local beat tracker stands");
  if (beats.length < 8) warnings.push(`beats: only ${beats.length} beats tracked; the grid is not fit to cut on`);
  if (bpmPrior !== undefined && Math.abs(bpmGlobal - bpmPrior) / bpmPrior > 0.05) {
    warnings.push(
      fromSuno
        ? `tempo: suno's ${bpmGlobal} BPM disagrees with the style prompt's ${bpmPrior} by more than 5%; suno stands`
        : `tempo: detected ${bpmGlobal} BPM disagrees with the style prompt's ${bpmPrior} by more than 5%; the detection stands`,
    );
  }
  const curve = tempoCurve(beats);

  const intensity = intensityCurve(sp.rms, sp.low, sp.flux, bpmGlobal);
  const parsed = parseLyrics(input.lyricsText);
  const sectionInput = {
    durationS: track.durationS,
    bands: { low: sp.low, mid: sp.mid, high: sp.high },
    flux: sp.flux,
    onsets,
    downbeats: beats.filter((b) => b.downbeat).map((b) => b.t),
    intensity,
    tags: parsed.tags,
  };
  let pass = buildSections(sectionInput);
  // Suno's boundaries replace the novelty pass's when the lyric tags can be laid over them (the
  // count is within the two the builder tolerates); otherwise the local boundaries stand and
  // Suno's letters are kept by overlap only.
  const spans = sa ? sunoSections(sa) : [];
  let sunoBounds = false;
  if (spans.length > 0) {
    const want = sectionsWanted(parsed.tags);
    if (parsed.tags.length === 0 || Math.abs(spans.length - want) <= 2) {
      const starts = sunoStarts(spans);
      warnings.push(...boundaryDisagreement(starts, pass.sections.map((x) => x.startS)));
      pass = buildSections({ ...sectionInput, boundaries: starts });
      sunoBounds = true;
    } else warnings.push(`sections: suno marks ${spans.length} parts against the ${want} the lyrics name; the local boundaries stand, suno's letters kept by overlap`);
  }
  warnings.push(...pass.warnings);
  let sections = pass.sections;
  if (sections.length < 5) warnings.push(`sections: only ${sections.length} heard; fewer than the five a clip's structure is planned on`);

  const homes = lineSections(parsed, pass.tagSections);
  let lyrics: TimelineLyric[] = sectionOnly(parsed, sections, homes);
  /** The sung lines get a say in where the parts begin (anchor.ts); the lyrics are then re-homed. */
  const reanchor = (firstLineS: (number | undefined)[]) => {
    const re = reanchorSections({ pass, tags: parsed.tags, firstLineS, downbeats: beats.filter((b) => b.downbeat).map((b) => b.t), intensity, durationS: track.durationS });
    if (!re) return;
    sections = re.result.sections;
    for (let i = warnings.length - 1; i >= 0; i--) if (warnings[i].includes("heard no section of its own")) warnings.splice(i, 1);
    warnings.push(...re.notes, ...re.result.warnings);
    lyrics = sectionOnly(parsed, sections, lineSections(parsed, re.result.tagSections));
  };
  const aligned = grid?.alignment ? alignLines(parsed.lines, sungWords(grid.alignment)) : undefined;
  if (aligned?.size === 0 && parsed.lines.length > 0) warnings.push("lyrics: suno's alignment matched no line of the lyrics file; the line times fall back to Gemini");
  if (parsed.lines.length === 0) warnings.push("lyrics: no lines in the lyrics file");
  else if (aligned && aligned.size > 0) {
    // Suno's word timings: the Gemini call is skipped. Suno's own boundaries are not split by the
    // line times (Suno stands); a local pass is re-anchored on them as on Gemini's.
    if (!sunoBounds) reanchor(parsed.tags.map((t) => (t.lineIds[0] !== undefined ? aligned.get(t.lineIds[0])?.startS : undefined)));
    lyrics = lyrics.map((l) => {
      const a = aligned.get(l.id);
      return a ? { ...l, startS: a.startS, endS: a.endS, confidence: a.confidence, source: "suno-align" as const, words: a.words } : l;
    });
    const missed = lyrics.filter((l) => l.source !== "suno-align").map((l) => l.id);
    if (missed.length) warnings.push(`lyrics: suno's alignment placed ${aligned.size} of ${lyrics.length} lines; ${missed.length} line(s) are section-only: ${missed.join(", ")}`);
  } else if (input.dry) warnings.push("lyrics: dry run - no Gemini call; every line carries its section's span (section-only)");
  else {
    const apiKey = seams.apiKey ?? process.env.GOOGLE_AI_API_KEY?.trim();
    if (!apiKey) warnings.push("lyrics: GOOGLE_AI_API_KEY is not set; every line carries its section's span (section-only)");
    else {
      const ext = track.file.split(".").pop()?.toLowerCase() ?? "";
      const answer = await askGeminiForLineTimes({
        audio: bytes,
        mimeType: MIME[ext] ?? "audio/mp3",
        lines: parsed.lines.map((l) => (l.tagIndex >= 0 ? { id: l.id, text: l.text, tag: parsed.tags[l.tagIndex].tag } : { id: l.id, text: l.text })),
        durationS: track.durationS,
        apiKey,
        model: process.env.MUSIC_CLIP_GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL,
        ...(seams.fetch ? { fetch: seams.fetch } : {}),
      });
      if (!answer.ok) warnings.push(`lyrics: the Gemini call failed, every line is section-only - ${answer.error}`);
      else {
        const v = validateLineTimes(answer.value, parsed.lines.map((l) => l.id), track.durationS);
        // The sung lines get a say in where the parts begin (anchor.ts), then
        // every line is judged against the parts as re-anchored.
        reanchor(parsed.tags.map((t) => (t.lineIds[0] !== undefined ? v.times.get(t.lineIds[0])?.startS : undefined)));
        lyrics = snapLyrics(lyrics, v.times, onsets, sections);
        if (v.dropped.length) warnings.push(`lyrics: ${v.dropped.length} line(s) fell back to section-only: ${v.dropped.map((d) => `${d.id} ${d.why}`).join("; ")}`);
        warnings.push(...crossCheckBoundaries(v.sections, sections));
      }
    }
  }
  const counts = { high: 0, medium: 0, low: 0, "section-only": 0 };
  for (const l of lyrics) counts[l.confidence]++;
  if (!input.dry && (counts.low > 0 || counts["section-only"] > 0)) {
    warnings.push(`lyrics: confidence high ${counts.high} / medium ${counts.medium} / low ${counts.low} / section-only ${counts["section-only"]}`);
  }

  if (spans.length > 0) sections = withSunoLetters(sections, spans);
  const voice = deriveVoice(lyrics, sections, input.styleText, { mid: sp.mid, high: sp.high }, track.durationS, warnings);

  return {
    v: 1,
    track,
    fps: CLIP_FPS,
    tempo: { ...(bpmPrior !== undefined ? { bpmPrior } : {}), bpmGlobal, curve },
    ...(sa?.key ? { key: sa.key } : {}),
    beats,
    bands: { low: sp.low, mid: sp.mid, high: sp.high, rms: sp.rms },
    onsets,
    intensity,
    sections,
    lyrics,
    voice,
    warnings,
  };
}
