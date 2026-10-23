"use client";

// A clip's own controls under it (operator, 2026-10-22: "bottom bar with play/pause/volume"): play
// or pause, sound on or off, the level, and where the clip is. The clip starts muted and looping, so
// a run opens moving and silent; sound is the operator's choice. Reads the element it is handed and
// follows its events, so a key that pauses the clip elsewhere shows here too.
import { useEffect, useState, type RefObject } from "react";

import { LibraryGlyph } from "../library/LibraryGlyph.tsx";
import s from "./Verdict.module.css";

/** A speaker, with its sound waves while sound is on (drawn in currentColor, as LibraryGlyph's marks are). */
function Speaker({ on }: { readonly on: boolean }) {
  return (
    <svg className={s.ctlGlyph} viewBox="0 0 12 10" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
      <path d="M1 3.5h2l3-2.5v8l-3-2.5H1z" fill="currentColor" stroke="none" />
      {on ? <path d="M8 3c.8.6.8 3.4 0 4M9.6 1.6c1.6 1.6 1.6 5.2 0 6.8" /> : <path d="M8 3.2l3 3.6M11 3.2l-3 3.6" />}
    </svg>
  );
}

const clock = (t: number): string => (Number.isFinite(t) ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}` : "0:00");

export function VideoBar({ video, label }: { readonly video: RefObject<HTMLVideoElement | null>; readonly label: string }) {
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [volume, setVolume] = useState(0.8);
  const [at, setAt] = useState(0);
  const [length, setLength] = useState(0);

  useEffect(() => {
    const el = video.current;
    if (el === null) return;
    const sync = () => {
      setPlaying(!el.paused);
      setMuted(el.muted);
      setVolume(el.volume);
      setAt(el.currentTime);
      setLength(el.duration);
    };
    const events = ["play", "pause", "volumechange", "timeupdate", "loadedmetadata"] as const;
    for (const e of events) el.addEventListener(e, sync);
    sync();
    return () => {
      for (const e of events) el.removeEventListener(e, sync);
    };
  }, [video]);

  const el = () => video.current;
  return (
    <div className={s.bar} role="group" aria-label={`${label} playback`}>
      <button type="button" className={s.ctl} aria-label={playing ? "pause" : "play"} onMouseDown={(e) => e.preventDefault()} onClick={() => (playing ? el()?.pause() : void el()?.play())}>
        <LibraryGlyph name={playing ? "pause" : "play"} className={s.ctlGlyph} />
      </button>
      <button type="button" className={s.ctl} aria-pressed={!muted} aria-label={muted ? "sound on" : "sound off"} onMouseDown={(e) => e.preventDefault()} onClick={() => { const v = el(); if (v !== null) v.muted = !v.muted; }}>
        <Speaker on={!muted} />
      </button>
      <input
        className={s.volume}
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={muted ? 0 : volume}
        aria-label="volume"
        onChange={(e) => {
          const v = el();
          if (v === null) return;
          v.volume = Number(e.target.value);
          v.muted = v.volume === 0;
        }}
      />
      <span className={s.time} aria-label="position">
        {clock(at)} / {clock(length)}
      </span>
    </div>
  );
}
