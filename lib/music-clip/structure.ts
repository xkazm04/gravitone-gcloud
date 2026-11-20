// THE MUSICAL STRUCTURE: where a cut, a join or an ending may land. The timeline already
// knows where the beats, the bars and the parts are; this pass reads them as a listener
// choosing a cut point would - how hard each bar hits and which way it is moving, where a
// phrase ends (a downbeat no sung line runs across, with a breath, a change in the bass or
// the energy, or a part starting there), which of those a cut can leave on (an exit) or come
// in on (an entry), and where the song stops. The 2026-11-20 r23 ad cut its refrain in half
// because nothing here said where the phrase ended; the treatments' "phrase" and "drop"
// transition grids had nothing to resolve to.
//
// Rules (registry row shift-apply-gravitone-music-structure; plan in its run folder):
//   - bar state: calm under 0.35, active from 0.55 (cutsPerBarFor's bands), building or
//     dropping on a two-bar slope of 0.12; a mid, flat bar keeps the state before it.
//   - lowIn / lowOut: the per-beat low band crossing 0.25.
//   - a phrase boundary is a downbeat no lyric line runs more than a beat across, with at
//     least one cue (a voice gap of half a beat within a beat; an energy step or a lowIn or
//     lowOut within a beat; a section start); 2-16 bars, the 4/8-bar prior breaking ties and
//     splitting longer spans.
//   - the stop: the last hit after which rms stays under 0.1 to the end.
//   - sections: same-tag neighbours merge; a start inside a sung line (begun more than two
//     beats before it - a pickup is the part's own) moves to a phrase boundary near the line.
// The thresholds and the pickup, stop and phase readings are fitted on two songs (Break the
// Sequence, Leave the Door Unlatched); score a third before calling them general.
//
// The downbeat phase is only REPORTED: assignBars guesses the one from the low band, and a
// listener picks the metrical level (track-map-before-treatment), so a song whose changes
// all land on one other beat gets a warning, never a re-numbered grid.
//
// Pure: no decode, no I/O, no model.

import { meanOver } from "./intensity";
import { cutsPerBarFor } from "./sections";
import type { BarState, TimelineBar, TimelineLyric, TimelinePhrase, TimelinePoint, TimelineSection, TimelineV1 } from "./types";
import { CLIP_FPS } from "./types";

const CALM = 0.35;
const ACTIVE = 0.55;
const SLOPE = 0.12;
const LOW = 0.25;
const STOP_RMS = 0.1;
const MIN_BARS = 2;
const MAX_BARS = 16;

export type StructureInput = Pick<TimelineV1, "track" | "beats" | "bands" | "intensity" | "sections" | "lyrics" | "voice">;

export interface Structure {
  bars: TimelineBar[];
  phrases: TimelinePhrase[];
  points: TimelinePoint[];
  sections: TimelineSection[];
  /** The lyrics with any line homed in a merged-away section re-homed to the survivor. */
  lyrics: TimelineLyric[];
  warnings: string[];
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;

function medianBeat(ts: number[]): number {
  const d = ts
    .slice(1)
    .map((t, i) => t - ts[i])
    .sort((a, b) => a - b);
  return d.length ? d[Math.floor(d.length / 2)] : 0.5;
}

function stateOf(e: number, slope: number, prev: BarState | undefined): BarState {
  if (e >= ACTIVE && slope > -SLOPE) return "active";
  if (e < CALM && slope < SLOPE) return "calm";
  if (slope >= SLOPE) return "building";
  if (slope <= -SLOPE) return "dropping";
  return prev ?? (e < (CALM + ACTIVE) / 2 ? "calm" : "active");
}

/** Lines running more than `beat` on both sides of `t`. */
function crossing(lines: TimelineLyric[], t: number, beat: number): TimelineLyric[] {
  return lines.filter((l) => l.startS < t - beat && l.endS > t + beat);
}

export function buildStructure(tl: StructureInput): Structure {
  const warnings: string[] = [];
  const dur = tl.track.durationS;
  const beatTimes = tl.beats.map((b) => b.t);
  const beat = medianBeat(beatTimes);
  const downs = tl.beats.filter((b) => b.downbeat);
  // A section-only line carries its section's span, not a sung time: it says nothing about where a phrase ends.
  const lines = tl.lyrics.filter((l) => l.confidence !== "section-only").sort((a, b) => a.startS - b.startS);
  if (lines.length === 0) warnings.push("structure: no timed lyric lines; phrases come from energy, the bass and the 4/8-bar prior alone");

  // Per-beat low band, and where it crosses LOW.
  const lowAt = tl.beats.map((b, i) => meanOver(tl.bands.low, b.t, tl.beats[i + 1]?.t ?? Math.min(dur, b.t + beat)));
  const lowEvents: { t: number; beat: number; kind: "in" | "out" }[] = [];
  for (let i = 1; i < tl.beats.length; i++) {
    if (lowAt[i] >= LOW && lowAt[i - 1] < LOW) lowEvents.push({ t: tl.beats[i].t, beat: tl.beats[i].beat, kind: "in" });
    if (lowAt[i] < LOW && lowAt[i - 1] >= LOW) lowEvents.push({ t: tl.beats[i].t, beat: tl.beats[i].beat, kind: "out" });
  }

  // Bars and their states.
  const spans = downs.map((d, k) => ({ bar: d.bar, startS: d.t, endS: downs[k + 1]?.t ?? Math.min(dur, d.t + 4 * beat) }));
  const energy = spans.map((s) => meanOver(tl.intensity, s.startS, s.endS));
  const bars: TimelineBar[] = [];
  spans.forEach((s, k) => {
    const slope = (energy[Math.min(k + 1, energy.length - 1)] ?? 0) - (energy[Math.max(k - 1, 0)] ?? 0);
    const state = stateOf(energy[k], slope, bars[k - 1]?.state);
    const lowIn = lowEvents.find((e) => e.kind === "in" && e.t >= s.startS && e.t < s.endS);
    const lowOut = lowEvents.find((e) => e.kind === "out" && e.t >= s.startS && e.t < s.endS);
    bars.push({
      bar: s.bar,
      startS: s.startS,
      endS: r3(s.endS),
      energy: r3(energy[k]),
      low: r3(meanOver(tl.bands.low, s.startS, s.endS)),
      state,
      ...(lowIn ? { lowIn: lowIn.t } : {}),
      ...(lowOut ? { lowOut: lowOut.t } : {}),
    });
  });

  // Voice gaps of half a beat or more: the voice map's silences and the gaps between lines. A breath of up to
  // two bars marks every downbeat within a beat of it; a longer silence (an intro, an instrumental) only the
  // downbeats within a beat of where the voice stops or starts - inside it the voice says nothing.
  const gaps: [number, number][] = tl.voice.filter((v) => v.kind === "none").map((v) => [v.startS, v.endS]);
  let reach = lines[0]?.endS ?? 0;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].startS - reach >= 0.5 * beat) gaps.push([reach, lines[i].startS]);
    reach = Math.max(reach, lines[i].endS);
  }
  const voiced = (t: number) => t > 0 && t < dur;
  const gapAt = (t: number) =>
    gaps.some(([a, b]) => {
      if (b - a < 0.5 * beat - 1e-9) return false;
      if (b - a <= 8 * beat) return a <= t + beat && b >= t - beat;
      return (voiced(a) && Math.abs(a - t) <= beat) || (voiced(b) && Math.abs(b - t) <= beat);
    });

  // Cues at each downbeat.
  const cuesAt = (k: number): string[] => {
    const t = bars[k].startS;
    const why: string[] = [];
    if (gapAt(t)) why.push("voice gap");
    if (k > 0 && Math.abs(energy[k] - energy[k - 1]) >= SLOPE) why.push(`energy ${energy[k] > energy[k - 1] ? "up" : "down"}`);
    const lows = lowEvents.filter((e) => Math.abs(e.t - t) <= beat + 1e-9);
    if (lows.length) why.push(...new Set(lows.map((e) => `low ${e.kind}`)));
    if (tl.sections.some((s) => s.startS > 0 && Math.abs(s.startS - t) <= beat + 1e-9)) why.push("section start");
    return why;
  };
  const crossed = bars.map((b) => crossing(lines, b.startS, beat).length > 0);
  const cues = bars.map((_, k) => cuesAt(k));

  // Phrase boundaries, left to right.
  const bounds: { k: number; why: string[] }[] = bars.length ? [{ k: 0, why: ["first downbeat", ...cues[0]] }] : [];
  const onPrior = (n: number) => n % 8 === 0 || n % 4 === 0;
  for (let k = 1; k < bars.length; k++) {
    if (crossed[k] || cues[k].length === 0) continue;
    const last = bounds[bounds.length - 1];
    if (k - last.k >= MIN_BARS) {
      bounds.push({ k, why: cues[k] });
      continue;
    }
    if (bounds.length < 2) continue;
    const before = bounds[bounds.length - 2].k;
    const better = cues[k].length > last.why.length || (cues[k].length === last.why.length && onPrior(k - before) && !onPrior(last.k - before));
    if (better && k - before >= MIN_BARS) bounds[bounds.length - 1] = { k, why: cues[k] };
  }
  // Spans past MAX_BARS split on the prior at the uncrossed downbeat nearest 8 bars in (then 4, 12).
  for (let i = 0; i < bounds.length; i++) {
    const from = bounds[i].k;
    const to = bounds[i + 1]?.k ?? bars.length;
    if (to - from <= MAX_BARS) continue;
    const at = [8, 4, 12].map((n) => from + n).find((k) => k < to && k - from >= MIN_BARS && to - k >= MIN_BARS && !crossed[k]);
    if (at === undefined) {
      warnings.push(`structure: the phrase from ${bars[from].startS} s runs ${to - from} bars; every 4/8-bar split falls inside a sung line`);
      continue;
    }
    bounds.splice(i + 1, 0, { k: at, why: ["prior", ...cues[at]] });
  }
  const phrases: TimelinePhrase[] = bounds.map((b, i) => {
    const to = bounds[i + 1]?.k ?? bars.length;
    return { startS: bars[b.k].startS, endS: to < bars.length ? bars[to].startS : bars[bars.length - 1].endS, bars: to - b.k, why: b.why };
  });

  // Points: every phrase boundary is an exit; an entry when its bar starts a line, brings the bass in, or is calm.
  const points: TimelinePoint[] = bounds.map(({ k, why }) => {
    const b = bars[k];
    const lineIn = lines.some((l) => l.startS >= b.startS - beat && l.startS < b.endS);
    const lowIn = lowEvents.some((e) => e.kind === "in" && e.t >= b.startS - beat && e.t < b.endS);
    const entryWhy = [...(lineIn ? ["a line starts"] : []), ...(lowIn ? ["bass in"] : []), ...(b.state === "calm" ? ["calm bar"] : [])];
    return { t: b.startS, bar: b.bar, kind: entryWhy.length ? "both" : "exit", stateBefore: bars[k - 1]?.state ?? "calm", stateAfter: b.state, why: [...why, ...entryWhy] };
  });

  // The stop: the last hit before rms falls under STOP_RMS for good.
  const rms = tl.bands.rms;
  let lastLoud = rms.length - 1;
  while (lastLoud >= 0 && rms[lastLoud] < STOP_RMS) lastLoud--;
  if (lastLoud >= 0 && lastLoud < rms.length - 1) {
    const decayEndS = (lastLoud + 1) / CLIP_FPS;
    const from = Math.max(0, Math.floor((decayEndS - 4 * beat) * CLIP_FPS));
    let peak = 0;
    for (let f = from; f <= lastLoud; f++) peak = Math.max(peak, rms[f]);
    let hit = lastLoud;
    while (hit > from && rms[hit] < 0.8 * peak) hit--;
    const hitS = hit / CLIP_FPS;
    const onBeat = tl.beats.reduce<(typeof tl.beats)[number] | undefined>((best, b) => (Math.abs(b.t - hitS) <= beat / 2 && (!best || Math.abs(b.t - hitS) < Math.abs(best.t - hitS)) ? b : best), undefined);
    const t = onBeat?.t ?? r3(hitS);
    const bar = [...bars].reverse().find((b) => b.startS <= t);
    points.push({ t, bar: bar?.bar ?? 0, kind: "stop", stateBefore: bar?.state ?? "calm", stateAfter: "calm", why: [`last hit, rms under ${STOP_RMS} from ${r3(decayEndS)} s to the end`], decayEndS: r3(decayEndS) });
  } else warnings.push(`structure: no stop - rms does not stay under ${STOP_RMS} to the end (a fade or a hard cut)`);

  // Phase evidence, reported only: where the bass comes back after a bar or more without it, and the stop. A
  // lowIn after a single beat is the groove's own rhythm (a kick on one beat of four), not a change in the form.
  const entries = tl.beats.filter((_, i) => i >= 4 && lowAt[i] >= LOW && lowAt.slice(i - 4, i).every((v) => v < LOW)).map((b) => b.beat);
  const events = [...entries, ...points.filter((p) => p.kind === "stop").map((p) => tl.beats.find((b) => b.t === p.t)?.beat)].filter((b): b is 1 | 2 | 3 | 4 => b !== undefined);
  const byBeat = [1, 2, 3, 4].map((n) => events.filter((b) => b === n).length);
  const top = byBeat.indexOf(Math.max(...byBeat)) + 1;
  if (events.length >= 4 && top !== 1 && byBeat[top - 1] >= 0.75 * events.length) {
    warnings.push(`beats: ${byBeat[top - 1]} of ${events.length} structural changes land on beat ${top}; the downbeat may be beat ${top}`);
  }

  const fixed = fixSections(tl, lines, points, beat, warnings);
  return { bars, phrases, points, sections: fixed.sections, lyrics: fixed.lyrics, warnings };
}

/** Same-tag neighbours merge; a start inside a sung line moves to a phrase boundary near the line's end. */
function fixSections(tl: StructureInput, lines: TimelineLyric[], points: TimelinePoint[], beat: number, warnings: string[]) {
  const merged: TimelineSection[] = [];
  const rehome = new Map<string, string>();
  for (const s of tl.sections) {
    const prev = merged[merged.length - 1];
    if (prev && s.lyricTag !== undefined && s.lyricTag === prev.lyricTag) {
      warnings.push(`sections: ${s.id} at ${s.startS} s merged into ${prev.id} (both [${s.lyricTag}])`);
      rehome.set(s.id, prev.id);
      prev.endS = s.endS;
      continue;
    }
    merged.push({ ...s });
  }
  const bounds = points.filter((p) => p.kind !== "stop").map((p) => p.t);
  const bar = 4 * beat;
  for (let i = 1; i < merged.length; i++) {
    const s = merged[i];
    // A line begun within two beats of the start is its pickup ("Break the sequence." into chorus 2), not a line
    // the part starts inside of.
    const inside = crossing(lines, s.startS, beat).filter((l) => l.startS < s.startS - 2 * beat);
    if (!inside.length) continue;
    const line = inside[0];
    const after = bounds.find((t) => t >= line.endS - beat && t <= line.endS + 2 * bar && t < s.endS);
    const before = [...bounds].reverse().find((t) => t <= line.startS + beat && t >= s.startS - 2 * bar && t > merged[i - 1].startS);
    const to = after ?? before;
    if (to === undefined) {
      warnings.push(`sections: ${s.id} starts at ${s.startS} s inside ${line.id}; no phrase boundary within two bars (kept)`);
      continue;
    }
    warnings.push(`sections: ${s.id} moved ${s.startS} -> ${to} s, out of ${line.id} (${line.startS}-${line.endS} s)`);
    s.startS = to;
    merged[i - 1].endS = to;
  }
  for (const s of merged) {
    s.intensity = Math.round(meanOver(tl.intensity, s.startS, s.endS) * 1000) / 1000;
    s.cutsPerBar = cutsPerBarFor(s.intensity, s.label);
  }
  const lyrics = tl.lyrics.map((l) => (rehome.has(l.section) ? { ...l, section: rehome.get(l.section) as string } : l));
  return { sections: merged, lyrics };
}

export interface WindowAsk {
  targetS: number;
  minS: number;
  maxS: number;
  /** Allow one join, from an exit to a later entry whose state matches what is heard before it. */
  join?: boolean;
}

export type WindowChoice = { pieces: { fromS: number; toS: number }[]; why: string[] } | { refused: true; why: string[] };

/** A cut of the song from `minS` to `maxS` long, nearest `targetS`: it starts on a calm entry, ends on an exit
 *  or the stop, and joins only exit to entry in matching states. It refuses rather than end anywhere else. */
export function chooseWindow(st: Pick<Structure, "points" | "bars">, ask: WindowAsk): WindowChoice {
  const beat = st.bars.length > 1 ? (st.bars[st.bars.length - 1].startS - st.bars[0].startS) / (4 * (st.bars.length - 1)) : 0.5;
  const starts = st.points.filter((p) => (p.kind === "entry" || p.kind === "both") && p.stateAfter === "calm");
  const entries = st.points.filter((p) => p.kind === "entry" || p.kind === "both");
  const exits = st.points.filter((p) => p.kind !== "entry");
  if (!starts.length) return { refused: true, why: ["no calm entry to start on"] };
  type Cand = { pieces: TimelinePoint[][]; dur: number };
  let best: Cand | undefined;
  const rank = (c: Cand) => [Math.round(Math.abs(c.dur - ask.targetS) / beat), c.pieces[c.pieces.length - 1][1].kind === "stop" ? 0 : 1, c.pieces.length];
  const consider = (c: Cand) => {
    if (c.dur < ask.minS || c.dur > ask.maxS) return;
    if (!best) return void (best = c);
    const a = rank(c);
    const b = rank(best);
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return void (a[i] < b[i] && (best = c));
  };
  for (const s of starts) {
    for (const x of exits) {
      if (x.t <= s.t || x.t - s.t > ask.maxS) continue;
      consider({ pieces: [[s, x]], dur: x.t - s.t });
      if (!ask.join || x.kind === "stop") continue;
      for (const n of entries) {
        if (n.t <= x.t || n.stateAfter !== x.stateBefore) continue;
        for (const y of exits) if (y.t > n.t && x.t - s.t + y.t - n.t <= ask.maxS) consider({ pieces: [[s, x], [n, y]], dur: x.t - s.t + y.t - n.t });
      }
    }
  }
  if (!best) return { refused: true, why: [`no calm entry to exit${ask.join ? " (with one matching join)" : ""} runs ${ask.minS}-${ask.maxS} s`] };
  const chosen: Cand = best;
  const why = chosen.pieces.flatMap(([a, z], i) => [
    `${i === 0 ? "start" : "join in"} ${a.t} s (bar ${a.bar}, ${a.stateAfter}): ${a.why.join(", ")}`,
    `${i === chosen.pieces.length - 1 ? "end" : "join out"} ${z.t} s (bar ${z.bar}, ${z.kind === "stop" ? "the stop" : `${z.stateBefore} before`}): ${z.why.join(", ")}`,
  ]);
  return { pieces: chosen.pieces.map(([a, z]) => ({ fromS: a.t, toS: z.t })), why };
}
