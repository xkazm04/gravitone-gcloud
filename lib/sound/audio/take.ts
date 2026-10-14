// THE TAKE — the shape of one row on the audio shelf, and the rubric it is
// scored on. Split out of book.ts: the type declarations and the rubric are one
// unit, read without the readers that derive from them (./derived.ts) or the
// reader that fills a Take from an Asset (./takeFromAsset.ts). Moved verbatim.
import type { LabEditMode, LabOp, MeasuredAudio } from "@/lib/assets";
import type { WirePlan } from "@/lib/music/types";

/* ── the take ─────────────────────────────────────────────────────────── */

export type Kind = "track" | "sfx";
export type Status = "kept" | "rejected" | "unrated";
export type Verdict = "proven" | "kept" | "unjudged" | "rejected";
export const VORDER: readonly Verdict[] = ["proven", "kept", "unjudged", "rejected"];

export type RatingKey = "melody" | "instrument_choice" | "instrument_quality";
export type Ratings = Record<RatingKey, number | null>;

export const RUBRIC: readonly {
  key: RatingKey;
  short: string;
  label: string;
}[] = [
  { key: "melody", short: "MEL", label: "Melody" },
  { key: "instrument_choice", short: "CHO", label: "Instrument choice" },
  { key: "instrument_quality", short: "QUA", label: "Instrument quality" },
];

export interface Take {
  id: string;
  kind: Kind;
  title: string;
  duration_s: number | null;
  vendor: string | null;
  status: Status;
  created_at: number;
  ratings: Ratings | null;
  reject_reason: string | null;
  genre_tags: string[];
  mood_tags: string[];
  instrumentation: string[];
  tempo_bpm: number | null;
  key: string | null;
  reference_track_id: string | null;
  prompt_round: string | null;
  sfx_category: string | null;
  loopable: boolean;
  parent_id: string | null;
  draft_id: string | null;
  prompt_text: string | null;
  /** The returned file's name, when the take came back from a vendor. */
  file_name: string | null;
  /** Its bytes in studioDb's uploads store (lib/assets#putUploads). Null for a
   *  fixture row, which has none and plays through ./engine.ts's sketch. */
  upload_id: string | null;
  // ── what the Sound lab (app/playground) records on a take it rendered. All
  // null on a fixture row and on a file returned by hand: they are facts the
  // render handed back, never something this module infers.
  /** How the lab made it: one prompt, a rendered plan, a section edit, an effect. */
  lab_op: LabOp | null;
  /** The vendor's stored-song id — the handle a later section edit references. */
  song_id: string | null;
  /** The vendor's own composition plan for what was rendered. */
  plan: WirePlan | null;
  /** A section edit's per-section mode, in plan order. */
  edit_modes: LabEditMode[] | null;
  /** Magnitude per slice, measured off the bytes (./analysis.ts). */
  peaks: number[] | null;
  /** Tempo and key MEASURED on the bytes — beside `tempo_bpm`/`key`, which are
   *  what the recipe asked for. The two disagreeing is a finding, not a bug. */
  measured: MeasuredAudio | null;
  /** The one change that produced this take, when it came out of a fan-out. */
  variation: { axis: string; diff: string[] } | null;
  hunt_id: string | null;
  // ── what the sound store (lib/sound, round 4) adds to a row. Read off the
  // meta ./soundAdapter.ts writes; false / null on a row that never passed
  // through the store.
  /** A design sample (./audioSeed.ts), not somebody's work: drawn with a
   *  `demo` mark, cleared by the examples action, never counted by the ledger. */
  fixture: boolean;
  /** Arrangement's column, once kept (lib/sound/types.ts Stage). */
  stage: string | null;
  /** The library label a finalized take carries — what agents select it by. */
  label: string | null;
}
