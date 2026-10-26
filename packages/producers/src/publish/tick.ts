import { err, ok, type Result } from "@gt/domain/errors";
import type { EventData } from "@gt/domain/event";
import type { Slot } from "@gt/domain/slot";
import { actorOf } from "@gt/kernel/lease";
import { listSlotsIn } from "@gt/kernel/slots/read";
import { sweep, type ClaimedSlot } from "@gt/kernel/slots/sweep";
import type { SweepFacts } from "@gt/kernel/slots/sweep-core";
import { publishNow } from "@gt/kernel/slots/write";
import type { Gap } from "./timers.ts";
import { abandonClaimed, publishClaimed, type PublishDeps, type PublishOutcome } from "./publish.ts";

// THE TICK - v1 publisher.ts `tick(now)`: sweep with claims, then publish what was claimed,
// sequentially, never throwing for a slot's failure (that lands on the slot). Run by the
// worker's `publish-tick` timer (workers/timers.ts) and by `pipeline/publish.mts tick`, the
// same function, so the CLI and the worker cannot disagree about what a tick is.
//
// THE DOWNTIME GAP (scheduling: missed-run-semantics, "record what was decided"). v1's sweep
// marked a slot missed with the instant it noticed and nothing else, so "why didn't my 18:00
// upload go out?" had no answer but inference. The timer hands this tick the gap it measured
// from its own last heartbeat; a slot this sweep marks missed whose time fell inside that gap
// (due after the last tick the worker ran) was missed BECAUSE nothing was awake, and its
// history says so: the kernel's own `slot.miss` carries `downtime: {from, to}`, the gap's two
// ends, in the same commit as the miss (the sweep's `missData`). Wave B wrote a second event,
// `slot.miss-downtime`, in a transaction of its own after the sweep's - a crash between the two
// left a miss that never said why; one event cannot be half-written.

export type TickDeps = PublishDeps & {
  /** The sweep's facts at `now` (epoch ms): the window, the wired channels, which items exist. */
  readonly facts: (now: number) => Promise<Result<SweepFacts>>;
};

export type TickOptions = {
  readonly gap?: Gap;
  /** The timer's own heartbeat, carried through long uploads. */
  readonly beat?: () => Promise<void>;
  /** A stop: the claims not yet started are failed in words (./publish.ts STOPPED_TEXT). */
  readonly signal?: AbortSignal;
  /** Claim only these (the CLI's `publish <slotId>`); the rest is still swept. */
  readonly only?: ReadonlySet<string>;
};

export type TickReport = {
  readonly missed: readonly string[];
  readonly interrupted: readonly string[];
  readonly drifted: readonly string[];
  readonly cleared: readonly string[];
  readonly outcomes: readonly PublishOutcome[];
  /** The slots this sweep missed inside the gap, when a gap was handed in. */
  readonly downtime?: Gap & { readonly missed: readonly string[] };
  /** The earliest slot still waiting after this tick: when the next one is due (adaptive cadence). */
  readonly next?: string;
};

/** The sweep's `missData` for a gap: a slot due inside it was missed because nothing was awake. */
function downtimeOf(gap: Gap, hit: string[]): (slot: Slot) => EventData | undefined {
  const from = Date.parse(gap.from);
  return (slot) => {
    if (!(Date.parse(slot.at) > from)) return undefined;
    hit.push(slot.id);
    return { downtime: { from: gap.from, to: gap.to } };
  };
}

/** One tick at `now`. An error is the sweep's (the store, the facts); a slot's failure is an outcome. */
export async function publishTick(deps: TickDeps, now: Date, opts: TickOptions = {}): Promise<Result<TickReport>> {
  const facts = await deps.facts(now.getTime());
  if (!facts.ok) return facts;
  const hit: string[] = [];
  const swept = sweep(deps.store, facts.value, {
    claim: true,
    holder: deps.holder,
    ...(deps.alive === undefined ? {} : { alive: deps.alive }),
    ...(opts.only === undefined ? {} : { only: opts.only }),
    ...(opts.gap === undefined ? {} : { missData: downtimeOf(opts.gap, hit) }),
  });
  if (!swept.ok) return swept;
  const s = swept.value;
  const downtime: TickReport["downtime"] = opts.gap === undefined ? undefined : { ...opts.gap, missed: hit };
  const outcomes: PublishOutcome[] = [];
  const pending: ClaimedSlot[] = [...s.claimed];
  while (pending.length > 0) {
    if (opts.signal?.aborted === true) {
      outcomes.push(...abandonClaimed(deps, pending.splice(0)));
      break;
    }
    const next = pending.shift();
    if (next !== undefined) outcomes.push(await publishClaimed(deps, next, pending, opts.beat));
  }
  const upcoming = deps.store.read((r) => listSlotsIn(r, { states: ["scheduled"], from: now.toISOString(), limit: 1 })[0]?.slot.at);
  if (!upcoming.ok) return upcoming;
  const next = upcoming.value;
  return ok({ missed: s.missed, interrupted: s.interrupted, drifted: s.drifted, cleared: s.cleared, outcomes, ...(downtime === undefined ? {} : { downtime }), ...(next === undefined ? {} : { next }) });
}

/**
 * `publish <slotId>` (v1 publisher.ts publishNow): the person's act makes the slot due now -
 * overriding the missed window, refused for a drifted slot (@gt/kernel/slots/core.ts
 * planPublishNow) - and this process's sweep claims it like any other, so a publish-now can never
 * stand beside a running tick as a second claimant. Claimed by someone else first: said, not raced.
 */
export async function publishSlotNow(deps: TickDeps, slotId: string, now: Date): Promise<Result<PublishOutcome>> {
  const facts = await deps.facts(now.getTime());
  if (!facts.ok) return facts;
  const due = publishNow(deps.store, slotId, actorOf(deps.holder), { now: now.getTime(), ready: facts.value });
  if (!due.ok) return due;
  const t = await publishTick({ ...deps, facts: () => Promise.resolve(facts) }, now, { only: new Set([slotId]) });
  if (!t.ok) return t;
  const mine = t.value.outcomes.find((o) => o.slotId === slotId);
  return mine === undefined ? err("conflict", `slot ${slotId} was not claimed by this process (another claimant holds it, or it moved)`) : ok(mine);
}
