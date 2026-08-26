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
 * A spotting cue, as the Score surface knows it — the row the plan is
 * derived from. `durS` and `bpm` come from the cue list; `intent` is the
 * purpose sentence the spotting discipline requires every cue to carry.
 */
export interface CueBrief {
  title: string;
  intent: string;
  bpm: number;
  durS: number;
  /** The production's standing style block, restated on every call —
   *  consistency is carried, never remembered. */
  styleBlock: string[];
  /** Standing excludes beyond the engine's defaults. */
  avoid?: string[];
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
