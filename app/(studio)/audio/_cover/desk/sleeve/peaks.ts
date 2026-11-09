"use client";

// A SLEEVE'S WAVEFORM: the peaks of a cover's section, kept from the decode the desk already made when
// that cover was opened (../useCover.ts hears its source). The view carries no peaks and the crate never fetches a
// song to draw one - a five-minute mp3 per sleeve would be the crate's whole cost - so a cover not opened in this
// tab has none, and its sleeve draws Wave's dashed absent line.
import { useSyncExternalStore } from "react";

/** Bars on a sleeve: one per few seconds of a section is all a sidebar can show. */
const SLEEVE_BARS = 48;

const kept = new Map<string, readonly number[]>();
const listeners = new Set<() => void>();
let version = 0;

/** The section's slice of a song's peaks, resampled to the sleeve's bars by their maxima. */
export function sectionPeaks(peaks: readonly number[], lenS: number, startS: number, endS: number): readonly number[] {
  if (peaks.length === 0 || lenS <= 0 || endS <= startS) return [];
  const from = Math.floor((startS / lenS) * peaks.length);
  const to = Math.max(from + 1, Math.ceil((endS / lenS) * peaks.length));
  const span = peaks.slice(from, to);
  const per = span.length / SLEEVE_BARS;
  if (per <= 1) return span;
  return Array.from({ length: SLEEVE_BARS }, (_, i) => Math.max(0, ...span.slice(Math.floor(i * per), Math.floor((i + 1) * per))));
}

export function keepPeaks(id: string, peaks: readonly number[]): void {
  const had = kept.get(id);
  if (had !== undefined && had.length === peaks.length && had.every((p, i) => p === peaks[i])) return;
  kept.set(id, peaks);
  version++;
  for (const l of listeners) l();
}

const subscribe = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** Re-renders when any sleeve's peaks are kept; `peaksOf` reads them. */
export const usePeaksVersion = (): number => useSyncExternalStore(subscribe, () => version, () => 0);
export const peaksOf = (id: string): readonly number[] => kept.get(id) ?? [];
