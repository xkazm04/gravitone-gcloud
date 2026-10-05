"use client";

// THE LAB'S TRANSPORT — one audio element for the whole Sound lab, so one take
// plays at a time across triage, arrange and hunt, and flipping a tab does not
// leave a take playing under a module that is no longer on screen.
//
// The round-3 lab borrowed the Library's engine (app/library/audio/engine.ts),
// which is shaped around the Library's own Take and plays a WebAudio sketch for
// a fixture row with no bytes. A SoundTake either has a file the store serves
// (lib/sound/client.ts#takeFileUrl) or it does not, and a take without bytes
// does not play — no sketch stands in for a file that was never there. So this
// is the engine's caller half only: one <audio>, a snapshot, a subscribe.
//
// Read through useSyncExternalStore. Every change REPLACES `current`, which is
// what lets a reader compare snapshots by identity.

import { useSyncExternalStore } from "react";

import { takeFileUrl } from "@/lib/sound/client";

export interface PlayState {
  id: string;
  playing: boolean;
  position: number;
  /** Seconds, from the file's own metadata once it loads; the brief's
   *  durationS until then; 0 when neither is known. */
  duration: number;
  /** The element refused the file (missing bytes, a 404, an undecodable body). */
  failed: boolean;
}

class Transport {
  current: PlayState | null = null;
  private el: HTMLAudioElement | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private subs = new Set<() => void>();
  /** File durations learned from metadata, by take id — survives a stop. */
  private lengths = new Map<string, number>();

  subscribe = (fn: () => void) => {
    this.subs.add(fn);
    return () => {
      this.subs.delete(fn);
    };
  };
  getSnapshot = () => this.current;
  private emit() {
    this.subs.forEach((fn) => fn());
  }

  /** The file's own length, once any element has read its metadata. */
  lengthOf(id: string): number | null {
    return this.lengths.get(id) ?? null;
  }

  /** Learn a take's length from its file's metadata without playing it —
   *  one metadata request, then the element is dropped. Readers re-render
   *  through the same subscription. */
  probe(id: string) {
    if (this.lengths.has(id) || this.probing.has(id)) return;
    this.probing.add(id);
    const el = new Audio();
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      if (Number.isFinite(el.duration)) this.lengths.set(id, el.duration);
      this.probing.delete(id);
      el.removeAttribute("src");
      this.emit();
    };
    el.onerror = () => this.probing.delete(id);
    el.src = takeFileUrl(id);
  }
  private probing = new Set<string>();

  /** Play from the start, resume, or pause — whichever this take needs. */
  toggle(id: string, hint: number | null = null) {
    const c = this.current;
    if (c && c.id === id && c.playing) return this.pause();
    const from = c && c.id === id && c.position < c.duration - 0.05 ? c.position : 0;
    this.play(id, from, hint);
  }

  play(id: string, from = 0, hint: number | null = null) {
    this.halt();
    const el = new Audio(takeFileUrl(id));
    el.preload = "auto";
    this.el = el;
    const duration = this.lengths.get(id) ?? hint ?? 0;
    this.current = { id, playing: true, position: from, duration, failed: false };
    el.onloadedmetadata = () => {
      if (!Number.isFinite(el.duration)) return;
      this.lengths.set(id, el.duration);
      if (this.current?.id === id) this.current = { ...this.current, duration: el.duration };
      if (from > 0) el.currentTime = Math.min(from, el.duration);
      this.emit();
    };
    el.onended = () => {
      this.halt();
      if (this.current?.id === id) this.current = { ...this.current, playing: false, position: this.current.duration };
      this.emit();
    };
    el.onerror = () => {
      this.halt();
      if (this.current?.id === id) this.current = { ...this.current, playing: false, failed: true };
      this.emit();
    };
    el.play().catch(() => {
      // Autoplay refusal or a body the element cannot decode. onerror covers
      // the second; for the first the take simply is not playing.
      if (this.current?.id === id && !this.current.failed) {
        this.current = { ...this.current, playing: false };
        this.emit();
      }
    });
    this.timer = setInterval(() => {
      if (this.el && this.current?.id === id) {
        this.current = { ...this.current, position: this.el.currentTime };
        this.emit();
      }
    }, 50);
    this.emit();
  }

  pause() {
    const c = this.current;
    if (!c) return;
    const p = this.el ? this.el.currentTime : c.position;
    this.halt();
    this.current = { ...c, playing: false, position: p };
    this.emit();
  }

  /** Seek a take. If it is playing it keeps playing from there; otherwise the
   *  head moves and the next play starts there. */
  seek(id: string, s: number, hint: number | null = null) {
    const c = this.current;
    const duration = this.lengths.get(id) ?? (c?.id === id ? c.duration : (hint ?? 0));
    const to = Math.max(0, duration > 0 ? Math.min(duration, s) : s);
    if (c && c.id === id && c.playing && this.el) {
      this.el.currentTime = to;
      this.current = { ...c, position: to };
    } else {
      this.halt();
      this.current = { id, playing: false, position: to, duration, failed: false };
    }
    this.emit();
  }

  /** Seek by a delta from wherever the head is. */
  nudge(id: string, delta: number, hint: number | null = null) {
    const c = this.current;
    const at = c && c.id === id ? (this.el && c.playing ? this.el.currentTime : c.position) : 0;
    this.seek(id, at + delta, hint);
  }

  stop() {
    this.halt();
    this.current = null;
    this.emit();
  }

  private halt() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.el) {
      this.el.pause();
      this.el.onended = null;
      this.el.onerror = null;
      this.el.onloadedmetadata = null;
      this.el.removeAttribute("src");
      this.el = null;
    }
  }
}

/** The lab's one transport. Module-level, so every module shares it. */
export const transport = new Transport();

/** The whole transport state. */
export function usePlayState(): PlayState | null {
  return useSyncExternalStore(transport.subscribe, transport.getSnapshot, () => null);
}

/** A take's file length in seconds once any element has read its metadata
 *  (a play, or `transport.probe(id)`), else null. */
export function useFileLength(id: string | null | undefined): number | null {
  return useSyncExternalStore(
    transport.subscribe,
    () => (id ? transport.lengthOf(id) : null),
    () => null,
  );
}

/** The transport state if it is this take's, else null. */
export function usePlayback(id: string | null | undefined): PlayState | null {
  const st = usePlayState();
  return id && st?.id === id ? st : null;
}
