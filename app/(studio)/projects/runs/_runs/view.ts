// FROM THE MODEL TO THE DAY-LINE - pure: rows, bars, pins, the lit thread, the J/K walk and the
// totals, all derived from one RunsModel and the selection (projects.js `rowsOf`, `Bar`,
// `drawLinks`, the keydown walk, `renderTop` totals). No React here, so the probe can ask
// exactly what the page would draw.

import type { ResourceLane } from "@gt/domain/lane";
import type { JobState } from "@gt/domain/job.machine";
import { dayLabel, hm, occupancy } from "@gt/ui/components/runs/dayline.ts";
import { CALENDAR_ROW, LANE_ORDER, LANE_SPECS, WEIR_ROW } from "@gt/ui/components/runs/lanes.ts";
import type { DaylineBar, DaylinePin, DaylineRow } from "@gt/ui/components/runs/RunsDayline.tsx";
import { blockedBy, light, type Dep, type Lit } from "@gt/ui/components/runs/thread.ts";
import { STATUS } from "@gt/ui/components/status/status.ts";

import type { RunJob, RunWeir, RunsModel } from "./model.ts";

/** States that end a dependency's chances: whatever waits on them is blocked. */
const STUCK: ReadonlySet<JobState> = new Set(["failed", "interrupted", "cancelled"]);
/** States that hold a lane now. */
const HOLDING: ReadonlySet<JobState> = new Set(["running"]);
/** An interrupted job waits on the operator's look, not on its lane: it is counted with the failed. */
const WAITING: ReadonlySet<JobState> = new Set(["queued", "planned", "paused"]);
const NEEDS: ReadonlySet<JobState> = new Set(["failed", "interrupted"]);

/** `14:05` today, `Wed 15 Oct 14:05` otherwise; `≈` when the time is derived. UTC, as the axis is. */
export function when(t: number, now: number, approx = false): string {
  const same = new Date(t).toISOString().slice(0, 10) === new Date(now).toISOString().slice(0, 10);
  return `${approx ? "≈ " : ""}${same ? "" : `${dayLabel(t)} `}${hm(t)}`;
}

/** A lane on hold, as a row names it: which job holds it and in what stage. */
export type RowHold = { readonly lane: ResourceLane; readonly title: string; readonly stage?: string };

export function rowsOf(m: RunsModel, holds: readonly RowHold[] = []): DaylineRow[] {
  const lanes: DaylineRow[] = LANE_ORDER.map((lane) => {
    const spec = LANE_SPECS[lane];
    const running = m.jobs.filter((j) => j.lane === lane && HOLDING.has(j.state)).length;
    const h = holds.find((x) => x.lane === lane);
    return {
      id: lane,
      label: spec.label,
      engines: spec.engines,
      cap: spec.cap,
      kind: spec.kind,
      held: { share: occupancy(running, spec.cap), name: `${spec.label}: ${running} of ${spec.cap} running` },
      ...(h === undefined ? {} : { hold: { name: `${spec.label} on hold: ${h.title}${h.stage === undefined ? "" : `, ${h.stage}`}` } }),
    };
  });
  return [...lanes, { ...WEIR_ROW, cap: 1, kind: "weir" }, { ...CALENDAR_ROW, cap: 1, kind: "calendar" }];
}

export const depsOf = (m: RunsModel): Dep[] => m.jobs.flatMap((j) => j.after.map((from) => ({ from, to: j.key })));

export function blockedOf(m: RunsModel, deps: readonly Dep[]): Map<string, string> {
  const stuck = new Set(m.jobs.filter((j) => STUCK.has(j.state)).map((j) => j.key));
  const out = new Map<string, string>();
  for (const j of m.jobs) {
    if (j.state === "done" || j.state === "cancelled") continue;
    const b = blockedBy(j.key, deps, (id) => stuck.has(id));
    if (b !== null) out.set(j.key, b);
  }
  return out;
}

function jobBar(j: RunJob, m: RunsModel, blocked: boolean): DaylineBar {
  const st = STATUS.job[j.state];
  const label = j.progress !== undefined && j.progress.total > 1 && j.state !== "done" ? `${j.title} ${j.progress.done}/${j.progress.total}` : j.title;
  const end = j.open ? "now" : when(j.e, m.now, j.approx);
  return {
    id: j.key,
    row: j.lane,
    s: j.s,
    e: j.e,
    look: st.look,
    label,
    ...(j.progress?.stage === undefined ? {} : { sub: j.progress.stage }),
    ...(j.state === "running" && j.progress !== undefined && j.progress.total > 0 ? { progress: j.progress.done / j.progress.total } : {}),
    floor: j.projectId === undefined,
    blocked,
    name: `${LANE_SPECS[j.lane].label}, ${j.title}, ${blocked ? "blocked" : st.label}, ${when(j.s, m.now, j.approx)} to ${end}`,
  };
}

/**
 * A pile at the Weir is drawn from when it arrived to NOW: how long the operator has kept it
 * waiting is the fact the row exists to show (a pile from last month reaches in from the left
 * edge). A committed pile is a mark at its commit.
 */
function weirBar(w: RunWeir, m: RunsModel): DaylineBar {
  const left = w.pending === undefined ? "" : `, ${w.pending} to judge`;
  return {
    id: w.key,
    row: WEIR_ROW.id,
    s: w.at,
    e: w.done ? w.at : Math.max(w.at, m.now),
    look: w.done ? "done" : "awaiting",
    mark: "gate",
    label: `◆ ${w.title}`,
    floor: true,
    name: `${WEIR_ROW.label}, ${w.title}, ${w.done ? "committed" : "at the weir"}${left}, ${when(w.at, m.now, w.approx)}`,
  };
}

export function barsOf(m: RunsModel, blocked: ReadonlyMap<string, string>): DaylineBar[] {
  return [...m.jobs.map((j) => jobBar(j, m, blocked.has(j.key))), ...m.weir.map((w) => weirBar(w, m))];
}

export const pinsOf = (m: RunsModel): DaylinePin[] =>
  m.pins.map((p) => ({ id: p.key, at: p.at, state: p.status, name: `${p.channel} ${p.title}, ${p.status}, ${when(p.at, m.now)}`, href: p.href }));

/** The bars of a project: every job and slot v1 recorded with that projectId. */
export const membersOf = (m: RunsModel, project: string | null): Set<string> =>
  project === null ? new Set() : new Set(m.jobs.filter((j) => j.projectId === project).map((j) => j.key));

export function litOf(m: RunsModel, sel: { readonly job: string | null; readonly project: string | null }, deps: readonly Dep[], blocked: ReadonlyMap<string, string>): Lit | null {
  return light({ job: sel.job, members: membersOf(m, sel.project) }, deps, new Set(blocked.keys()));
}

/**
 * What J/K walk (projects.js keydown): the project's bars when one is selected, else every bar
 * that is not finished - jobs and Weir piles alike - in start order.
 */
export function walkPool(m: RunsModel, project: string | null): string[] {
  const members = membersOf(m, project);
  const jobs = m.jobs.filter((j) => (project === null ? j.state !== "done" : members.has(j.key))).map((j) => ({ k: j.key, s: j.s }));
  const piles = project === null ? m.weir.filter((w) => !w.done).map((w) => ({ k: w.key, s: w.at })) : [];
  return [...jobs, ...piles].sort((a, b) => a.s - b.s || a.k.localeCompare(b.k)).map((x) => x.k);
}

/** The next (dir 1) or previous (dir -1) key in the pool, wrapping; the first or last from nothing. */
export function step(pool: readonly string[], current: string | null, dir: 1 | -1): string | null {
  if (pool.length === 0) return null;
  const i = current === null ? -1 : pool.indexOf(current);
  if (i < 0) return pool[dir === 1 ? 0 : pool.length - 1] ?? null;
  return pool[(i + dir + pool.length) % pool.length] ?? null;
}

/** Projects v1 named on its records, with how many bars each has. */
export function projectsOf(m: RunsModel): { readonly id: string; readonly jobs: number; readonly slots: number }[] {
  const ids = new Set<string>([...m.jobs.flatMap((j) => (j.projectId === undefined ? [] : [j.projectId])), ...m.pins.map((p) => p.projectId)]);
  return [...ids].sort().map((id) => ({ id, jobs: m.jobs.filter((j) => j.projectId === id).length, slots: m.pins.filter((p) => p.projectId === id).length }));
}

/** What failed, or was interrupted, and is not the ledger's past: the totals' count and the inspector's list. */
export const failedOf = (m: RunsModel): RunJob[] => m.jobs.filter((j) => j.from !== "ledger" && NEEDS.has(j.state));

/** The "All lanes" row's floor runs, by the rule Plan counts them with (projects/page.tsx): the
 *  produce jobs no project owns that are not done - so the row reads the same number on both tabs. */
export const floorRunsOf = (m: RunsModel): number => m.jobs.filter((j) => j.act !== undefined && j.act.projectId === undefined && j.state !== "done").length;

const counted = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? "" : "s"}`;
/** A v1-only project's row in the composition list: its bars, counted. */
export const projectMeta = (p: { readonly jobs: number; readonly slots: number }): string => `${counted(p.jobs, "job")} · ${counted(p.slots, "slot")}`;

export type Totals = { readonly running: number; readonly waiting: number; readonly weir: number; readonly failed: number };

export function totalsOf(m: RunsModel): Totals {
  const live = m.jobs.filter((j) => j.from !== "ledger");
  return {
    running: live.filter((j) => HOLDING.has(j.state)).length,
    waiting: live.filter((j) => WAITING.has(j.state)).length,
    weir: m.weir.filter((w) => !w.done).length,
    failed: failedOf(m).length,
  };
}

/** Each resource's holding, for the inspector's resource list. */
export function holdingOf(m: RunsModel): { readonly lane: ResourceLane; readonly cap: number; readonly running: number; readonly waiting: number }[] {
  return LANE_ORDER.map((lane) => {
    const mine = m.jobs.filter((j) => j.lane === lane && j.from !== "ledger");
    return { lane, cap: LANE_SPECS[lane].cap, running: mine.filter((j) => HOLDING.has(j.state)).length, waiting: mine.filter((j) => WAITING.has(j.state)).length };
  }).filter((r) => r.running + r.waiting > 0);
}

/** USD held by open spend reservations (in flight, not spent); audio seconds are their own unit. */
export function heldMoney(m: RunsModel): { readonly usd: number; readonly audioS: number; readonly n: number } {
  let usd = 0;
  let audioS = 0;
  for (const h of m.holds) {
    if (h.unit === "usd") usd += h.amount;
    else audioS += h.amount;
  }
  return { usd, audioS, n: m.holds.length };
}

/** The held chip's figure: every unit that holds something, so audio seconds are not hidden behind dollars. */
export function heldLabel(h: { readonly usd: number; readonly audioS: number }): string {
  const parts = [...(h.usd > 0 ? [`$${h.usd.toFixed(2)}`] : []), ...(h.audioS > 0 ? [`${Math.round(h.audioS)} s`] : [])];
  return parts.length === 0 ? "$0.00" : parts.join(" · ");
}
