"use client";

// TRANSPORT AND A MAGNITUDE WAVEFORM: the marks for playing a piece of audio or
// video, drawn in the world's line.
//
// These are CONTROLLED parts. They own no <audio> or <video> element and fetch
// nothing: the caller holds the media element and passes its `playing`, `position`
// and `duration` in, and answers `onToggle` / `onSeek`. That keeps the kit
// provider-free, and it is why one player serves a score spot, a playground take
// and a cut preview alike.
//
//   Transport   play / pause, step back, step forward, and `0:12 / 0:48`
//   Waveform    the piece's magnitude as vertical strokes, played ones in white,
//               the rest in ash; a gold playhead star; spot marks below
//   Player      the two together, with an optional screen above for video
//
// The waveform is the seek control: role="slider", ArrowLeft / ArrowRight step,
// Shift steps by a longer stride, Home / End jump, a press or drag seeks. The
// spot marks are buttons in their own row (never nested inside the slider).

import { useRef } from "react";

import { Ico } from "./Ico";

/** 0:07, 12:34, 1:02:03. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(r)}` : `${m}:${two(r)}`;
}

export function Transport({
  label,
  playing,
  position,
  duration,
  step = 5,
  disabled = false,
  onToggle,
  onSeek,
}: {
  /** The control group's accessible name and the subject of the play button: "Take 2". */
  label: string;
  playing: boolean;
  /** Seconds. */
  position: number;
  /** Seconds. */
  duration: number;
  /** Seconds a step button moves. */
  step?: number;
  disabled?: boolean;
  onToggle: () => void;
  onSeek: (seconds: number) => void;
}) {
  const clamp = (t: number) => Math.min(duration, Math.max(0, t));
  return (
    <div className="k-transport" role="group" aria-label={`${label} transport`}>
      <button
        type="button"
        className="k-tp"
        disabled={disabled}
        aria-label={`Back ${step} seconds`}
        onClick={() => onSeek(clamp(position - step))}
      >
        <Ico name="back" />
      </button>
      <button
        type="button"
        className={`k-tp k-tp--main${playing ? " is-playing" : ""}`}
        disabled={disabled}
        aria-label={`${playing ? "Pause" : "Play"} ${label}`}
        aria-pressed={playing}
        onClick={onToggle}
      >
        <Ico name={playing ? "pause" : "play"} size={18} />
      </button>
      <button
        type="button"
        className="k-tp"
        disabled={disabled}
        aria-label={`Forward ${step} seconds`}
        onClick={() => onSeek(clamp(position + step))}
      >
        <Ico name="fwd" />
      </button>
      <span className="k-tp__time k-num" aria-hidden="true">
        {clock(position)} <span className="k-tp__of">/ {clock(duration)}</span>
      </span>
    </div>
  );
}

export interface WaveMark {
  /** Seconds. */
  at: number;
  /** The mark's name: "spot 3, door slam". */
  label: string;
}

const PLOT_H = 48;

export function Waveform({
  label,
  peaks,
  position,
  duration,
  marks,
  disabled = false,
  onSeek,
}: {
  /** The slider's accessible name: "Take 2 position". */
  label: string;
  /** Magnitude per slice, 0 to 1. */
  peaks: readonly number[];
  position: number;
  duration: number;
  marks?: readonly WaveMark[];
  /** A piece that is not there: the strokes draw as a dashed rule. */
  disabled?: boolean;
  onSeek: (seconds: number) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const n = Math.max(1, peaks.length);
  const frac = duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0;
  const playedTo = frac * n;
  const seekFromPointer = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r || r.width === 0 || duration <= 0) return;
    onSeek(Math.min(duration, Math.max(0, ((clientX - r.left) / r.width) * duration)));
  };
  const stride = Math.max(1, duration / 40);

  return (
    <div className={`k-wave${disabled ? " is-off" : ""}`}>
      <div
        ref={box}
        className="k-wave__plot"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(position)}
        aria-valuetext={`${clock(position)} of ${clock(duration)}`}
        aria-disabled={disabled || undefined}
        onPointerDown={(e) => {
          if (disabled) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          seekFromPointer(e.clientX);
        }}
        onPointerMove={(e) => {
          if (!disabled && e.currentTarget.hasPointerCapture(e.pointerId)) seekFromPointer(e.clientX);
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          const d = e.shiftKey ? stride * 3 : stride;
          const to =
            e.key === "ArrowRight" || e.key === "ArrowUp"
              ? position + d
              : e.key === "ArrowLeft" || e.key === "ArrowDown"
                ? position - d
                : e.key === "Home"
                  ? 0
                  : e.key === "End"
                    ? duration
                    : null;
          if (to === null) return;
          e.preventDefault();
          onSeek(Math.min(duration, Math.max(0, to)));
        }}
      >
        <svg className="k-wave__svg" viewBox={`0 0 ${n} ${PLOT_H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
          {disabled ? (
            <line className="k-wave__rest" x1={0} x2={n} y1={PLOT_H / 2} y2={PLOT_H / 2} strokeDasharray="4 6" />
          ) : (
            peaks.map((p, i) => {
              const h = Math.max(2, Math.min(1, Math.max(0, p)) * (PLOT_H - 4));
              const x = i + 0.5;
              return (
                <line
                  key={i}
                  className={i + 0.5 <= playedTo ? "k-wave__on" : "k-wave__rest"}
                  x1={x}
                  x2={x}
                  y1={PLOT_H / 2 - h / 2}
                  y2={PLOT_H / 2 + h / 2}
                />
              );
            })
          )}
        </svg>
        {!disabled && (
          <span className="k-wave__head" style={{ left: `${frac * 100}%` }} aria-hidden="true">
            <i />
          </span>
        )}
      </div>
      {marks && marks.length > 0 && duration > 0 && (
        <div className="k-wave__marks" role="group" aria-label={`${label}, marks`}>
          {marks.map((m) => (
            <button
              key={`${m.at}-${m.label}`}
              type="button"
              className="k-wave__mark"
              style={{ left: `${Math.min(1, Math.max(0, m.at / duration)) * 100}%` }}
              aria-label={`${m.label}, at ${clock(m.at)}`}
              disabled={disabled}
              onClick={() => onSeek(m.at)}
            >
              <span aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Player({
  label,
  kind = "audio",
  screen,
  peaks,
  marks,
  playing,
  position,
  duration,
  disabled,
  onToggle,
  onSeek,
}: {
  /** What is playing: "Spot 3, door slam". */
  label: string;
  kind?: "audio" | "video";
  /** A video's picture: a poster or the element itself. Ignored for audio. */
  screen?: React.ReactNode;
  peaks: readonly number[];
  marks?: readonly WaveMark[];
  playing: boolean;
  position: number;
  duration: number;
  disabled?: boolean;
  onToggle: () => void;
  onSeek: (seconds: number) => void;
}) {
  return (
    <div className={`k-player k-player--${kind}`} role="group" aria-label={label}>
      {kind === "video" && <div className="k-player__screen">{screen}</div>}
      <Waveform
        label={`${label} position`}
        peaks={peaks}
        position={position}
        duration={duration}
        marks={marks}
        disabled={disabled}
        onSeek={onSeek}
      />
      <Transport
        label={label}
        playing={playing}
        position={position}
        duration={duration}
        disabled={disabled}
        onToggle={onToggle}
        onSeek={onSeek}
      />
    </div>
  );
}
