"use client";

// TWO PRELOADED EARS, ONE SOUNDING (the winner's booth audio): both arms load at once; playing one
// pauses the other; the position is SHARED, so a flip lands the other arm at the same second of the
// window; a seek moves the shared position. Each arm's source is its own blind window (a 25 s cut,
// loudness-matched by the server's ab-window job), so the window starts at 0 on both.
//
// One pair per mount: the booth is keyed by its pair id, so a new match is a new hook with a fresh
// clock rather than a reset inside an effect. The clock is the media element's, read at a tenth of
// a second (what the booth prints), so a playing arm re-renders the booth ten times a second.
import { useCallback, useEffect, useRef, useState } from "react";

import type { ArmSrc } from "./songlab.ts";

export type ArmsState = {
  readonly active: 0 | 1;
  readonly playing: boolean;
  /** Seconds into the shared window. */
  readonly pos: number;
  /** The arm that could not be played, in words; absent while both play. */
  readonly error?: string;
};

export type Arms = ArmsState & {
  readonly play: (i: 0 | 1) => void;
  readonly flip: () => void;
  readonly toggle: () => void;
  readonly seek: (s: number) => void;
  readonly stop: () => void;
};

const GRAIN_MS = 100;
const letter = (i: 0 | 1): string => (i === 0 ? "A" : "B");
/** A media element's clock is set through here: the element is the browser's, not React state. */
function setTime(el: HTMLAudioElement, t: number): void {
  el.currentTime = t;
}

export function useArms(arms: readonly [ArmSrc, ArmSrc] | null, windowS: number): Arms {
  const ears = useRef<[HTMLAudioElement, HTMLAudioElement] | null>(null);
  const [st, setSt] = useState<ArmsState>({ active: 0, playing: false, pos: 0 });
  const live = useRef(st);
  useEffect(() => {
    live.current = st;
  });
  const a0 = arms?.[0].src ?? "";
  const a1 = arms?.[1].src ?? "";

  useEffect(() => {
    if (a0 === "" || a1 === "") return;
    const pair: [HTMLAudioElement, HTMLAudioElement] = [new Audio(), new Audio()];
    [a0, a1].forEach((src, n) => {
      const i: 0 | 1 = n === 0 ? 0 : 1;
      const el = pair[i];
      el.preload = "auto";
      el.src = src;
      // A source that fails to load is said when its arm is played, not at preload: a window still
      // being cut is the booth's own state, not an error until someone asks to hear it.
      el.onerror = () => setSt((s) => (s.active === i && s.playing ? { ...s, playing: false, error: `could not play ${letter(i)}` } : s));
    });
    ears.current = pair;
    return () => {
      for (const el of pair) {
        el.pause();
        el.removeAttribute("src");
        el.load();
      }
      ears.current = null;
    };
  }, [a0, a1]);

  useEffect(() => {
    if (!st.playing) return;
    const id = window.setInterval(() => {
      const el = ears.current?.[live.current.active];
      if (el === undefined) return;
      const pos = Math.min(windowS, el.currentTime);
      if (pos >= windowS - 0.05 || el.ended) {
        el.pause();
        setSt((s) => ({ ...s, playing: false, pos: windowS }));
        return;
      }
      setSt((s) => (Math.abs(s.pos - pos) < 0.05 ? s : { ...s, pos }));
    }, GRAIN_MS);
    return () => window.clearInterval(id);
  }, [st.playing, windowS]);

  const play = useCallback(
    (i: 0 | 1) => {
      const pair = ears.current;
      if (pair === null) return;
      const cur = live.current;
      pair[i === 0 ? 1 : 0].pause();
      const el = pair[i];
      if (cur.playing && cur.active === i) {
        el.pause();
        setSt((s) => ({ ...s, playing: false, pos: Math.min(windowS, el.currentTime) }));
        return;
      }
      const from = cur.pos >= windowS - 0.05 ? 0 : cur.pos;
      const go = () => {
        // `go` runs once the source has metadata, so the seek lands.
        setTime(el, from);
        el.play().then(
          () => setSt((s) => ({ active: i, playing: true, pos: from, ...(s.error === undefined ? {} : { error: s.error }) })),
          () => setSt((s) => ({ ...s, playing: false, error: `could not play ${letter(i)}` })),
        );
      };
      setSt((s) => ({ ...s, active: i }));
      if (el.error !== null) {
        setSt((s) => ({ ...s, playing: false, error: `could not play ${letter(i)}` }));
        return;
      }
      if (el.readyState >= 1) go();
      else el.addEventListener("loadedmetadata", go, { once: true });
    },
    [windowS],
  );

  const seek = useCallback(
    (s: number) => {
      const pos = Math.max(0, Math.min(windowS, s));
      const el = ears.current?.[live.current.active];
      if (el !== undefined && live.current.playing) setTime(el, pos);
      setSt((x) => ({ ...x, pos }));
    },
    [windowS],
  );

  const stop = useCallback(() => {
    ears.current?.forEach((el) => el.pause());
    setSt((s) => ({ ...s, playing: false }));
  }, []);

  return {
    ...st,
    play,
    flip: () => play(live.current.active === 0 ? 1 : 0),
    toggle: () => play(live.current.active),
    seek,
    stop,
  };
}
