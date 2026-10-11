// THE SUNO WIRE TYPES — shared by the browser driver (lib/suno/driver.ts), the
// queue + store (lib/sound/suno/*), the routes (app/api/sound/suno/**) and the
// audio adapter (lib/board/sources/audio.ts). Pure types and constants: this
// module is imported by client code and must never import node: or name a
// server-only env var.
//
// Absent-value convention: optional keys are OMITTED. `audioUrl`, `imageUrl`
// and `durationS` are `null` (not omitted) when Suno has not exposed them yet,
// because a clip that is still rendering is a known state, not a missing key.

/** The two models every job renders on. Ids are ours; the picker's visible
 *  labels live in SUNO_MODEL_LABEL and are confirmed against the live page. */
export type SunoModel = "v6" | "v6-wild";
export const SUNO_MODELS: readonly SunoModel[] = ["v6", "v6-wild"];
export const SUNO_MODEL_LABEL: Record<SunoModel, string> = { v6: "v6", "v6-wild": "v6 wild" };

/** What a Suno custom create takes. Instrumental = lyrics "[Instrumental]". */
export interface SunoFields {
  title?: string;
  style: string;
  lyrics?: string;
  exclude?: string;
}

export interface SunoLane {
  /** The group axis id the value belongs to ("group", "genre", ...). */
  axis: string;
  value: string;
}

export type SunoProposalOrigin = "custom" | "llm" | "riff" | "hunt";

export interface SunoProposal {
  id: string;
  fields: SunoFields;
  lane: SunoLane;
  origin: SunoProposalOrigin;
  /** The proposal a riff varied, or the hunt node a hunt proposal came from. */
  sourceId?: string;
  createdAt: number;
  /** Why the model drafted it — one line, shown in detail only. */
  note?: string;
  /** The last job's failure, kept so a returned card says why. */
  error?: string;
}

export type SunoPhase = "attaching" | "composing" | "creating" | "rendering" | "collecting";

export const SUNO_PHASE_WORD: Record<SunoPhase, string> = {
  attaching: "opening suno",
  composing: "filling the form",
  creating: "creating",
  rendering: "rendering",
  collecting: "collecting clips",
};

export type SunoJobState = "queued" | "active" | "done" | "failed" | "cancelled";

export interface SunoJob {
  id: string;
  proposalId: string;
  /** A snapshot: editing the proposal later does not rewrite a job. */
  fields: SunoFields;
  lane: SunoLane;
  state: SunoJobState;
  phase?: SunoPhase;
  /** The model the driver is on right now (with `phase`), for "creating v6 wild". */
  model?: SunoModel;
  models: SunoModel[];
  enqueuedAt: number;
  startedAt?: number;
  endedAt?: number;
  error?: string;
  clipIds: string[];
}

/** What the driver hands back per clip — a REFERENCE, never a file. */
export interface SunoClipRef {
  songId: string;
  /** https://suno.com/song/<songId> */
  url: string;
  audioUrl: string | null;
  imageUrl: string | null;
  title: string;
  durationS: number | null;
}

export type SunoVerdict = "keep" | "drop";

export type SunoClip = SunoClipRef & {
  id: string;
  jobId: string;
  model: SunoModel;
  createdAt: number;
  verdict: SunoVerdict | null;
};

export type SunoDriverHealth = { ok: true } | { ok: false; reason: string };

/** GET /api/sound/suno */
export interface SunoSnapshot {
  proposals: SunoProposal[];
  jobs: SunoJob[];
  clips: SunoClip[];
  driver: SunoDriverHealth;
}

/** The CDP port the dedicated profile listens on (Leonardo's was 9333). */
export const SUNO_CDP_PORT = 9334;
