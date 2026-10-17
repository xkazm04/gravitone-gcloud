"use client";

// ONE TRANSPORT FOR THE BOARD (v1 app/playground/shared/transport.ts: one <audio> for the whole
// lab, one take at a time). A card's play is a request to this element; pressing another card's
// play moves the one element to it, so two takes never sound at once. The registry's
// media-playback rules it keeps: a play that never reaches `playing` within the watchdog is a
// failure in words (transport-contract), the element's own error code is the message, and
// unmounting pauses and releases the source (media-resource-lifecycle).
import { useEffect, useRef, useState } from "react";

import { mediaErrorWords, PLAY_WATCHDOG_MS } from "@gt/ui/components/audio/AudioPreview.tsx";

export function useTransport(onFail: (words: string) => void): { readonly playing: string | null; readonly toggle: (id: string, src: string) => void } {
  const el = useRef<HTMLAudioElement | null>(null);
  const dog = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A play is in flight: the `pause` the switch itself raises is not the listener's stop.
  const asked = useRef(false);
  // Which play is current: a superseded play's rejection is not this one's failure.
  const gen = useRef(0);
  const [playing, setPlaying] = useState<string | null>(null);
  const fail = useRef(onFail);
  useEffect(() => {
    fail.current = onFail;
  });

  useEffect(() => {
    const a = new Audio();
    a.preload = "none";
    el.current = a;
    const calm = (): void => {
      asked.current = false;
      if (dog.current !== null) clearTimeout(dog.current);
      dog.current = null;
    };
    const stop = (): void => {
      if (!asked.current) setPlaying(null);
    };
    const err = (): void => {
      calm();
      stop();
      fail.current(mediaErrorWords(a.error?.code, a.src));
    };
    a.addEventListener("playing", calm);
    a.addEventListener("pause", stop);
    a.addEventListener("ended", stop);
    a.addEventListener("error", err);
    return () => {
      calm();
      a.removeEventListener("playing", calm);
      a.removeEventListener("pause", stop);
      a.removeEventListener("ended", stop);
      a.removeEventListener("error", err);
      a.pause();
      a.removeAttribute("src");
      a.load();
      el.current = null;
    };
  }, []);

  const toggle = (id: string, src: string): void => {
    const a = el.current;
    if (a === null) return;
    if (playing === id && !a.paused) {
      a.pause();
      return;
    }
    const mine = ++gen.current;
    asked.current = true;
    a.pause();
    a.src = src;
    setPlaying(id);
    if (dog.current !== null) clearTimeout(dog.current);
    dog.current = setTimeout(() => {
      asked.current = false;
      setPlaying(null);
      fail.current(`no answer from the player after ${PLAY_WATCHDOG_MS / 1000} s · ${src}`);
    }, PLAY_WATCHDOG_MS);
    a.play().catch((e: unknown) => {
      if (mine !== gen.current) return;
      asked.current = false;
      if (dog.current !== null) clearTimeout(dog.current);
      setPlaying(null);
      fail.current(e instanceof Error ? `${e.name} · ${e.message}` : String(e));
    });
  };

  return { playing, toggle };
}
