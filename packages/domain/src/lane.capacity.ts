// THE RESOURCE LANES AND THEIR SLOTS, zod-free (./lane.ts re-exports both and holds the schema).
// A client may hold these: the Runs day-line draws a lane's capacity from LANE_CAPACITY itself
// (@gt/ui runs/lanes.ts), so the row a screen packs and the slots the lease grants are one number.
// tests/next-gates/client-closure.test.ts holds the zod-free line.

/** The resources a Job can hold (./lane.ts says what each one is). */
export const RESOURCE_LANES = [
  "gpu.local",
  "box.render",
  "box.blender",
  "box.chrome",
  "seat.text",
  "cloud.google",
  "cloud.elevenlabs",
  "cloud.leonardo",
  "cloud.qwen",
] as const;
export type ResourceLane = (typeof RESOURCE_LANES)[number];

/**
 * HOW MANY JOBS A RESOURCE RUNS AT ONCE (Director's decision 5, Phase 4). The
 * kernel leases a SLOT, `<lane>#<i>`, not the whole lane, so two article turns
 * share the text seat while the one GPU still runs one thing. v1 had this as
 * four separate habits (lib/gpu/lease.ts one holder; the Suno and MV queues one
 * worker each; the turn ledger's concurrent CLI sessions; the imaging router's
 * per-vendor rate) and the Runs view drew a fifth copy as UI data
 * (@gt/ui runs/lanes.ts LANE_SPECS `cap`). The table lives here so the lease
 * and the view read one number.
 */
export const LANE_CAPACITY: { readonly [L in ResourceLane]: number } = {
  "gpu.local": 1,
  "box.render": 1,
  // Blender headless (spark game-3d-assets): its own row so a mesh finish never serialises behind
  // an ffmpeg render on box.render. One at a time; what it may share the box with is admission's
  // question (./resource.ts), asked in measured memory, not in slots.
  "box.blender": 1,
  "box.chrome": 1,
  "seat.text": 4,
  "cloud.google": 3,
  "cloud.elevenlabs": 2,
  "cloud.leonardo": 2,
  "cloud.qwen": 1,
};

