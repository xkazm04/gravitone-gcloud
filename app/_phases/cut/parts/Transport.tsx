"use client";

// THE TRANSPORT — play, shuttle, step, the timecode, sound — and the keys.
//
// Nothing here reads the playhead through state. The play button selects
// `playing` (a render per press), the rate chip selects the signed rate while
// playing (a render per J/L), and the timecode is written into the DOM by
// `useClockWriter`, so the one readout that changes every frame costs no render
// at all. StatReel's Monitor.tsx memoises a Timecode leaf that renders per
// frame; writing the text node is the step past that.

import { useEffect, useRef } from "react";

import { ChevronLeft, ChevronRight, Pause, Play, Volume2, VolumeX } from "lucide-react";

import { Hint, Keycaps, Tally } from "@/components/ui/signal";

import { overlayOpen, typing } from "@/lib/board/keys";

import { timecode, useClockSelector, useClockWriter, stepBy, FPS, type CutClock } from "../clock";
import { nextEdit, nextGap, type Gap } from "../edits";
import { useCutCtx } from "../useCut";

const KEYS = [
  { keys: ["Space"], does: "play / pause" },
  { keys: ["J", "K", "L"], does: "reverse · stop · forward" },
  { keys: ["←", "→"], does: "one frame" },
  { keys: ["⇧", "←/→"], does: "one second" },
  { keys: ["↑", "↓"], does: "previous · next edit" },
  { keys: ["G"], does: "next music gap" },
  { keys: ["⇧", "G"], does: "previous music gap" },
  { keys: ["⇧", "drag"], does: "snap to an edit" },
  { keys: ["Home", "End"], does: "head · tail" },
  { keys: ["Ctrl/⌘", "Z"], does: "undo sync" },
];

/** What the jumps land on — read off the cut by ../edits.ts. Optional so a
 *  surface with no lanes can still bind the transport. */
export interface TransportMarks {
  edits: readonly number[];
  gaps: readonly Gap[];
  /** Take back the last sync change; absent where nothing is undoable. */
  undo?: () => void;
}

/** One key handler for the surface, bound to the window while the cut is
 *  mounted. Ignored while the creator is typing — a space in a field is a
 *  space — and while a dialog is open over the cut, which owns the keyboard
 *  (the studio's step keys hold the same rule). The typing test is the shared
 *  one (lib/board/keys), so an open combobox counts as typing here too. */
export function useTransportKeys(clock: CutClock, marks?: TransportMarks): void {
  // The marks change with every nudge; the listener should not. Read through
  // a ref written after render, the shape useClockWriter already uses.
  const latest = useRef(marks);
  useEffect(() => {
    latest.current = marks;
  });
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || typing(e.target) || overlayOpen()) return;
      const m = latest.current;
      const k = e.key.toLowerCase();
      if (e.metaKey || e.ctrlKey) {
        // Undo is the only chord the cut binds, and only with no Shift: ⇧⌘Z
        // is redo everywhere else and there is no redo here to give it.
        if (k !== "z" || e.shiftKey || !m?.undo) return;
        m.undo();
        e.preventDefault();
        return;
      }
      const s = clock.get();
      if (e.key === " ") clock.toggle();
      else if (k === "j" || k === "k" || k === "l") clock.shuttle(k);
      else if (e.key === "ArrowLeft") clock.seek(e.shiftKey ? s.t - 1 : stepBy(s.t, -1, s.duration));
      else if (e.key === "ArrowRight") clock.seek(e.shiftKey ? s.t + 1 : stepBy(s.t, 1, s.duration));
      else if ((e.key === "ArrowUp" || e.key === "ArrowDown") && m)
        clock.seek(nextEdit(m.edits, s.t, e.key === "ArrowDown" ? 1 : -1));
      else if (k === "g" && m) {
        const at = nextGap(m.gaps, s.t, e.shiftKey ? -1 : 1);
        if (at === null) return;
        clock.seek(at);
      } else if (e.key === "Home") clock.seek(0);
      else if (e.key === "End") clock.seek(s.duration);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [clock]);
}

/** The readout, written straight into its text node. */
export function Timecode({ className = "" }: { className?: string }) {
  const { clock, cut } = useCutCtx();
  const ref = useRef<HTMLSpanElement>(null);
  useClockWriter(clock, (s) => {
    if (ref.current) ref.current.textContent = timecode(s.t);
  });
  return (
    <span className={`font-jetbrains tabular-nums ${className}`}>
      <span ref={ref} className="text-white">
        {timecode(0)}
      </span>
      <span className="text-white/35"> / {timecode(cut.totalS)}</span>
    </span>
  );
}

function RateChip() {
  const { clock } = useCutCtx();
  const rate = useClockSelector(clock, (s) => (s.playing ? s.rate : 0));
  if (rate === 0 || rate === 1) return null;
  return <Tally label="shuttle" value={rate} tone={rate < 0 ? "amber" : "cyan"} className="tabular-nums" />;
}

export function Transport({ className = "" }: { className?: string }) {
  const { clock, cut, takes, muted, setMuted, refused, setRefused } = useCutCtx();
  const playing = useClockSelector(clock, (s) => s.playing);
  const none = cut.totalS <= 0;
  const hasTakes = Object.keys(takes).length > 0;
  const btn =
    "inline-flex h-9 items-center justify-center rounded-lg border border-white/12 px-2.5 text-white/75 transition hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-35";

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`} role="group" aria-label="Transport">
      <button
        type="button"
        className={btn}
        disabled={none}
        aria-label="Back one frame"
        onClick={() => {
          const s = clock.get();
          clock.seek(stepBy(s.t, -1, s.duration));
        }}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </button>
      <button
        type="button"
        disabled={none}
        onClick={() => {
          setRefused(null);
          clock.toggle();
        }}
        aria-label={playing ? "Pause" : "Play"}
        className="inline-flex h-9 w-12 items-center justify-center rounded-lg border border-cyan-400/40 bg-cyan-400/10 text-cyan-100 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-35"
      >
        {playing ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
      </button>
      <button
        type="button"
        className={btn}
        disabled={none}
        aria-label="Forward one frame"
        onClick={() => {
          const s = clock.get();
          clock.seek(stepBy(s.t, 1, s.duration));
        }}
      >
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
      <Timecode className="ml-1 text-content" />
      <span className="font-jetbrains text-label text-white/30">{FPS}fps</span>
      <RateChip />
      <button
        type="button"
        className={btn}
        disabled={!hasTakes}
        aria-pressed={!muted}
        aria-label={muted ? "Sound off" : "Sound on"}
        onClick={() => setMuted(!muted)}
      >
        {muted || !hasTakes ? <VolumeX className="h-4 w-4" aria-hidden /> : <Volume2 className="h-4 w-4" aria-hidden />}
      </button>
      <Keycaps map={KEYS} label="Transport keys" />
      {refused && (
        // The browser's own words — the only thing that knows why it refused.
        <span role="alert" className="font-jetbrains text-label text-rose-300">
          play refused · {refused}
        </span>
      )}
    </div>
  );
}

/** Which of the three this cut is — said where the cut is drawn. */
export function OriginChip() {
  const { cut } = useCutCtx();
  if (cut.origin === "fixture")
    return (
      <Tally
        label="fixture"
        value={cut.clips.length}
        tone="amber"
        hint={<Hint>Glass Harbor&apos;s hand-typed cut — this project has no frames yet</Hint>}
      />
    );
  if (cut.origin === "empty") return <Tally label="nothing upstream" value={0} tone="neutral" />;
  return <Tally label="shots" value={cut.scenes.length} tone="cyan" />;
}
