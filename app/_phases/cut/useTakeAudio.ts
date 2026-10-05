"use client";

// THE TAKES FOLLOW THE CLOCK — one <audio> per loaded take, slaved to the
// Cut's playhead rather than the other way round.
//
// An <audio> element keeps its own time, and two clocks drift. So the element
// is never trusted to BE the position: every tick asks `audioAction` what the
// element should be doing at the playhead, and corrects it only when it is
// wrong by more than `SLACK_S`. Correcting every frame would re-buffer the
// element continuously and stutter; never correcting would let a take wander
// off the picture it was spotted against, which is the one thing the Cut is
// for.
//
// A refused `play()` — autoplay policy, a codec the browser will not decode —
// is REPORTED through `onRefused` with the browser's own message, the rule
// StatReel's monitor follows ("refused play() reported"), rather than leaving a
// transport that moves while nothing sounds.

import { useEffect, useRef } from "react";

import type { ClockState, CutClock } from "./clock";

/** How far the element may sit from the playhead before it is re-seeked. */
export const SLACK_S = 0.12;

export type AudioAction =
  | { kind: "none" }
  | { kind: "pause" }
  | { kind: "play"; at: number; rate: number }
  | { kind: "seek"; at: number };

/**
 * What one take's element should do, given the clock and where the element is.
 *
 * Inside its span and playing FORWARD it plays (re-seeking if it wandered, or
 * if the clock jumped — `jumped`). Reverse shuttle silences it: no engine plays
 * audio backwards, and a forward take under a reversing picture is wrong sound.
 * Outside its span, or with the clock stopped, it is paused — but a paused
 * element is still parked at the playhead, so pressing play is in sync from
 * the first sample.
 */
export function audioAction(
  s: Pick<ClockState, "t" | "playing" | "rate">,
  span: { startS: number; durS: number },
  el: { time: number; paused: boolean },
  jumped: boolean,
): AudioAction {
  const local = s.t - span.startS;
  const inside = local >= 0 && local < span.durS;
  const forward = s.playing && s.rate > 0;
  if (!inside || !forward) {
    if (!el.paused) return { kind: "pause" };
    if (inside && (jumped || Math.abs(el.time - local) > SLACK_S)) return { kind: "seek", at: local };
    return { kind: "none" };
  }
  if (el.paused) return { kind: "play", at: local, rate: s.rate };
  if (jumped || Math.abs(el.time - local) > SLACK_S * Math.max(1, s.rate)) return { kind: "seek", at: local };
  return { kind: "none" };
}

export interface TakeSpan {
  id: string;
  src: string;
  /** Where the take starts on the cut, offset already applied. */
  startS: number;
  durS: number;
}

export function useTakeAudio(
  clock: CutClock,
  spans: TakeSpan[],
  muted: boolean,
  onRefused: (message: string) => void,
): void {
  const els = useRef(new Map<string, HTMLAudioElement>());
  const refusedRef = useRef(onRefused);
  useEffect(() => {
    refusedRef.current = onRefused;
  });

  // Elements follow the spans: one per take, replaced when its src changes,
  // released when the take goes.
  useEffect(() => {
    const map = els.current;
    const want = new Map(spans.map((s) => [s.id, s]));
    for (const [id, el] of map) {
      if (!want.has(id) || want.get(id)!.src !== el.src) {
        el.pause();
        el.removeAttribute("src");
        el.load();
        map.delete(id);
      }
    }
    for (const s of spans) {
      if (map.has(s.id)) continue;
      const el = new Audio(s.src);
      el.preload = "auto";
      map.set(s.id, el);
    }
  }, [spans]);

  useEffect(() => {
    for (const el of els.current.values()) el.muted = muted;
  }, [muted, spans]);

  useEffect(() => {
    let seq = clock.get().seq;
    const sync = () => {
      const s = clock.get();
      const jumped = s.seq !== seq;
      seq = s.seq;
      for (const span of spans) {
        const el = els.current.get(span.id);
        if (!el) continue;
        // A take shorter than its cue ends where IT ends: past its own length
        // the span is over, or every tick would re-`play()` an ended element.
        const durS = Number.isFinite(el.duration) ? Math.min(span.durS, el.duration) : span.durS;
        const a = audioAction(s, { startS: span.startS, durS }, { time: el.currentTime, paused: el.paused }, jumped);
        if (a.kind === "pause") el.pause();
        else if (a.kind === "seek") el.currentTime = a.at;
        else if (a.kind === "play") {
          el.currentTime = a.at;
          el.playbackRate = a.rate;
          el.play().catch((e: unknown) => {
            refusedRef.current(e instanceof Error ? e.message : String(e));
            clock.pause();
          });
        }
      }
    };
    sync();
    return clock.subscribe(sync);
  }, [clock, spans]);

  useEffect(() => {
    const map = els.current;
    return () => {
      for (const el of map.values()) {
        el.pause();
        el.removeAttribute("src");
      }
      map.clear();
    };
  }, []);
}
