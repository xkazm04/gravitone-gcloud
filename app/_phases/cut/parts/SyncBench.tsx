"use client";

// THE SYNC BENCH — kept from the timeline this replaces, pointed at a little
// more. It worked one clip: the first drifting one. It now works the SELECTED
// clip when that clip is one a nudge means something for — a drifting clip, or
// a music cue with a take in hand, whose audio the clock re-seeks to the moved
// mark (./useTakeAudio.ts) — and falls back to the first drifting clip as
// before. No such clip, no bench: a sync control over nothing is the defect the
// 2026-08-14 honesty round removed.
//
// The arithmetic is `nudgeOffsets` (../offsets.ts) unchanged, which is what
// tests/golden-path/cut-nudge-batching.probe.spec.ts holds: two presses in one
// batch move the clip twice.

import { drawnStart, nudgeOffsets, offsetFrom } from "../offsets";
import type { CutClip } from "../deriveTimeline";
import { useCutCtx } from "../useCut";

const benchable = (c: CutClip | null): c is CutClip =>
  Boolean(c && (c.status === "drift" || (c.track === "music" && c.src)));

export function SyncBench({ className = "" }: { className?: string }) {
  const { cut, selected, offsets, setOffsets } = useCutCtx();
  const target = benchable(selected) ? selected : (cut.clips.find((c) => c.status === "drift") ?? null);
  if (!target) return null;

  const drift = offsetFrom(offsets, target);
  const nudge = (ms: number) => setOffsets((o) => nudgeOffsets(o, target, ms));
  const btn = "cursor-pointer rounded-lg border border-white/15 px-3 py-1.5 text-white/70 transition hover:bg-white/5";

  return (
    <div className={`rounded-2xl border border-amber-400/25 bg-amber-400/[0.03] p-4 ${className}`} data-testid="sync-bench">
      <p className="font-jetbrains truncate text-label tracking-[0.14em] text-amber-300/90 uppercase">
        sync · {target.label}
      </p>
      {/* The mark, and where the block is drawn. The ghost outline on the lane
          draws the same pair; these are the two numbers a picture cannot be
          read to. */}
      <p className="font-jetbrains mt-1.5 text-content text-slate-300">
        {drift === 0 ? (
          <span className="text-cyan-300">{target.startS}s</span>
        ) : (
          <>
            {target.startS}s → <span className="text-amber-200">{drawnStart(offsets, target).toFixed(2)}s</span>
          </>
        )}
      </p>
      <div className="font-jetbrains mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-label whitespace-nowrap">
        <button type="button" onClick={() => nudge(-50)} className={btn}>
          −50ms
        </button>
        <span className="min-w-16 text-center text-white tabular-nums">{drift >= 0 ? `+${drift}` : drift}ms</span>
        <button type="button" onClick={() => nudge(50)} className={btn}>
          +50ms
        </button>
        {drift !== 0 && (
          <button
            type="button"
            onClick={() => setOffsets((o) => ({ ...o, [target.id]: 0 }))}
            className="ml-auto cursor-pointer text-white/45 transition hover:text-white"
          >
            snap to mark
          </button>
        )}
      </div>
    </div>
  );
}
