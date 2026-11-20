"use client";

// The one scrubber both faces share: play, the playhead in desktop time over the film's length, and the pinned
// notes as marks along it. A native range underneath, so the keyboard and a screen reader get a slider for free;
// the drawn track, fill and marks sit over it and take no pointer.
import { Button } from "@gt/ui/components/button/Button.tsx";
import { mss } from "@gt/ui/components/filmstrip/Filmstrip.tsx";

import { FPS } from "./useLinked.ts";
import r from "./review.module.css";

export function Transport({ t, duration, playing, marks, onToggle, onSeek }: {
  readonly t: number;
  readonly duration: number;
  readonly playing: boolean;
  readonly marks: readonly { readonly at: number; readonly label: string }[];
  readonly onToggle: () => void;
  readonly onSeek: (t: number) => void;
}) {
  const share = duration > 0 ? Math.min(1, t / duration) : 0;
  return (
    <div className={r.transport}>
      <Button label={playing ? "pause" : "play"} tone={playing ? "neutral" : "cyan"} solid={!playing} size="sm" shortcut={{ mode: "reel", verb: "play" }} onPress={onToggle} />
      <span className={r.clock}>
        <b>{mss(t)}</b>
        <span>{duration > 0 ? mss(duration) : "—"}</span>
      </span>
      <span className={r.scrub}>
        <span className={r.track} aria-hidden="true">
          <span className={r.fill} style={{ width: `${(share * 100).toFixed(2)}%` }} />
          {marks.map((m) => (
            <span key={`${m.at}:${m.label}`} className={r.pinMark} style={{ left: `${(Math.min(1, Math.max(0, m.at)) * 100).toFixed(2)}%` }} />
          ))}
        </span>
        <input className={r.range} type="range" min={0} max={duration > 0 ? duration : 1} step={1 / FPS} value={Math.min(t, duration > 0 ? duration : 1)} onChange={(e) => onSeek(Number(e.currentTarget.value))} aria-label="playhead" aria-valuetext={`${mss(t)} of ${mss(duration)}`} />
      </span>
      <span className={r.phoneClock} aria-label={`phone ${mss(t / 2)}`}>
        phone {mss(t / 2)}
      </span>
    </div>
  );
}
