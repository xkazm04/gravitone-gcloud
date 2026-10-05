"use client";

// THE TRANSPORT — one engine for the whole module, so one thing plays at a time.
//
// kit/Player is controlled (playing / position / duration in, onToggle / onSeek
// out) and owns no media element; this is the caller half it asks for. Two
// sources feed the SAME state:
//
//   · a returned take plays its real bytes through an <audio> element, from an
//     object URL the shelf hook minted and owns (./useAudioShelf.ts);
//   · a fixture row has no bytes, so it plays a WebAudio sketch seeded from the
//     row itself — tempo, key, genre for a track; the category's gesture for an
//     effect. The contest entry did exactly this (core.js, "the transport
//     engine"), and it is what lets the page be judged by ear on a fresh
//     account. A take with neither — an upload whose bytes are gone — does not
//     play; its waveform draws as the kit's dashed rule.
//
// Subscribed through useSyncExternalStore. Every change replaces `current`
// rather than mutating it, which is what lets a reader compare snapshots.

import { hash, rng, type Take } from "./book";

export interface PlayState {
  id: string;
  playing: boolean;
  position: number;
  duration: number;
}

type Spec =
  | {
      sfx: true;
      cat: string | null;
      dur: number;
      r: () => number;
      beat: number;
    }
  | {
      sfx: false;
      beat: number;
      root: number;
      scale: number[];
      four: boolean;
      half: boolean;
      ambient: boolean;
      prog: number[];
      arp: number[];
      bright: number;
      swing: number;
    };

const KEYROOT: Record<string, number> = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
};

function specFor(t: Take): Spec {
  const r = rng(hash(`${t.id}s`));
  if (t.kind === "sfx")
    return {
      sfx: true,
      cat: t.sfx_category,
      dur: t.duration_s ?? 1,
      r,
      beat: 1,
    };
  const g = t.genre_tags.join(" ");
  const bpm =
    t.tempo_bpm ||
    (/drum and bass|dnb/.test(g)
      ? 172
      : /trap|dubstep|chillstep/.test(g)
        ? 140
        : /hip hop|boom bap|lo-fi|trip hop/.test(g)
          ? 88
          : /ambient|drone|cinematic/.test(g)
            ? 70
            : 118);
  const k = (t.key || "A minor").split(" ");
  const root = KEYROOT[k[0]] ?? 9;
  const minor = (k[1] || "minor") === "minor";
  return {
    sfx: false,
    beat: 60 / bpm / 2,
    root,
    scale: minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11],
    four: /house|disco|synthwave|outrun|retro|french/.test(g),
    half: /trap|dubstep|chillstep|dnb|drum and bass|hip hop|boom bap|lo-fi|trip/.test(g),
    ambient: /ambient|drone|cinematic|textural/.test(g),
    prog: [0, 5, 3, 4].map((d) => (d + Math.floor(r() * 2)) % 7),
    arp: Array.from({ length: 8 }, () => Math.floor(r() * 7)),
    bright: 0.4 + r() * 0.6,
    swing: /boom bap|lo-fi|jazz/.test(g) ? 0.12 : 0,
  };
}

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);
type Stoppable = { stop: (when?: number) => void };

function tone(
  ac: AudioContext,
  out: AudioNode,
  f: number,
  when: number,
  d: number,
  type: OscillatorType,
  gain: number,
  nodes: Stoppable[],
  cutoff?: number,
) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.value = f;
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(gain, when + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, when + d);
  let node: AudioNode = o;
  if (cutoff) {
    const fl = ac.createBiquadFilter();
    fl.type = "lowpass";
    fl.frequency.value = cutoff;
    o.connect(fl);
    node = fl;
  }
  node.connect(g);
  g.connect(out);
  o.start(when);
  o.stop(when + d + 0.05);
  nodes.push(o);
}

let noiseBuf: AudioBuffer | null = null;
function noise(
  ac: AudioContext,
  out: AudioNode,
  when: number,
  d: number,
  gain: number,
  type: BiquadFilterType,
  freq: number,
  nodes: Stoppable[],
  sweepTo?: number,
) {
  if (!noiseBuf || noiseBuf.sampleRate !== ac.sampleRate) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const s = ac.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, when);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, when + d);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(gain, when + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, when + d);
  s.connect(f);
  f.connect(g);
  g.connect(out);
  s.start(when);
  s.stop(when + d + 0.05);
  nodes.push(s);
}

function kick(ac: AudioContext, out: AudioNode, when: number, nodes: Stoppable[]) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.frequency.setValueAtTime(140, when);
  o.frequency.exponentialRampToValueAtTime(42, when + 0.18);
  g.gain.setValueAtTime(1, when);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.35);
  o.connect(g);
  g.connect(out);
  o.start(when);
  o.stop(when + 0.4);
  nodes.push(o);
}

function playBeat(
  ac: AudioContext,
  out: AudioNode,
  sp: Extract<Spec, { sfx: false }>,
  b: number,
  when: number,
  nodes: Stoppable[],
) {
  const step = b % 16; // eighth-notes, two bars
  const bar = Math.floor(b / 8) % 4;
  const chordDeg = sp.prog[bar];
  const note = (deg: number, oct: number) =>
    12 * oct + sp.root + sp.scale[((deg % 7) + 7) % 7] + 12 * Math.floor(deg / 7);
  const t = when + (step % 2 ? sp.swing * sp.beat : 0);
  if (sp.ambient) {
    if (step % 8 === 0)
      [0, 2, 4].forEach((d) => tone(ac, out, hz(note(chordDeg + d, 4)), t, sp.beat * 8.5, "sine", 0.12, nodes));
    if (step % 4 === 2) tone(ac, out, hz(note(sp.arp[step % 8], 6)), t, sp.beat * 3, "triangle", 0.05, nodes);
    return;
  }
  if (sp.four ? step % 2 === 0 : step === 0 || step === 5 || step === 10) kick(ac, out, t, nodes);
  if (sp.half ? step % 8 === 4 : step % 4 === 2) noise(ac, out, t, 0.14, 0.35, "bandpass", 1800, nodes);
  if (!(sp.half && step % 2)) noise(ac, out, t, 0.04, 0.12, "highpass", 7000, nodes);
  if (step % 4 === 0) tone(ac, out, hz(note(chordDeg, 2)), t, sp.beat * 1.8, "sawtooth", 0.18, nodes, 420);
  if (step % 8 === 0)
    [0, 2, 4].forEach((d) => tone(ac, out, hz(note(chordDeg + d, 4)), t, sp.beat * 7.5, "triangle", 0.05, nodes, 2400));
  if (step % 2 === 0 || sp.bright > 0.7)
    tone(ac, out, hz(note(chordDeg + sp.arp[step % 8], 5)), t, sp.beat * 0.9, "square", 0.035 * sp.bright, nodes, 3200);
}

function playSfx(ac: AudioContext, out: AudioNode, sp: Extract<Spec, { sfx: true }>, t0: number, nodes: Stoppable[]) {
  const d = Math.max(0.15, sp.dur);
  const r = sp.r;
  const at = Math.max(ac.currentTime, t0);
  const c = sp.cat;
  if (c === "footstep") {
    for (let i = 0; i < Math.max(1, Math.round(d / 0.45)); i++)
      noise(ac, out, at + i * 0.45, 0.12, 0.7, "lowpass", 900 + r() * 400, nodes);
  } else if (c === "impact" || c === "explosion") {
    kick(ac, out, at, nodes);
    noise(ac, out, at, d, 0.9, "lowpass", 3000, nodes, 120);
  } else if (c === "door") {
    noise(ac, out, at, 0.5, 0.5, "bandpass", 500, nodes, 300);
    kick(ac, out, at + Math.min(d - 0.3, 0.6), nodes);
  } else if (c === "glass-break") {
    noise(ac, out, at, d * 0.6, 0.6, "highpass", 4000, nodes);
    for (let i = 0; i < 6; i++) tone(ac, out, 2500 + r() * 3000, at + r() * 0.3, 0.3, "sine", 0.08, nodes);
  } else if (c === "whoosh") {
    noise(ac, out, at, d, 0.6, "bandpass", 300, nodes, 4000);
  } else if (c === "magic-spell") {
    for (let i = 0; i < 10; i++) tone(ac, out, 600 * Math.pow(2, i / 6), at + i * (d / 12), d / 2, "sine", 0.08, nodes);
    noise(ac, out, at, d, 0.2, "highpass", 6000, nodes);
  } else if (c === "weapon-fire") {
    noise(ac, out, at, 0.3, 1, "lowpass", 5000, nodes, 200);
    kick(ac, out, at, nodes);
  } else if (c === "pickup-chime" || c === "notification") {
    [0, 4, 7, 12].forEach((s, i) => tone(ac, out, hz(76 + s), at + i * 0.08, 0.5, "triangle", 0.16, nodes));
  } else if (c === "ui-click") {
    tone(ac, out, 1800, at, 0.04, "square", 0.2, nodes);
  } else if (c === "creature-growl") {
    tone(ac, out, 70 + r() * 30, at, d, "sawtooth", 0.3, nodes, 500);
    noise(ac, out, at, d, 0.3, "bandpass", 300, nodes);
  } else {
    // ambience / environment loops
    noise(ac, out, at, d, 0.25, "lowpass", 700, nodes);
    tone(ac, out, 110, at, d, "sine", 0.08, nodes);
  }
}

export class Engine {
  current: PlayState | null = null;
  private subs = new Set<() => void>();
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private take: Take | null = null;
  private spec: Spec | null = null;
  private start = 0;
  private offset = 0;
  private nextBeat = 0;
  private sfxFired = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nodes: Stoppable[] = [];
  private el: HTMLAudioElement | null = null;

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

  private ac(): AudioContext {
    if (!this.ctx) {
      const AC =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.22;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  /** Play from the start, resume, or pause — whichever this take needs. */
  toggle(t: Take, url: string | null) {
    const c = this.current;
    if (c && c.id === t.id && c.playing) return this.pause();
    if (c && c.id === t.id) return this.play(t, c.position >= c.duration - 0.05 ? 0 : c.position, url);
    this.play(t, 0, url);
  }

  play(t: Take, from: number, url: string | null) {
    this.halt();
    this.take = t;
    const duration = t.duration_s ?? 0;
    this.current = { id: t.id, playing: true, position: from, duration };
    if (url) {
      const el = new Audio(url);
      this.el = el;
      el.currentTime = from;
      el.play().catch(() => this.pause());
      el.onloadedmetadata = () => {
        if (this.current?.id === t.id && Number.isFinite(el.duration))
          this.current = { ...this.current, duration: el.duration };
      };
      el.onended = () => this.end();
    } else if (t.upload_id) {
      // A returned take whose bytes are gone: nothing to play, and no sketch
      // stands in for a file that was real.
      this.current = { ...this.current, playing: false };
      this.emit();
      return;
    } else {
      const ac = this.ac();
      this.start = ac.currentTime;
      this.offset = from;
      this.spec = specFor(t);
      this.nextBeat = Math.ceil(from / this.spec.beat - 1e-6);
      this.sfxFired = false;
    }
    this.timer = setInterval(() => this.tick(), 40);
    this.emit();
  }

  pause() {
    if (!this.current) return;
    const p = this.position();
    this.halt();
    this.current = { ...this.current, playing: false, position: p };
    this.emit();
  }

  seek(t: Take, time: number, url: string | null) {
    const c = this.current;
    if (c && c.id === t.id && c.playing) return this.play(t, time, url);
    this.current = {
      id: t.id,
      playing: false,
      position: time,
      duration: c && c.id === t.id ? c.duration : (t.duration_s ?? 0),
    };
    this.emit();
  }

  dispose() {
    this.halt();
    this.current = null;
    void this.ctx?.close();
    this.ctx = null;
    this.subs.clear();
  }

  private position(): number {
    const c = this.current;
    if (!c) return 0;
    if (!c.playing) return c.position;
    if (this.el) return this.el.currentTime;
    return this.offset + ((this.ctx?.currentTime ?? this.start) - this.start);
  }

  private halt() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.el) {
      this.el.pause();
      this.el.onended = null;
      this.el.onloadedmetadata = null;
      this.el = null;
    }
    for (const n of this.nodes) {
      try {
        n.stop();
      } catch {
        /* already stopped */
      }
    }
    this.nodes = [];
  }

  private end() {
    this.halt();
    if (this.current)
      this.current = {
        ...this.current,
        playing: false,
        position: this.current.duration,
      };
    this.emit();
  }

  private tick() {
    const c = this.current;
    if (!c || !c.playing) return;
    const p = this.position();
    if (p >= c.duration) {
      if (!this.el && this.take?.loopable) return this.play(this.take, 0, null);
      return this.end();
    }
    this.current = { ...c, position: Math.min(p, c.duration) };
    if (!this.el) this.schedule();
    this.emit();
  }

  private schedule() {
    const ac = this.ctx;
    const sp = this.spec;
    if (!ac || !sp || !this.master) return;
    if (sp.sfx) {
      if (!this.sfxFired) {
        this.sfxFired = true;
        playSfx(ac, this.master, sp, this.start - this.offset, this.nodes);
      }
      return;
    }
    const horizon = this.position() + 0.25;
    while (this.nextBeat * sp.beat < horizon) {
      const when = this.start + (this.nextBeat * sp.beat - this.offset);
      if (when >= ac.currentTime - 0.01)
        playBeat(ac, this.master, sp, this.nextBeat, Math.max(when, ac.currentTime), this.nodes);
      this.nextBeat++;
    }
    if (this.nodes.length > 200) this.nodes = this.nodes.slice(-120);
  }
}
