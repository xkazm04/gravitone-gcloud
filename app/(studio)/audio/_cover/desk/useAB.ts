"use client";

// ONE PLAYER FOR THE COVER: a take against its section, A/B at matched level, one at a time (the track-mirror
// page's per-row player, pipeline/track-mirror/page.js, rebuilt as a hook). Two elements play together - the
// source from the section's start, the take from zero - and the side not heard is muted rather than paused, so
// switching sides keeps the beat. Each side is turned down to one loudness (./audio.ts levelFor, the RMS each
// was measured at in the browser). The take drives the clock: past the section's end the source side is silence.
// A take left mid-way resumes where it was left. The section alone plays through the same pair (key "section").
import { useCallback, useEffect, useRef, useState } from "react";

import { mediaErrorWords } from "@gt/ui/components/audio/AudioPreview.tsx";

import { advance, audioOf, reap, type AB, type Loaded, type Side } from "./abElements.ts";
import { hearUrl, levelFor } from "./audio.ts";

export type { AB, Side } from "./abElements.ts";
export const SECTION_KEY = "section";

export function useAB(sourceUrl: string | undefined, section: { readonly startS: number; readonly endS: number }, sourceRms: number | undefined): AB {
  const a = useRef<HTMLAudioElement | null>(null);
  const b = useRef<HTMLAudioElement | null>(null);
  const cur = useRef<Loaded | null>(null);
  const sideRef = useRef<Side>("b");
  const levels = useRef<{ a: number; b: number }>({ a: 0.5, b: 0.5 });
  const positions = useRef(new Map<string, number>());
  const sec = useRef(section);
  const [at, setAt] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [side, setSideState] = useState<Side>("b");
  const [clock, setClock] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);

  const apply = useCallback((): void => {
    const take = cur.current?.url !== null && cur.current !== null;
    if (a.current !== null) a.current.volume = !take || sideRef.current === "a" ? levels.current.a : 0;
    if (b.current !== null) b.current.volume = take && sideRef.current === "b" ? levels.current.b : 0;
  }, []);

  const halt = useCallback((): void => {
    a.current?.pause();
    b.current?.pause();
    setPlaying(false);
  }, []);

  const tick = useCallback((): void => {
    const c = cur.current;
    if (c === null || a.current === null) return;
    const step = advance(c, a.current, b.current, sec.current);
    if (step === null) return;
    if (step === "ended") {
      halt();
      positions.current.set(c.key, 0);
      setClock(0);
    } else setClock(step);
  }, [halt]);

  // The clock runs on animation frames while something sounds, and stops with it.
  useEffect(() => {
    if (!playing) return;
    let id = 0;
    const loop = (): void => {
      tick();
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [playing, tick]);

  const failWith = useCallback(
    (words: string): void => {
      halt();
      setFailed(words);
    },
    [halt],
  );

  const start = useCallback(
    async (key: string, url: string | null, from: number): Promise<void> => {
      if (sourceUrl === undefined) return;
      const prev = cur.current;
      if (prev !== null) positions.current.set(prev.key, prev.url === null ? (a.current?.currentTime ?? sec.current.startS) - sec.current.startS : (b.current?.currentTime ?? 0));
      halt();
      setFailed(null);
      const src = audioOf(a);
      src.onerror = () => failWith(mediaErrorWords(src.error?.code, sourceUrl));
      if (src.src === "" || !src.src.endsWith(sourceUrl)) src.src = sourceUrl;
      levels.current.a = levelFor(sourceRms);
      cur.current = { key, url };
      setAt(key);
      if (url === null) {
        sideRef.current = "a";
        src.currentTime = sec.current.startS + from;
      } else {
        const take = audioOf(b);
        take.onerror = () => failWith(mediaErrorWords(take.error?.code, url));
        // The take's own level is measured before it is heard, so the first press is already matched.
        const h = await hearUrl(url);
        levels.current.b = levelFor(h.ok ? h.value.rms(0, h.value.lenS) : undefined);
        if (!take.src.endsWith(url)) {
          take.src = url;
          await new Promise<void>((done) => take.addEventListener("loadedmetadata", () => done(), { once: true }));
        }
        take.currentTime = from;
        src.currentTime = sec.current.startS + from;
      }
      setSideState(sideRef.current);
      apply();
      try {
        await (url === null ? src.play() : audioOf(b).play());
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
        failWith(e instanceof Error ? `${e.name} · ${e.message}` : String(e));
        return;
      }
      setPlaying(true);
      setClock(from);
    },
    [sourceUrl, sourceRms, halt, apply, failWith],
  );

  const stop = useCallback((): void => {
    halt();
    const c = cur.current;
    if (c !== null) positions.current.set(c.key, 0);
    cur.current = null;
    setAt(null);
    setClock(0);
  }, [halt]);

  const toggle = useCallback(
    (key: string, url: string | null): void => {
      if (cur.current?.key === key && playing) {
        positions.current.set(key, clock);
        halt();
        return;
      }
      if (url !== null && cur.current?.key !== key) sideRef.current = "b";
      void start(key, url, cur.current?.key === key ? clock : (positions.current.get(key) ?? 0));
    },
    [playing, clock, halt, start],
  );

  const seek = useCallback(
    (key: string, url: string | null, s: number): void => {
      const to = Math.max(0, s);
      if (cur.current?.key !== key || !playing) {
        positions.current.set(key, to);
        void start(key, url, to);
        return;
      }
      if (url === null) {
        if (a.current !== null) a.current.currentTime = sec.current.startS + to;
      } else {
        if (b.current !== null) b.current.currentTime = to;
        if (a.current !== null) a.current.currentTime = sec.current.startS + to;
      }
      setClock(to);
    },
    [playing, start],
  );

  const hear = useCallback(
    (key: string, url: string, next: Side): void => {
      sideRef.current = next;
      setSideState(next);
      if (cur.current?.key !== key) void start(key, url, positions.current.get(key) ?? 0);
      else apply();
    },
    [start, apply],
  );

  useEffect(() => {
    sec.current = { startS: section.startS, endS: section.endS };
  }, [section.startS, section.endS]);

  useEffect(() => {
    levels.current.a = levelFor(sourceRms);
    apply();
  }, [sourceRms, apply]);

  // The reaper: leaving the page pauses both and lets go of their sources.
  useEffect(() => () => reap([a, b]), []);

  const positionOf = useCallback((key: string): number => (cur.current?.key === key ? clock : (positions.current.get(key) ?? 0)), [clock]);
  return { at, playing, side, clock, failed, positionOf, toggle, seek, hear, stop };
}
