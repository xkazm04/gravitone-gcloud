// THE LIBRARY'S MEDIA AND EXTRAS - what a probe measured about an item's bytes (MediaFacts) and
// the per-kind facts its detail shows (LibraryExtras), split out of ./library.ts, which re-exports
// every name here, so `@gt/domain/library` stays the one door a reader imports from. A leaf: it
// imports nothing, so ./library.ts can hold its detail type over these without a cycle.
//
// THE MODEL KIND (spark game-3d-assets): a game asset's finished variant - a TRELLIS.2 mesh
// finished in Blender to its class's triangle budget - as a glb (Draco off: PoF's viewer cannot
// decode it). Its closed sets are lib/foundry/mesh/types.ts's, restated here because a package
// cannot import lib/; tests/next-server/library-model.test.ts holds the two equal.

/** The bytes of a model item: binary glTF. */
export const MODEL_MIME = "model/gltf-binary";

export const MODEL_CLASSES = ["character", "weapon", "prop"] as const;
export type ModelClass = (typeof MODEL_CLASSES)[number];

export const MODEL_TECHNIQUES = ["T1", "T2", "M1", "M2"] as const;
export type ModelTechnique = (typeof MODEL_TECHNIQUES)[number];

/** The game projects a model is handed to (the `export` act), each by its own adapter. */
export const MODEL_EXPORT_PROJECTS = ["pof", "mage-arena", "bp"] as const;
export type ModelExportProject = (typeof MODEL_EXPORT_PROJECTS)[number];

/** A triangle count as its facet band (PoF's presets: prop 10k, weapon 15k, character 40k). */
export const TRIS_BANDS = ["0–10k", "10–20k", "20–40k", "40k+"] as const;
export function trisBand(n: number): (typeof TRIS_BANDS)[number] {
  return n <= 10_000 ? "0–10k" : n <= 20_000 ? "10–20k" : n <= 40_000 ? "20–40k" : "40k+";
}

/** What a glb's own header says (media-facts' parser). A count it could not take is absent, never 0. */
export type MeshFacts = {
  readonly tris: number;
  readonly verts: number;
  /** Joints across the file's skins; 0 for a static mesh. */
  readonly bones: number;
  readonly clips: number;
  readonly images: number;
  /** The extent of POSITION min/max over the scene, metres (x, y, z), when every accessor names both. */
  readonly bboxM?: readonly [number, number, number];
};

export type MediaFacts = {
  readonly sha: string;
  readonly decodable: boolean;
  readonly mime: string;
  readonly w: number | null; // pixels; null for audio
  readonly h: number | null;
  readonly durationS: number | null;
  /** A video's keyframe, itself a blob. */
  readonly posterSha: string | null;
  /** 0..255, the 1x1 average of the image or the poster. */
  readonly meanLuma: number | null;
  readonly nearBlack: boolean;
  readonly probedAt: string;
  /** The probe's own words when it could not decode. */
  readonly error: string | null;
  /** A glb's counts (model/gltf-binary only); absent for every other mime. */
  readonly mesh?: MeshFacts;
};

/** Mean luma below this is near-black (measured 2026-10-14 over the Floor's covers, index.html DARK_COVER). */
export const NEAR_BLACK_LUMA = 16;

/** A video's keyframe is written as this (the media-facts producer's poster). */
export const POSTER_MIME = "image/jpeg";


export type StyleEvidenceRow = {
  readonly run: string;
  readonly scene: string;
  readonly mechanism?: string;
  readonly verdict: "keep" | "reject";
  readonly by?: "operator" | "agent";
  readonly at?: string;
};

/**
 * A take's asked-for and measured numbers, 1:1 from v1 lib/sound/types.ts
 * SoundTake / MeasuredSound. Declared HERE because @gt/domain cannot import
 * @gt/ui; the audio components (packages/ui/src/components/audio/audio.ts, L52)
 * alias this one (Director, 2026-10-17). `measured` is null until the take was
 * measured - never zeros standing in for "not measured".
 */
export type AudioFacts = {
  readonly asked: { readonly tempoBpm: number | null; readonly key: string | null; readonly durationS: number | null };
  readonly measured: {
    readonly tempoBpm: number | null;
    readonly key: string | null;
    readonly durationS: number | null;
    readonly lufs: number | null;
    readonly truePeakDb: number | null;
    readonly energy: number | null;
  } | null;
};

/** The audio kind's extras, the shape L52's detail components take whole. */
export type AudioExtras = {
  readonly prompt: string;
  readonly negative?: string;
  readonly reasons: readonly string[];
  readonly facts: AudioFacts;
  /** The waveform, 0..1 per bucket; empty when the take was never peaked. */
  readonly peaks: readonly number[];
  /** Where the audio is served from (the take's file route), null when it has no file. */
  readonly src: string | null;
};

/** Per-kind facts the record does not facet on but the detail shows (library.js `body`). */
export type LibraryExtras = {
  readonly meta?: string;
  /** The text a non-audio item was made from: a forge prompt, a style's recipe. */
  readonly prompt?: string;
  readonly negative?: string;
  readonly observables?: Readonly<Record<string, string | undefined>>;
  readonly palette?: readonly string[];
  readonly evidence?: readonly StyleEvidenceRow[];
  /** Present on audio items only. */
  readonly audio?: AudioExtras;
  readonly file?: { readonly w?: number; readonly h?: number; readonly path?: string };
  /** The run an item came from, as its source names it (a forge run, an article run). */
  readonly run?: { readonly id: string; readonly stage?: string };
  readonly captions?: number;
  /** Present on model items only. */
  readonly model?: ModelExtras;
};


/** One gate's verdict on a model variant, as the mesh store records it (lib/foundry/mesh/types.ts GateResult). */
export type ModelGate = {
  readonly name: string;
  readonly verdict: "pass" | "warn" | "fail" | "unmeasured";
  readonly score?: number;
  readonly fails: readonly string[];
  readonly warns: readonly string[];
};

/** The model kind's extras: which asset and variant it is, what judged it, and its poster render. */
export type ModelExtras = {
  readonly asset: string;
  readonly variant: string;
  readonly class: ModelClass;
  readonly technique: ModelTechnique;
  /** What the variant did, one sentence (the round's `approach`). */
  readonly approach?: string;
  readonly budgetTris: number;
  readonly rig?: "ue5-mannequin";
  /** The poster render as an address a page can draw; absent when none was rendered. */
  readonly poster?: string;
  readonly gates: readonly ModelGate[];
  /** What the variant could not fix, each verbatim. */
  readonly limitations: readonly string[];
};
