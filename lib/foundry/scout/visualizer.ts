// THE VISUALIZER ACT - server only (spark scout-decision-graph WP-S3). WP-S0 STUB: the signatures are the
// contract; WP-S3 fills the bodies. A kept track clip rendered as a full-song visualizer through the existing
// music-video pipeline (lib/sound/mv), the mp4 collected into the night as `visualizers/<c-id>/visualizer.mp4`.

import { Refusal, type ActContext } from "./acts";
import type { NightId, VisualizerCandidate } from "./types";

/** What a test hands in place of the mv queue, launch and drive. WP-S3 defines its fields. */
export type VisualizerEngines = Readonly<Record<string, unknown>>;

/** `track` is `<night>/<c-id>/<part>` of a kept track clip. */
export async function visualizerAct(_ctx: ActContext, _id: NightId, _track: string, _engines: VisualizerEngines = {}): Promise<{ readonly candidate: VisualizerCandidate; readonly outcome?: string }> {
  throw new Refusal("the visualizer act is being built (spark scout-decision-graph WP-S3)");
}
