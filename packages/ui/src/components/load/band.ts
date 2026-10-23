// THE LOAD BAND'S WORDS AND GEOMETRY - pure, so the drawing and its tests read the same numbers
// (spark night-load-band, 2026-10-23). The summary arrives as fractions 0..1 (@gt/domain/load);
// everything a person reads is a whole percent, rounded once here so the track's mark, the
// readout and the spoken name can never disagree by a rounding.
//
// A resource sits UNDER the band (the box idled: the night was under-scoped), IN it, or OVER it
// (the night queued itself). The average decides the row's look and each strip slot's own mean
// decides that slot's: an idle hour inside a busy night stays visible as idle.
//
// A resource no sample ever read is UNREAD, never 0%: an unread GPU (nvidia-smi [N/A] on this box)
// drawn as an idle one would tell the operator to launch GPU work into a probe that cannot see it.

import type { LoadResource, LoadSummary } from "@gt/domain/load";
import type { WaitResource } from "@gt/domain/resource";

export const LOAD_RESOURCES = ["cpu", "ram", "gpu"] as const;
export type LoadResourceName = (typeof LOAD_RESOURCES)[number];

export type BandLook = "under" | "in" | "over";

/** A fraction as a whole percent, clamped to the track. */
export const pct = (x: number): number => Math.max(0, Math.min(100, Math.round(x * 100)));

/** Where a fraction sits against the band. The band's own edges count as in it. */
export function lookOf(x: number, band: LoadSummary["band"]): BandLook {
  return x < band.low ? "under" : x > band.high ? "over" : "in";
}

export type ResourceRow =
  | { readonly name: LoadResourceName; readonly read: false }
  | {
      readonly name: LoadResourceName;
      readonly read: true;
      readonly avg: number;
      readonly p95: number;
      readonly inBand: number;
      readonly look: BandLook;
      /** Per strip slot: null where nothing was read (a gap), else its percent and look. */
      readonly strip: readonly ({ readonly v: number; readonly look: BandLook } | null)[];
    };

export function rowOf(name: LoadResourceName, r: LoadResource, band: LoadSummary["band"]): ResourceRow {
  if (r.read <= 0) return { name, read: false };
  return {
    name,
    read: true,
    avg: pct(r.avg),
    p95: pct(r.p95),
    inBand: pct(r.inBand),
    look: lookOf(r.avg, band),
    strip: r.strip.map((v) => (v < 0 ? null : { v: pct(v), look: lookOf(v, band) })),
  };
}

export const rowsOf = (load: LoadSummary): readonly ResourceRow[] => LOAD_RESOURCES.map((n) => rowOf(n, load[n], load.band));

/** The row's accessible name: `cpu average 64 percent, p95 81 percent, 72 percent of the night in band`. */
export function spokenRow(row: ResourceRow): string {
  if (!row.read) return `${row.name} unread`;
  return `${row.name} average ${row.avg} percent, p95 ${row.p95} percent, ${row.inBand} percent of the night in band`;
}

/** `commit 88 of 102 GB peak`; without a limit `commit 88 GB peak`; null when the peak was never read. */
export function commitLine(commit: LoadSummary["commit"]): string | null {
  if (commit.peakGb === undefined) return null;
  const peak = Math.round(commit.peakGb);
  return commit.limitGb === undefined ? `commit ${peak} GB peak` : `commit ${peak} of ${Math.round(commit.limitGb)} GB peak`;
}

/** `memory 41 min · comfy queue 12 min`, longest first; null when nothing waited a whole minute. */
export function waitedLine(waited: LoadSummary["waited"]): string | null {
  const parts = (Object.entries(waited) as [WaitResource, number | undefined][])
    .map(([k, m]) => [k.replace(/-/g, " "), Math.round(m ?? 0)] as const)
    .filter(([, m]) => m > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([k, m]) => `${k} ${m} min`);
  return parts.length === 0 ? null : parts.join(" · ");
}
