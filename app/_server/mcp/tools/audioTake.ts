import { trackIdOf } from "@gt/domain/audio.score";
import { err, ok, type Result } from "@gt/domain/errors";

import type { LocalScorePlan } from "../../../../lib/sound/localScorePlan.ts";
import { takeFileHref } from "../../../../lib/sound/takeHref.ts";
import type { SoundTake } from "../../../../lib/sound/types.ts";
import type { Obj } from "../op.ts";

// A LOCAL-BAND TAKE AS THE AGENT DOOR ANSWERS IT (spark audio-agent-studio S2): what audio_render,
// audio_mix and audio_rewrite return, and the state audio_inbox reads back. Every href is this
// server's own path (the turn door refuses any other), so the agent copies them into a turn as they
// are and never builds one.
//
// STEMS ARE PRE-FADER. A stem file holds the track as played, before its level and pan; the mix file
// holds them applied. So every stem row carries `levelDb` (the track's gainDb) and `pan`, ready to
// drop into a `stems` piece's row: the page then plays what the mix holds.

/** One stem, ready for a `stems` piece's row (its `label` is the agent's words, not the engine's). */
export type StemAnswer = {
  readonly id: string;
  readonly role: string;
  readonly href: string;
  readonly instrument: { readonly id: string; readonly name: string };
  readonly source: string;
  readonly fallback: boolean;
  readonly levelDb: number;
  readonly pan: number;
  readonly muted?: true;
  readonly solo?: true;
  readonly enters?: readonly boolean[];
  /** The stem came from the cache bit-exact (nothing re-rendered for it). */
  readonly reused: boolean;
};

export function stemsOf(plan: LocalScorePlan): StemAnswer[] {
  return plan.stems.map((s) => {
    const track = plan.spec.tracks.find((t) => trackIdOf(t) === s.id);
    return {
      id: s.id,
      role: s.role,
      href: s.audioUrl,
      instrument: { id: s.instrument, name: s.instrumentName },
      source: s.source,
      fallback: s.fallback,
      levelDb: s.gainDb,
      pan: s.pan,
      ...(s.muted ? { muted: true as const } : {}),
      ...(s.solo ? { solo: true as const } : {}),
      ...(track?.enters !== undefined ? { enters: [...track.enters] } : {}),
      reused: s.reused,
    };
  });
}

/** The verb answer: the take, its mix, its stems, its sections (ready for a `sections` piece) and its measures. */
export function takeAnswer(take: SoundTake, plan: LocalScorePlan): Obj {
  const standIns = plan.stems.filter((s) => s.fallback).map((s) => s.id);
  return {
    takeId: take.id,
    title: take.title,
    mixHref: takeFileHref(take.id),
    bpm: plan.spec.tempoBpm,
    key: plan.spec.key,
    sections: plan.spec.sections.map((s) => ({ name: s.name, bars: s.bars, energy: s.energy })),
    stems: stemsOf(plan),
    lufs: take.measured?.lufs ?? null,
    durationS: take.durationS,
    triageFlagged: plan.triage.flagged,
    reusedIds: plan.reusedIds,
    renderedIds: plan.renderedIds,
    ...(take.parentId !== null ? { parentId: take.parentId } : {}),
    ...(take.variation !== null ? { changed: take.variation.diff } : {}),
    ...(standIns.length > 0 ? { standIns, standInNote: `a stand-in synth played ${standIns.join(", ")}: say so to the person` } : {}),
  };
}

/** A take the sound store holds, read with its local plan; a take with no ScoreSpec is refused by name. */
export async function readLocalTake(takeId: string): Promise<Result<{ readonly take: SoundTake; readonly plan: LocalScorePlan }>> {
  const [{ getTake }, { readLocalScorePlan }, { soundFailure }] = await Promise.all([
    import("../../../../lib/sound/takes.ts"),
    import("../../../../lib/sound/localScorePlan.ts"),
    import("../../../../lib/sound/store.ts"),
  ]);
  let take: SoundTake;
  try {
    take = await getTake(takeId);
  } catch (e) {
    return soundFailure(e);
  }
  const plan = readLocalScorePlan(take);
  return plan === null ? err("invalid", `take ${takeId} was not made by the local band (it carries no score)`) : ok({ take, plan });
}
