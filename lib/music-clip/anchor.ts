// RE-ANCHORING THE SECTIONS ON THE SUNG LINES - the second look the section pass
// gets once Gemini has said when lines are sung.
//
// Why it exists: the tag-order alignment in sections.ts assumes the lyrics'
// first tag starts at the first boundary after one intro. Measured on Break the
// Sequence (2026-10-30): the track opens with a cold pulse (0-15 s) AND an
// instrumental build (15-46 s), so the build was labelled Verse 1 and every
// tag after it slid one section early. Only the vocal can say where Verse 1
// starts.
//
// Why it does not simply trust the line times: on the same track Gemini's
// times were right to the onset up to ~95 s and then drifted 15-40 s late
// (verse 2 at 152 s against an energy boundary at 96 s; the bridge after the
// final chorus). So a line time is evidence only where the energy agrees:
//   - CONFIRM: a tag whose first line lands within 3 s of one of our
//     boundaries starts there (the boundary stays ours, the label is fixed);
//   - SPLIT: a tag whose first line lands inside a section, BETWEEN two
//     confirmed tags, gets a new boundary at the nearest downbeat - the one
//     place a drifting time cannot be, because both its neighbours agreed.
// Everything outside the confirmed stretch is aligned by order and energy as
// before. A pass with no confirmed tag changes nothing.

import type { LyricTag } from "./lyricsParse";
import { meanOver } from "./intensity";
import { alignToUnits, cutsPerBarFor, snapToDownbeat, type SectionPassResult } from "./sections";
import type { SectionLabel, TimelineSection } from "./types";

const CONFIRM_S = 3;
const SPLIT_SNAP_S = 1.5;

export interface ReanchorInput {
  pass: SectionPassResult;
  tags: LyricTag[];
  /** Per tag index: the model's start time of that tag's first line, if it gave one. */
  firstLineS: (number | undefined)[];
  downbeats: number[];
  intensity: number[];
  durationS: number;
}

const r3 = (t: number) => Math.round(t * 1000) / 1000;

export function reanchorSections(input: ReanchorInput): { result: SectionPassResult; notes: string[] } | undefined {
  const { pass, tags, firstLineS } = input;
  let starts = pass.sections.map((s) => s.startS);
  // CONFIRM, in tag order, never going back in time.
  const at = new Map<number, number>();
  let last = 0;
  tags.forEach((_, ti) => {
    const a = firstLineS[ti];
    if (a === undefined) return;
    let best = -1;
    for (let j = 1; j < starts.length; j++) if (Math.abs(starts[j] - a) <= CONFIRM_S && (best < 0 || Math.abs(starts[j] - a) < Math.abs(starts[best] - a))) best = j;
    if (best > 0 && starts[best] > last) {
      at.set(ti, starts[best]);
      last = starts[best];
    }
  });
  if (at.size === 0) return undefined;
  const notes: string[] = [];
  const confirmed = [...at.keys()].sort((a, b) => a - b);
  notes.push(`sections: lyric line times confirm ${confirmed.map((ti) => `[${tags[ti].tag}] ${at.get(ti)}`).join(", ")}`);

  // SPLIT, only between two confirmed tags.
  for (let k = 0; k + 1 < confirmed.length; k++) {
    const p = confirmed[k];
    const q = confirmed[k + 1];
    for (let ti = p + 1; ti < q; ti++) {
      const a = firstLineS[ti];
      if (a === undefined || a <= at.get(p)! + CONFIRM_S || a >= at.get(q)! - CONFIRM_S) continue;
      if (starts.some((s) => Math.abs(s - a) <= CONFIRM_S)) continue;
      const b = r3(snapToDownbeat(a, input.downbeats, SPLIT_SNAP_S));
      starts = [...starts, b].sort((x, y) => x - y);
      at.set(ti, b);
      notes.push(`sections: split at ${b} s for [${tags[ti].tag}] (first line sung at ${a} s)`);
    }
  }
  const anchored = [...at.keys()].sort((a, b) => a - b);

  const spans = starts.map((s, i) => ({ startS: s, endS: i + 1 < starts.length ? starts[i + 1] : input.durationS }));
  const intens = spans.map((sp) => meanOver(input.intensity, sp.startS, sp.endS));
  // tagOf[i]: the tag index a span plays, -1 for the intro.
  const tagOf = new Array<number>(spans.length).fill(-1);
  const range = (from: number, to: number) => spans.map((_, i) => i).filter((i) => spans[i].startS >= from && spans[i].startS < to);

  const head = range(0, at.get(anchored[0])!);
  if (anchored[0] > 0 && head.length > 0) {
    const units: (SectionLabel | undefined)[] = ["intro", ...tags.slice(0, anchored[0]).map((t) => t.label)];
    alignToUnits(head.map((i) => intens[i]), units, true).forEach((u, k) => (tagOf[head[k]] = u - 1));
  }
  anchored.forEach((ti, k) => {
    const nextTi = k + 1 < anchored.length ? anchored[k + 1] : tags.length;
    const idx = range(at.get(ti)!, k + 1 < anchored.length ? at.get(anchored[k + 1])! : Infinity);
    const units = tags.slice(ti, nextTi).map((t) => t.label);
    const out = alignToUnits(idx.map((i) => intens[i]), units, false);
    out[0] = 0; // the anchored tag owns the span it was confirmed on
    out.forEach((u, j) => (tagOf[idx[j]] = ti + u));
  });

  const tagSections: number[][] = tags.map(() => []);
  tagOf.forEach((t, i) => t >= 0 && tagSections[t].push(i));
  const sections: TimelineSection[] = spans.map((sp, i) => {
    const tag = tagOf[i] >= 0 ? tags[tagOf[i]] : undefined;
    const label: SectionLabel = tag ? (tag.label ?? "verse") : "intro";
    const intensity = Math.round(intens[i] * 1000) / 1000;
    return {
      id: `s${String(i + 1).padStart(2, "0")}`,
      label,
      startS: sp.startS,
      endS: sp.endS,
      intensity,
      cutsPerBar: cutsPerBarFor(intensity, label),
      ...(tag ? { lyricTag: tag.tag } : {}),
    };
  });
  // Only the coverage warnings are this pass's; the caller drops the old ones.
  const warnings: string[] = [];
  tags.forEach((t, ti) => {
    if (tagSections[ti].length === 0) warnings.push(`sections: tag [${t.tag}] heard no section of its own; its lines join the section before it`);
  });
  return { result: { sections, tagSections, warnings }, notes };
}
