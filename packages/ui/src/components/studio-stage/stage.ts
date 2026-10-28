// THE STAGE'S ARITHMETIC (spark audio-agent-studio, variant "stage"), pure so it is tested without a
// browser: where each part of the band stands (drums at the back, bass and chords on the flanks, the
// tunes in front), which section a second falls in, who plays in a section, which wing a waiting
// player stands in, and how bright a player's halo is at the playhead. The tiles that draw these
// numbers are ./Performer.tsx and ./LightStrip.tsx.
import type { StudioRole } from "@gt/domain/audio.studio.kinds";

export type StagePlace = "back" | "left" | "right" | "front";

/** Where a role stands, seen from the audience. */
export const ROLE_PLACE: Readonly<Record<StudioRole, StagePlace>> = {
  drums: "back",
  percussion: "back",
  bass: "left",
  chords: "right",
  pad: "right",
  lead: "front",
  texture: "front",
};

/** A role in the words a non-musician uses. */
export const ROLE_WORDS: Readonly<Record<StudioRole, string>> = {
  drums: "drums",
  percussion: "shakers and taps",
  bass: "bass",
  chords: "chords",
  pad: "background swell",
  lead: "tune",
  texture: "sparkle",
};

export const STAGE_PLACES: readonly StagePlace[] = ["back", "left", "right", "front"];

/** The rows grouped by where they stand, each group in the turn's own order. */
export function arrange<T extends { readonly role: StudioRole }>(rows: readonly T[]): Readonly<Record<StagePlace, readonly T[]>> {
  const out: Record<StagePlace, T[]> = { back: [], left: [], right: [], front: [] };
  for (const r of rows) out[ROLE_PLACE[r.role]].push(r);
  return out;
}

/** The wing a waiting player stands in: beside the one it would replace (left flank: left wing). */
export const wingOf = (role: StudioRole): "left" | "right" => (ROLE_PLACE[role] === "left" ? "left" : "right");

/** Does a part play in section `i`. Omitted entries mean everywhere; a missing index is "yes". */
export const playsIn = (enters: readonly boolean[] | undefined, i: number): boolean => enters === undefined || enters[i] !== false;

/** How many of the rows play in each of `count` sections. */
export function playingPer(rows: readonly { readonly enters?: readonly boolean[] }[], count: number): readonly number[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => rows.filter((r) => playsIn(r.enters, i)).length);
}

/** The section a second falls in; null before the first, past the last, or with no spans. */
export function sectionAt(spans: readonly { readonly startS: number; readonly endS: number }[] | null, s: number): number | null {
  if (spans === null || !Number.isFinite(s)) return null;
  const i = spans.findIndex((sp) => s >= sp.startS && s < sp.endS);
  return i === -1 ? null : i;
}

/**
 * A halo's brightness, 0..1: the part's own loudness at the playhead (its peak in that window, on a
 * square-root curve so a steady quiet part still reads as playing beside its own loudest hit) times
 * what it is allowed to play at (its effective gain, capped at 1). No peaks yet, no length, or a
 * silent part is 0 - a halo never glows on a guess.
 */
export function haloLevel(peaks: readonly number[] | null, at: number, duration: number | null, gain: number): number {
  if (peaks === null || peaks.length === 0 || duration === null || !(duration > 0) || !(gain > 0)) return 0;
  const f = Math.max(0, Math.min(0.9999, at / duration));
  const p = peaks[Math.floor(f * peaks.length)] ?? 0;
  return Math.round(Math.min(1, gain) * Math.sqrt(Math.max(0, p)) * 100) / 100;
}

/** A pan in words: "centre", "a little left", "far right". */
export function panWords(pan: number): string {
  const a = Math.abs(pan);
  if (!Number.isFinite(pan) || a < 0.1) return "centre";
  const side = pan < 0 ? "left" : "right";
  return a < 0.45 ? `a little ${side}` : a < 0.85 ? `${side}` : `far ${side}`;
}

/** A level in words, with its figure: "as recorded", "quieter (-6 dB)". */
export function levelWords(db: number): string {
  if (!Number.isFinite(db) || Math.abs(db) < 0.5) return "as recorded";
  const n = Math.round(db);
  return `${n < 0 ? "quieter" : "louder"} (${n > 0 ? "+" : ""}${n} dB)`;
}
