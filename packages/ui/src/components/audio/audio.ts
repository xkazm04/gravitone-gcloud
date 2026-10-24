// What an audio take IS beside what it was ASKED to be - the Library detail's "Measured" block
// (prototype library.js :552-554, `.meas`), pure, so the arithmetic is tested without a DOM.
//
// v1 kept the two side by side on the take (lib/sound/types.ts SoundTake `tempoBpm`/`key`/
// `durationS` = the brief, `measured` = the bytes) and said why in a comment: "the two
// disagreeing is a finding, not a bug" (app/library/audio/take.ts `measured`). The prototype
// drew the measured value OR the asked one in the same cell, so a take briefed at 120 BPM and
// measured at 60 read "60" and nobody saw the half-time read. Here a cell carries both: the
// measured value is the figure, and the asked one is marked beside it only when they differ.
// LUFS, true peak and energy have no asked side - nothing briefs loudness.

import type { AudioFacts } from "@gt/domain/library";

import { sameKey } from "./brief.ts";

// The facts' type lives in @gt/domain (L49's LibraryDetail carries it, and the domain cannot
// import the kit); the kit aliases it so the detail panel hands it over whole (Director,
// 2026-10-17).
export type { AudioFacts };
export type AskedAudio = AudioFacts["asked"];
export type MeasuredAudio = NonNullable<AudioFacts["measured"]>;

export type MeasureKey = "bpm" | "key" | "length" | "lufs" | "peak" | "energy";

export type MeasureCell = {
  readonly key: MeasureKey;
  readonly label: string;
  /** The figure drawn: the measured value, else the asked one, else an em dash. */
  readonly value: string;
  /** Where the figure came from; `none` draws the dash. */
  readonly from: "measured" | "asked" | "none";
  /** The asked value, present only when a measured value DISAGREES with it. */
  readonly asked?: string;
};

/** `m:ss` (prototype `M.fmt.dur`); an hour-long file keeps counting minutes. */
export function fmtDur(s: number | null): string {
  if (s === null || !Number.isFinite(s) || s < 0) return "—";
  const r = Math.round(s);
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, "0")}`;
}

/** v1's one threshold pair (app/library/audio/analysis.ts `energyBand`): the word is read off the RMS. */
export function energyBand(rms: number): "high" | "medium" | "low" {
  return rms > 0.2 ? "high" : rms > 0.09 ? "medium" : "low";
}

const bpm = (n: number): string => String(Math.round(n * 10) / 10);

/**
 * Tempo agrees within 3 % - the tolerance v1 graded a tempo method by (app/library/audio/
 * referenceTracks.ts `tempoError`, "within x%"); a half-time read is a disagreement, which is
 * the point. A length agrees within a second (a render is never cut to the frame it was asked).
 * A key is a pitch class and a mode (./brief.ts `sameKey`): a brief typed "Am" or "G# major"
 * holds against the tracker's "A minor" / "Ab major" - compared as text, each read as a miss.
 */
const sameTempo = (a: number, m: number): boolean => a > 0 && Math.abs(m / a - 1) <= 0.03;
const sameLength = (a: number, m: number): boolean => Math.abs(a - m) <= 1;

function pair<T>(key: MeasureKey, label: string, asked: T | null, measured: T | null, show: (v: T) => string, same: (a: T, m: T) => boolean): MeasureCell {
  if (measured !== null) {
    const differs = asked !== null && !same(asked, measured);
    return { key, label, value: show(measured), from: "measured", ...(differs ? { asked: show(asked) } : {}) };
  }
  if (asked !== null) return { key, label, value: show(asked), from: "asked" };
  return { key, label, value: "—", from: "none" };
}

const solo = (key: MeasureKey, label: string, v: number | null, show: (n: number) => string): MeasureCell =>
  v === null ? { key, label, value: "—", from: "none" } : { key, label, value: show(v), from: "measured" };

/** The six cells in the prototype's order: bpm, key, length / lufs, true peak, energy. */
export function measureCells(f: AudioFacts): readonly MeasureCell[] {
  const m = f.measured;
  return [
    pair<number>("bpm", "bpm", f.asked.tempoBpm, m?.tempoBpm ?? null, bpm, sameTempo),
    pair<string>("key", "key", f.asked.key, m?.key ?? null, (k) => k, sameKey),
    pair<number>("length", "length", f.asked.durationS, m?.durationS ?? null, fmtDur, sameLength),
    solo("lufs", "lufs", m?.lufs ?? null, (n) => String(Math.round(n * 10) / 10)),
    solo("peak", "true peak", m?.truePeakDb ?? null, (n) => `${Math.round(n * 10) / 10} dB`),
    solo("energy", "energy", m?.energy ?? null, (n) => `${n.toFixed(2)} ${energyBand(n)}`),
  ];
}

/** How many cells disagree with their brief - the detail's heading counts the findings. */
export const disagreements = (cells: readonly MeasureCell[]): number => cells.filter((c) => c.asked !== undefined).length;
