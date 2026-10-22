import { z } from "zod";

import { LANE_CAPACITY, RESOURCE_LANES, type ResourceLane } from "./lane.capacity.ts";

// TWO THINGS ARE CALLED A LANE, AND THEY MUST NOT BE SWAPPABLE.
//
// The Floor has four MEDIA lanes (what a Run or a Packet is about), and the
// Runs day-line has one row per RESOURCE (what a Part or a Job occupies while
// it runs). The prototype used the bare word `lane` for both
// (docs/next/prototype/app/model.js `media`, studio.js `LANES`), and v1 used it
// for a third thing again (lib/turns/ledger.ts `WorkReceipt.lane`). Here they
// are two vocabularies with disjoint words, so a MediaLane handed where a
// ResourceLane is wanted is a type error, not a row that never lights.

/** The Floor's four rows, in the order the header binds ⇧1–4 to them. */
export const MEDIA_LANES = ["image", "article", "audio", "video"] as const;
export const mediaLaneSchema = z.enum(MEDIA_LANES);
export type MediaLane = z.output<typeof mediaLaneSchema>;

/**
 * The resources a Job can hold. `<class>.<name>`: `gpu` is the one 24 GB card
 * (lib/gpu/lease.ts — one holder, ComfyUI and Ollama both live on it), `box`
 * the render box and its Chrome profile (Suno and the Leonardo studio are
 * driven over CDP there, lib/suno, lib/imaging/providers/leonardoStudio.ts),
 * `seat` the operator's text CLI sessions, `cloud` a paid vendor with its own
 * quota.
 *
 * The prototype's seven (studio.js `LANES`) plus `cloud.qwen`: v1's imaging
 * router serves recognition from Qwen's hosted endpoint
 * (lib/imaging/providers/qwen.ts), a vendor with its own key and its own
 * rate, and folding it into `cloud.google` would put two quotas on one row.
 * `agy` (lib/imaging/providers/agy.ts) is the operator's own CLI install, so
 * it occupies `seat.text`, not a lane of its own.
 */
// The list and the capacity table live in ./lane.capacity.ts, zod-free, so the Runs view (a
// client) reads the very numbers the lease does; re-exported so every import path holds.
export { LANE_CAPACITY, RESOURCE_LANES, type ResourceLane } from "./lane.capacity.ts";
export const resourceLaneSchema = z.enum(RESOURCE_LANES);

/** The slot resources of a lane, in the order a claim tries them. */
export function laneSlots(lane: ResourceLane): readonly string[] {
  return Array.from({ length: LANE_CAPACITY[lane] }, (_, i) => `${lane}#${i + 1}`);
}

/** The lane a slot resource belongs to, or undefined for any other resource. */
export function laneOfSlot(resource: string): ResourceLane | undefined {
  const hash = resource.lastIndexOf("#");
  const lane = resourceLaneSchema.safeParse(hash < 0 ? resource : resource.slice(0, hash));
  return lane.success ? lane.data : undefined;
}

/**
 * WHERE A CRASH COSTS MONEY (owner ruling 2026-10-16). A job interrupted on a
 * PAID lane may already have spent - Suno credits, a Leonardo studio still, a
 * seat's turn, a cloud call - so its lane HOLDS until an operator has looked
 * (v1 MV/Suno switched the whole queue off: "credits may be spent - look
 * first"). The free local lanes carry on: a crashed render is re-rendered for
 * the price of electricity. Two lists, exhaustive by the mapped type.
 */
export const LANE_PAYS: { readonly [L in ResourceLane]: boolean } = {
  "gpu.local": false,
  "box.render": false,
  "box.blender": false,
  "box.chrome": true,
  "seat.text": true,
  "cloud.google": true,
  "cloud.elevenlabs": true,
  "cloud.leonardo": true,
  "cloud.qwen": true,
};
export const PAID_LANES: readonly ResourceLane[] = RESOURCE_LANES.filter((l) => LANE_PAYS[l]);
export const FREE_LANES: readonly ResourceLane[] = RESOURCE_LANES.filter((l) => !LANE_PAYS[l]);
