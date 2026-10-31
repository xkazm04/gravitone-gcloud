// LYRIC TIMES AND THE VOICE MAP: which section each line belongs to, when it
// is sung, how far to believe that, and where a voice is heard at all.
//
// Structure first, time second. Every line gets a section from the TAG it sits
// under (sections.ts aligned tags to sections), so a line always has a home
// even when nothing else is known - that is the `section-only` floor, and a
// dry run stands on it. A time from Gemini is then held to three tests:
//   - the SNAP: the nearest onset within 0.35 s takes the start (a sung word
//     begins on a transient far more often than between two); further than
//     that, the model's time is kept and marked low;
//   - the WINDOW: a start more than a second outside its tag's section means
//     the model's order and the song's form disagree - low;
//   - the NEIGHBOURS: high only when the snap was short (< 0.15 s) and the
//     line still sits strictly between the lines either side of it.
// A Gemini section boundary is never applied; one more than 3 s from ours is
// a warning, so a reader knows where the two listeners disagree.
//
// VOICE is derived, not heard (no stems): sung where lines sit; synthetic in
// the bridge when the style prompt says the track strips to a machine voice;
// none in a gap over a second. `confirmed: false`, always, by the type.

import type { ParsedLyrics } from "./lyricsParse";
import { tagLabel } from "./lyricsParse";
import type { LyricConfidence, TimelineLyric, TimelineSection, TimelineVoice, VoiceKind } from "./types";
import { CLIP_FPS } from "./types";

const SNAP_S = 0.35;
const HIGH_SNAP_S = 0.15;
const WINDOW_GRACE_S = 1;
const ms = (t: number) => Math.round(t * 1000) / 1000;

/** The section index each line belongs to by tag: a tag's lines spread evenly
 *  over the sections it was matched to; a tag matched to none lends its lines
 *  to the section before it (or after, at the very start). */
export function lineSections(parsed: ParsedLyrics, tagSections: number[][]): number[] {
  const homeOf = (ti: number): number[] => {
    if (ti < 0) return [0];
    if (tagSections[ti]?.length) return tagSections[ti];
    for (let k = ti - 1; k >= 0; k--) if (tagSections[k]?.length) return [tagSections[k][tagSections[k].length - 1]];
    for (let k = ti + 1; k < tagSections.length; k++) if (tagSections[k]?.length) return [tagSections[k][0]];
    return [0];
  };
  const seen = new Map<number, number>();
  return parsed.lines.map((l) => {
    const k = seen.get(l.tagIndex) ?? 0;
    seen.set(l.tagIndex, k + 1);
    const home = homeOf(l.tagIndex);
    const n = l.tagIndex >= 0 ? parsed.tags[l.tagIndex].lineIds.length : parsed.lines.filter((x) => x.tagIndex < 0).length;
    return home[Math.min(home.length - 1, Math.floor((k * home.length) / Math.max(1, n)))];
  });
}

/** Every line at its section's span: the dry run, and the fallback per line. */
export function sectionOnly(parsed: ParsedLyrics, sections: TimelineSection[], homes: number[]): TimelineLyric[] {
  return parsed.lines.map((l, i) => {
    const s = sections[homes[i]];
    return { id: l.id, section: s.id, text: l.text, startS: s.startS, endS: s.endS, confidence: "section-only", source: "section" };
  });
}

/** The nearest value in sorted `xs` to `t`, or undefined if xs is empty. */
export function nearest(xs: number[], t: number): number | undefined {
  let lo = 0;
  let hi = xs.length - 1;
  if (hi < 0) return undefined;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  const a = xs[lo];
  const b = lo > 0 ? xs[lo - 1] : undefined;
  return b !== undefined && Math.abs(b - t) <= Math.abs(a - t) ? b : a;
}

/**
 * Apply validated Gemini times over the section-only floor. `times` holds
 * only the lines that passed validation; every other line keeps its section
 * span and `section-only`. Returns the lyrics and how many landed at each
 * confidence.
 */
export function snapLyrics(base: TimelineLyric[], times: Map<string, { startS: number; endS: number }>, onsets: number[], sections: TimelineSection[]): TimelineLyric[] {
  const byId = new Map(sections.map((s) => [s.id, s]));
  const timed = base.filter((l) => times.has(l.id));
  const starts = new Map<string, { t: number; d: number }>();
  let prevT = -Infinity;
  for (const l of timed) {
    const g = times.get(l.id)!;
    const o = nearest(onsets, g.startS);
    let t = g.startS;
    // d: how far the snap moved the start; Infinity when no onset was in
    // reach (the model's time stands, low), NaN when one was but the line
    // before already took it (the time stands, medium).
    let d = Infinity;
    if (o !== undefined && Math.abs(o - g.startS) <= SNAP_S) {
      if (o > prevT) {
        t = o;
        d = Math.abs(o - g.startS);
      } else d = Number.NaN;
    }
    // Snapping the line before forward can leave this start behind it; nudge
    // it past so starts stay strictly increasing.
    if (t <= prevT) {
      t = prevT + 0.05;
      d = Number.NaN;
    }
    starts.set(l.id, { t, d });
    prevT = Math.max(prevT, t);
  }
  return base.map((l) => {
    const g = times.get(l.id);
    if (!g) return l;
    const i = timed.findIndex((x) => x.id === l.id);
    const { t, d } = starts.get(l.id)!;
    const prev = i > 0 ? starts.get(timed[i - 1].id)!.t : -Infinity;
    const next = i + 1 < timed.length ? starts.get(timed[i + 1].id)!.t : Infinity;
    const sec = byId.get(l.section)!;
    const inWindow = t >= sec.startS - WINDOW_GRACE_S && t <= sec.endS + WINDOW_GRACE_S;
    const between = t > prev && t < next;
    const confidence: LyricConfidence = !inWindow || d === Infinity ? "low" : d < HIGH_SNAP_S && between ? "high" : "medium";
    let end = Math.min(g.endS + (t - g.startS), Number.isFinite(next) ? next : g.endS);
    if (end <= t) end = Math.min(t + 0.3, Number.isFinite(next) && next > t ? next : t + 0.3);
    return { ...l, startS: ms(t), endS: ms(end), confidence, source: "gemini+snap" };
  });
}

/** One warning per Gemini boundary more than 3 s from every one of ours. */
export function crossCheckBoundaries(gemini: { label: string; startS: number }[], sections: TimelineSection[]): string[] {
  const ours = sections.map((s) => s.startS);
  return gemini
    .filter((g) => g.startS > 1)
    .flatMap((g) => {
      const o = nearest(ours, g.startS) ?? 0;
      return Math.abs(o - g.startS) > 3 ? [`sections: gemini hears "${g.label}" start at ${g.startS.toFixed(1)} s; the nearest boundary here is ${o.toFixed(1)} s (kept)`] : [];
    });
}

/** Does the style prompt say the track has a machine voice somewhere? */
export const SYNTHETIC_VOICE = /synthetic voice|text[- ]to[- ]speech|\btts\b|robotic voice|vocoder|computer voice/i;

/**
 * The vocal activity map, contiguous from 0 to the track's end. Sung spans
 * are the line spans merged across gaps of a second or less, with their edges
 * trimmed to where the vocal band (mid + high) is audible - a section-only
 * span covers a whole section, and its silent bars are not singing.
 */
export function deriveVoice(lyrics: TimelineLyric[], sections: TimelineSection[], styleText: string, bands: { mid: number[]; high: number[] }, durationS: number, warnings: string[]): TimelineVoice[] {
  const machine = SYNTHETIC_VOICE.test(styleText);
  const bridgeIds = new Set(sections.filter((s) => s.lyricTag !== undefined && tagLabel(s.lyricTag) === "bridge").map((s) => s.id));
  if (machine && bridgeIds.size === 0) warnings.push("voice: the style names a synthetic voice but no section is tagged [Bridge]; every line is marked sung");
  const raw = lyrics
    .map((l) => ({ startS: l.startS, endS: l.endS, kind: (machine && bridgeIds.has(l.section) ? "synthetic" : "sung") as VoiceKind }))
    .sort((a, b) => a.startS - b.startS);
  const merged: { startS: number; endS: number; kind: VoiceKind }[] = [];
  for (const r of raw) {
    const last = merged[merged.length - 1];
    if (last && last.kind === r.kind && r.startS - last.endS <= 1) last.endS = Math.max(last.endS, r.endS);
    else if (last && r.startS < last.endS) {
      // Overlap of two kinds: the later one starts where the earlier ends.
      if (r.endS > last.endS) merged.push({ startS: last.endS, endS: r.endS, kind: r.kind });
    } else merged.push({ ...r });
  }
  const audible = (i: number) => ((bands.mid[i] ?? 0) + (bands.high[i] ?? 0)) / 2 >= 0.1;
  for (const m of merged) {
    let a = Math.floor(m.startS * CLIP_FPS);
    let b = Math.ceil(m.endS * CLIP_FPS);
    while (a < b && !audible(a)) a++;
    while (b > a && !audible(b - 1)) b--;
    if (b - a >= CLIP_FPS / 2) {
      m.startS = a / CLIP_FPS;
      m.endS = Math.min(durationS, b / CLIP_FPS);
    }
  }
  const out: TimelineVoice[] = [];
  let cursor = 0;
  for (const m of merged) {
    if (m.endS <= cursor) continue;
    const start = Math.max(cursor, m.startS);
    if (start - cursor > 1) out.push({ startS: ms(cursor), endS: ms(start), kind: "none", confirmed: false });
    else if (out.length && start > cursor) out[out.length - 1].endS = ms(start);
    out.push({ startS: ms(out.length || start > 1 ? start : 0), endS: ms(m.endS), kind: m.kind, confirmed: false });
    cursor = m.endS;
  }
  if (durationS - cursor > 1 || out.length === 0) out.push({ startS: ms(cursor), endS: ms(durationS), kind: "none", confirmed: false });
  else out[out.length - 1].endS = ms(durationS);
  return out;
}
