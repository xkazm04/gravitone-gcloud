// THE DAY-LINE'S ROWS - one per resource a job can hold, then the Weir and the Calendar
// (prototype studio.js `LANES`, projects.js `rowsOf`).
//
// Keyed by @gt/domain's ResourceLane union with a mapped type, so a lane added to the domain
// is a compile error here until it has a label, a capacity and its engines - the prototype's
// `laneById[id] || {gate}|| {calendar}` fallback drew any unknown id as the Calendar row.
//
// CAPACITY is how many jobs the resource runs at once, and so how many sub-tracks its row
// packs before the rest go behind +N. The prototype's numbers, kept: one GPU card (lib/gpu/
// lease.ts - one holder), one render box and its one Chrome profile, four text sessions,
// Google ×3, ElevenLabs ×2, Leonardo ×2. `cloud.qwen` is new (plan §8.7): ×2, because v1
// measured a batch at concurrency 3 timing out four times on the primary model
// (lib/imaging/providers/qwen.ts) - two is the last width v1 saw hold.
//
// The engines line is what each resource carries, in the prototype's words; it is a label,
// not a claim about what is running (that is the bars).
import type { ResourceLane } from "@gt/domain/lane";

/** Where a resource lives: drawn as the lane chip's mark (square local, round cloud). */
export type LaneKind = "local" | "seat" | "cloud";

export type LaneSpec = {
  readonly label: string;
  readonly engines: string;
  readonly cap: number;
  readonly kind: LaneKind;
};

export const LANE_SPECS: { readonly [L in ResourceLane]: LaneSpec } = {
  "gpu.local": { label: "GPU box", engines: "Flux 2 dev fp8 · Wan 2.2 · qwen3.8:27b", cap: 1, kind: "local" },
  "box.render": { label: "Render box", engines: "ffmpeg · compositor · strips", cap: 1, kind: "local" },
  "box.chrome": { label: "Render box · Chrome", engines: "Suno v6 · Leonardo (CDP)", cap: 1, kind: "local" },
  "seat.text": { label: "Text seat", engines: "article turns · scripts · CLIs · 4 sessions", cap: 4, kind: "seat" },
  "cloud.google": { label: "Google", engines: "Nano Banana · Gemini", cap: 3, kind: "cloud" },
  "cloud.elevenlabs": { label: "ElevenLabs", engines: "music · sfx · voice", cap: 2, kind: "cloud" },
  "cloud.leonardo": { label: "Leonardo", engines: "image", cap: 2, kind: "cloud" },
  "cloud.qwen": { label: "Qwen", engines: "recognition · vision", cap: 2, kind: "cloud" },
};

/**
 * The rows in drawing order: @gt/domain's RESOURCE_LANES, restated because that module holds
 * the zod schema and a client may not load zod (tests/next-gates/client-closure.test.ts). The
 * unit test holds the two lists equal, order included, so a lane added there fails here.
 */
export const LANE_ORDER: readonly ResourceLane[] = ["gpu.local", "box.render", "box.chrome", "seat.text", "cloud.google", "cloud.elevenlabs", "cloud.leonardo", "cloud.qwen"];

/** The two rows below the resources: verdicts waiting on the operator, and publish slots. */
export const WEIR_ROW = { id: "weir", label: "Weir · operator", engines: "verdicts" } as const;
export const CALENDAR_ROW = { id: "calendar", label: "Calendar", engines: "slots · publish" } as const;

export type RowKind = LaneKind | "weir" | "calendar";
