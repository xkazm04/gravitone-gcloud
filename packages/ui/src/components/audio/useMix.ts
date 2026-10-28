"use client";

// ONE CLOCK FOR N STEMS (spark audio-agent-studio, stage S1). A stems piece plays as its parts, not
// as a mix: every stem is fetched and decoded, then all start on ONE AudioContext time, so a mute,
// a solo, a level or a pan changes what is heard live without restarting. The same handle plays a
// single mix or a candidate (one layer). One ear for the page (useEar's rule): starting anything
// stops what was sounding. The arithmetic is ./mix.ts; this hook only drives Web Audio with it.
//
// The media-playback rules useEar keeps hold here: a decode that never lands inside the watchdog
// fails in words, a failed fetch says its status and its path, unmounting stops every source and
// closes the context (the reaper). A press superseded by a newer one never reports.
import { useCallback, useEffect, useRef, useState } from "react";

import { srcWords } from "./AudioPreview.tsx";
import { clampPan, effectiveGains, entersSteps, gainAt, peaksOf, type Span, type StemMix } from "./mix.ts";
import { EAR_WATCHDOG_MS, type EarState } from "./useEar.ts";

/** One part of what plays: its id (a stem id, or "mix"), its audio, as-rendered settings, its sections. */
export type MixLayer = { readonly id: string; readonly href: string; readonly mix?: StemMix; readonly enters?: readonly boolean[] };
/** `name`: what is sounding, in words, for a transport row ("smooth bass alone"). */
export type PlayOptions = { readonly from?: number; readonly spans?: readonly Span[] | null; readonly name?: string };
/** What is sounding, by the key the caller played it under. */
export type Sounding = { readonly key: string; readonly name: string; readonly ids: readonly string[]; readonly hrefs: readonly string[] };

export type MixTransport = {
  readonly state: EarState;
  readonly sounding: Sounding | null;
  readonly failed: string | null;
  /** Seconds into what is sounding, sampled four times a second; 0 when silent. */
  readonly clock: number;
  /** The longest sounding layer, in seconds; null when nothing sounds. */
  readonly duration: number | null;
  /** The exact second now (for a playhead drawn at frame rate). */
  readonly position: () => number;
  readonly stateOf: (key: string) => EarState;
  readonly play: (key: string, layers: readonly MixLayer[], opts?: PlayOptions) => void;
  /** Play, or stop when `key` is the one sounding. */
  readonly toggle: (key: string, layers: readonly MixLayer[], opts?: PlayOptions) => void;
  readonly seek: (s: number) => void;
  readonly stop: () => void;
  /** Change one stem's live settings (merged over what it was rendered with). */
  readonly setMix: (id: string, patch: StemMix) => void;
  /** A stem's settings now: `base` (the turn's) under the person's changes. */
  readonly mixOf: (id: string, base?: StemMix) => StemMix;
  readonly resetMix: () => void;
  /** `n` peaks of a decoded href (cached); null until it is decoded. */
  readonly peaks: (href: string, n: number) => readonly number[] | null;
  /** Fetch and decode without playing (peaks before the first press). */
  readonly decode: (hrefs: readonly string[]) => void;
};

type Voice = { readonly layer: MixLayer; readonly src: AudioBufferSourceNode; readonly gain: GainNode; readonly pan: StereoPannerNode };
type Live = { readonly key: string; readonly layers: readonly MixLayer[]; readonly opts: PlayOptions; readonly voices: readonly Voice[]; readonly startAt: number; readonly from: number; readonly duration: number };

const RAMP_S = 0.015;

export function useMix(): MixTransport {
  const ctxRef = useRef<AudioContext | null>(null);
  const decoded = useRef(new Map<string, AudioBuffer>());
  const pending = useRef(new Map<string, Promise<AudioBuffer>>());
  const peakCache = useRef(new Map<string, readonly number[]>());
  const live = useRef<Live | null>(null);
  const press = useRef(0);
  const overrides = useRef<Readonly<Record<string, StemMix>>>({});
  const [mixView, setMixView] = useState<Readonly<Record<string, StemMix>>>({});
  const [decodeRev, setDecodeRev] = useState(0);
  const [state, setState] = useState<EarState>("idle");
  const [sounding, setSounding] = useState<Sounding | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [clock, setClock] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);

  const ctx = useCallback((): AudioContext => {
    if (ctxRef.current === null) ctxRef.current = new AudioContext();
    return ctxRef.current;
  }, []);

  const load = useCallback(
    (href: string): Promise<AudioBuffer> => {
      const have = decoded.current.get(href);
      if (have !== undefined) return Promise.resolve(have);
      const inFlight = pending.current.get(href);
      if (inFlight !== undefined) return inFlight;
      const p = fetch(href)
        .then(async (r) => {
          if (!r.ok) throw new Error(`the server answered ${r.status} · ${srcWords(href)}`);
          return ctx().decodeAudioData(await r.arrayBuffer());
        })
        .then((buf) => {
          decoded.current.set(href, buf);
          setDecodeRev((n) => n + 1);
          return buf;
        })
        .finally(() => pending.current.delete(href));
      pending.current.set(href, p);
      return p;
    },
    [ctx],
  );

  const silence = useCallback((): void => {
    const l = live.current;
    live.current = null;
    if (l === null) return;
    for (const v of l.voices) {
      v.src.onended = null;
      v.src.stop();
      v.src.disconnect();
      v.gain.disconnect();
      v.pan.disconnect();
    }
  }, []);

  /** Push the current mix onto the sounding voices (no restart). */
  const apply = useCallback((): void => {
    const l = live.current;
    if (l === null || ctxRef.current === null) return;
    const now = ctxRef.current.currentTime;
    const merged = l.voices.map((v) => ({ id: v.layer.id, ...v.layer.mix, ...overrides.current[v.layer.id] }));
    const gains = effectiveGains(merged);
    l.voices.forEach((v, i) => {
      v.gain.gain.setTargetAtTime(gains[v.layer.id] ?? 0, now, RAMP_S);
      v.pan.pan.setTargetAtTime(clampPan(merged[i]?.pan ?? 0), now, RAMP_S);
    });
  }, []);

  const stop = useCallback((): void => {
    press.current++;
    silence();
    setSounding(null);
    setState("idle");
    setClock(0);
    setDuration(null);
  }, [silence]);

  const play = useCallback(
    (key: string, layers: readonly MixLayer[], opts: PlayOptions = {}): void => {
      silence();
      const mine = ++press.current;
      setFailed(null);
      setClock(opts.from ?? 0);
      setSounding({ key, name: opts.name ?? key, ids: layers.map((l) => l.id), hrefs: layers.map((l) => l.href) });
      setState("loading");
      if (layers.length === 0) {
        setFailed("nothing here has audio to play yet");
        setSounding(null);
        setState("idle");
        return;
      }
      const c = ctx();
      let dog: ReturnType<typeof setTimeout> | null = null;
      const watchdog = new Promise<never>((_, reject) => {
        dog = setTimeout(() => reject(new Error(`no sound after ${EAR_WATCHDOG_MS / 1000} s · ${srcWords(layers[0]?.href ?? "")}`)), EAR_WATCHDOG_MS);
      });
      void Promise.race([Promise.all(layers.map((l) => load(l.href))), watchdog])
        .then(async (bufs) => {
          if (press.current !== mine) return;
          await c.resume();
          if (press.current !== mine) return;
          const length = Math.max(...bufs.map((b) => b.duration));
          const from = Math.max(0, Math.min(opts.from ?? 0, length - 0.05));
          const startAt = c.currentTime + 0.06;
          const voices = layers.map((layer, i): Voice => {
            const src = c.createBufferSource();
            src.buffer = bufs[i] ?? null;
            const section = c.createGain();
            const steps = entersSteps(layer.enters, opts.spans ?? null);
            section.gain.setValueAtTime(gainAt(steps, from), startAt);
            for (const st of steps) if (st.atS > from) section.gain.setValueAtTime(st.gain, startAt + st.atS - from);
            const gain = c.createGain();
            gain.gain.value = 0;
            const pan = c.createStereoPanner();
            src.connect(section).connect(gain).connect(pan).connect(c.destination);
            if (from < (bufs[i]?.duration ?? 0)) src.start(startAt, from);
            return { layer, src, gain, pan };
          });
          const longest = voices[bufs.findIndex((b) => b.duration === length)];
          if (longest !== undefined)
            longest.src.onended = () => {
              if (press.current !== mine) return;
              silence();
              setSounding(null);
              setState("idle");
              setClock(0);
              setDuration(null);
            };
          live.current = { key, layers, opts, voices, startAt, from, duration: length };
          apply();
          setDuration(length);
          setState("playing");
        })
        .catch((e: unknown) => {
          if (press.current !== mine) return;
          setFailed(e instanceof Error ? e.message : String(e));
          setSounding(null);
          setState("idle");
        })
        .finally(() => {
          if (dog !== null) clearTimeout(dog);
        });
    },
    [apply, ctx, load, silence],
  );

  const position = useCallback((): number => {
    const l = live.current;
    const c = ctxRef.current;
    if (l === null || c === null) return 0;
    return Math.max(0, Math.min(l.duration, l.from + c.currentTime - l.startAt));
  }, []);

  // The clock is sampled, not streamed: four writes a second while something sounds.
  useEffect(() => {
    if (state !== "playing") return;
    const t = setInterval(() => setClock(position()), 250);
    return () => clearInterval(t);
  }, [state, position]);

  // The reaper: every source stopped, the context closed.
  useEffect(() => {
    const holder = ctxRef;
    const presses = press;
    return () => {
      presses.current++;
      silence();
      void holder.current?.close();
      holder.current = null;
    };
  }, [silence]);

  const seek = useCallback(
    (s: number): void => {
      const l = live.current;
      if (l === null) return;
      play(l.key, l.layers, { ...l.opts, from: s });
    },
    [play],
  );

  const toggle = useCallback(
    (key: string, layers: readonly MixLayer[], opts?: PlayOptions): void => {
      if (sounding?.key === key && state !== "idle") stop();
      else play(key, layers, opts);
    },
    [sounding, state, stop, play],
  );

  const setMix = useCallback(
    (id: string, patch: StemMix): void => {
      overrides.current = { ...overrides.current, [id]: { ...overrides.current[id], ...patch } };
      setMixView(overrides.current);
      apply();
    },
    [apply],
  );

  const resetMix = useCallback((): void => {
    overrides.current = {};
    setMixView(overrides.current);
    apply();
  }, [apply]);

  const mixOf = useCallback((id: string, base?: StemMix): StemMix => ({ ...base, ...mixView[id] }), [mixView]);
  // decodeRev moves when a buffer lands, so `peaks` changes identity and a waveform re-renders.
  const peaks = useCallback(
    (href: string, n: number): readonly number[] | null => {
      if (decodeRev < 0) return null;
      const k = `${n}|${href}`;
      const hit = peakCache.current.get(k);
      if (hit !== undefined) return hit;
      const buf = decoded.current.get(href);
      if (buf === undefined) return null;
      const chans = Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i));
      const p = peaksOf(chans, n);
      peakCache.current.set(k, p);
      return p;
    },
    [decodeRev],
  );

  const decode = useCallback(
    (hrefs: readonly string[]): void => {
      for (const h of hrefs)
        load(h).catch((e: unknown) => {
          setFailed(e instanceof Error ? e.message : String(e));
        });
    },
    [load],
  );

  const stateOf = useCallback((key: string): EarState => (sounding?.key === key ? state : "idle"), [sounding, state]);

  return { state, sounding, failed, clock, duration, position, stateOf, play, toggle, seek, stop, setMix, mixOf, resetMix, peaks, decode };
}
