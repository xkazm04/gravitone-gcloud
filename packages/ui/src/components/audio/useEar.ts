"use client";

// ONE EAR FOR THE COMPOSER - every audition on the screen plays through one element, so pressing
// a second instrument stops the first (a comparison is two sounds in turn, never on top of each
// other), and the press that is waiting reads as waiting.
//
// The media-playback golden path AudioPreview keeps holds here too: a play that never reaches
// `playing` inside the watchdog is declared failed in words; the element's own error code is
// the failure's words; unmounting pauses and releases the source (the reaper). The watchdog is
// longer than AudioPreview's: a first audition is RENDERED on press (pipeline/audio/audition.py
// measures the instrument's samples, then plays the phrase), seconds before the first byte.
import { useCallback, useEffect, useRef, useState } from "react";

import { mediaErrorWords } from "./AudioPreview.tsx";

/** A first render measures a sample family and plays sixteen notes: well inside this. */
export const EAR_WATCHDOG_MS = 30_000;

export type EarState = "idle" | "loading" | "playing";

export type Ear = {
  /** The href sounding or about to, and how far it got. */
  readonly at: string | null;
  readonly state: EarState;
  readonly failed: string | null;
  readonly stateOf: (href: string) => EarState;
  /** Seconds into `at`, sampled at the element's `timeupdate` (a few times a second); 0 when silent. */
  readonly clock: number;
  /** Play `href`, or stop it if it is the one sounding. */
  readonly toggle: (href: string) => void;
  /** Play `href` from the start, whatever is sounding (a compose answers with its sound). */
  readonly play: (href: string) => void;
  readonly stop: () => void;
};

type Handlers = { readonly playing: () => void; readonly ended: () => void; readonly error: (code: number | undefined) => void; readonly time: (s: number) => void };

/** Point the one element at a new source, its events at this press. Outside the hook: the element is
 *  an external system the hook drives, not a value React renders from. */
function load(a: HTMLAudioElement, href: string, on: Handlers): void {
  a.onplaying = on.playing;
  a.onended = on.ended;
  a.ontimeupdate = () => on.time(a.currentTime);
  a.onerror = () => on.error(a.error?.code);
  a.pause();
  a.src = href;
}

/**
 * `explain`: the source's own words for a failed play. An <audio> element that receives an error
 * envelope instead of a WAV reports only MEDIA_ERR_SRC_NOT_SUPPORTED; the route said why (a
 * library that files no such instrument, a sample whose pitch could not be measured), and that
 * sentence is the one to show.
 */
export function useEar(explain?: (href: string) => Promise<string | null>): Ear {
  const el = useRef<HTMLAudioElement | null>(null);
  const dog = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The newest press: an explanation that lands after a newer press is about a sound no longer asked for. */
  const press = useRef(0);
  const [at, setAt] = useState<string | null>(null);
  const [state, setState] = useState<EarState>("idle");
  const [failed, setFailed] = useState<string | null>(null);
  // The clock is not render state at audio rate: one cell, written at timeupdate (~4 Hz), which the
  // playhead samples (AudioPreview's playback-clock rule).
  const [clock, setClock] = useState(0);

  const calm = (): void => {
    if (dog.current !== null) clearTimeout(dog.current);
    dog.current = null;
  };

  const stop = useCallback((): void => {
    calm();
    const a = el.current;
    if (a !== null) a.pause();
    setAt(null);
    setState("idle");
    setClock(0);
  }, []);

  useEffect(() => {
    const watchdog = dog;
    const holder = el;
    return () => {
      if (watchdog.current !== null) clearTimeout(watchdog.current);
      const a = holder.current;
      if (a === null) return;
      a.pause();
      a.removeAttribute("src");
      a.load();
    };
  }, []);

  const play = useCallback(
    (href: string): void => {
      calm();
      const mine = ++press.current;
      let a = el.current;
      if (a === null) {
        a = new Audio();
        a.preload = "auto";
        el.current = a;
      }
      const me = a;
      load(me, href, {
        playing: () => {
          calm();
          setState("playing");
        },
        ended: () => {
          setAt(null);
          setState("idle");
          setClock(0);
        },
        time: (t) => {
          // Twice a second is enough for a playhead over four-bar columns, and every write
          // re-renders the composer.
          if (press.current === mine) setClock((c) => (Math.abs(t - c) >= 0.5 ? t : c));
        },
        error: (code) => {
          calm();
          setFailed(mediaErrorWords(code, href));
          setAt(null);
          setState("idle");
          void explain?.(href).then((words) => {
            if (words !== null && press.current === mine) setFailed(words);
          });
        },
      });
      setAt(href);
      setState("loading");
      setFailed(null);
      setClock(0);
      dog.current = setTimeout(() => {
        setFailed(`no answer from the player after ${EAR_WATCHDOG_MS / 1000} s · ${href.split("?")[0] ?? href}`);
        me.pause();
        setAt(null);
        setState("idle");
      }, EAR_WATCHDOG_MS);
      void me.play().catch((e: unknown) => {
        // A newer press superseded this one (the browser's AbortError): not the file's fault.
        if (e instanceof Error && e.name === "AbortError") return;
        calm();
        setFailed(e instanceof Error ? `${e.name} · ${e.message}` : String(e));
        setAt(null);
        setState("idle");
      });
    },
    [explain],
  );

  const toggle = useCallback(
    (href: string): void => {
      if (at === href && state !== "idle") stop();
      else play(href);
    },
    [at, state, stop, play],
  );

  const stateOf = useCallback((href: string): EarState => (href === at ? state : "idle"), [at, state]);
  return { at, state, failed, stateOf, clock, toggle, play, stop };
}
