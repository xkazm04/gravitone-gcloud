// A KEPT IDEA COMPOSED AS A VIDEO before any video is made (spark scout-storyboards, 2026-10-24).
//
// The operator: "clips are generated in isolation and full videos are following only short idea approved in
// the beginning. We will need concept in graph/pipeline to create video composition proving idea can become
// final content." A storyboard is that proof: up to five rough frames drawn by the local Flux model from the
// seat's words, a paragraph and bullets saying the vision, judged whole on the night's packet. A kept one is
// the root every full-video act must name (`keptStoryboardFor`); nothing here makes the video.
//
// WP0 stub (Director): the signatures are final, the bodies are WP4's.

import type { ActContext } from "./acts";
import type { Night, NightId, StoryboardCandidate } from "./types";

/** What a test injects in place of the Flux producer's drive; production passes none. */
export type StoryboardEngines = {
  /** Draw one frame: the PNG bytes and the seed it drew with. */
  readonly draw?: (prompt: string, o: { readonly aspect: "16:9" | "9:16"; readonly seed?: number }) => Promise<{ readonly png: Uint8Array; readonly seed: number }>;
};

export type StoryboardResult = { readonly candidates: readonly StoryboardCandidate[]; readonly jobIds: readonly string[]; readonly outcome?: string };

export const storyboardsUsed = (n: Night): number => n.candidates.filter((c) => c.kind === "storyboard").length;

export function storyboardCapOf(_n: Night): number {
  throw new Error("storyboardCapOf: WP4");
}

/** The `storyboard` act: briefs (JSON, one per kept idea) through the door, each drawn as one gpu.local job. */
export async function storyboardAct(_ctx: ActContext, _id: NightId, _input: unknown, _engines: StoryboardEngines = {}): Promise<StoryboardResult> {
  throw new Error("storyboardAct: WP4");
}

/** Collect detached storyboard jobs' frames into the night. */
export async function collectStoryboards(_id: NightId): Promise<StoryboardCandidate[]> {
  throw new Error("collectStoryboards: WP4");
}

/**
 * THE GATE: the kept storyboard a full-video act grows from, by the idea it composes (`<night>/<c-id>`), or
 * null. Kept = its run was kept on a live (not dry) committed night - a part counts once committed.
 */
export function keptStoryboardFor(_nights: readonly Night[], _ideaRef: string): { readonly night: NightId; readonly candidate: StoryboardCandidate } | null {
  throw new Error("keptStoryboardFor: WP4");
}
