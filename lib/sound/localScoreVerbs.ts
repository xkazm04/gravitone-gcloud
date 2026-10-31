import type { ScoreNote, ScoreSpec } from "@gt/domain/audio.score";
import { mixScoreTracks, rewriteScoreTrack } from "@gt/domain/audio.score.edit";
import { err, ok, type Result } from "@gt/domain/errors";

import { renderLocalScore } from "./localScore";
import { readLocalScorePlan, type LocalScorePlan } from "./localScorePlan";
import { soundFailure } from "./store";
import { getTake } from "./takes";
import type { SoundTake } from "./types";

// THE LOCAL BAND'S TRACK-LEVEL VERBS (spark audio-agent-studio, stage S2) - what an agent driving the
// studio does to a take beyond rendering a whole score. Tracks are addressed by `id` (absent in the
// spec = the role), never by role alone: a role may repeat.
//
// Each verb files a NEW take (parent = the take it changed, op section-edit), like a stem swap: the
// studio's history is the chain of takes. The spec edit is pure (@gt/domain/audio.score.edit); what
// re-renders is the renderer's stem hash: a remix re-renders nothing, a rewrite or an `enters` change
// re-renders that one stem and reuses every other bit-exact (the plan's renderedIds / reusedIds say so).

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

type Parent = { readonly take: SoundTake; readonly plan: LocalScorePlan };

async function localParent(takeId: string): Promise<Result<Parent>> {
  let take: SoundTake;
  try {
    take = await getTake(takeId);
  } catch (e) {
    return soundFailure(e);
  }
  const plan = readLocalScorePlan(take);
  return plan === null ? err("invalid", `take ${takeId} does not carry a local ScoreSpec`) : ok({ take, plan });
}

/** File the edited spec as the parent's child. A take whose stand-ins were allowed keeps that consent: its
 *  remix may not be refused over a stem it already plays. */
function renderChild(parent: Parent, spec: ScoreSpec, axis: string, diff: readonly string[]): Promise<Result<LocalVerbResult>> {
  return renderLocalScore(spec, {
    verifyDeterminism: false,
    fallbackDeterminism: parent.plan.determinism,
    ...(parent.plan.stems.some((s) => s.fallback) ? { allowFallback: true } : {}),
    parentId: parent.take.id,
    op: "section-edit",
    group: parent.take.group,
    variation: { axis, diff: diff.length > 0 ? [...diff] : ["no change"] },
  });
}

/** Remix a take by track id: level, pan, mute, solo (no stem re-renders) and where a track plays (`enters`). */
export async function mixLocalTake(input: MixLocalInput): Promise<Result<LocalVerbResult>> {
  const parent = await localParent(input.takeId);
  if (!parent.ok) return parent;
  const next = mixScoreTracks(parent.value.plan.spec, input.tracks);
  if (!next.ok) return next;
  return renderChild(parent.value, next.value.spec, "mix", next.value.diff);
}

/** Rewrite one track's notes (or pattern) by track id; every other stem is reused bit-exact. */
export async function rewriteLocalStem(input: RewriteLocalInput): Promise<Result<LocalVerbResult>> {
  const parent = await localParent(input.takeId);
  if (!parent.ok) return parent;
  const next = rewriteScoreTrack(parent.value.plan.spec, input.track, input.notes !== undefined ? { notes: input.notes } : { pattern: input.pattern });
  if (!next.ok) return next;
  return renderChild(parent.value, next.value.spec, `stem:${input.track}`, next.value.diff);
}
