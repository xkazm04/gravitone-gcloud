// THE LOCAL SCORE PLAN - what a local-band take carries in `plan` (the spec, the per-track stems, the
// cache facts), and the one reader that turns a stored plan back into that shape. Stage S2 (spark
// audio-agent-studio) addressed stems by track id; a plan filed before then has stems keyed by role,
// and the reader gives them the id they always had (the role) so old takes keep playing.

import { trackIdOf, type ScoreRole, type ScoreSpec } from "@gt/domain/audio.score";
import type { Triage } from "@gt/domain/audio.triage";

import type { DeterminismReport, RenderedStem } from "../audio/sidecar";
import type { SoundTake } from "./types";

export type LocalScoreStemMeta = RenderedStem & {
  readonly fileRel: string;
  readonly midiRel: string;
  readonly audioUrl: string;
  readonly midiUrl: string;
};

export type LocalScorePlan = {
  readonly kind: "local-score";
  readonly chunks: readonly { readonly text: string; readonly duration_ms: number }[];
  readonly spec: ScoreSpec;
  readonly stems: readonly LocalScoreStemMeta[];
  readonly triage: Triage;
  readonly determinism: DeterminismReport | null;
  readonly mixSha256: string;
  readonly rppRel: string;
  readonly rppUrl: string;
  /** Track ids whose stem came from the cache bit-exact / was rendered for this take. */
  readonly reusedIds: readonly string[];
  readonly renderedIds: readonly string[];
  /** The same, by role - kept one release beside the ids (a repeated role appears once per track). */
  readonly reusedRoles: readonly ScoreRole[];
  readonly renderedRoles: readonly ScoreRole[];
  readonly totalRenderMs: number;
  readonly costUsd: 0;
};

/** The stems' file names and URLs: `files/<takeId>-<trackId>.wav|.mid`, `?stem=<trackId>`. */
export const stemFileName = (safeTakeId: string, trackId: string, ext: "wav" | "mid"): string => `${safeTakeId}-${trackId}.${ext}`;
export const stemAudioUrl = (takeId: string, trackId: string): string => `/api/sound/takes/${encodeURIComponent(takeId)}/file?stem=${encodeURIComponent(trackId)}`;
export const stemMidiUrl = (takeId: string, trackId: string): string => `/api/sound/takes/${encodeURIComponent(takeId)}/file?artifact=midi&stem=${encodeURIComponent(trackId)}`;

type StoredStem = Omit<LocalScoreStemMeta, "id" | "fallback"> & { readonly id?: string; readonly fallback?: boolean };
type StoredPlan = Omit<LocalScorePlan, "stems" | "reusedIds" | "renderedIds"> & {
  readonly stems: readonly StoredStem[];
  readonly reusedIds?: readonly string[];
  readonly renderedIds?: readonly string[];
};

/** A stand-in source, as the renderer names it (scipy-*). */
export const isStandInSource = (source: string): boolean => source.startsWith("scipy");

/** The take's local plan (null when it is not a local-band take), with pre-S2 role-keyed stems read as ids. */
export function readLocalScorePlan(take: Pick<SoundTake, "plan">): LocalScorePlan | null {
  const p = take.plan as Partial<StoredPlan> | null;
  if (!p || typeof p !== "object" || p.kind !== "local-score" || !p.spec || !Array.isArray(p.stems)) return null;
  const plan = p as StoredPlan;
  const stems = plan.stems.map((st): LocalScoreStemMeta => ({ ...st, id: st.id ?? st.role, fallback: st.fallback ?? isStandInSource(st.source) }));
  return {
    ...plan,
    stems,
    reusedIds: plan.reusedIds ?? stems.filter((s) => s.reused).map((s) => s.id),
    renderedIds: plan.renderedIds ?? stems.filter((s) => !s.reused).map((s) => s.id),
  };
}

/** The spec's track a stem id names (absent = no such track on this take). */
export const trackOfPlan = (plan: LocalScorePlan, trackId: string): ScoreSpec["tracks"][number] | undefined =>
  plan.spec.tracks.find((t) => trackIdOf(t) === trackId);
