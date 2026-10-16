import type { WirePlan } from "@/lib/music/types";

// THE AUDIO TAKE'S BAG - what v1's shelf kept in an audio `Asset.meta`, and what the Sound lab
// (app/playground) still files a render with. Moved verbatim from lib/assets.ts when the v1
// shelf retired (Phase 5, L55): the store is gone, the shape is the one ./take.ts and the lab
// read. References to app/library/audio below name the retired module the fields came from.

/** The ledger an audio take carries in `Asset.meta` — ratings, verdict, recipe
 *  lineage. `meta` itself stays `Record<string, unknown>` (the contest-winning
 *  variant's own accepted cost: an untyped bag, full-table-scan queries), so
 *  this type is a cast/guard at read sites, not a schema IndexedDB enforces. */
export interface AudioMeta {
  /** One score per rubric dimension, 1-10, each null until somebody scores
   *  it: the audio ledger rates a take one dimension at a time
   *  (app/library/audio/AudioWorkbench.tsx, keys 1-9 and 0), so a take with a
   *  melody score and nothing else is a real state, not a partial write. */
  ratings?: { melody: number | null; instrument_choice: number | null; instrument_quality: number | null };
  /** The person's call. `"proven"` is NOT written any more: it is read off
   *  the ratings (kept AND scoring 7+, app/library/audio/book.ts#verdict), and
   *  a row the previous module stored as proven reads as kept. */
  verdict: "unjudged" | "kept" | "proven" | "rejected";
  reject_reason?: string;
  vendor?: "suno" | "elevenlabs";
  genre_tags?: string[];
  mood_tags?: string[];
  instrumentation?: string[];
  tempo_bpm?: number;
  key?: string;
  /** Seconds. Absent until measured: a returned file whose metadata never
   *  loaded has no length, and a 0 would be a fake one. */
  duration_s?: number;
  sfx_category?: string;
  loopable?: boolean;
  reference_track_id?: string;
  prompt_round?: string;
  draft_id?: string;
  parent_id?: string;
  /** The composed prompt text a draft was sent with — WP3 finding: the
   *  contest-winning variant's `lineageHTML()` shows this in the Recipe chain
   *  (`it.prompt_text`), but WP1's `AudioMeta` had no field for it. Added here
   *  rather than reported as a silent gap, same cast/guard discipline as the
   *  rest of this bag — absent for a take composed before this field existed,
   *  never a guess dressed as data. */
  prompt_text?: string;
  // ── THE SOUND LAB'S FIELDS (app/playground, 2026-10-05). The lab files every
  // render into this same store so the Library's ledger is where it is judged;
  // these record what the render handed back that the bag had no place for.
  // Every one is absent on a fixture row and on a file returned by hand, and
  // absent means "not known", never a default.
  /** How the lab made the take. */
  lab_op?: LabOp;
  /** The music vendor's stored-song id — the handle a section edit references
   *  (lib/music/types.ts#WireAudioRefChunk). Without it a take cannot be
   *  edited after a reload, only re-rolled. */
  song_id?: string;
  /** The vendor's own composition plan for what was rendered, verbatim — the
   *  section list (with measured durations) a later edit ranges against. */
  plan?: WirePlan;
  /** A section edit's per-section mode, in plan order. */
  edit_modes?: LabEditMode[];
  /** Magnitude per slice, 0 to 1, measured off the bytes in the browser
   *  (app/library/audio/analysis.ts). */
  peaks?: number[];
  /** Tempo, key and energy MEASURED on the bytes. Kept apart from
   *  `tempo_bpm` / `key`, which are what the recipe ASKED for. */
  measured?: MeasuredAudio;
  /** The one change a fan-out made to produce this take (book.ts#Variation). */
  variation?: { axis: string; diff: string[] };
  /** The hunt (a fan-out of one seed) this take was rendered or returned in. */
  hunt_id?: string;
}

/** How the Sound lab produced a take: one prompt, a rendered plan, a section
 *  edit of a stored song, a sound effect. */
export type LabOp = "compose" | "plan" | "section-edit" | "sfx";

/** A section edit's per-section choice: keep by reference, regenerate under
 *  the original at a strength, or regenerate free. */
export type LabEditMode = "keep" | "low" | "medium" | "high" | "free";

export interface MeasuredAudio {
  tempo_bpm: number;
  key: string;
  energy: "high" | "medium" | "low" | null;
  /** The measurement's own name for itself, e.g. "onset autocorr · goertzel chroma". */
  method: string;
}
