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

/** Percent geometry against the project clock. */
export const spanStyle = (startS: number, durS: number) => ({
  left: `${(startS / PROJECT.totalS) * 100}%`,
  width: `${(durS / PROJECT.totalS) * 100}%`,
});

/** The one time ruler. Ticks every 5s, honest to PROJECT.totalS. */
export function TimeRuler() {
  const ticks = [];
  for (let s = 0; s <= PROJECT.totalS; s += 5) ticks.push(s);
  return (
    <div className="relative h-5 border-b border-white/8">
      {ticks.map((s) => (
        <span
          key={s}
          className="font-jetbrains absolute -translate-x-1/2 text-label text-white/30"
          style={{ left: `${(s / PROJECT.totalS) * 100}%` }}
        >
          {s}s
        </span>
      ))}
    </div>
  );
}
