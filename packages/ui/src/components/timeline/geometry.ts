// THE TIMELINE'S ARITHMETIC (spark character-cores WP3), pure so the unit lane holds it without a DOM: where a time
// sits on the strip, which beats open a bar, which block the playhead is in, which block an arrow key reaches.
//
// A bar is four beats counted from the map's first beat. The track map carries beats, not downbeats (the music-clip
// analyzer's timeline.json has no meter), so 4/4 from beat 0 is an assumption the strip draws, stated here.

import type { ProductionNodeState } from "@gt/domain/productionGraph";

/** One clip on the master clock, as the strip draws and plays it. */
export type TimelineBlock = {
  readonly id: string;
  readonly label: string;
  /** Seconds on the track where the clip starts. */
  readonly at: number;
  /** Seconds the clip runs. */
  readonly dur: number;
  readonly state: ProductionNodeState;
  readonly verdict?: { readonly verdict: "keep" | "reject"; readonly reasons: readonly string[]; readonly note?: string };
  /** The take itself; absent, the block is drawn and selectable but plays nothing. */
  readonly video?: string;
  /** The take's first keyframe. */
  readonly poster?: string;
};

export const BEATS_PER_BAR = 4;

/** 0..1 across the strip; a time outside the track is held to its ends. */
export function at01(t: number, seconds: number): number {
  if (!(seconds > 0)) return 0;
  return Math.min(1, Math.max(0, t / seconds));
}

/** Each beat with whether it opens a bar. */
export function beatTicks(beats: readonly number[]): readonly { readonly t: number; readonly bar: boolean }[] {
  return beats.map((t, i) => ({ t, bar: i % BEATS_PER_BAR === 0 }));
}

/** The blocks in clock order (ties by id), the order every arrow key and switch reads. */
export function inOrder(blocks: readonly TimelineBlock[]): readonly TimelineBlock[] {
  return [...blocks].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}

/** The block under `t` - the later one where two overlap, since a cut lands on the incoming take - or null in a gap. */
export function blockAt(blocks: readonly TimelineBlock[], t: number): TimelineBlock | null {
  let hit: TimelineBlock | null = null;
  for (const b of inOrder(blocks)) if (t >= b.at && t < b.at + b.dur) hit = b;
  return hit;
}

/** The first block that starts after `t`, the one to have loaded before the playhead reaches it. */
export function blockAfter(blocks: readonly TimelineBlock[], t: number): TimelineBlock | null {
  return inOrder(blocks).find((b) => b.at > t) ?? null;
}

/** The block an arrow key reaches from `current` (null: from nothing, the first or the last). */
export function step(blocks: readonly TimelineBlock[], current: string | null, dir: 1 | -1): TimelineBlock | null {
  const list = inOrder(blocks);
  if (list.length === 0) return null;
  const i = list.findIndex((b) => b.id === current);
  if (i < 0) return (dir === 1 ? list[0] : list[list.length - 1]) ?? null;
  return list[Math.min(list.length - 1, Math.max(0, i + dir))] ?? null;
}

/** The lyric line sounding at `t`: the last one that started, held until the next. */
export function lineAt(lyrics: readonly { readonly t: number; readonly text: string }[], t: number): string | null {
  let line: string | null = null;
  for (const l of lyrics) if (l.t <= t) line = l.text;
  return line;
}

/** The section the playhead is in. */
export function sectionAt(sections: readonly { readonly name: string; readonly start: number; readonly end: number }[], t: number): string | null {
  return sections.find((s) => t >= s.start && t < s.end)?.name ?? null;
}

/** `m:ss.d`, the strip's clock. */
export function timecode(t: number): string {
  const safe = Number.isFinite(t) && t > 0 ? t : 0;
  const m = Math.floor(safe / 60);
  const s = safe - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

/** How far the take lags the track (seconds; negative leads), with the gentle rate that closes it, or a seek when
 *  it is past `hard`. A rate nudge does not stutter; a seek does, so it is kept for a real jump. */
export function correction(drift: number, hard = 0.25): { readonly seek: boolean; readonly rate: number } {
  if (Math.abs(drift) > hard) return { seek: true, rate: 1 };
  return { seek: false, rate: Math.min(1.1, Math.max(0.9, 1 + drift * 2)) };
}
