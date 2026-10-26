import type { ResourceLane } from "@gt/domain/lane";

// THE LIST SCHEDULER - where every job lands on its lane, from its dependencies and the lane's
// slots. Pure: `now`, the queue and the capacity are parameters (registry scheduling: the
// schedule is computed from persisted state, so "why does this start at 14:20" is answerable by
// replaying the same inputs).
//
// Absorbed from the prototype's `schedule()` (docs/next/prototype/app/studio.js :182-224): fixed
// history keeps its clock, running work holds a slot until its estimated end, and the rest is
// placed repeatedly - the earliest-ready item first, ties broken by queue order - on the
// earliest-free slot of its lane. Kept: an item behind a failed or paused upstream is drawn from
// NOW and holds no slot (the prototype's `blockedBy`); a gate or slot is drawn 20 minutes wide
// (its "drawn width only - the verdict is the operator's"). Upgraded: capacity is the kernel's
// LANE_CAPACITY (one table for the lease and the schedule), a queue position counts running slots
// as ahead (COMMON decision 5: computed, never stored), and the whole thing is deterministic -
// the prototype broke ties on float arithmetic over `order * 1e-3`.

export const OPERATOR_WIDTH_S = 20 * 60;

export type SchedItem = {
  readonly key: string;
  /** null for an operator act (a gate, a slot): it holds no lane. */
  readonly lane: ResourceLane | null;
  readonly seconds: number;
  readonly after: readonly string[];
  /** Queue order within its lane; lower runs first among equally ready items. */
  readonly order: number;
  /**
   * `pending` is placed by the scheduler; `running` holds a slot from `startedAt`; `done` keeps
   * its recorded times; `stuck` (failed, paused, interrupted) is drawn from now and holds nothing.
   */
  readonly status: "pending" | "running" | "done" | "stuck";
  readonly startedAt?: number;
  readonly endedAt?: number;
};

export type Placed = { readonly start: number; readonly end: number; readonly queuePos: number | null; readonly blocked: boolean };

export type ScheduleInput = {
  readonly items: readonly SchedItem[];
  readonly capacity: Readonly<Record<ResourceLane, number>>;
  readonly now: number;
};

/** Every item placed, by key. An item waiting on a key no item has is drawn blocked, from now;
 *  items that wait on each other (a cycle - their upstream never resolves) are left out. */
export function schedule(input: ScheduleInput): Map<string, Placed> {
  const { items, capacity, now } = input;
  const free = new Map<ResourceLane, number[]>();
  const slotsOf = (lane: ResourceLane): number[] => {
    let s = free.get(lane);
    if (s === undefined) {
      s = Array.from({ length: Math.max(1, capacity[lane]) }, () => now);
      free.set(lane, s);
    }
    return s;
  };
  const take = (lane: ResourceLane, until: number): void => {
    const s = slotsOf(lane);
    let i = 0;
    for (let k = 1; k < s.length; k++) if ((s[k] ?? 0) < (s[i] ?? 0)) i = k;
    s[i] = Math.max(s[i] ?? now, until);
  };
  const placed = new Map<string, { start: number; end: number; blocked: boolean; stuck: boolean }>();

  for (const it of items) {
    if (it.status === "done") {
      const end = it.endedAt ?? now;
      placed.set(it.key, { start: it.startedAt ?? end - it.seconds * 1000, end, blocked: false, stuck: false });
    } else if (it.status === "running") {
      const start = it.startedAt ?? now;
      const end = Math.max(now, start + it.seconds * 1000);
      placed.set(it.key, { start, end, blocked: false, stuck: false });
      if (it.lane !== null) take(it.lane, end);
    } else if (it.status === "stuck") {
      placed.set(it.key, { start: now, end: now + Math.max(600, it.seconds) * 1000, blocked: false, stuck: true });
    }
  }

  const pending = items.filter((it) => it.status === "pending");
  const keys = new Set(items.map((i) => i.key));
  while (pending.length > 0) {
    let best: { i: number; t: number; blocked: boolean } | undefined;
    for (let i = 0; i < pending.length; i++) {
      const it = pending[i];
      if (it === undefined) continue;
      let t = now;
      let ready = true;
      let blocked = false;
      for (const dep of it.after) {
        const d = placed.get(dep);
        if (d === undefined) {
          ready = keys.has(dep) ? false : ready;
          if (!keys.has(dep)) blocked = true;
          continue;
        }
        if (d.stuck || d.blocked) blocked = true;
        t = Math.max(t, d.end);
      }
      if (!ready) continue;
      if (it.lane !== null && !blocked) t = Math.max(t, Math.min(...slotsOf(it.lane)));
      const b = best === undefined ? undefined : pending[best.i];
      if (best === undefined || b === undefined || t < best.t || (t === best.t && (it.order < b.order || (it.order === b.order && it.key < b.key)))) best = { i, t, blocked };
    }
    if (best === undefined) break; // the rest waits on something that never resolves
    const it = pending[best.i];
    if (it === undefined) break;
    const width = it.lane === null ? OPERATOR_WIDTH_S : it.seconds;
    const end = best.t + width * 1000;
    placed.set(it.key, { start: best.t, end, blocked: best.blocked, stuck: false });
    if (it.lane !== null && !best.blocked) take(it.lane, end);
    pending.splice(best.i, 1);
  }

  const out = new Map<string, Placed>();
  for (const it of items) {
    const p = placed.get(it.key);
    if (p === undefined) continue;
    out.set(it.key, { start: p.start, end: p.end, blocked: p.blocked, queuePos: it.lane === null || it.status === "done" ? null : queuePos(it, p, items, placed, now) });
  }
  return out;
}

/** 1 + the live items on the same lane that start no later than this one (running slots count).
 *  A stuck item, and one blocked behind it, is drawn from now but holds no slot: never ahead. */
function queuePos(it: SchedItem, p: { start: number }, items: readonly SchedItem[], placed: ReadonlyMap<string, { start: number; end: number; blocked: boolean; stuck: boolean }>, now: number): number {
  let ahead = 0;
  for (const x of items) {
    if (x.key === it.key || x.lane !== it.lane || x.status === "done") continue;
    const q = placed.get(x.key);
    if (q === undefined || q.end <= now || q.stuck || q.blocked) continue;
    if (q.start < p.start || (q.start === p.start && (x.order < it.order || (x.order === it.order && x.key < it.key)))) ahead++;
  }
  return ahead + 1;
}

/** The latest end among `placed`: when the work is done. Every caller passes only the work lines
 *  (a gate or a calendar slot is drawn 20 minutes wide, and is not work). */
export function etaOf(placed: ReadonlyMap<string, Placed>): number | null {
  let eta: number | null = null;
  for (const p of placed.values()) eta = eta === null ? p.end : Math.max(eta, p.end);
  return eta;
}
