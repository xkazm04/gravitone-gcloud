import { Refusal } from "./acts";
import { castOf, CAST_PROMPT_MAX } from "./cast";
import { castPrompt, type KeptCharacter } from "./characters";
import type { KeptIdea } from "./direction";
import { listSeedBatches, seedOf } from "./seedStore";
import type { StoryboardBrief } from "./storyboard";

// The storyboard door's cast compile, moved out of ./storyboard.ts (over its 400 lines) with its words unchanged.

/* ── The cast ─────────────────────────────────────────────────────────────── */

/**
 * Each brief's cast (by place; undefined: none) and its COMPILED panels - every member's identity block verbatim, then
 * the panel's own words. Refused - nothing written - when a member is not kept, breaks the audience rule (the work's
 * audience is its idea's seed's), or a compiled panel is past what Flux takes.
 */
export async function castPanels(briefs: readonly (Pick<StoryboardBrief, "cast"> & { readonly panels: readonly string[] })[], ideas: readonly (KeptIdea | undefined)[], kept: readonly KeptCharacter[]): Promise<({ readonly members: readonly KeptCharacter[]; readonly panels: readonly string[] } | undefined)[]> {
  if (!briefs.some((b) => b.cast !== undefined)) return briefs.map(() => undefined);
  const batches = await listSeedBatches();
  return briefs.map((b, i) => {
    if (b.cast === undefined) return undefined;
    const ref = ideas[i]?.idea.fromSeed;
    const audience = ref === undefined ? undefined : seedOf(batches, ref)?.seed.audience;
    const members = castOf(b.cast, kept, audience);
    if (!members.ok) throw new Refusal(`storyboard ${i + 1}: ${members.error.message}`);
    const cards = members.value.map((m) => m.card);
    const panels = b.panels.map((p) => castPrompt(cards, p));
    const long = panels.findIndex((p) => p.length > CAST_PROMPT_MAX);
    if (long >= 0) throw new Refusal(`storyboard ${i + 1}: panel ${long + 1} with its cast's identity blocks is ${panels[long]?.length} characters; a Flux prompt is at most ${CAST_PROMPT_MAX}`);
    return { members: members.value, panels };
  });
}

