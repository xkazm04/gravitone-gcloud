// THE MESH ASSET WIRE TYPES - one game asset made on this box (spark game-3d-assets): a concept
// image, one or more VARIANTS (a technique each - T1 budget generation, T2 game-camera design, a
// weapon's M1 touch-up), each a TRELLIS.2 mesh finished in Blender to its class's triangle budget,
// gated, rendered and, for a character, rigged onto UE5 Mannequin chains. Shared by the mesh and
// finish producers (lib/producers/mesh*.ts, server), the Library's mesh feed, the 3D viewer, the
// export to a game project, and /scout's asset rows. Nothing here imports Node.
//
// The shape is the lynx-bench rounds' result.json (C:\Users\kazda\ai\lynx-bench\pof3d\round*/
// result.json), which the operator's round reviews were already read against: a variant names its
// technique, says what it did and what it could not, lists its files, and carries the mesh gate's
// score, verdict, fails, warns and metrics verbatim. A gate that did not run is ABSENT, and a
// measurement it could not take reads `unmeasured` - never a pass (game-production:
// generated-mesh-acceptance / unmeasured-is-not-pass). Optional keys are omitted, never null.

export type AssetId = string;
export const ASSET_ID_RE = /^[a-z0-9][a-z0-9-]{1,60}$/;

/** PoF's polycount presets (pof src/lib/visual-gen polycount-presets.ts), in TRIANGLES. */
export const ASSET_CLASSES = ["character", "weapon", "prop"] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

export type Budget = { readonly tris: number; readonly warnAbove: number; readonly maxParts: number; readonly heightM?: number };
export const BUDGETS: { readonly [C in AssetClass]: Budget } = {
  character: { tris: 40_000, warnAbove: 60_000, maxParts: 24, heightM: 1.8 },
  weapon: { tris: 15_000, warnAbove: 22_500, maxParts: 6 },
  prop: { tris: 10_000, warnAbove: 15_000, maxParts: 6 },
};

/** How a variant was made. T1/T2 are the hero question from round 4; M1/M2 the weapon touch-ups. */
export const TECHNIQUES = ["T1", "T2", "M1", "M2"] as const;
export type Technique = (typeof TECHNIQUES)[number];
export const TECHNIQUE_LABEL: { readonly [T in Technique]: string } = {
  T1: "budget generation",
  T2: "game-camera design",
  M1: "automated touch-up",
  M2: "corrected regeneration",
};

export const VARIANT_STATUSES = ["pending", "generated", "finished", "failed"] as const;
export type VariantStatus = (typeof VARIANT_STATUSES)[number];

/** One gate's verdict, as PoF's scorers report it. */
export type GateResult = {
  readonly name: "mesh" | "rig" | "input" | "scale" | "budget";
  /** The ported scorer's version: `<pof-or-lynx-file>@<commit or date>`, so a consumer can tell which rules judged it. */
  readonly version: string;
  readonly score?: number;
  readonly verdict: "pass" | "warn" | "fail" | "unmeasured";
  readonly fails: readonly string[];
  readonly warns: readonly string[];
  readonly metrics?: Readonly<Record<string, number | boolean | readonly number[]>>;
  /** What it was graded against, verbatim ("Character budget (40000 tri target, ...)"). */
  readonly gradedAs?: string;
};

/** Asset-relative files. Every path is under the asset's directory. */
export type VariantFiles = {
  readonly raw?: string;
  /** The finished, budgeted glb (Draco OFF - PoF's viewer cannot decode it). */
  readonly glb?: string;
  readonly rigged?: string;
  readonly poster?: string;
  readonly turnaround?: string;
  readonly gameplay?: string;
  readonly blend?: string;
};

export type MeshVariant = {
  readonly id: string;
  readonly technique: Technique;
  readonly status: VariantStatus;
  readonly error?: string;
  /** What the variant did, one sentence (the round's `approach`). */
  readonly approach?: string;
  /** What it could not fix, each verbatim - the honest residue the operator reads. */
  readonly limitations: readonly string[];
  readonly files: VariantFiles;
  readonly gates: readonly GateResult[];
  readonly tris?: number;
  readonly seed?: number;
  /** Kernel job ids that made it (mesh, finish). */
  readonly jobs: readonly string[];
  /** Set by a decision (/scout's packet, or the CLI's keep): absent while undecided. */
  readonly verdict?: "kept" | "rejected";
};

export type MeshBrief = {
  readonly class: AssetClass;
  /** What it is, in craft words: "hooded archer, leather, chunky silhouette". */
  readonly subject: string;
  readonly style?: string;
  readonly technique?: string;
  readonly budgetTris: number;
  /** Characters: "ue5-mannequin" (rig.py); absent = not rigged. */
  readonly rig?: "ue5-mannequin";
};

export type MeshAsset = {
  readonly id: AssetId;
  readonly createdAt: string;
  readonly brief: MeshBrief;
  /** Asset-relative concept image - OURS (drawn from our words), never a found source. */
  readonly concept?: string;
  readonly variants: readonly MeshVariant[];
  /** The /scout night that briefed it, when one did. */
  readonly night?: string;
  readonly dry: boolean;
  /** Publishable: made from our own concept; a found source never becomes geometry. */
  readonly rights: "publishable";
};

/* ── The hand-off to a game project ───────────────────────────────────────── */

export const EXPORT_PROJECTS = ["pof", "mage-arena", "bp"] as const;
export type ExportProject = (typeof EXPORT_PROJECTS)[number];

/** What travels beside the glb into a game project: enough to import it and to know what judged it. */
export type Sidecar = {
  readonly id: string;
  readonly asset: AssetId;
  readonly variant: string;
  readonly class: AssetClass;
  readonly technique: Technique;
  readonly budgetTris: number;
  readonly tris?: number;
  readonly heightM?: number;
  readonly rig?: "ue5-mannequin";
  readonly gates: readonly GateResult[];
  readonly limitations: readonly string[];
  readonly provenance: { readonly made: string; readonly engine: string; readonly night?: string; readonly concept?: string; readonly gravitoneCommit?: string };
  readonly rights: "publishable";
};
