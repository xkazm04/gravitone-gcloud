import type { ResourceLane } from "@gt/domain/lane";

import type { RecentLoad } from "./load";

// WHICH LOCAL RESOURCES A LANE LOADS (perfect 2026-11-08, per-lane-load-band; the Director's decision on the map).
// The night-fill's 60-80% rule is about the box, but a box is three meters and an item loads only some of them: on
// 2026-10-26 twelve drafts expired and on 10-27-2 seven more while cpu sat near 25% and a loaded Flux held the gpu
// at 80-96%, because one hot meter held every item. A draft is on seat.text, a Claude or Ollama turn that needs
// cpu and memory and no share of the card (draft.ts records 59 of 110 GB VRAM free with Flux loaded and a 17 GB
// model), so gpu utilisation alone must not hold it.
//
//   gpu.local            cpu, ram, gpu   Flux and LTX draw on the card and feed it from the host
//   seat.text            cpu, ram        a text turn
//   box.chrome           cpu, ram        a local browser (Suno, the studio) over CDP
//   box.render           cpu, ram        the reels' lane: ffmpeg and the compositor on the host
//   cloud.*              none            a vendor's own quota; nothing local is loaded
//
// A lane NOT in this table (box.blender today, or one added tomorrow) fails closed: it is judged on all three.

export type BandResource = "cpu" | "ram" | "gpu";

const ALL: readonly BandResource[] = ["cpu", "ram", "gpu"];

export const LANE_BAND_RESOURCES: { readonly [L in ResourceLane]?: readonly BandResource[] } = {
  "gpu.local": ALL,
  "seat.text": ["cpu", "ram"],
  "box.chrome": ["cpu", "ram"],
  "box.render": ["cpu", "ram"],
  "cloud.google": [],
  "cloud.elevenlabs": [],
  "cloud.leonardo": [],
  "cloud.qwen": [],
  "cloud.suno": [],
};

/** The union of what `lanes` load; every resource when one lane is unmapped. */
export function bandResourcesOf(lanes: readonly ResourceLane[]): readonly BandResource[] {
  const want = new Set<BandResource>();
  for (const lane of lanes) for (const k of LANE_BAND_RESOURCES[lane] ?? ALL) want.add(k);
  return ALL.filter((k) => want.has(k));
}

/**
 * Under the band on `resources`: each averages below the window's low. Undefined when it is; the reason otherwise.
 * An item that loads nothing local (an empty list) is never held, samples or none.
 */
export function overBandOn(l: RecentLoad, resources: readonly BandResource[]): string | undefined {
  if (resources.length === 0) return undefined;
  if (l.samples === 0) return `no load samples in the last ${l.minutes} min`;
  const read = resources.filter((k) => l.avg[k] !== undefined);
  if (read.length === 0) return `no resource read in the last ${l.minutes} min`;
  const high = read.filter((k) => (l.avg[k] ?? 0) >= l.band.low);
  if (high.length === 0) return undefined;
  return `the box is at the band: ${high.map((k) => `${k} ${Math.round((l.avg[k] ?? 0) * 100)}%`).join(" · ")} over ${l.minutes} min (low ${Math.round(l.band.low * 100)}%)`;
}
