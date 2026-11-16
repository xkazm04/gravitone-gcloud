// THE THREE READS OF A TAKE, COMPARED (spark suno-api, the listener doctrine): what this server
// measured (`measured`), Suno's own free reads (`suno`) and the priced Gemini listen (`gemini`). Each
// read is kept; none replaces another. Where two of them disagree, each side's row carries the other's
// value - tempo, key, and where a section starts - and the take surface (./TakeFacts.tsx) marks it.
//
// THE TOLERANCES. Two MEASUREMENTS of a tempo (the sidecar's beat tracker and Suno's analysis) agree
// within BPM_AGREE_MEASURED, 2 %; a tempo a listener model HEARD keeps ./suno.ts BPM_AGREE, 4 %, the
// vocabulary's tolerance for a hypothesis. A key agrees when its pitch class and mode do (./suno.ts
// keyClass), or, where a name does not read as one, when the names match. A section boundary agrees
// with the other read's nearest boundary within SECTION_AGREE_S, 3 s. Pure: tested without a DOM.
import type { ReadSource, StudioListen, StudioMeasured, SunoRead } from "@gt/domain/audio.suno";

import { BPM_AGREE, keyClass } from "./suno.ts";

/** Two measured tempos within 2 % are the same tempo. */
export const BPM_AGREE_MEASURED = 0.02;
/** Two section starts within 3 s are the same boundary. */
export const SECTION_AGREE_S = 3;

export type TakeReads = { readonly measured: StudioMeasured; readonly suno?: SunoRead; readonly gemini?: StudioListen };

/** The other read a row disagrees with, and what that read says. */
export type Off = { readonly source: ReadSource; readonly value: string };

export type ReadsDisagree = {
  readonly bpm: Readonly<Partial<Record<ReadSource, readonly Off[]>>>;
  readonly key: Readonly<Partial<Record<ReadSource, readonly Off[]>>>;
  /** Per read, the sections whose start the other read has no boundary near, with that read's nearest start. */
  readonly sections: { readonly suno: ReadonlyMap<number, number>; readonly gemini: ReadonlyMap<number, number> };
};

const tolerance = (a: ReadSource, b: ReadSource): number => (a === "gemini" || b === "gemini" ? BPM_AGREE : BPM_AGREE_MEASURED);

const norm = (s: string): string => s.trim().replace(/\s+/g, " ").toLowerCase();

/** Do two key names name different keys? */
export function keysDiffer(a: string, b: string): boolean {
  const x = keyClass(a);
  const y = keyClass(b);
  return x === null || y === null ? norm(a) !== norm(b) : x.pc !== y.pc || x.minor !== y.minor;
}

/** Do two tempos differ beyond the tolerance of the pair that read them? */
export function tempoDiffers(a: { readonly source: ReadSource; readonly bpm: number }, b: { readonly source: ReadSource; readonly bpm: number }): boolean {
  return Math.abs(a.bpm - b.bpm) / Math.min(a.bpm, b.bpm) > tolerance(a.source, b.source);
}

/** The boundaries a read's sections draw: every start after the first moment. */
const starts = (xs: readonly { readonly startS: number }[]): readonly number[] => xs.map((x) => x.startS).filter((s) => s > 0.5);

/** Each section (by index) whose start has no boundary of `other` within SECTION_AGREE_S, with the nearest one. */
function farStarts(own: readonly { readonly startS: number }[], other: readonly { readonly startS: number }[]): ReadonlyMap<number, number> {
  const theirs = starts(other);
  const out = new Map<number, number>();
  if (theirs.length === 0) return out;
  own.forEach((x, i) => {
    if (x.startS <= 0.5) return;
    let near = theirs[0] ?? 0;
    for (const t of theirs) if (Math.abs(t - x.startS) < Math.abs(near - x.startS)) near = t;
    if (Math.abs(near - x.startS) > SECTION_AGREE_S) out.set(i, near);
  });
  return out;
}

/** Where the take's reads disagree; a read the take does not hold disagrees with nothing. */
export function readsDisagree(r: TakeReads): ReadsDisagree {
  const tempos = [
    ...(r.measured.bpm !== undefined ? [{ source: "measured" as const, bpm: r.measured.bpm }] : []),
    ...(r.suno?.bpm !== undefined ? [{ source: "suno" as const, bpm: r.suno.bpm }] : []),
    ...(r.gemini?.bpm !== undefined ? [{ source: "gemini" as const, bpm: r.gemini.bpm }] : []),
  ];
  const keys = [
    ...(r.measured.key !== undefined ? [{ source: "measured" as const, key: r.measured.key }] : []),
    ...(r.suno?.key !== undefined ? [{ source: "suno" as const, key: r.suno.key }] : []),
    ...(r.gemini?.key !== undefined ? [{ source: "gemini" as const, key: r.gemini.key }] : []),
  ];
  const bpm: Partial<Record<ReadSource, Off[]>> = {};
  for (const a of tempos)
    for (const b of tempos) if (a.source !== b.source && tempoDiffers(a, b)) (bpm[a.source] ??= []).push({ source: b.source, value: String(Math.round(b.bpm)) });
  const key: Partial<Record<ReadSource, Off[]>> = {};
  for (const a of keys) for (const b of keys) if (a.source !== b.source && keysDiffer(a.key, b.key)) (key[a.source] ??= []).push({ source: b.source, value: b.key });
  const sunoSections = r.suno?.sections ?? [];
  const geminiSections = r.gemini?.sections ?? [];
  return { bpm, key, sections: { suno: farStarts(sunoSections, geminiSections), gemini: farStarts(geminiSections, sunoSections) } };
}

/** A row's disagreement in words: "measured 124 · suno 100"; null when it agrees with every other read. */
export const offWords = (offs: readonly Off[] | undefined): string | null => (offs === undefined || offs.length === 0 ? null : offs.map((o) => `${o.source} ${o.value}`).join(" · "));

/** Suno's answer as prose: its trailing json block is drawn as rows, so the sentence stands without it. */
export const answerProse = (answer: string): string => answer.replace(/```(?:json)?[\s\S]*?```/gi, "").trim();
