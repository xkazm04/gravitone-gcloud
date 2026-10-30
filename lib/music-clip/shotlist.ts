// THE EDIT AS DATA - a shot plan (sets and cameras per section, on the beat grid)
// expanded into a shot list with exact cut times, and the gate that holds it.
//
// Why: the operator's rule for this track, 2026-10-30 - "one cut max 3 s long to keep the clip
// dynamic - something always needs to happen". A rule a scene page merely promises is a rule
// nobody can check; a rule over a list of cut times is a comparison. The film page reads
// `film/shotlist.json` and routes t to a shot; this module is the only writer of that file.
//
// Cuts land on the grid (music-video-production/cut-rate-follows-the-section): a shot's length is
// counted in grid units - "bar" (4 beats), "half" (2 beats), "beat" - from the section's own beats,
// so the list is right where the tempo drifts. A section's first shot starts at the section start
// and its last ends at the section end, whatever grid point is nearest; nothing is left uncovered.

import type { TimelineV1 } from "./types";

export type GridUnit = "bar" | "half" | "beat";

/** The camera vocabulary every set implements (falling back to its nearest move). */
export const CAMS = ["wide", "medium", "close", "macro", "track", "orbit", "crane", "pov", "insert"] as const;
export type Cam = (typeof CAMS)[number];

export interface PlannedShot {
  set: string;
  cam: Cam;
  /** Length in grid units of the section's `unit` (default 1). */
  units?: number;
  /** The subject and the event that happens in the shot. */
  note: string;
}

export interface SectionPlan {
  sectionId: string;
  unit: GridUnit;
  /** Cycled in order until the section is filled. */
  shots: PlannedShot[];
}

export interface ShotPlanV1 {
  v: 1;
  /** Hard ceiling per shot, seconds. */
  maxShotS: number;
  sections: SectionPlan[];
}

export interface Shot {
  /** `<sectionId>-<nn>` */
  id: string;
  sectionId: string;
  startS: number;
  endS: number;
  set: string;
  cam: Cam;
  note: string;
  /** Index of this (set, cam) pair's occurrence in the film: a set varies its angle by it. */
  variant: number;
}

export interface ShotListV1 {
  v: 1;
  maxShotS: number;
  shots: Shot[];
}

const BEATS_PER: Record<GridUnit, number> = { bar: 4, half: 2, beat: 1 };
const MIN_SHOT_S = 0.25;
const r3 = (t: number) => Math.round(t * 1000) / 1000;

/** Grid points of one section: its start, every n-th beat inside it (downbeat-aligned for bars), its end. */
function gridOf(timeline: TimelineV1, startS: number, endS: number, unit: GridUnit): number[] {
  const step = BEATS_PER[unit];
  const inside = timeline.beats.filter((b) => b.t > startS + MIN_SHOT_S && b.t < endS - MIN_SHOT_S);
  // Align to downbeats for bars and halves: count beats from the first downbeat in the section.
  const first = unit === "beat" ? 0 : Math.max(0, inside.findIndex((b) => b.downbeat));
  // A pickup before the first downbeat joins the first shot.
  const points = inside.filter((_, i) => i >= first && (i - first) % step === 0).map((b) => b.t);
  return [startS, ...points, endS];
}

export function expandPlan(plan: ShotPlanV1, timeline: TimelineV1): { list: ShotListV1; errors: string[] } {
  const errors: string[] = [];
  const shots: Shot[] = [];
  const seen = new Map<string, number>();
  const byId = new Map(timeline.sections.map((s) => [s.id, s]));
  const planned = new Set(plan.sections.map((s) => s.sectionId));
  for (const s of timeline.sections) if (!planned.has(s.id)) errors.push(`section ${s.id} has no plan`);
  for (const sp of plan.sections) {
    const sec = byId.get(sp.sectionId);
    if (!sec) {
      errors.push(`plan names unknown section ${sp.sectionId}`);
      continue;
    }
    if (sp.shots.length === 0) {
      errors.push(`${sp.sectionId}: no shots`);
      continue;
    }
    for (const p of sp.shots) if (!(CAMS as readonly string[]).includes(p.cam)) errors.push(`${sp.sectionId}: cam "${p.cam}" is not one of ${CAMS.join(", ")}`);
    const grid = gridOf(timeline, sec.startS, sec.endS, sp.unit);
    let g = 0;
    let k = 0;
    while (g < grid.length - 1) {
      const p = sp.shots[k % sp.shots.length];
      const n = Math.max(1, Math.round(p.units ?? 1));
      const end = Math.min(grid.length - 1, g + n);
      const key = `${p.set}/${p.cam}`;
      const variant = seen.get(key) ?? 0;
      seen.set(key, variant + 1);
      shots.push({ id: `${sp.sectionId}-${String(k + 1).padStart(2, "0")}`, sectionId: sp.sectionId, startS: r3(grid[g]), endS: r3(grid[end]), set: p.set, cam: p.cam, note: p.note, variant });
      g = end;
      k++;
    }
  }
  shots.sort((a, b) => a.startS - b.startS);
  errors.push(...checkList({ v: 1, maxShotS: plan.maxShotS, shots }, timeline));
  return { list: { v: 1, maxShotS: plan.maxShotS, shots }, errors };
}

/** The gate: every shot within the ceiling, the film covered end to end with no gap or overlap. */
export function checkList(list: ShotListV1, timeline: TimelineV1): string[] {
  const errors: string[] = [];
  const dur = timeline.track.durationS;
  if (list.shots.length === 0) return ["no shots"];
  if (Math.abs(list.shots[0].startS) > 0.001) errors.push(`first shot starts at ${list.shots[0].startS}, not 0`);
  if (Math.abs(list.shots[list.shots.length - 1].endS - dur) > 0.05) errors.push(`last shot ends at ${list.shots[list.shots.length - 1].endS}, not ${dur}`);
  list.shots.forEach((s, i) => {
    const len = s.endS - s.startS;
    if (len > list.maxShotS + 1e-6) errors.push(`${s.id} (${s.set}/${s.cam}) is ${len.toFixed(2)} s, over the ${list.maxShotS} s ceiling`);
    if (len < MIN_SHOT_S) errors.push(`${s.id} is ${len.toFixed(2)} s, under ${MIN_SHOT_S} s`);
    const prev = list.shots[i - 1];
    if (prev && Math.abs(prev.endS - s.startS) > 0.001) errors.push(`${prev.id} -> ${s.id}: ${prev.endS} != ${s.startS} (gap or overlap)`);
  });
  return errors;
}

export function listStats(list: ShotListV1): { shots: number; maxS: number; meanS: number; sets: Record<string, number> } {
  const lens = list.shots.map((s) => s.endS - s.startS);
  const sets: Record<string, number> = {};
  for (const s of list.shots) sets[s.set] = (sets[s.set] ?? 0) + 1;
  return { shots: lens.length, maxS: r3(Math.max(...lens)), meanS: r3(lens.reduce((a, b) => a + b, 0) / lens.length), sets };
}
