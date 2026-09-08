"use client";

// Shared leaves for the lifecycle phases: the status words, and the one time
// ruler + span geometry every timeline surface computes from the same source,
// so the pictures stay to scale.
//
// `FrameThumb` used to head this file — a frame candidate drawn as a gradient
// still. Its last consumer went with `MotionShotLab` in 80ac10c and it has had
// none since; the landing contact sheet draws its own tiles. Deleted 2026-08-14.

import type { ClipStatus, CueStatus } from "./projectTypes";
import { PROJECT } from "./scenes";

const CLIP_WORD: Record<ClipStatus, { word: string; cls: string }> = {
  rendered: { word: "rendered", cls: "text-cyan-300" },
  rendering: { word: "rendering", cls: "text-cyan-300/70" },
  failed: { word: "rejected", cls: "text-rose-300" },
  "not-started": { word: "not started", cls: "text-white/40" },
};

export function ClipStatusWord({ status }: { status: ClipStatus }) {
  const s = CLIP_WORD[status];
  return <span className={`font-jetbrains text-label ${s.cls}`}>{s.word}</span>;
}

const CUE_WORD: Record<CueStatus, { word: string; cls: string }> = {
  rendered: { word: "rendered", cls: "text-cyan-300" },
  failed: { word: "refused", cls: "text-rose-300" },
};

export function CueStatusWord({ status }: { status: CueStatus }) {
  const s = CUE_WORD[status];
  return <span className={`font-jetbrains text-label ${s.cls}`}>{s.word}</span>;
}

/** Percent geometry against the project clock.
 *
 *  `totalS` IS A PARAMETER NOW, defaulting to the fixture's. The Score step
 *  draws the creator's own frames rather than Glass Harbor's five scenes
 *  (score/picture.ts), and their cut is not 31 seconds long — every span it drew
 *  against the fixture's total would have overflowed its lane or huddled at the
 *  left of it, to scale with nothing. The default keeps the Cut step, which
 *  still renders the fixture timeline, byte-identical: a caller that passes
 *  nothing gets exactly the geometry it got before. */
export const spanStyle = (startS: number, durS: number, totalS: number = PROJECT.totalS) => ({
  left: `${(startS / totalS) * 100}%`,
  width: `${(durS / totalS) * 100}%`,
});

/** THE LANE GUTTER — the fixed column the timeline lane NAMES sit in, left of
 *  every lane and left of the ruler itself.
 *
 *  It lives here, beside <TimeRuler>, because the ruler is what it has to stay
 *  aligned with: the two timelines (score's picture/music lanes, cut's three
 *  tracks) each open with a blank spacer of exactly this width so their 0s tick
 *  lands over the same pixel as every clip's start. Seven copies of `w-14`
 *  spelled that agreement before this constant existed, and on 2026-09-08 the
 *  type scale went up 2px and broke it: `picture`, uppercase jetbrains with
 *  0.12em tracking, measures 81px at text-label 16px against a 56px column, so
 *  the longest lane name bled into its own lane. 88px, measured, with room.
 *
 *  A lane name longer than `picture` needs this number re-measured, not
 *  guessed — and now there is one number to change. */
export const LANE_GUTTER = "w-22 shrink-0";

/** The tick ladder, coarsest step that fits. Ticks were every 5s, full stop,
 *  which is right for the 31s fixture and unreadable for anything longer:
 *  measured 2026-09-08, the Score step drawn against a real 286s cut laid 58
 *  labels over a 1760px lane and they overprinted into a grey band. Eight is the
 *  count the 31s fixture already sits under (7 ticks), so the fixture-clock case
 *  is unchanged — 5s is still chosen for it — and a longer film steps up rather
 *  than smearing. */
const TICK_STEPS = [5, 10, 15, 30, 60, 120, 300, 600];

/** The one time ruler, honest to the clock it is given — the fixture's when
 *  nobody says otherwise, for the same reason `spanStyle` above takes one: the
 *  ruler and the spans under it have to be measured against the same number or
 *  the picture stops being to scale, which is the one thing a timeline is for. */
export function TimeRuler({ totalS = PROJECT.totalS }: { totalS?: number }) {
  const step = TICK_STEPS.find((s) => totalS / s <= 8) ?? Math.ceil(totalS / 8);
  const ticks = [];
  for (let s = 0; s <= totalS; s += step) ticks.push(s);
  return (
    <div className="relative h-5 border-b border-white/8">
      {ticks.map((s) => (
        <span
          key={s}
          className="font-jetbrains absolute -translate-x-1/2 text-label text-white/30"
          style={{ left: `${(s / totalS) * 100}%` }}
        >
          {s}s
        </span>
      ))}
    </div>
  );
}
