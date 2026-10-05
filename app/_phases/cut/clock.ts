"use client";

// THE CUT'S PLAYHEAD — a clock that lives OUTSIDE React.
//
// Derived from StatReel's studio monitor (apps/studio/src/studio/playerClock.ts),
// whose header states the whole argument: if the playhead fed `useState` in the
// monitor or the lanes, every lane and the monitor would re-render per frame.
// Here the time lives in a tiny store. A leaf subscribes with
// `useClockSelector` and re-renders only when the value IT selected changes —
// "which shot is under the playhead" costs one render per cut, not one per
// frame — and the needle on the lanes does not render at all: it writes its
// own `left` into the DOM from `subscribe`.
//
// One difference from StatReel, and it is the reason this file is bigger: there
// is no Remotion player here to BE the clock. StatReel's clock follows a
// player's `frameupdate`; this one is the authority itself, advanced by
// `requestAnimationFrame` against `performance.now()`, and the <audio> takes
// follow IT (see ./useTakeAudio.ts). A native sequencer has to own time.
//
// The arithmetic is pure and exported (`advance`, `nextRate`, `stepBy`,
// `timecode`) so tests/golden-path/cut.probe.spec.ts can drive it with no DOM
// and no frame loop; `createClock` takes its `now`/`schedule` as arguments for
// the same reason.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/** The frame grid the transport steps on and the timecode counts in. Frames in
 *  this app are stills held for a beat, so there is no source frame rate to
 *  inherit; 25 is the PAL rate the StatReel timecode also defaults near, and it
 *  is a display grid only — nothing is rendered at it. */
export const FPS = 25;

/** The J/L shuttle ladder. Four is the ceiling because an <audio> element's
 *  `playbackRate` above that is inaudible chatter in every engine measured. */
export const RATES = [1, 2, 4] as const;

export interface ClockState {
  /** Seconds from the head of the cut. */
  t: number;
  playing: boolean;
  /** Signed: negative is J (reverse). Never 0 — pausing is `playing: false`. */
  rate: number;
  /** Seconds. 0 means there is nothing on the clock and play is refused. */
  duration: number;
  /** Bumped on every DISCONTINUITY (seek, step, a new duration). A follower
   *  that slaves media to this clock re-syncs when it moves, rather than
   *  guessing a seek from a large delta. */
  seq: number;
}

export const INITIAL: ClockState = { t: 0, playing: false, rate: 1, duration: 0, seq: 0 };

const clamp = (t: number, duration: number) => Math.min(Math.max(0, t), Math.max(0, duration));

/**
 * Advance a playing clock by `elapsedMs` of wall time.
 *
 * Stops AT the end it ran into — forward at `duration`, reverse at 0 — rather
 * than wrapping: a cut that loops silently reads as a cut that is longer than
 * it is. A paused clock is returned unchanged.
 */
export function advance(s: ClockState, elapsedMs: number): ClockState {
  if (!s.playing || elapsedMs <= 0) return s;
  const raw = s.t + (elapsedMs / 1000) * s.rate;
  if (s.rate > 0 && raw >= s.duration) return { ...s, t: s.duration, playing: false };
  if (s.rate < 0 && raw <= 0) return { ...s, t: 0, playing: false };
  return { ...s, t: raw };
}

/**
 * The J/K/L shuttle, as a pure step.
 *
 *   K  stop, keeping the direction for the next play.
 *   L  forward: from stop or reverse it plays at 1x; already forward, it
 *      doubles up the ladder and holds at the top.
 *   J  the mirror image.
 */
export function nextRate(s: Pick<ClockState, "playing" | "rate">, key: "j" | "k" | "l"): { playing: boolean; rate: number } {
  if (key === "k") return { playing: false, rate: s.rate };
  const dir = key === "l" ? 1 : -1;
  const same = s.playing && Math.sign(s.rate) === dir;
  if (!same) return { playing: true, rate: dir };
  const at = RATES.indexOf(Math.abs(s.rate) as (typeof RATES)[number]);
  const up = RATES[Math.min(RATES.length - 1, Math.max(0, at) + 1)];
  return { playing: true, rate: dir * up };
}

/** Move `frames` frames on the FPS grid, snapping to the grid first so that
 *  repeated steps land on whole frames rather than accumulating the float the
 *  playhead stopped at. */
export function stepBy(t: number, frames: number, duration: number, fps = FPS): number {
  const at = Math.round(t * fps);
  return clamp((at + frames) / fps, duration);
}

/** `m:ss:ff` — minutes, seconds, frames on the FPS grid. Hours appear only
 *  when there are some. */
export function timecode(t: number, fps = FPS): string {
  const total = Math.max(0, Math.round((Number.isFinite(t) ? t : 0) * fps));
  const ff = total % fps;
  const secs = Math.floor(total / fps);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return `${h > 0 ? `${h}:${two(m)}` : m}:${two(s)}:${two(ff)}`;
}

export interface CutClock {
  get(): ClockState;
  subscribe(fn: () => void): () => void;
  play(): void;
  pause(): void;
  toggle(): void;
  seek(t: number): void;
  /** J/K/L. */
  shuttle(key: "j" | "k" | "l"): void;
  setDuration(d: number): void;
  /** Stop the frame loop and drop every subscriber. */
  destroy(): void;
}

export interface ClockDeps {
  now: () => number;
  schedule: (cb: () => void) => number;
  cancel: (handle: number) => void;
}

function browserDeps(): ClockDeps {
  return {
    now: () => performance.now(),
    schedule: (cb) => requestAnimationFrame(cb),
    cancel: (h) => cancelAnimationFrame(h),
  };
}

export function createClock(deps: ClockDeps = browserDeps()): CutClock {
  let s: ClockState = INITIAL;
  let last = 0;
  let handle: number | null = null;
  const subs = new Set<() => void>();

  // A NEW OBJECT ON EVERY CHANGE and the same object otherwise: that is what
  // lets `useSyncExternalStore` compare snapshots by identity, and what lets a
  // selector's primitive result decide whether its component renders.
  const set = (next: ClockState) => {
    if (next === s) return;
    s = next;
    for (const fn of [...subs]) fn();
  };

  const stopLoop = () => {
    if (handle !== null) deps.cancel(handle);
    handle = null;
  };

  const frame = () => {
    handle = null;
    const now = deps.now();
    const elapsed = now - last;
    last = now;
    set(advance(s, elapsed));
    if (s.playing) handle = deps.schedule(frame);
  };

  const startLoop = () => {
    stopLoop();
    last = deps.now();
    handle = deps.schedule(frame);
  };

  const begin = (rate: number) => {
    if (s.duration <= 0) return;
    // Play from the end restarts at the head (and reverse from the head starts
    // at the tail) — pressing play on a finished cut and getting nothing is a
    // dead button.
    let t = s.t;
    let seq = s.seq;
    if (rate > 0 && t >= s.duration) {
      t = 0;
      seq += 1;
    }
    if (rate < 0 && t <= 0) {
      t = s.duration;
      seq += 1;
    }
    set({ ...s, t, seq, rate, playing: true });
    startLoop();
  };

  // Play is always 1x forward, whatever the shuttle last did: Space after a
  // J-J-K is "play the cut", not "resume the reverse scan".
  const play = () => begin(1);
  const pause = () => {
    stopLoop();
    if (s.playing) set({ ...s, playing: false });
  };

  return {
    get: () => s,
    subscribe(fn) {
      subs.add(fn);
      return () => void subs.delete(fn);
    },
    play,
    pause,
    toggle: () => (s.playing ? pause() : play()),
    seek(t) {
      const next = clamp(t, s.duration);
      if (next === s.t) return;
      if (s.playing) last = deps.now();
      set({ ...s, t: next, seq: s.seq + 1 });
    },
    shuttle(key) {
      const r = nextRate(s, key);
      if (!r.playing) {
        stopLoop();
        set({ ...s, playing: false, rate: r.rate });
        return;
      }
      begin(r.rate);
    },
    setDuration(d) {
      const duration = Math.max(0, Number.isFinite(d) ? d : 0);
      if (duration === s.duration) return;
      if (duration <= 0) stopLoop();
      set({ ...s, duration, t: clamp(s.t, duration), playing: duration > 0 && s.playing, seq: s.seq + 1 });
    },
    destroy() {
      stopLoop();
      subs.clear();
    },
  };
}

/** One clock per cut surface, torn down with it. The returned object is
 *  stable, so handing it down the tree never re-renders anyone. */
export function useCutClock(duration: number): CutClock {
  const [clock] = useState(() => createClock());
  useEffect(() => () => clock.destroy(), [clock]);
  useEffect(() => clock.setDuration(duration), [clock, duration]);
  return clock;
}

/**
 * Subscribe to a value derived from the clock. The component re-renders only
 * when `select` returns a different primitive — so select the coarsest thing
 * you need (a shot index, a boolean), never `t` itself unless the component is
 * a leaf that genuinely changes every frame.
 */
export function useClockSelector<T extends string | number | boolean | null>(
  clock: CutClock,
  select: (s: ClockState) => T,
): T {
  return useSyncExternalStore(
    clock.subscribe,
    () => select(clock.get()),
    () => select(INITIAL),
  );
}

/** Write a clock-derived value straight into the DOM, once per change, with no
 *  render. The needle and the timecode readout are the two users. `key` re-runs
 *  the write when something the writer closes over changes while the clock is
 *  still (a resize of the ruler, a new duration) — a paused clock never ticks,
 *  so without it the DOM would hold the old geometry until the next play. */
export function useClockWriter(clock: CutClock, write: (s: ClockState) => void, key: string | number = 0): void {
  const ref = useRef(write);
  useEffect(() => {
    ref.current = write;
  });
  useEffect(() => {
    const run = () => ref.current(clock.get());
    run();
    return clock.subscribe(run);
  }, [clock, key]);
}
