// DRAFTS — the manual round-trip through Suno / ElevenLabs: a draft is the text
// a human copied out, and a returned file is filed back against it. Split out of
// book.ts. Moved verbatim.
import type { AudioMeta } from "@/lib/assets";
import { blankSeed, seedOf, type Seed, type Target } from "./prompts";
import type { Take } from "./take";

/* ── drafts: the manual round-trip through Suno / ElevenLabs ───────────── */

export interface Draft {
  id: string;
  created_at: number;
  copied_at: number | null;
  text: string;
  target: Target;
  seed: Seed;
  parent_id: string | null;
  ref_id: string | null;
  /** Set when the draft was one lane of a Sound lab hunt (app/playground):
   *  the return then joins that hunt, carrying the change it was sent for.
   *  Absent on every draft the Library writes. */
  hunt_id?: string;
  variation?: { axis: string; diff: string[] };
}

/** A draft's returns are the takes that name it — derived, not stored, so a
 *  deleted take cannot linger in a draft's list. */
export const returnsOf = (draftId: string, takes: readonly Take[]) => takes.filter((t) => t.draft_id === draftId);

/** A new draft, before it is copied. Was inline in AudioWorkbench#copyDraft;
 *  lifted so the Sound lab files its Suno drafts into the SAME book, and a
 *  return dropped in either place attaches to the draft that asked for it. */
export function newDraft(
  seed: Seed,
  target: Target,
  text: string,
  parent: string | null,
  ref: string | null,
  now: number = Date.now(),
): Draft {
  return {
    id: `dr-${now.toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    created_at: now,
    copied_at: null,
    text,
    target,
    seed,
    parent_id: parent,
    ref_id: ref,
  };
}

/** What a returned file is filed with: its draft, its parent, the recipe it
 *  was asked for (core.js#attachReturn). Was inline in AudioWorkbench#attach;
 *  the Sound lab's drop zone files through the same function. Absent fields
 *  are dropped, never written as undefined. */
export function returnMeta(d: Draft | undefined, parent: Take | undefined): Partial<AudioMeta> {
  const seed = d?.seed ?? (parent ? seedOf(parent) : blankSeed());
  const meta: Partial<AudioMeta> = {
    vendor: d?.target,
    parent_id: parent?.id,
    draft_id: d?.id,
    prompt_text: d?.text,
    genre_tags: seed.genres,
    mood_tags: seed.moods,
    instrumentation: seed.instruments,
    tempo_bpm: seed.bpm ?? undefined,
    key: seed.key ?? undefined,
    reference_track_id: parent?.reference_track_id ?? d?.ref_id ?? undefined,
    sfx_category: parent?.sfx_category ?? undefined,
    loopable: parent ? parent.loopable : undefined,
    hunt_id: d?.hunt_id,
    variation: d?.variation,
  };
  for (const k of Object.keys(meta) as (keyof AudioMeta)[]) if (meta[k] === undefined) delete meta[k];
  return meta;
}
