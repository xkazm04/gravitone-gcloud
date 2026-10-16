import type { ResourceLane } from "@gt/domain/lane";
import { weakest } from "@gt/domain/plan";
import type { FigureSource, ModelOption, PlanEstimate, Receipt, ReceiptLine, ReceiptMode, ReceiptSubject, ReceiptTotals } from "@gt/domain/produce";
import { canonical, sha256Hex } from "../canonical.ts";
import { etaOf, schedule, type Placed, type SchedItem } from "./schedule.ts";

// THE RECEIPT - what a launch will occupy, cost and finish at, computed STATICALLY from the plan,
// the option table and the queue as read (COMMON decision 3: never by performing a step). Pure.
//
// The prototype applied a launch the instant ⏎ was pressed (studio.js `launch`) and showed its
// consequence only afterwards on the day-line. Here the consequence comes first, and the confirm
// is pinned to it by a TOKEN: a digest of the inputs, the quotes and the queue state read - the
// Phase 3 consequence pattern (kernel/decision/consequence.ts), where a commit carries the token of
// the preview it was shown and a stale one is refused with the fresh preview. What the token
// leaves out on purpose: the clock. An ETA moves every second; a token over it would refuse every
// confirm that took longer than a blink, though nothing the operator agreed to had changed.

/** One plan line as the pure model sees it: a part (or a run's one job) and its status. */
export type PlanLine = {
  readonly key: string;
  readonly label: string;
  readonly lane: ResourceLane | null;
  readonly units: number;
  readonly option?: ModelOption;
  readonly after: readonly string[];
  readonly order: number;
  readonly status: SchedItem["status"];
  readonly startedAt?: number;
  readonly endedAt?: number;
};

/** A line's figures: its option's per-unit pace and price times its units. */
export function priceLine(units: number, o: ModelOption): PlanEstimate {
  const n = Math.max(1, units);
  return {
    seconds: o.secondsPerUnit * n,
    usd: o.usdPerUnit === null ? null : round2(o.usdPerUnit * n),
    ...(o.usdRangePerUnit === undefined ? {} : { usdRange: [round2(o.usdRangePerUnit[0] * n), round2(o.usdRangePerUnit[1] * n)] as const }),
    ...(o.unpricedReason === undefined ? {} : { unpricedReason: o.unpricedReason }),
    src: o.src,
  };
}

const round2 = (x: number): number => Math.round(x * 100) / 100;

const itemOf = (l: PlanLine): SchedItem => ({
  key: l.key,
  lane: l.lane,
  seconds: l.option === undefined ? 0 : priceLine(l.units, l.option).seconds,
  after: l.after,
  order: l.order,
  status: l.status,
  ...(l.startedAt === undefined ? {} : { startedAt: l.startedAt }),
  ...(l.endedAt === undefined ? {} : { endedAt: l.endedAt }),
});

export type QueueRead = {
  /** Other work on the lanes (not this plan's), as schedule items. */
  readonly others: readonly SchedItem[];
  /** Digest of that queue state - the half of the token the plan does not cover. */
  readonly digest: string;
};

/** Place a plan's lines among the other work. */
export function placePlan(lines: readonly PlanLine[], queue: QueueRead, capacity: Readonly<Record<ResourceLane, number>>, now: number): Map<string, Placed> {
  return schedule({ items: [...queue.others, ...lines.map(itemOf)], capacity, now });
}

export function totalsOf(estimates: readonly PlanEstimate[]): ReceiptTotals {
  let seconds = 0;
  let usd = 0;
  let lo = 0;
  let hi = 0;
  let unpriced = 0;
  let banded = false;
  for (const e of estimates) {
    seconds += e.seconds;
    if (e.usd === null) {
      unpriced++;
      continue;
    }
    usd += e.usd;
    if (e.usdRange !== undefined) banded = true;
    lo += e.usdRange?.[0] ?? e.usd;
    hi += e.usdRange?.[1] ?? e.usd;
  }
  const srcs: FigureSource[] = estimates.map((e) => e.src);
  return { seconds, usd: round2(usd), ...(banded ? { usdRange: [round2(lo), round2(hi)] as const } : {}), unpriced, src: weakest(srcs) };
}

export type ReceiptInput = {
  readonly subject: ReceiptSubject;
  /** The work lines (gates and slots are not jobs and are not on a receipt). */
  readonly lines: readonly PlanLine[];
  /** Every line of the plan, gates included, so dependencies resolve when placing. */
  readonly plan: readonly PlanLine[];
  readonly queue: QueueRead;
  readonly capacity: Readonly<Record<ResourceLane, number>>;
  readonly now: number;
  readonly mode: ReceiptMode;
  readonly ceilingUsd?: number;
};

/** The digest a confirm must carry back: inputs + quotes + queue state, never the clock. */
export function tokenOf(i: Pick<ReceiptInput, "subject" | "lines" | "queue" | "mode" | "ceilingUsd">): string {
  const lines = i.lines.map((l) => ({
    key: l.key,
    after: l.after,
    units: l.units,
    option: l.option === undefined ? null : { key: l.option.key, lane: l.option.lane, s: l.option.secondsPerUnit, usd: l.option.usdPerUnit, src: l.option.src },
  }));
  return sha256Hex(canonical({ subject: i.subject, lines, queue: i.queue.digest, mode: i.mode, ceilingUsd: i.ceilingUsd ?? null }));
}

const iso = (ms: number): string => new Date(ms).toISOString();

export function receiptFor(i: ReceiptInput): Receipt {
  const placed = placePlan(i.plan, i.queue, i.capacity, i.now);
  const out: ReceiptLine[] = [];
  const estimates: PlanEstimate[] = [];
  for (const l of i.lines) {
    if (l.option === undefined || l.lane === null) continue;
    const e = priceLine(l.units, l.option);
    estimates.push(e);
    const p = placed.get(l.key);
    out.push({
      key: l.key,
      label: l.label,
      lane: l.option.lane,
      provider: l.option.provider,
      model: l.option.model,
      units: l.units,
      seconds: e.seconds,
      usd: e.usd,
      ...(e.usdRange === undefined ? {} : { usdRange: e.usdRange }),
      ...(e.unpricedReason === undefined ? {} : { unpricedReason: e.unpricedReason }),
      src: e.src,
      queuePos: p?.queuePos ?? 1,
      start: iso(p?.start ?? i.now),
      end: iso(p?.end ?? i.now),
    });
  }
  const totals = totalsOf(estimates);
  const first = [...out].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.queuePos - b.queuePos))[0];
  const eta = etaOf(new Map([...placed].filter(([k]) => i.plan.some((l) => l.key === k && l.lane !== null))));
  // Fail closed against the band's top: a ceiling is a promise about the worst case.
  const exposure = totals.usdRange?.[1] ?? totals.usd;
  return {
    token: tokenOf(i),
    subject: i.subject,
    mode: i.mode,
    lines: out,
    totals,
    queuePos: first?.queuePos ?? 1,
    etaAt: iso(eta ?? i.now),
    ...(i.ceilingUsd === undefined ? {} : { ceilingUsd: i.ceilingUsd }),
    overCeiling: i.ceilingUsd !== undefined && exposure > i.ceilingUsd,
    readAt: iso(i.now),
  };
}

/**
 * What choosing `option` for line `key` does to the whole plan (prototype studio.js `preview`):
 * the ETA moves by `dEtaS`, the priced total by `dUsd`, and the line lands at `queuePos`.
 */
export function rerouteDelta(
  plan: readonly PlanLine[],
  key: string,
  option: ModelOption,
  queue: QueueRead,
  capacity: Readonly<Record<ResourceLane, number>>,
  now: number,
): { dEtaS: number; dUsd: number; queuePos: number } {
  const swapped = plan.map((l) => (l.key === key ? { ...l, option, lane: option.lane, ...(l.status === "stuck" ? { status: "pending" as const } : {}) } : l));
  const before = summary(plan, queue, capacity, now);
  const after = summary(swapped, queue, capacity, now);
  return { dEtaS: Math.round((after.eta - before.eta) / 1000), dUsd: round2(after.usd - before.usd), queuePos: after.placed.get(key)?.queuePos ?? 1 };
}

function summary(plan: readonly PlanLine[], queue: QueueRead, capacity: Readonly<Record<ResourceLane, number>>, now: number) {
  const placed = placePlan(plan, queue, capacity, now);
  const work = plan.filter((l) => l.lane !== null && l.option !== undefined);
  const eta = etaOf(new Map([...placed].filter(([k]) => work.some((l) => l.key === k)))) ?? now;
  const usd = totalsOf(work.map((l) => (l.option === undefined ? { seconds: 0, usd: 0, src: "real" as const } : priceLine(l.units, l.option)))).usd;
  return { placed, eta, usd };
}
