// THE TRACK ACT - server only (spark scout-decision-graph WP-S3). WP-S0 STUB: the signatures are the contract;
// WP-S3 fills the bodies. A kept music seed's sentence made into a Suno track on the signed-in browser (both
// models, ~4 clips), each clip downloaded into the night as `tracks/<c-id>/a<N>.mp3`.

import { Refusal, type ActContext } from "./acts";
import type { Night, NightId, SeedRef, TrackCandidate } from "./types";

/** What a test hands in place of the Suno browser and the clip download. WP-S3 defines its fields. */
export type TrackEngines = Readonly<Record<string, unknown>>;

export async function trackAct(_ctx: ActContext, _id: NightId, _seed: SeedRef, _engines: TrackEngines = {}): Promise<{ readonly candidate: TrackCandidate; readonly outcome?: string }> {
  throw new Refusal("the track act is being built (spark scout-decision-graph WP-S3)");
}

/** The taste brief's `## Tracks to visualize`: kept track clips no visualizer plays yet. */
export function tracksSection(_nights: readonly Night[]): string[] {
  return [];
}
