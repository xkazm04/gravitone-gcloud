"use client";

// ONE CLOCK FOR THE CUT (registry music-video-production / segment-on-the-master-clock): the track is the clock and
// every take follows it. The audio element is the master; the take under the playhead plays muted on one of two
// video elements, seeked to (t - at). The other element holds the NEXT take, loaded and parked at its first frame,
// so a block edge is a swap of which element shows, not a load. A take that drifts is pulled back by its playback
// rate (a nudge does not stutter); past a quarter second it is seeked.
//
// With no audio (a /kit specimen, a map before its excerpt is cut) the clock is performance.now(), same contract.
// Under prefers-reduced-motion the playhead the caller draws moves once a second instead of sweeping; the take and
// the sound are not slowed, only the mark.

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import { blockAfter, blockAt, correction, type TimelineBlock } from "./geometry.ts";

export type MasterClock = {
  readonly audio: RefObject<HTMLAudioElement | null>;
  /** The two take elements; `showing` says which is drawn. */
  readonly videos: readonly [RefObject<HTMLVideoElement | null>, RefObject<HTMLVideoElement | null>];
  readonly showing: 0 | 1 | null;
  /** The block whose take is showing. */
  readonly current: TimelineBlock | null;
  /** The playhead as drawn (quantized under reduced motion). */
  readonly t: number;
  readonly playing: boolean;
  readonly play: () => void;
  readonly pause: () => void;
  readonly toggle: () => void;
  readonly seek: (t: number) => void;
};

const reducedMotion = (): boolean => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Loads `b` on `v` at `offset` seconds into the take, paused or playing. */
function cue(v: HTMLVideoElement, b: TimelineBlock, offset: number, run: boolean): void {
  const src = b.video ?? "";
  if (v.dataset["block"] !== b.id) {
    v.dataset["block"] = b.id;
    v.dataset["at"] = String(b.at);
    v.src = src;
  }
  const place = () => {
    if (Math.abs(v.currentTime - offset) > 0.02) v.currentTime = offset;
    v.playbackRate = 1;
    if (run) void v.play().catch(() => undefined);
    else v.pause();
  };
  if (v.readyState >= 1) place();
  else v.addEventListener("loadedmetadata", place, { once: true });
}

export function useMasterClock({ seconds, audioSrc, blocks }: { readonly seconds: number; readonly audioSrc: string | undefined; readonly blocks: readonly TimelineBlock[] }): MasterClock {
  const audio = useRef<HTMLAudioElement | null>(null);
  const v0 = useRef<HTMLVideoElement | null>(null);
  const v1 = useRef<HTMLVideoElement | null>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showing, setShowing] = useState<0 | 1 | null>(null);
  const [current, setCurrent] = useState<TimelineBlock | null>(null);
  // The synthetic clock: where it was started from, and when.
  const synth = useRef({ from: 0, since: 0 });
  const head = useRef(0);
  const live = useRef({ showing: null as 0 | 1 | null, current: null as string | null });
  const blocksRef = useRef(blocks);
  const playingRef = useRef(false);
  useEffect(() => {
    blocksRef.current = blocks;
  }, [blocks]);

  const now = useCallback((): number => {
    const a = audio.current;
    if (audioSrc !== undefined && a !== null) return a.currentTime;
    return playingRef.current ? synth.current.from + (performance.now() - synth.current.since) / 1000 : synth.current.from;
  }, [audioSrc]);

  /** Puts the right take on screen for `time`, playing or parked, and the next one behind it. */
  const place = useCallback((time: number, run: boolean) => {
    const els = [v0.current, v1.current] as const;
    const b = blockAt(blocksRef.current, time);
    const was = live.current;
    if (b === null || b.video === undefined) {
      for (const v of els) v?.pause();
      if (was.showing !== null || was.current !== null) {
        live.current = { showing: null, current: null };
        setShowing(null);
        setCurrent(b);
      }
    } else {
      const ready = els.findIndex((v) => v?.dataset["block"] === b.id);
      const slot: 0 | 1 = ready === 0 || ready === 1 ? ready : was.showing === 0 ? 1 : 0;
      const v = els[slot];
      if (v !== null) {
        if (was.current !== b.id || was.showing !== slot) {
          cue(v, b, time - b.at, run);
          els[slot === 0 ? 1 : 0]?.pause();
          live.current = { showing: slot, current: b.id };
          setShowing(slot);
          setCurrent(b);
        } else if (run) {
          const fix = correction(time - b.at - v.currentTime);
          if (fix.seek) v.currentTime = time - b.at;
          v.playbackRate = fix.rate;
          if (v.paused) void v.play().catch(() => undefined);
        } else {
          cue(v, b, time - b.at, false);
        }
      }
    }
    // The next take waits on the hidden element, parked at its first frame.
    const next = blockAfter(blocksRef.current, time);
    const spare = els[live.current.showing === 0 ? 1 : 0];
    if (next?.video !== undefined && spare !== null && spare.dataset["block"] !== next.id) cue(spare, next, 0, false);
  }, []);

  const draw = useCallback((time: number) => {
    head.current = time;
    setT(reducedMotion() && playingRef.current ? Math.floor(time) : time);
  }, []);

  const pause = useCallback(() => {
    const time = now();
    playingRef.current = false;
    synth.current = { from: time, since: performance.now() };
    audio.current?.pause();
    setPlaying(false);
    place(time, false);
    draw(time);
  }, [now, place, draw]);

  const seek = useCallback(
    (to: number) => {
      const time = Math.min(seconds, Math.max(0, to));
      synth.current = { from: time, since: performance.now() };
      if (audio.current !== null && audioSrc !== undefined) audio.current.currentTime = time;
      place(time, playingRef.current);
      draw(time);
    },
    [seconds, audioSrc, place, draw],
  );

  const play = useCallback(() => {
    const from = head.current >= seconds ? 0 : head.current;
    synth.current = { from, since: performance.now() };
    playingRef.current = true;
    setPlaying(true);
    const a = audio.current;
    if (a !== null && audioSrc !== undefined) {
      a.currentTime = from;
      void a.play().catch(() => pause());
    }
    place(from, true);
  }, [seconds, audioSrc, place, pause]);

  const toggle = useCallback(() => (playingRef.current ? pause() : play()), [play, pause]);

  // The frame loop runs only while playing.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const time = now();
      if (time >= seconds) {
        pause();
        draw(seconds);
        return;
      }
      place(time, true);
      draw(time);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, now, seconds, place, draw, pause]);

  // A new block list (a verdict, a recast) re-places what is under the head.
  useEffect(() => {
    if (!playingRef.current) place(head.current, false);
  }, [blocks, place]);

  return { audio, videos: [v0, v1], showing, current, t, playing, play, pause, toggle, seek };
}
