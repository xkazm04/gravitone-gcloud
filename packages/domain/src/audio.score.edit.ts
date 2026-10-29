import { parseScoreSpec, trackIdOf, type ScoreNote, type ScoreSpec, type ScoreTrack } from "./audio.score.ts";
import { err, ok, type Result } from "./errors.ts";

// TRACK-LEVEL SCORE EDITS (spark audio-agent-studio, stage S2) - the pure halves of the local band's
// track verbs (lib/sound/localScoreVerbs.ts): a remix and a one-track rewrite, each a new ScoreSpec
// held to the same door as any other. Tracks are addressed by id (absent in the spec = the role).
//
// What re-renders is the renderer's business, decided by its stem hash: gainDb / pan / muted / solo
// are mix-time and re-render nothing; `enters`, notes and pattern change one track's notes, so that
// one stem re-renders and every other is reused bit-exact.

export type ScoreTrackMix = {
  readonly gainDb?: number;
  readonly pan?: number;
  readonly muted?: boolean;
  readonly solo?: boolean;
  readonly enters?: readonly boolean[];
};

export type ScoreTrackRewrite = { readonly notes: readonly ScoreNote[]; readonly pattern?: never } | { readonly pattern: string; readonly notes?: never };

const fmt = (v: unknown): string => (v === undefined ? "default" : Array.isArray(v) ? v.map((b) => (b ? "on" : "rest")).join("/") : String(v));

function trackAt(spec: ScoreSpec, trackId: string): Result<number> {
  const at = spec.tracks.findIndex((t) => trackIdOf(t) === trackId);
  return at >= 0 ? ok(at) : err("invalid", `score spec: no track ${trackId} (tracks: ${spec.tracks.map(trackIdOf).join(", ")})`);
}

/**
 * Apply mix changes by track id. Every id must name a track; an empty change set is refused (nothing to
 * do). Returns the next spec and a plain list of what changed (`lead-2: gainDb -3 -> -6`).
 */
export function mixScoreTracks(
  spec: ScoreSpec,
  changes: Readonly<Record<string, ScoreTrackMix>>,
): Result<{ readonly spec: ScoreSpec; readonly diff: readonly string[] }> {
  const ids = Object.keys(changes);
  if (ids.length === 0) return err("invalid", "a mix names at least one track to change");
  const tracks: ScoreTrack[] = [...spec.tracks];
  const diff: string[] = [];
  for (const id of ids) {
    const at = trackAt(spec, id);
    if (!at.ok) return at;
    const change = changes[id] ?? {};
    let next: ScoreTrack = tracks[at.value]!;
    for (const field of ["gainDb", "pan", "muted", "solo", "enters"] as const) {
      const v = change[field];
      if (v === undefined) continue;
      const before = next[field];
      next = { ...next, [field]: field === "enters" ? [...(v as readonly boolean[])] : v };
      if (fmt(before) !== fmt(v)) diff.push(`${id}: ${field} ${fmt(before)} -> ${fmt(v)}`);
    }
    tracks[at.value] = next;
  }
  const checked = parseScoreSpec({ ...spec, tracks });
  return checked.ok ? ok({ spec: checked.value, diff }) : checked;
}

/**
 * Rewrite one track's part: explicit notes (its pattern stays, unheard while notes are written), or a
 * pattern (its written notes go, or they would keep sounding). Every other track is untouched.
 */
export function rewriteScoreTrack(spec: ScoreSpec, trackId: string, change: ScoreTrackRewrite): Result<{ readonly spec: ScoreSpec; readonly diff: readonly string[] }> {
  const at = trackAt(spec, trackId);
  if (!at.ok) return at;
  const prev = spec.tracks[at.value]!;
  let next: ScoreTrack;
  let diff: string;
  if (change.notes !== undefined) {
    if (change.notes.length === 0) return err("invalid", `score spec: tracks.${at.value}.notes: a rewrite writes at least one note (to go back to a pattern, rewrite with a pattern)`);
    next = { ...prev, notes: change.notes.map((n) => ({ ...n })) };
    diff = `${trackId}: ${prev.notes?.length ?? 0} written notes -> ${change.notes.length}`;
  } else {
    const { notes: _gone, ...rest } = prev;
    next = { ...rest, pattern: change.pattern };
    diff = `${trackId}: pattern ${prev.pattern ?? "default"}${prev.notes === undefined ? "" : " (written notes)"} -> ${change.pattern}`;
  }
  const checked = parseScoreSpec({ ...spec, tracks: spec.tracks.map((t, i) => (i === at.value ? next : t)) });
  return checked.ok ? ok({ spec: checked.value, diff: [diff] }) : checked;
}
