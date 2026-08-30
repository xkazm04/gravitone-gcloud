// The music engine's vocabulary. Mirrors lib/imaging/types.ts in spirit:
// callers speak in briefs and results, and only lib/music/elevenlabs.ts knows
// what the vendor's wire format looks like.

/** How strongly a section must blend with its neighbours. `high` is the
 *  default posture for a cue edit (the reviewer approved the rest); `low` is
 *  for a deliberate departure, which then needs a designed seam. */
export type ContextAdherence = "low" | "medium" | "high";

/**
 * One section of a piece — the unit of specification AND of later revision.
 * The registry's section-plan doctrine in type form: a piece briefed as
 * sections has addressable parts, and a note on one section becomes an edit
 * to that section instead of a reroll of the whole take.
 */
export interface PlanSection {
  /** Structural role, human-readable: "Build", "Release", "Verse 1". */
  name: string;
  /** Milliseconds, 3_000..120_000 per section (vendor-enforced). */
  durationMs: number;
  /** Styles/directions to include — layered vocabulary, not adjectives. */
  positiveStyles: string[];
  /** The fence on the side you cannot see: what must NOT appear. */
  negativeStyles: string[];
  /** Lyric lines for this section. Empty for instrumental sections — the
   *  engine then marks the section instrumental explicitly, because an empty
   *  lyric field is ambiguous to a model that can sing. */
  lyrics?: string[];
  /** Inline performance directions, rendered in braces: "{taiko joins}". */
  directions?: string[];
  adherence?: ContextAdherence;
}

/** A full piece brief: global identity + ordered sections. */
export interface MusicPlan {
  positiveGlobalStyles: string[];
  negativeGlobalStyles: string[];
  sections: PlanSection[];
}

/**
 * ONE SCENE OF THE PICTURE a cue plays under, in the music engine's own
 * vocabulary.
 *
 * Every field here is COPIED from the project's scene record — none of it is
 * authored for the brief. That is the whole point: spotting means scoring
 * AGAINST PICTURE, and until this type existed the music pipeline had never
 * seen the picture. `cueToPlan`'s only input was a hand-typed
 * `{title, intent, bpm, durS, styleBlock}`, so the duration a cue asked the
 * vendor for was a literal somebody typed next to a literal somebody else
 * typed on the timeline, free to disagree with it forever.
 *
 * Declared here rather than importing `Scene` from `app/_studio/` on purpose:
 * lib/music must not depend on a surface's fixtures, and the mapping is the
 * caller's job (see `pictureFor` in app/_studio/score.ts).
 */
export interface CueScene {
  /** 1-based narrative order, as the picture lane labels it. */
  index: number;
  /** The slugline, verbatim: "EXT. PIER 7 — NIGHT". */
  slug: string;
  /** The scene's mood, verbatim from the record. Load-bearing vocabulary —
   *  it is the only word in the brief that describes the moment. */
  mood: string;
  /** Where the scene starts on the project clock, in seconds. */
  startS: number;
  /** How long it runs, in seconds. */
  durS: number;
}

/**
 * The stretch of film a cue is scored against.
 *
 * `scenes` is contiguous and in order. It is what makes a cue BRIEFABLE: a cue
 * with no scenes is not a cue with a default duration, it is a cue with nothing
 * to score, and `cueToPlan` refuses it rather than inventing a film.
 */
export interface CuePicture {
  /** The production's title, for context the model can use. */
  projectTitle: string;
  /** The logline — one sentence of what the film IS, which is the only global
   *  narrative context a section-level brief ever gets. */
  logline: string;
  scenes: CueScene[];
}

/**
 * A spotting cue, as the Score surface knows it — the row the plan is derived
 * from.
 *
 * ── WHAT CHANGED, AND WHY `durS` IS NOT HERE ───────────────────────────────
 *
 * This interface used to carry `durS`, hand-typed beside a `startS` that was
 * hand-typed on the timeline. Two authored copies of one fact, with nothing
 * holding them together: a cue could ask the vendor for 13 seconds while the
 * span it was drawn over covered 12, and neither number would ever notice.
 *
 * The duration is now DERIVED from `picture` (see `cueDurationS`), so the
 * length of music requested is the length of film it plays under, by
 * construction. What stays hand-authored is what a human actually decides:
 * WHICH scenes a cue covers (a human spots — auto-spotting is explicitly not
 * this engine's job), the tempo, the title, and the purpose sentence.
 */
export interface CueBrief {
  title: string;
  /** The purpose sentence the spotting discipline requires every cue to carry
   *  — what this cue is FOR, in the spotter's words. */
  intent: string;
  bpm: number;
  /** The production's standing style block, restated on every call —
   *  consistency is carried, never remembered. */
  styleBlock: string[];
  /** Standing excludes beyond the engine's defaults. */
  avoid?: string[];
  /** The film this cue is scored against. Required: there is no such thing as
   *  a cue for no picture, and a default one standing in for a film that does
   *  not exist is the failure mode this field exists to make impossible. */
  picture: CuePicture;
}

export interface MusicAudio {
  /** Base64 of the encoded audio, ready for a data/blob URL client-side. */
  b64: string;
  mime: string;
}

/** Who served, with what, from what — every generated cue is traceable to
 *  the request that made it, or the rights record cannot be written. */
export interface MusicProvenance {
  vendor: "elevenlabs";
  modelId: string;
  requestedMs: number;
  plan: MusicPlan;
  generatedAt: string; // ISO
}

export interface MusicResult {
  audio: MusicAudio;
  provenance: MusicProvenance;
}

// ── Wire-level plan types (playground / advanced callers) ───────────────────
//
// The vendor's music_v2 composition-plan grammar, verbatim (docs resolved
// 2026-08-26). The Score route deliberately does NOT accept these — its
// callers speak CueBrief and the doctrine translates — but the playground's
// whole job is to exercise the raw feature surface, section editing included,
// so it speaks chunks directly.

/** A section to GENERATE. `conditioning_ref` optionally binds it to a range
 *  of an already-stored song, at `condition_strength` — "regenerate this
 *  section under the original's influence", the middle ground between keeping
 *  it verbatim and starting free. */
export interface WireGenerationChunk {
  text: string;
  duration_ms: number;
  positive_styles: string[];
  negative_styles: string[];
  context_adherence?: ContextAdherence;
  conditioning_ref?: { song_id: string; range: { start_ms: number; end_ms: number } };
  condition_strength?: ContextAdherence;
}

/** A section KEPT verbatim by reference to a stored song — the seam
 *  discipline's "kept material is referenced, never re-rendered" as an API
 *  primitive. Requires the source render to have been stored for inpainting. */
export interface WireAudioRefChunk {
  song_id: string;
  range: { start_ms: number; end_ms: number };
}

export type WireChunk = WireGenerationChunk | WireAudioRefChunk;

export interface WirePlan {
  chunks: WireChunk[];
}

/** A detailed compose result: audio plus everything the vendor knows about
 *  what it made — and, when stored for inpainting, the song id that later
 *  section edits reference. */
export interface DetailedMusicResult {
  audio: MusicAudio;
  songId: string | null;
  /** The vendor's own composition plan for what was rendered — the ground
   *  truth section list (with durations) that a section edit ranges against. */
  plan: WirePlan | null;
  /** Title/description/genres etc., as returned; shape is vendor-owned. */
  meta: Record<string, unknown> | null;
}

export interface SfxResult {
  audio: MusicAudio;
  requestedSeconds: number | null;
}
