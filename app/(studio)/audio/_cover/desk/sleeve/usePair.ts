"use client";

// TWO TAKES AGAINST EACH OTHER: the cover desk's A/B (../useAB.ts) holds a take against
// its section; this holds take against take, the owner's question once two takes both pass. The same rules: two
// elements play together from the same second, the side not heard is muted rather than paused so switching keeps the
// beat, and each is turned down to one loudness (../audio.ts levelFor, each take's RMS as the browser measured it).
// The heard side drives the clock; the other is pulled back to it past DRIFT_S. One player at a time: the caller
// stops the desk's A/B before this starts, and this before the A/B does.
import { useCallback, useEffect, useRef, useState } from "react";

import { mediaErrorWords } from "@gt/ui/components/audio/AudioPreview.tsx";

import { audioOf, DRIFT_S, reap, type AudioRef } from "../abElements.ts";
import { hearUrl, levelFor } from "../audio.ts";

export type PairSide = "x" | "y";

export type Pair = {
  readonly playing: boolean;
  readonly side: PairSide;
  readonly clock: number;
  readonly failed: string | null;
  readonly toggle: (x: string, y: string) => void;
  readonly hear: (side: PairSide) => void;
  readonly seek: (s: number) => void;
  readonly stop: () => void;
};

export function usePair(): Pair {
  const ex = useRef<HTMLAudioElement | null>(null);
  const ey = useRef<HTMLAudioElement | null>(null);
  const sideRef = useRef<PairSide>("x");
  const levels = useRef({ x: 0.5, y: 0.5 });
  const [playing, setPlaying] = useState(false);
  const [side, setSide] = useState<PairSide>("x");
  const [clock, setClock] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);

  const apply = useCallback((): void => {
    if (ex.current !== null) ex.current.volume = sideRef.current === "x" ? levels.current.x : 0;
    if (ey.current !== null) ey.current.volume = sideRef.current === "y" ? levels.current.y : 0;
  }, []);

  const halt = useCallback((): void => {
    ex.current?.pause();
    ey.current?.pause();
    setPlaying(false);
  }, []);

  useEffect(() => {
    if (!playing) return;
    let id = 0;
    const loop = (): void => {
      const lead = sideRef.current === "x" ? ex.current : ey.current;
      const other = sideRef.current === "x" ? ey.current : ex.current;
      if (lead !== null) {
        if (lead.ended) {
          halt();
          setClock(0);
          return;
        }
        if (other !== null && !other.ended && Math.abs(other.currentTime - lead.currentTime) > DRIFT_S) other.currentTime = lead.currentTime;
        setClock(lead.currentTime);
      }
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [playing, halt]);

  const load = useCallback(
    async (r: AudioRef, url: string, key: "x" | "y"): Promise<HTMLAudioElement> => {
    const a = audioOf(r);
    a.onerror = () => {
      halt();
      setFailed(mediaErrorWords(a.error?.code, url));
    };
    const h = await hearUrl(url);
    levels.current[key] = levelFor(h.ok ? h.value.rms(0, h.value.lenS) : undefined);
    if (!a.src.endsWith(url)) {
      a.src = url;
      await new Promise<void>((done) => a.addEventListener("loadedmetadata", () => done(), { once: true }));
    }
    return a;
    },
    [halt],
  );

  const start = useCallback(
    async (x: string, y: string, from: number): Promise<void> => {
      halt();
      setFailed(null);
      const [ax, ay] = await Promise.all([load(ex, x, "x"), load(ey, y, "y")]);
      ax.currentTime = Math.min(from, Number.isFinite(ax.duration) ? ax.duration : from);
      ay.currentTime = Math.min(from, Number.isFinite(ay.duration) ? ay.duration : from);
      apply();
      try {
        await Promise.all([ax.play(), ay.play()]);
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
        halt();
        setFailed(e instanceof Error ? `${e.name} · ${e.message}` : String(e));
        return;
      }
      setPlaying(true);
      setClock(from);
    },
    [halt, apply, load],
  );

  const toggle = useCallback(
    (x: string, y: string): void => {
      if (playing) return halt();
      void start(x, y, clock);
    },
    [playing, clock, halt, start],
  );

  const seek = useCallback(
    (s: number): void => {
      const to = Math.max(0, s);
      if (!playing) {
        setClock(to);
        return;
      }
      if (ex.current !== null) ex.current.currentTime = to;
      if (ey.current !== null) ey.current.currentTime = to;
      setClock(to);
    },
    [playing],
  );

  const hear = useCallback(
    (next: PairSide): void => {
      sideRef.current = next;
      setSide(next);
      apply();
    },
    [apply],
  );

  const stop = useCallback((): void => {
    halt();
    setClock(0);
  }, [halt]);

  // The reaper: leaving the cover pauses both and lets go of their sources.
  useEffect(() => () => reap([ex, ey]), []);

  return { playing, side, clock, failed, toggle, hear, seek, stop };
}
