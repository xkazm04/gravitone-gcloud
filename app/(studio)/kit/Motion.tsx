"use client";

// The four acts the design animates (kit.js "acts": lockIn on a ratified item, fadeUp on an
// arrival, moved on a re-route, shake on a refusal). Pressing one plays it once; the class
// clears when the animation ends, so the next press plays it again. Under reduced motion
// the world sheet's blanket rule stills them, and the press does nothing visible.

import { useState } from "react";

import k from "./kit.module.css";

const ACTS = [
  { cls: "playLock", label: "lockIn · ratified" },
  { cls: "playFade", label: "fadeUp · arrive" },
  { cls: "playMoved", label: "moved · re-routed" },
  { cls: "playShake", label: "shake · refused" },
] as const;

export function Motion() {
  const [playing, setPlaying] = useState<string | null>(null);
  return (
    <div className={k.motion}>
      {ACTS.map((a) => (
        <button
          key={a.cls}
          type="button"
          className={playing === a.cls ? k[a.cls] : undefined}
          onClick={() => setPlaying(a.cls)}
          onAnimationEnd={() => setPlaying(null)}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}
