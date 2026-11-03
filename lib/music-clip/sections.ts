// THE SECTION MAP: where the song's parts begin, what each is called, and how
// fast it earns cuts.
//
// The boundaries come from lib/sound/mv/sections.ts's Foote-novelty pass,
// reused as it is (its header owns what it does and does not do). Two things
// are better here than there, because this pass has what that one lacks:
//   - a DOWNBEAT list, so a boundary snaps to the nearest bar line within a
//     second instead of to the nearest onset - a section starts on the one;
//   - the LYRICS FILE's tags, the songwriter's own statement of the form. The
//     audio decides WHEN; the tags decide WHAT, by an order-preserving
//     alignment (below) that may let one tag span two detected sections or
//     two short tags share one, and pays for each. Energy labels are the
//     fallback, not the first word: the registry's track-map-before-treatment
//     warns a quiet chorus and a loud verse are both common.
//
// The novelty pass's scale is chosen BY the tag count: the lyrics say there
// are ten parts, so of the minimum section lengths tried, the one whose
// detected count lands nearest ten is kept. A short pre-chorus (8 bars, 15 s)
// is invisible at the pass's default 20 s floor and plain at 10 s.

import { detectSections, labelSections } from "../sound/mv/sections";
import { meanOver } from "./intensity";
import type { LyricTag } from "./lyricsParse";
import type { SectionLabel, TimelineSection } from "./types";
import { CLIP_FPS } from "./types";

export interface SectionPassInput {
  durationS: number;
  bands: { low: number[]; mid: number[]; high: number[] };
  flux: number[];
  onsets: number[];
  downbeats: number[];
  intensity: number[];
  tags: LyricTag[];
}

export interface SectionPassResult {
  sections: TimelineSection[];
  /** For each tag (by index), the indices of the sections it was matched to. */
  tagSections: number[][];
  warnings: string[];
}

const SCALES_S = [20, 16, 13, 10, 8];

/** Snap `t` to the nearest downbeat within `maxS`, else leave it. */
export function snapToDownbeat(t: number, downbeats: number[], maxS = 1): number {
  let best = t;
  let bestD = maxS;
  for (const d of downbeats) {
    const dd = Math.abs(d - t);
    if (dd <= bestD) {
      best = d;
      bestD = dd;
    }
  }
  return best;
}

/** Cuts per bar from a section's mean intensity (cut-rate-follows-the-section). */
export function cutsPerBarFor(intensity: number, label: SectionLabel): number {
  const c = intensity < 0.35 ? 0.25 : intensity < 0.55 ? 0.5 : intensity < 0.75 ? 1 : 2;
  return label === "bridge" || label === "breakdown" ? Math.min(1, c) : c;
}

/** Where each label's section usually sits on the 0..1 intensity scale - the
 *  energy prior the alignment pays against. */
const EXPECTED: Record<SectionLabel, number> = { intro: 0.2, verse: 0.5, prechorus: 0.6, chorus: 0.85, bridge: 0.35, breakdown: 0.3, outro: 0.25 };
const SKIP_COST = 0.6;
const SPLIT_COST = 0.35;

/**
 * Order-preserving alignment of sections to units (an optional leading intro
 * unit, then the tags). Each section takes one unit; the unit index never
 * goes back; a step of 0 is a split (one tag over two sections), a step past
 * 1 merges the skipped tags into the section before. Cost: per section the
 * distance from its intensity to its unit's expected intensity, plus a fixed
 * price per split and per skipped tag. Small DP, m x k.
 */
export function alignToUnits(intensities: number[], unitLabels: (SectionLabel | undefined)[], introOptional: boolean): number[] {
  const m = intensities.length;
  const k = unitLabels.length;
  if (m === 0 || k === 0) return intensities.map(() => 0);
  const fit = (i: number, u: number) => Math.abs(intensities[i] - EXPECTED[unitLabels[u] ?? "verse"]);
  const skipCost = (from: number, to: number) => {
    let c = 0;
    for (let u = from + 1; u < to; u++) c += u === 0 && introOptional ? 0.1 : SKIP_COST;
    return c;
  };
  const cost: number[][] = Array.from({ length: m }, () => new Array<number>(k).fill(Infinity));
  const prev: number[][] = Array.from({ length: m }, () => new Array<number>(k).fill(-1));
  for (let u = 0; u < k; u++) cost[0][u] = fit(0, u) + skipCost(-1, u);
  for (let i = 1; i < m; i++) {
    for (let u = 0; u < k; u++) {
      for (let p = 0; p <= u; p++) {
        if (!Number.isFinite(cost[i - 1][p])) continue;
        const c = cost[i - 1][p] + (p === u ? SPLIT_COST : skipCost(p, u)) + fit(i, u);
        if (c < cost[i][u]) {
          cost[i][u] = c;
          prev[i][u] = p;
        }
      }
    }
  }
  let end = 0;
  for (let u = 0; u < k; u++) if (cost[m - 1][u] + skipCost(u, k) < cost[m - 1][end] + skipCost(end, k)) end = u;
  const out = new Array<number>(m);
  for (let i = m - 1, u = end; i >= 0; i--) {
    out[i] = u;
    u = prev[i][u];
  }
  return out;
}

function detectAtScale(input: SectionPassInput, minSectionS: number): number[] {
  const chapters = detectSections(
    { fps: CLIP_FPS, bands: input.bands, flux: input.flux, onsetFrames: input.onsets.map((t) => Math.round(t * CLIP_FPS)) },
    { minSectionS, kernelHalfS: Math.min(10, minSectionS / 2) },
  );
  const starts = chapters.map((c) => (c.startS === 0 ? 0 : snapToDownbeat(c.startS, input.downbeats)));
  // Snapping can pull two starts onto one bar line; keep strictly increasing.
  return starts.filter((s, i) => i === 0 || s > starts[i - 1] + 0.5);
}

export function buildSections(input: SectionPassInput): SectionPassResult {
  const warnings: string[] = [];
  const hasIntroTag = input.tags[0]?.label === "intro";
  const want = input.tags.length + (hasIntroTag ? 0 : 1);
  let starts = detectAtScale(input, SCALES_S[0]);
  if (input.tags.length > 0) {
    for (const s of SCALES_S.slice(1)) {
      const next = detectAtScale(input, s);
      if (Math.abs(next.length - want) < Math.abs(starts.length - want)) starts = next;
    }
  }
  if (starts.length === 0) starts = [0];
  const spans = starts.map((s, i) => ({ startS: Math.round(s * 1000) / 1000, endS: i + 1 < starts.length ? Math.round(starts[i + 1] * 1000) / 1000 : input.durationS }));
  const intens = spans.map((sp) => meanOver(input.intensity, sp.startS, sp.endS));

  // The energy words, from the reused pass's own rule, as the fallback.
  const energyLabels = energyWords(intens);

  const units: (SectionLabel | undefined)[] = [...(hasIntroTag ? [] : ["intro" as const]), ...input.tags.map((t) => t.label)];
  const offset = hasIntroTag ? 0 : 1;
  const unitOf = input.tags.length > 0 ? alignToUnits(intens, units, !hasIntroTag) : spans.map(() => -1);
  const trustTags = input.tags.length > 0 && Math.abs(spans.length - want) <= 2;
  if (input.tags.length === 0) warnings.push("sections: the lyrics carry no [tags]; labels come from energy alone");
  else if (!trustTags) warnings.push(`sections: ${spans.length} sections heard against ${want} the lyrics name (${input.tags.length} tags${hasIntroTag ? "" : " + intro"}); labels come from energy, lyric lines still follow the tag order`);

  const tagSections: number[][] = input.tags.map(() => []);
  unitOf.forEach((u, i) => {
    const t = u - offset;
    if (t >= 0) tagSections[t].push(i);
  });
  input.tags.forEach((t, ti) => {
    if (tagSections[ti].length === 0) warnings.push(`sections: tag [${t.tag}] heard no section of its own; its lines join the section before it`);
  });

  const sections: TimelineSection[] = spans.map((sp, i) => {
    const t = unitOf[i] - offset;
    const tag = t >= 0 ? input.tags[t] : undefined;
    const label: SectionLabel = trustTags ? (unitOf[i] === 0 && !hasIntroTag ? "intro" : (tag?.label ?? energyLabels[i] ?? "verse")) : (energyLabels[i] ?? "verse");
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
  return { sections, tagSections, warnings };
}

const WORDS = new Set<string>(["intro", "verse", "prechorus", "chorus", "bridge", "breakdown", "outro"]);

/** lib/sound/mv/sections.ts `labelSections` over this pass's intensities,
 *  narrowed to the timeline's words (it only ever says five of them). */
function energyWords(intens: number[]): SectionLabel[] {
  return labelSections(intens).map((w) => (WORDS.has(w) ? (w as SectionLabel) : "verse"));
}
