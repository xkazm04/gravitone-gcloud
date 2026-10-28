// THE MULTI-STEM TRANSPORT'S ARITHMETIC (spark audio-agent-studio, stage S1), pure so it is tested
// without an AudioContext: what a stem's mute, solo and level make of its gain, where a section
// starts and ends in seconds, which sections a stem plays in, and the peaks a waveform draws from
// decoded samples. The hook that drives Web Audio with these numbers is ./useMix.ts.

/** One stem's live settings. Every field optional: absent is "as rendered" (unmuted, 0 dB, centre). */
export type StemMix = { readonly muted?: boolean; readonly solo?: boolean; readonly levelDb?: number; readonly pan?: number };

export const LEVEL_DB = { min: -60, max: 12 } as const;

/** At or below the floor a level is silence, not a very quiet stem. */
export function dbToGain(db: number): number {
  if (!Number.isFinite(db) || db <= LEVEL_DB.min) return 0;
  return 10 ** (Math.min(db, LEVEL_DB.max) / 20);
}

export const clampPan = (p: number): number => (Number.isFinite(p) ? Math.max(-1, Math.min(1, p)) : 0);

/**
 * The gain each stem plays at. When any stem is soloed only the soloed ones sound; a muted stem is
 * silent even when soloed (the person said "not this one" last about that stem, and solo is about
 * the others).
 */
export function effectiveGains(stems: readonly (StemMix & { readonly id: string })[]): Readonly<Record<string, number>> {
  const anySolo = stems.some((s) => s.solo === true);
  const out: Record<string, number> = {};
  for (const s of stems) {
    const heard = s.muted !== true && (!anySolo || s.solo === true);
    out[s.id] = heard ? dbToGain(s.levelDb ?? 0) : 0;
  }
  return out;
}

/** A section as a turn carries it: bars always, seconds when the agent measured them. */
export type SectionShape = { readonly bars: number; readonly startS?: number; readonly endS?: number };
export type Span = { readonly startS: number; readonly endS: number };

/**
 * Each section's span in seconds: the turn's own seconds when every section has them, else bars
 * laid end to end at the tempo (four beats a bar). null when neither is known - no guess.
 */
export function sectionSpans(sections: readonly SectionShape[], bpm?: number): readonly Span[] | null {
  if (sections.length === 0) return null;
  if (sections.every((s) => s.startS !== undefined && s.endS !== undefined)) return sections.map((s) => ({ startS: s.startS ?? 0, endS: s.endS ?? 0 }));
  if (bpm === undefined || !(bpm > 0)) return null;
  const bar = (4 * 60) / bpm;
  let at = 0;
  return sections.map((s) => {
    const span = { startS: at, endS: at + s.bars * bar };
    at = span.endS;
    return span;
  });
}

/** A point on a stem's section envelope: from `atS` the stem plays at `gain` (1 in, 0 out). */
export type GainStep = { readonly atS: number; readonly gain: 0 | 1 };

/**
 * The section envelope of a stem that enters only in some sections. Omitted `enters` = everywhere
 * (one step at 0). Past the last section the last section's answer holds. A length mismatch is no
 * envelope (plays everywhere): the door already refuses that shape, this never invents one.
 */
export function entersSteps(enters: readonly boolean[] | undefined, spans: readonly Span[] | null): readonly GainStep[] {
  if (enters === undefined || spans === null || enters.length !== spans.length) return [{ atS: 0, gain: 1 }];
  const steps: GainStep[] = [];
  enters.forEach((on, i) => {
    const gain = on ? 1 : 0;
    if (steps.length === 0 || steps[steps.length - 1]?.gain !== gain) steps.push({ atS: i === 0 ? 0 : (spans[i]?.startS ?? 0), gain });
  });
  return steps;
}

/** The envelope's value at a second (a seek lands mid-section and must start at that section's gain). */
export function gainAt(steps: readonly GainStep[], s: number): 0 | 1 {
  let g: 0 | 1 = steps[0]?.gain ?? 1;
  for (const st of steps) if (st.atS <= s) g = st.gain;
  return g;
}

/**
 * `n` peaks, 0..1, from decoded channels: the loudest absolute sample of every channel in each
 * of n equal windows, scaled so the loudest window is 1 (a quiet stem still draws a shape).
 * Silence is all zeros, never NaN; no samples or n < 1 is an empty list.
 */
export function peaksOf(channels: readonly ArrayLike<number>[], n: number): number[] {
  const len = channels[0]?.length ?? 0;
  const count = Math.floor(n);
  if (len === 0 || count < 1) return [];
  const out = new Array<number>(count).fill(0);
  for (let w = 0; w < count; w++) {
    const a = Math.floor((w * len) / count);
    const b = Math.max(a + 1, Math.floor(((w + 1) * len) / count));
    let m = 0;
    for (const ch of channels) for (let i = a; i < b && i < len; i++) m = Math.max(m, Math.abs(ch[i] ?? 0));
    out[w] = m;
  }
  const top = Math.max(...out);
  return top > 0 ? out.map((p) => Math.round((p / top) * 1000) / 1000) : out;
}

/** "1:05" from seconds; a negative or unknown second is "0:00". */
export function clockOf(s: number): string {
  const t = Number.isFinite(s) && s > 0 ? Math.floor(s) : 0;
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}
