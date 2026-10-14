import { z } from "zod";

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
export const RESOURCE_LANES = [
  "gpu.local",
  "box.render",
  "box.chrome",
  "seat.text",
  "cloud.google",
  "cloud.elevenlabs",
  "cloud.leonardo",
  "cloud.qwen",
] as const;
export const resourceLaneSchema = z.enum(RESOURCE_LANES);
export type ResourceLane = z.output<typeof resourceLaneSchema>;
