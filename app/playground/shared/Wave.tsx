"use client";

// A TAKE'S WAVEFORM AND ITS PLAY BUTTON, wired to the lab's one transport
// (./transport.ts).
//
// The waveform is drawn from REAL peaks only — `take.peaks`, measured on the
// bytes (./measure.ts) and stored on the take. A take nobody has measured yet
// draws its silhouette at the faintest ink (<GhostWave>), never a shape
// invented from its id: the round-3 lab drew fixture rows that way because the
// Library did, and a drawn waveform that is not the sound's is a measurement
// nobody made. Behaviour is the kit Player's (components/kit/Player.tsx#Waveform:
// a role=slider that seeks on press, drag and arrows); the look is the lab's.

import { useRef } from "react";

import { Pause, Play } from "lucide-react";

import type { SoundTake } from "@/lib/sound/types";

import { dur } from "./format";
import { transport, usePlayback } from "./transport";

/** Resample peaks to `n` bars by max — a short array is stretched, a long one folded. */
export function resample(peaks: readonly number[], n: number): number[] {
  if (peaks.length === 0 || n <= 0) return [];
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.floor((i / n) * peaks.length);
    const b = Math.max(a + 1, Math.floor(((i + 1) / n) * peaks.length));
    let m = 0;
    for (let j = a; j < b && j < peaks.length; j++) m = Math.max(m, peaks[j]);
    out.push(m);
  }
  return out;
}

export function Wave({
  label,
  peaks,
  position,
  duration,
  playing = false,
  onSeek,
  height = "h-12",
  dim = false,
  tone = "cyan",
}: {
  label: string;
  peaks: readonly number[];
  position: number;
  duration: number;
  playing?: boolean;
  onSeek?: (s: number) => void;
  height?: string;
  dim?: boolean;
  tone?: "cyan" | "amber" | "emerald";
}) {
  const box = useRef<HTMLDivElement>(null);
  const n = Math.max(1, peaks.length);
  const frac = duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0;
  const seek = (x: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r || !r.width || duration <= 0 || !onSeek) return;
    onSeek(Math.min(duration, Math.max(0, ((x - r.left) / r.width) * duration)));
  };
  const lit = tone === "amber" ? "bg-amber-200/90" : tone === "emerald" ? "bg-emerald-200/90" : "bg-cyan-200";
  const stride = Math.max(1, duration / 40);
  return (
    <div
      ref={box}
      role="slider"
      tabIndex={onSeek ? 0 : -1}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(position)}
      aria-valuetext={`${dur(position)} of ${dur(duration)}`}
      onPointerDown={(e) => {
        if (!onSeek) return;
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        seek(e.clientX);
      }}
      onPointerMove={(e) => {
        if (onSeek && e.currentTarget.hasPointerCapture(e.pointerId)) seek(e.clientX);
      }}
      onKeyDown={(e) => {
        if (!onSeek) return;
        const d = e.shiftKey ? stride * 3 : stride;
        if (e.key === "ArrowRight") onSeek(Math.min(duration, position + d));
        else if (e.key === "ArrowLeft") onSeek(Math.max(0, position - d));
        else return;
        e.preventDefault();
        e.stopPropagation();
      }}
      className={`relative ${height} w-full touch-none select-none ${onSeek ? "cursor-pointer" : ""} ${dim ? "opacity-35" : ""}`}
    >
      <span aria-hidden className="absolute inset-0 flex items-center gap-[2px] px-0.5">
        {peaks.map((p, i) => (
          <span
            key={i}
            style={{ height: `${Math.max(6, p * 100)}%` }}
            className={`min-w-0 flex-1 rounded-full ${(i + 0.5) / n <= frac ? lit : "bg-white/30"}`}
          />
        ))}
      </span>
      {(playing || frac > 0) && (
        <span
          aria-hidden
          style={{ left: `${frac * 100}%` }}
          className="absolute -inset-y-1.5 w-0.5 -translate-x-1/2 rounded-full bg-white shadow-[0_0_8px] shadow-cyan-300/70"
        />
      )}
    </div>
  );
}

/** The SHAPE of a waveform nobody has measured — a silhouette at the faintest
 *  ink, so an unmeasured take reads as "a sound goes here", never as a hole
 *  and never as a fake measurement. Deterministic per `seed`. */
export function GhostWave({
  seed = 1,
  bars = 48,
  height = "h-8",
  className = "",
  pulse = false,
}: {
  seed?: number;
  bars?: number;
  height?: string;
  className?: string;
  /** Draw it breathing — the measurement is in flight. */
  pulse?: boolean;
}) {
  return (
    <span aria-hidden className={`flex ${height} items-center gap-[2px] ${pulse ? "animate-pulse" : ""} ${className}`}>
      {Array.from({ length: bars }, (_, i) => {
        const x = i / bars;
        const h = 18 + 55 * Math.abs(Math.sin(x * 9 + seed)) * (0.55 + 0.45 * Math.sin(x * 3.1 + seed * 2));
        return <span key={i} style={{ height: `${Math.max(10, h)}%` }} className="min-w-0 flex-1 rounded-full bg-white/[0.08]" />;
      })}
    </span>
  );
}

const seedOf = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return (Math.abs(h) % 97) / 7;
};

/** A take's waveform wired to the transport: real peaks when measured, the
 *  ghost when not, and nothing to seek for a take with no bytes. */
export function TakeWave({
  take,
  height = "h-12",
  bars = 96,
  dim,
  measuring = false,
  tone,
}: {
  take: Pick<SoundTake, "id" | "title" | "peaks" | "durationS" | "file">;
  height?: string;
  bars?: number;
  dim?: boolean;
  /** The bytes are being measured right now. */
  measuring?: boolean;
  tone?: "cyan" | "amber" | "emerald";
}) {
  const st = usePlayback(take.id);
  if (!take.peaks || take.peaks.length === 0) {
    return <GhostWave seed={seedOf(take.id)} bars={Math.min(bars, 64)} height={height} pulse={measuring} className="w-full" />;
  }
  const duration = st?.duration || transport.lengthOf(take.id) || take.durationS || 0;
  return (
    <Wave
      label={`${take.title} position`}
      peaks={resample(take.peaks, bars)}
      position={st?.position ?? 0}
      duration={duration}
      playing={!!st?.playing}
      height={height}
      dim={dim}
      tone={tone}
      onSeek={take.file ? (s) => transport.seek(take.id, s, take.durationS) : undefined}
    />
  );
}

/** Play / pause one take on the shared transport. A take with no bytes cannot
 *  play and says so in its accessible name; the control keeps its place. */
export function PlayButton({
  take,
  size = "md",
}: {
  take: Pick<SoundTake, "id" | "title" | "file" | "durationS">;
  size?: "sm" | "md" | "lg";
}) {
  const st = usePlayback(take.id);
  const on = !!st?.playing;
  const gone = !take.file || !!st?.failed;
  const box = size === "lg" ? "h-12 w-12" : size === "sm" ? "h-8 w-8" : "h-9 w-9";
  return (
    <button
      type="button"
      disabled={gone}
      onClick={(e) => {
        e.stopPropagation();
        transport.toggle(take.id, take.durationS);
      }}
      aria-label={gone ? `${take.title}: no audio file` : `${on ? "Pause" : "Play"} ${take.title}`}
      aria-pressed={on}
      className={`grid ${box} shrink-0 cursor-pointer place-items-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-30 ${
        on
          ? "border-cyan-300/60 bg-cyan-300/15 text-cyan-100 shadow-[0_0_14px] shadow-cyan-400/25"
          : "border-white/15 bg-white/[0.04] text-white/80 hover:border-cyan-300/40 hover:text-cyan-100"
      }`}
    >
      {on ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="ml-0.5 h-4 w-4" aria-hidden />}
    </button>
  );
}
