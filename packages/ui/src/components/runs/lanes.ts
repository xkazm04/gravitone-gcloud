// THE DAY-LINE'S ROWS - one per resource a job can hold, then the Weir and the Calendar
// (prototype studio.js `LANES`, projects.js `rowsOf`).
//
// Keyed by @gt/domain's ResourceLane union with a mapped type, so a lane added to the domain
// is a compile error here until it has a label and its engines - the prototype's
// `laneById[id] || {gate}|| {calendar}` fallback drew any unknown id as the Calendar row.
//
// CAPACITY is how many jobs the resource runs at once, and so how many sub-tracks its row
// packs before the rest go behind +N. It is READ from @gt/domain's LANE_CAPACITY - the table
// the kernel leases slots by - not restated: this file used to carry its own copy, and the two
// disagreed (cloud.qwen 2 here, 1 in the lease), so the row drew a second Qwen job running
// that the lease would never grant. The import is the zod-free module, so a client may hold it.
//
// The engines line is what each resource carries, in the prototype's words; it is a label,
// not a claim about what is running (that is the bars).
import { LANE_CAPACITY, RESOURCE_LANES, type ResourceLane } from "@gt/domain/lane.capacity";

/** Where a resource lives: drawn as the lane chip's mark (square local, round cloud). */
export type LaneKind = "local" | "seat" | "cloud";

export type LaneSpec = {
  readonly label: string;
  readonly engines: string;
  readonly cap: number;
  readonly kind: LaneKind;
};

type LaneLabel = Omit<LaneSpec, "cap">;

const LABELS: { readonly [L in ResourceLane]: LaneLabel } = {
  "gpu.local": { label: "GPU box", engines: "Flux 2 dev fp8 · Wan 2.2 · qwen3.8:27b", kind: "local" },
  "box.render": { label: "Render box", engines: "ffmpeg · compositor", kind: "local" },
  "box.blender": { label: "Blender", engines: "mesh finish · bake · poster", kind: "local" },
  "box.chrome": { label: "Render box · Chrome", engines: "Suno v6 · Leonardo (CDP)", kind: "local" },
  "seat.text": { label: "Text seat", engines: "article turns · strips authoring · scripts · CLIs", kind: "seat" },
  "cloud.google": { label: "Google", engines: "Nano Banana · Gemini", kind: "cloud" },
  "cloud.elevenlabs": { label: "ElevenLabs", engines: "music · sfx · voice", kind: "cloud" },
  "cloud.leonardo": { label: "Leonardo", engines: "image", kind: "cloud" },
  "cloud.qwen": { label: "Qwen", engines: "recognition · vision", kind: "cloud" },
};

// Each lane is spelled ONCE, in LABELS (the mapped type makes it total); its capacity is joined
// from the lease table here. The cast is the one fromEntries needs, and runs.test pins the keys.
export const LANE_SPECS = Object.fromEntries(RESOURCE_LANES.map((l) => [l, { ...LABELS[l], cap: LANE_CAPACITY[l] }])) as { readonly [L in ResourceLane]: LaneSpec };

/** The rows in drawing order: @gt/domain's RESOURCE_LANES, from the same zod-free module. */
export const LANE_ORDER: readonly ResourceLane[] = RESOURCE_LANES;

/** The two rows below the resources: verdicts waiting on the operator, and publish slots. */
export const WEIR_ROW = { id: "weir", label: "Weir · operator", engines: "verdicts" } as const;
export const CALENDAR_ROW = { id: "calendar", label: "Calendar", engines: "slots · publish" } as const;

export type RowKind = LaneKind | "weir" | "calendar";
