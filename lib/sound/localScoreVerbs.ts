import type { ScoreNote } from "@gt/domain/audio.score";
import { err, type Result } from "@gt/domain/errors";

import type { LocalScorePlan } from "./localScore";
import type { SoundTake } from "./types";

// THE LOCAL BAND'S TRACK-LEVEL VERBS (spark audio-agent-studio, stage S2) - what an agent driving the
// studio does to a take beyond rendering a whole score. Tracks are addressed by `id` (absent in the
// spec = the role), never by role alone: a role may repeat.
//
// WP0 STUBS: the signatures are final (the MCP ops and the studio's "keep this mix" are written
// against them); package E1 implements the bodies.

/** One track's mix-time change. gain / pan / mute / solo are a remix: no stem re-renders. `enters`
 *  changes the notes, so that one stem re-renders and every other is reused bit-exact. */
export type MixTrackChange = {
  readonly gainDb?: number;
  readonly pan?: number;
  readonly muted?: boolean;
  readonly solo?: boolean;
  readonly enters?: readonly boolean[];
};

export type MixLocalInput = { readonly takeId: string; readonly tracks: Readonly<Record<string, MixTrackChange>> };

/** Rewrite one track's part: explicit notes, or another pattern. Every other track is reused bit-exact. */
export type RewriteLocalInput = { readonly takeId: string; readonly track: string } & (
  | { readonly notes: readonly ScoreNote[]; readonly pattern?: never }
  | { readonly pattern: string; readonly notes?: never }
);

export type LocalVerbResult = { readonly take: SoundTake; readonly plan: LocalScorePlan };

export async function mixLocalTake(input: MixLocalInput): Promise<Result<LocalVerbResult>> {
  return err("unavailable", `mixLocalTake(${input.takeId}): not built yet (spark audio-agent-studio E1)`);
}

export async function rewriteLocalStem(input: RewriteLocalInput): Promise<Result<LocalVerbResult>> {
  return err("unavailable", `rewriteLocalStem(${input.takeId}, ${input.track}): not built yet (spark audio-agent-studio E1)`);
}
