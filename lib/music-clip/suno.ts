// SUNO'S OWN MEASUREMENT of a track it rendered: the beat grid, the tempo, the key, the parts and the
// sung words, read from api.suno.com (`analysis`, `lyrics-alignment` - both free) and mapped onto the
// TimelineV1 shapes the analysis publishes.
//
// Why it outranks the local DSP where it answers: Suno measured the render it made, on its stems; the
// local pass hears a mixed mp3 and guesses the "one" from the low band (beats.ts says its downbeat is a
// guess). So where both answer, Suno stands and the disagreement is a `warnings` line naming both
// figures. What Suno does not give - bands, onsets, intensity, the voice map - stays local, and every
// part Suno answers `unavailable` falls back to the local pass with a line saying so.
//
// Nothing here throws for a vendor answer: an unreachable account, a refusal, a status that never
// leaves `processing` are all warnings. The client and the clock are injected; tests never reach the
// network, and the live seam (`liveSunoGrid`) loads the client only when it is called.

import type { Alignment, Analysis } from "../suno/api/wire";
import type { Result } from "@gt/domain/errors";
import type { LyricLine } from "./lyricsParse";
import { nearest } from "./align";
import type { LyricConfidence, TimelineBeat, TimelineSection } from "./types";

export const POLL_INTERVAL_MS = 3_000;
export const POLL_CAP_MS = 120_000;
/** A Suno and a local boundary further apart than this are said to disagree. */
const BOUNDARY_S = 3;
/** A local downbeat within this of a Suno one agrees with it. */
const DOWNBEAT_S = 0.1;
/** Relative tempo difference past which the two figures are said to disagree. */
const TEMPO_REL = 0.01;

export interface SunoClient {
  analysis(id: string): Promise<Result<Analysis>>;
  alignment(id: string): Promise<Result<Alignment>>;
}

export interface SunoGridDeps {
  client: SunoClient;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  intervalMs?: number;
  capMs?: number;
}

/** What Suno answered, complete parts only, and the warnings for the rest. */
export interface SunoGrid {
  analysis?: Analysis;
  alignment?: Alignment;
  warnings: string[];
}

const PENDING = /^(processing|pending|queued|running|in[-_ ]?progress)$/i;
const DONE = /^(complete|completed|done|succeeded|success|ready)$/i;
const r3 = (t: number) => Math.round(t * 1000) / 1000;

async function poll<T extends { status: string }>(what: string, call: () => Promise<Result<T>>, deps: SunoGridDeps, warnings: string[]): Promise<T | undefined> {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const cap = deps.capMs ?? POLL_CAP_MS;
  const start = now();
  for (;;) {
    const r = await call();
    if (!r.ok) {
      warnings.push(`suno: ${what} failed (${r.error.message}); the local pass stands`);
      return undefined;
    }
    const status = r.value.status;
    if (DONE.test(status)) return r.value;
    if (!PENDING.test(status)) {
      warnings.push(`suno: ${what} ${status}; the local pass stands`);
      return undefined;
    }
    if (now() - start >= cap) {
      warnings.push(`suno: ${what} still ${status} after ${Math.round(cap / 1000)} s; the local pass stands`);
      return undefined;
    }
    await sleep(deps.intervalMs ?? POLL_INTERVAL_MS);
  }
}

/** Both free calls for one song, each polled while Suno is still measuring. Never throws on an answer. */
export async function fetchSunoGrid(id: string, deps: SunoGridDeps): Promise<SunoGrid> {
  const warnings: string[] = [];
  const analysis = await poll("analysis", () => deps.client.analysis(id), deps, warnings);
  const alignment = await poll("lyrics alignment", () => deps.client.alignment(id), deps, warnings);
  return { ...(analysis ? { analysis } : {}), ...(alignment ? { alignment } : {}), warnings };
}

/** The live seam: no grant on this machine is a warning, never a failed analysis. */
export async function liveSunoGrid(id: string): Promise<SunoGrid> {
  const { sunoApi, sunoApiStatus } = await import("../suno/api/client.ts");
  const status = await sunoApiStatus();
  if (!status.connected) return { warnings: ["suno: not connected; the local grid stands"] };
  return fetchSunoGrid(id, { client: sunoApi() });
}

/** A bare id or a https://suno.com/song/<id> link; undefined when it is neither. */
export function parseSunoId(text: string): string | undefined {
  const t = text.trim().split(/\s+/)[0] ?? "";
  const url = /^https?:\/\/(?:www\.)?suno\.com\/song\/([A-Za-z0-9-]+)\/?(?:[?#].*)?$/i.exec(t);
  if (url) return url[1];
  return /^[A-Za-z0-9-]{8,}$/.test(t) ? t : undefined;
}

/* ── mapping, each pure ─────────────────────────────────────────────────── */

/**
 * Suno's beats as the timeline's. `bar` counts from 1 at the first `bar_position: 1`; beats before it
 * are bar 0 (assignBars numbers a pickup the same way). `beat` is Suno's bar position clamped to
 * 1..4, or one past the beat before when Suno gave none. Undefined when no beat is marked as a one -
 * the caller then lays its own bars over Suno's times.
 */
export function sunoBeats(a: Analysis): { beats?: TimelineBeat[]; warnings: string[] } {
  const warnings: string[] = [];
  const raw = (a.beats ?? []).filter((b) => Number.isFinite(b.time_s)).sort((x, y) => x.time_s - y.time_s);
  if (a.time_signature != null && a.time_signature !== 4) {
    warnings.push(`beats: suno measures ${a.time_signature} beats to the bar; the timeline numbers beats in 4/4, bar positions past 4 read as 4`);
  }
  const first = raw.findIndex((b) => b.bar_position === 1);
  if (raw.length === 0) return { warnings };
  if (first < 0) {
    warnings.push("beats: suno marks no downbeat; the bars are laid locally over suno's beat times");
    return { warnings };
  }
  let bar = 0;
  let prev = 0;
  const beats = raw.map((b, i) => {
    const pos = b.bar_position;
    const downbeat = pos === 1;
    if (downbeat) bar++;
    let beat: number;
    if (pos != null && Number.isFinite(pos)) beat = Math.max(1, Math.min(4, Math.round(pos)));
    else if (i < first) beat = ((((i - first) % 4) + 4) % 4) + 1;
    else beat = Math.min(4, prev + 1);
    prev = beat;
    return { t: r3(b.time_s), bar, beat: beat as 1 | 2 | 3 | 4, downbeat };
  });
  return { beats, warnings };
}

/** Suno's BPM rounded as bpmFromBeats rounds the local figure. */
export const sunoBpm = (a: Analysis): number | undefined => (a.bpm != null && a.bpm > 0 ? Math.round(a.bpm * 100) / 100 : undefined);

export function tempoDisagreement(suno: number, local: number): string[] {
  return Math.abs(suno - local) / suno > TEMPO_REL ? [`tempo: suno measures ${suno} BPM, the local beat tracker ${local}; suno stands`] : [];
}

/** One line when fewer than half of Suno's downbeats have a local one within 0.1 s. */
export function downbeatDisagreement(suno: number[], local: number[]): string[] {
  if (suno.length === 0 || local.length === 0) return [];
  const hit = suno.filter((t) => Math.abs((nearest(local, t) ?? Infinity) - t) <= DOWNBEAT_S).length;
  if (hit * 2 >= suno.length) return [];
  return [`beats: ${hit} of suno's ${suno.length} downbeats have a local one within ${DOWNBEAT_S} s (suno's first ${suno[0]} s, the local first ${local[0]} s); suno stands`];
}

export interface SunoSpan {
  startS: number;
  endS: number;
  label?: string;
}

export function sunoSections(a: Analysis): SunoSpan[] {
  return (a.sections ?? [])
    .filter((s) => Number.isFinite(s.start_s) && Number.isFinite(s.end_s) && s.end_s > s.start_s)
    .sort((x, y) => x.start_s - y.start_s)
    .map((s) => ({ startS: s.start_s, endS: s.end_s, ...(s.label ? { label: s.label } : {}) }));
}

/** The starts the section builder is handed: Suno's, always opening at 0. */
export function sunoStarts(spans: SunoSpan[]): number[] {
  const starts = spans.map((s) => s.startS);
  return starts.length && starts[0] > 0.5 ? [0, ...starts] : starts.length ? [0, ...starts.slice(1)] : [];
}

/** One line naming every Suno boundary more than 3 s from every local one, with both figures. */
export function boundaryDisagreement(suno: number[], local: number[]): string[] {
  const off = suno
    .filter((t) => t > 1)
    .map((t) => ({ t, o: nearest(local, t) ?? 0 }))
    .filter((x) => Math.abs(x.o - x.t) > BOUNDARY_S);
  if (off.length === 0) return [];
  return [`sections: suno's boundaries stand; the local pass is more than ${BOUNDARY_S} s off at ${off.map((x) => `${x.t.toFixed(1)} s (local ${x.o.toFixed(1)} s)`).join(", ")}`];
}

/** Each section takes the letter of the Suno part that overlaps it most. */
export function withSunoLetters(sections: TimelineSection[], spans: SunoSpan[]): TimelineSection[] {
  return sections.map((s) => {
    let best: SunoSpan | undefined;
    let most = 0;
    for (const p of spans) {
      const o = Math.min(s.endS, p.endS) - Math.max(s.startS, p.startS);
      if (o > most && p.label) {
        most = o;
        best = p;
      }
    }
    return best?.label ? { ...s, sunoLabel: best.label } : s;
  });
}

/* ── words to lines ─────────────────────────────────────────────────────── */

export interface SungWord {
  text: string;
  norm: string;
  startS: number;
  endS: number;
  success: boolean;
}

const norm = (w: string) => w.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "");
export const lineTokens = (text: string): string[] => text.replace(/\[[^\]]*\]/g, " ").split(/\s+/).map(norm).filter(Boolean);

/** The alignment's words in time order, tags and timeless words dropped. */
export function sungWords(al: Alignment): SungWord[] {
  const out: SungWord[] = [];
  for (const w of al.words ?? []) {
    const text = (w.word ?? w.text ?? "").trim();
    if (!text || /^\[.*\]$/.test(text) || w.start_s == null || !Number.isFinite(w.start_s)) continue;
    for (const piece of text.split(/\s+/)) {
      const n = norm(piece);
      if (n) out.push({ text: piece, norm: n, startS: w.start_s, endS: w.end_s != null && w.end_s >= w.start_s ? w.end_s : w.start_s, success: w.success !== false });
    }
  }
  return out.sort((a, b) => a.startS - b.startS);
}

export interface AlignedLine {
  startS: number;
  endS: number;
  confidence: LyricConfidence;
  words: { text: string; startS: number; endS: number }[];
}

/** How far ahead of the stream a line's first word may be found (ad-libs, an unsung line). */
const LINE_REACH = 40;
/** How far ahead of the previous matched word the next one may be. */
const WORD_REACH = 4;

/**
 * The lyric file's lines matched to the word stream in order, case and punctuation aside. A line whose
 * every word matched a word Suno aligned with `success` is high; one with some words inferred
 * (success false) or at least half its words matched is medium; anything less is left out, and the
 * caller keeps that line on its section span. A line left out consumes no words.
 */
export function alignLines(lines: LyricLine[], words: SungWord[]): Map<string, AlignedLine> {
  const out = new Map<string, AlignedLine>();
  let p = 0;
  for (const l of lines) {
    const toks = lineTokens(l.text);
    if (toks.length === 0) continue;
    const hits: SungWord[] = [];
    let q = p;
    let reach = LINE_REACH;
    for (const tok of toks) {
      let j = -1;
      for (let k = q; k < Math.min(words.length, q + reach); k++) {
        if (words[k].norm === tok) {
          j = k;
          break;
        }
      }
      if (j < 0) continue;
      hits.push(words[j]);
      q = j + 1;
      reach = WORD_REACH;
    }
    if (hits.length * 2 < toks.length) continue;
    p = q;
    const all = hits.length === toks.length && hits.every((h) => h.success);
    out.set(l.id, {
      startS: r3(hits[0].startS),
      endS: r3(Math.max(hits[0].startS, hits[hits.length - 1].endS)),
      confidence: all ? "high" : "medium",
      words: hits.map((h) => ({ text: h.text, startS: r3(h.startS), endS: r3(h.endS) })),
    });
  }
  return out;
}
