// A PRODUCTION AS A GRAPH (spark character-cores, 2026-11-20). A music clip is driven as stations - the track, its
// look, the cast (a character core), the keyframes, the clips and the cut - and every node names the nodes it was made
// from, so a change upstream says exactly what it makes stale. S1 draws this on the scout canvas from a fixture built
// out of a real clip; S2 makes it the kernel production's manifest (these types are that manifest's draft).
//
// A core is identity only (registry character-identity-continuity / reference-shows-only-invariants): the card's
// identity block and one neutral sheet. Wardrobe, style and expression are per-scene state, written per keyframe.

export const PRODUCTION_STATIONS = ["track", "look", "cast", "keyframe", "clip", "cut"] as const;
export type ProductionStation = (typeof PRODUCTION_STATIONS)[number];

export const PRODUCTION_NODE_STATES = ["made", "stale", "pending", "failed"] as const;
export type ProductionNodeState = (typeof PRODUCTION_NODE_STATES)[number];

/** One continuity axis the eye reads. */
export const DRIFT_AXES = ["identity", "room", "wardrobe"] as const;
export type DriftAxis = (typeof DRIFT_AXES)[number];
export type DriftReading = "holds" | "drifts";

/** The eye's reading of one frame or clip: advisory, never a verdict. `reason` is at most 140 characters. */
export type Drift = {
  readonly identity: DriftReading;
  readonly room: DriftReading;
  readonly wardrobe: DriftReading;
  readonly reason: string;
  readonly by: string;
};

export type ProductionMedia = { readonly kind: "image" | "video" | "audio"; readonly src: string };

/** Absent values are omitted keys, never null. */
export type ProductionNode = {
  readonly id: string;
  readonly station: ProductionStation;
  readonly label: string;
  readonly state: ProductionNodeState;
  /** The node ids this one was made from (its inputs); the track and look have none upstream of them. */
  readonly madeFrom: readonly string[];
  /** A digest of the inputs it was made with: a different digest upstream means this node is stale. */
  readonly inputsDigest: string;
  readonly media?: ProductionMedia;
  /** Seconds on the master clock (keyframes, clips): where it sits on the track. */
  readonly at?: number;
  /** Seconds the clip runs (clips, the cut). */
  readonly dur?: number;
  readonly drift?: Drift;
  /** The prompt or direction it was made from, verbatim (keyframes, clips). */
  readonly prompt?: string;
  /** The operator's verdict on it (review rounds), with reasons and an optional note. */
  readonly verdict?: { readonly verdict: "keep" | "reject"; readonly reasons: readonly string[]; readonly note?: string };
  /** A foreign production's node whose media the owning device holds and this one does not (its kind); `media` is then absent. */
  readonly remote?: ProductionMedia["kind"];
};

/** A character core: identity once, a portrait and one invariant sheet. `id` is `chr:<key>`. */
export type CoreRef = {
  readonly id: string;
  readonly name: string;
  /** Her identity block, verbatim (lib/foundry/scout/characters.ts identityBlock). */
  readonly identity: string;
  readonly portrait: string;
  readonly sheet?: string;
  /** Where the core came from: the clip's own lead, a scout keep, a Codex round. */
  readonly origin: string;
  /** How many devices hold pictures of her, this one included; absent when only this one does (spark device-metadata-sync). */
  readonly devices?: number;
  /** Her pictures here were redrawn on this device from her prompts (another device made her). */
  readonly redrawnHere?: true;
};

/** The track's map on the master clock, as much of it as the street draws. */
export type TrackMap = {
  readonly title: string;
  readonly seconds: number;
  readonly bpm: number;
  readonly beats: readonly number[];
  readonly sections: readonly { readonly name: string; readonly start: number; readonly end: number }[];
  readonly lyrics: readonly { readonly t: number; readonly text: string }[];
  readonly audio?: string;
};

export type Production = {
  readonly id: string;
  readonly title: string;
  readonly track: TrackMap;
  readonly look: string;
  readonly cast: CoreRef;
  readonly nodes: readonly ProductionNode[];
  /** Another device's production (spark device-metadata-sync): shown as a lesson, never changed here. */
  readonly readOnly?: true;
  /** The owning device's id and name, on a foreign production. */
  readonly owner?: string;
  readonly ownerName?: string;
};

/** A swap's redo, priced in minutes per item as measured (Codex keyframe ~4 min, H3 take ~25 min). */
export type Redo = { readonly keyframes: { readonly n: number; readonly minEach: number }; readonly clips: { readonly n: number; readonly minEach: number }; readonly cuts: number };

/** What a swap shows before it changes anything: 2-3 frames redrawn with the new core, and the redo it would queue. */
export type SwapPreview = { readonly production: string; readonly from: string; readonly to: string; readonly frames: readonly ProductionNode[]; readonly stale: readonly string[]; readonly redo: Redo };

export const MIN_PER_KEYFRAME = 4;
export const MIN_PER_CLIP = 25;

/**
 * Every node downstream of `changedId` (transitively, through `madeFrom`), in the order the nodes are given. The
 * changed node itself is not included: it was remade, not invalidated.
 */
export function staleAfter(nodes: readonly ProductionNode[], changedId: string): string[] {
  const down = new Map<string, string[]>();
  for (const n of nodes) for (const f of n.madeFrom) down.set(f, [...(down.get(f) ?? []), n.id]);
  const hit = new Set<string>();
  const queue = [...(down.get(changedId) ?? [])];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    if (hit.has(id)) continue;
    hit.add(id);
    queue.push(...(down.get(id) ?? []));
  }
  return nodes.filter((n) => hit.has(n.id)).map((n) => n.id);
}

/** The redo a set of stale ids would queue. */
export function redoOf(nodes: readonly ProductionNode[], stale: readonly string[]): Redo {
  const s = new Set(stale);
  const count = (st: ProductionStation): number => nodes.filter((n) => s.has(n.id) && n.station === st).length;
  return { keyframes: { n: count("keyframe"), minEach: MIN_PER_KEYFRAME }, clips: { n: count("clip"), minEach: MIN_PER_CLIP }, cuts: count("cut") };
}
