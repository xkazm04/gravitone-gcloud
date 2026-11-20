"use client";

// TWO FACES ON ONE CLOCK (spark reel-studio, owner wave 3: "linked side by side: desktop 1x + phone 2x on one
// scrubber/timeline"). The phone film is the desktop timeline rendered every second frame, so the same moment sits
// at half the phone's time: phone time = desktop time / 2. The desktop element is the clock; while it plays the
// phone runs at half rate and is pulled back whenever it drifts past a frame and a half, so both show the same
// moment of the same timeline. With only one face on disk that face is the clock. Every time here is DESKTOP time.
//
// A pin is stamped in desktop seconds, so the scrubber, the strip and the notes all speak one time.
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

export const FPS = 30;
/** How far the phone may wander before it is pulled back, in phone seconds. */
const DRIFT = 1.5 / FPS;

export type Linked = {
  readonly desk: RefObject<HTMLVideoElement | null>;
  readonly phone: RefObject<HTMLVideoElement | null>;
  /** The playhead, desktop seconds. */
  readonly t: number;
  readonly duration: number;
  readonly playing: boolean;
  readonly toggle: () => void;
  readonly seek: (t: number) => void;
  readonly step: (frames: number) => void;
};

export function useLinked(fallbackDuration: number): Linked {
  const desk = useRef<HTMLVideoElement | null>(null);
  const phone = useRef<HTMLVideoElement | null>(null);
  const [t, setT] = useState(0);
  const [duration, setDuration] = useState(fallbackDuration);
  const [playing, setPlaying] = useState(false);
  const tRef = useRef(0);

  const clock = useCallback((): number => {
    const d = desk.current;
    const p = phone.current;
    if (d !== null) return d.currentTime;
    if (p !== null) return p.currentTime * 2;
    return tRef.current;
  }, []);

  const place = useCallback(
    (to: number) => {
      const x = Math.min(Math.max(0, to), duration > 0 ? duration : to);
      tRef.current = x;
      if (desk.current !== null) desk.current.currentTime = x;
      if (phone.current !== null) phone.current.currentTime = x / 2;
      setT(x);
    },
    [duration],
  );

  // The length: the desktop element's own when it has read it, else the phone's doubled, else the record's.
  useEffect(() => {
    const d = desk.current;
    const p = phone.current;
    const read = () => {
      const len = d !== null && Number.isFinite(d.duration) ? d.duration : p !== null && Number.isFinite(p.duration) ? p.duration * 2 : undefined;
      if (len !== undefined && len > 0) setDuration(len);
      if (p !== null) p.playbackRate = d === null ? 1 : 0.5;
    };
    const ended = () => {
      setPlaying(false);
      p?.pause();
      d?.pause();
    };
    read();
    const clockEl = d ?? p;
    d?.addEventListener("loadedmetadata", read);
    p?.addEventListener("loadedmetadata", read);
    clockEl?.addEventListener("ended", ended);
    return () => {
      d?.removeEventListener("loadedmetadata", read);
      p?.removeEventListener("loadedmetadata", read);
      clockEl?.removeEventListener("ended", ended);
    };
  }, []);

  // While playing: read the clock every frame, hold the phone to it.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const now = clock();
      const p = phone.current;
      if (desk.current !== null && p !== null && Math.abs(p.currentTime - now / 2) > DRIFT) p.currentTime = now / 2;
      if (Math.abs(now - tRef.current) >= 1 / FPS) {
        tRef.current = now;
        setT(now);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, clock]);

  const toggle = useCallback(() => {
    const d = desk.current;
    const p = phone.current;
    if (playing) {
      d?.pause();
      p?.pause();
      setPlaying(false);
      return;
    }
    if (duration > 0 && clock() >= duration - 1 / FPS) place(0);
    if (p !== null) {
      p.playbackRate = d === null ? 1 : 0.5;
      p.currentTime = clock() / 2;
    }
    const started = [d?.play(), p?.play()].filter((x): x is Promise<void> => x !== undefined);
    setPlaying(true);
    Promise.all(started).catch(() => {
      d?.pause();
      p?.pause();
      setPlaying(false);
    });
  }, [playing, duration, clock, place]);

  const seek = useCallback((to: number) => place(to), [place]);

  const step = useCallback(
    (frames: number) => {
      desk.current?.pause();
      phone.current?.pause();
      setPlaying(false);
      place(clock() + frames / FPS);
    },
    [clock, place],
  );

  return { desk, phone, t, duration, playing, toggle, seek, step };
}
