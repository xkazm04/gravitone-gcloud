// FROM SEED — the Library composer's recipe (app/library/audio/prompts.ts
// Seed) as a GenerateRequest, so a draft aimed at ElevenLabs can be rendered
// in place instead of copied out and carried back by hand. PURE: no I/O, no
// vendor, no key — it only decides WHAT to ask for; /api/sound/generate
// (lib/sound/generate.ts) is what spends, through the same metered chokepoint
// every other render goes through.
//
// ONE DIALECT, NOT TWO. The prompt is the Library's own `compose` for the
// ElevenLabs target — the sentence a person would have pasted — with one
// difference: the exclusions travel as `negative`, not as the sentence's "No …"
// tail, because generate.ts#withNegative appends that tail itself and a seed
// that went through both would be told "No vocals. No vocals.".
//
// SUNO IS NOT A TARGET HERE. There is no Suno API; a Suno draft stays a copy.
// Asking for one is a thrown error, so a caller that forgot the gate fails
// loudly instead of rendering something nobody asked for.

import { compose, type Seed, type Target } from "@/app/library/audio/prompts";
import type { Hand } from "@/app/library/audio/vocabulary";

import type { GenerateRequest } from "./types";

/** Length rendered when the caller does not choose one — inside the vendor's
 *  3..600 s window (generate.ts DURATION_BOUNDS) and long enough to judge. */
export const DEFAULT_RENDER_S = 30;

export interface FromSeedOptions {
  /** Seconds of audio to ask for (3..600; generate.ts holds the bound). */
  durationS?: number;
  /** The take this render is a variation of. */
  parentId?: string | null;
  /** The Library draft this render answers. */
  draftId?: string | null;
  /** The one change a fan-out made, so a verdict says which axis mattered. */
  variation?: { axis: string; diff: string[] } | null;
}

export function fromSeed(seed: Seed, target: Target, hands: Record<string, Hand> = {}, opts: FromSeedOptions = {}): GenerateRequest {
  if (target !== "elevenlabs") throw new Error("only an ElevenLabs draft can be rendered here; Suno has no API");
  const avoid = seed.avoid.map((s) => s.trim()).filter(Boolean);
  return {
    kind: "music",
    provider: "elevenlabs",
    op: "compose",
    // `compose` writes the exclusions as a "No …" tail; they ride as `negative`
    // instead (see the header).
    prompt: compose({ ...seed, avoid: [] }, target, hands),
    negative: avoid.length ? avoid.join(", ") : null,
    durationS: opts.durationS ?? DEFAULT_RENDER_S,
    loop: null,
    promptInfluence: null,
    technique: avoid.length ? ["single-sentence", "negative-styles"] : ["single-sentence"],
    terms: { genre: seed.genres.slice(), mood: seed.moods.slice(), instrument: seed.instruments.slice(), sfxCategory: null },
    tempoBpm: seed.bpm,
    key: seed.key,
    origin: "library",
    parentId: opts.parentId ?? null,
    draftId: opts.draftId ?? null,
    variation: opts.variation ?? null,
    sourceTakeId: null,
    editModes: null,
    plan: null,
    huntId: null,
    nodeId: null,
    title: null,
  };
}
