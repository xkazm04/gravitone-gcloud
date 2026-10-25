// THE FIXTURE'S CLOCK AND ARITHMETIC - pure: where every job lands on its lane, and what a
// receipt says. Time is a parameter (`now`), the digest is a parameter, nothing here reads a
// store or the wall clock, so the fixture's rules are the same on every call.
//
// Absorbed from the prototype's list scheduler (docs/next/prototype/app/studio.js `schedule`,
// `queuePos`, `previewLaunch`): history keeps its recorded clock, running work holds a lane slot
// until it ends, and the rest is placed forward from NOW - repeatedly the earliest-ready item in
// queue order - onto the first free slot of its lane, never before what it waits for. Kept: a
// failed or paused upstream draws its dependents as BLOCKED rather than scheduling them as if
// nothing were wrong. Upgraded: lane capacity is the domain's table (`LANE_CAPACITY`, not the
// prototype's UI literal), and a lane on HOLD (COMMON decision 6) claims no slot - its waiting
// work is drawn from NOW, held, instead of starting on a lane nothing may claim.
//
// The real scheduler is L26's (kernel records); this is the fixture side's stand-in, built to the
// same contract (@gt/domain/produce), so the screens are proven against the shapes they will read.

import type { ResourceLane } from "@gt/domain/lane";
import { weakest } from "@gt/domain/plan";
import { crossesCeiling, type ModelOption, type Receipt, type ReceiptLine, type ReceiptMode, type ReceiptSubject } from "@gt/domain/produce";

const MIN = 60_000;
/** How wide an operator act is drawn: a verdict 20 min, a slot 10 (studio.js `schedule`). */
export const GATE_MS = 20 * MIN;
export const SLOT_MS = 10 * MIN;

export type Phase = "done" | "failed" | "running" | "paused" | "waiting" | "gate-open" | "gate-done" | "slot";

export type Item = {
  readonly key: string;
  /** null for an operator act (a gate, a slot): it holds no resource. */
  readonly lane: ResourceLane | null;
  readonly seconds: number;
  readonly after: readonly string[];
  readonly phase: Phase;
  readonly order: number;
  readonly startedAt?: number;
  readonly endedAt?: number;
};

export type Placed = {
  readonly s: number;
  readonly e: number;
  readonly queuePos: number | null;
  /** An upstream is failed or paused: this waits on the operator, not on the queue. */
  readonly blocked: boolean;
  /** Its lane is on hold: it is drawn from NOW and claims no slot. */
  readonly held: boolean;
};

type Mut = { s: number; e: number; blocked: boolean; held: boolean };

const STUCK: ReadonlySet<Phase> = new Set<Phase>(["failed", "paused"]);

/**
 * Every item's place. `capacity` is slots per lane; `held` the lanes on hold. Items whose
 * dependencies never resolve (a cycle, a missing key) are left out rather than guessed.
 */
export function schedule(items: readonly Item[], now: number, capacity: Readonly<Record<ResourceLane, number>>, held: ReadonlySet<ResourceLane>): Map<string, Placed> {
  const free = new Map<ResourceLane, number[]>();
  const slots = (l: ResourceLane): number[] => {
    let f = free.get(l);
    if (f === undefined) {
      f = Array.from({ length: capacity[l] }, () => now);
      free.set(l, f);
    }
    return f;
  };
  const claim = (l: ResourceLane, until: number): void => {
    const f = slots(l);
    const i = f.indexOf(Math.min(...f));
    f[i] = Math.max(f[i] ?? now, until);
  };
  const out = new Map<string, Mut>();
  const byKey = new Map(items.map((i) => [i.key, i]));
  for (const it of items) {
    const s = it.startedAt ?? now - it.seconds * 1000;
    if (it.phase === "done" || it.phase === "gate-done") out.set(it.key, { s, e: it.endedAt ?? s + (it.lane === null ? GATE_MS : it.seconds * 1000), blocked: false, held: false });
    else if (it.phase === "failed") out.set(it.key, { s, e: it.endedAt ?? s + Math.max(6 * MIN, it.seconds * 200), blocked: false, held: false });
    else if (it.phase === "running") {
      const e = Math.max(s + it.seconds * 1000, now + 3 * MIN);
      out.set(it.key, { s, e, blocked: false, held: false });
      if (it.lane !== null) claim(it.lane, e);
    } else if (it.phase === "paused") out.set(it.key, { s: now, e: now + Math.max(10 * MIN, it.seconds * 1000), blocked: false, held: false });
  }
  // A gate opens when the part it judges ends; it waits on the operator from then until NOW.
  for (const it of items) {
    if (it.phase !== "gate-open") continue;
    const ends = it.after.map((k) => out.get(k)?.e ?? now);
    const s = ends.length === 0 ? now : Math.max(...ends);
    out.set(it.key, { s, e: Math.max(now, s) + GATE_MS, blocked: false, held: false });
  }
  const pending = items.filter((i) => !out.has(i.key));
  for (let guard = 0; pending.length > 0 && guard < 4000; guard++) {
    let best: { item: Item; t: number; blocked: boolean; held: boolean } | null = null;
    for (const it of pending) {
      let t = now;
      let ready = true;
      let blocked = false;
      for (const k of it.after) {
        const d = out.get(k);
        if (d === undefined) {
          ready = byKey.has(k) ? false : ready;
          continue;
        }
        const up = byKey.get(k);
        if ((up !== undefined && STUCK.has(up.phase)) || d.blocked) {
          blocked = true;
          t = Math.max(t, now + (up?.seconds ?? 0) * 1000);
        } else t = Math.max(t, d.e);
      }
      if (!ready) continue;
      const isHeld = it.lane !== null && held.has(it.lane);
      if (it.lane !== null && !blocked && !isHeld) t = Math.max(t, Math.min(...slots(it.lane)));
      if (best === null || t + it.order * 1e-3 < best.t + best.item.order * 1e-3) best = { item: it, t, blocked, held: isHeld };
    }
    if (best === null) break;
    const { item, t } = best;
    const e = item.lane === null ? t + (item.phase === "slot" ? SLOT_MS : GATE_MS) : t + item.seconds * 1000;
    out.set(item.key, { s: t, e, blocked: best.blocked, held: best.held });
    if (item.lane !== null && !best.blocked && !best.held) claim(item.lane, e);
    pending.splice(pending.indexOf(item), 1);
  }
  const placed = new Map<string, Placed>();
  for (const [k, p] of out) {
    const it = byKey.get(k);
    placed.set(k, { ...p, queuePos: it === undefined ? null : queuePos(it, p, items, out, now) });
  }
  return placed;
}

/** 1-based place on its lane: every unfinished item there that started no later counts ahead (studio.js `queuePos`). */
function queuePos(it: Item, p: Mut, items: readonly Item[], out: ReadonlyMap<string, Mut>, now: number): number | null {
  if (it.lane === null || it.phase === "done") return null;
  let ahead = 0;
  for (const x of items) {
    if (x === it || x.lane !== it.lane || x.phase === "done" || x.phase === "failed") continue;
    const q = out.get(x.key);
    if (q !== undefined && q.e > now && q.s <= p.s) ahead++;
  }
  return ahead + 1;
}

/* ── the receipt ──────────────────────────────────────────────────────────── */

export type LineSpec = { readonly key: string; readonly label: string; readonly option: ModelOption; readonly units: number };

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function lineOf(spec: LineSpec, placed: Placed | undefined, now: number): ReceiptLine {
  const o = spec.option;
  const units = Math.max(1, spec.units);
  const seconds = o.secondsPerUnit * units;
  const s = placed?.s ?? now;
  return {
    key: spec.key,
    label: spec.label,
    lane: o.lane,
    provider: o.provider,
    model: o.model,
    units: spec.units,
    seconds,
    usd: o.usdPerUnit === null ? null : round2(o.usdPerUnit * units),
    ...(o.usdRangePerUnit === undefined ? {} : { usdRange: [o.usdRangePerUnit[0] * units, o.usdRangePerUnit[1] * units] as const }),
    ...(o.unpricedReason === undefined ? {} : { unpricedReason: o.unpricedReason }),
    src: o.src,
    queuePos: placed?.queuePos ?? 1,
    start: new Date(s).toISOString(),
    end: new Date(placed?.e ?? s + seconds * 1000).toISOString(),
  };
}

export type ReceiptInput = {
  readonly subject: ReceiptSubject;
  readonly lines: readonly ReceiptLine[];
  readonly mode: ReceiptMode;
  readonly token: string;
  readonly now: number;
  readonly ceilingUsd?: number;
};

/** The totals and the verdict against the ceiling. A band's top end is what a ceiling holds. */
export function receiptOf(r: ReceiptInput): Receipt {
  let usd = 0;
  let lo = 0;
  let hi = 0;
  let banded = false;
  let unpriced = 0;
  let seconds = 0;
  let eta = r.now;
  for (const l of r.lines) {
    seconds += l.seconds;
    eta = Math.max(eta, Date.parse(l.end));
    if (l.usd === null) {
      unpriced++;
      continue;
    }
    usd += l.usd;
    if (l.usdRange !== undefined) {
      banded = true;
      lo += l.usdRange[0];
      hi += l.usdRange[1];
    } else {
      lo += l.usd;
      hi += l.usd;
    }
  }
  const top = banded ? hi : usd;
  return {
    token: r.token,
    subject: r.subject,
    mode: r.mode,
    lines: r.lines,
    totals: { seconds, usd: round2(usd), ...(banded ? { usdRange: [round2(lo), round2(hi)] as const } : {}), unpriced, src: weakest(r.lines.map((l) => l.src)) },
    queuePos: r.lines[0]?.queuePos ?? 1,
    etaAt: new Date(eta).toISOString(),
    ...(r.ceilingUsd === undefined ? {} : { ceilingUsd: r.ceilingUsd }),
    overCeiling: crossesCeiling(top, r.ceilingUsd),
    readAt: new Date(r.now).toISOString(),
  };
}
