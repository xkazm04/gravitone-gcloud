import { randomUUID } from "node:crypto";
import { AppError, isAppError, type Result } from "@gt/domain/errors";
import type { EventData } from "@gt/domain/event";
import type { Holder } from "@gt/domain/job";
import { append } from "@gt/kernel/events";
import { actorOf, claimIn, heartbeatIn, releaseIn, snapshotOf } from "@gt/kernel/lease";
import { fenceLoss, type Alive } from "@gt/kernel/lease-core";
import type { Store, Tx } from "@gt/kernel/store";
import { timerResource, timerStatusIn, timerTtlS, type Gap, type TimerName, type TimerSpec } from "@gt/producers/publish/timers";

import { delayAfter, FRESH, gapOf, settle, type Outcome, type TickEnd, type TimerState, type Transition } from "./timers-core.ts";

// THE TIMER ROSTER - the worker's one supervisor for recurring work (background-jobs:
// loop-supervision). v1 had no recurring work in-process at all (publish `tick` was a CLI verb
// someone had to type); the worker's busy-spin of 2026-10-16 (workers/worker.ts) is the warning
// about adding a timer by hand inside the job loop, so this is its own door: a closed set of
// named timers (@gt/producers/publish/timers), each registered with a cadence, a deadline and a
// staggered first firing, all driven, isolated, recorded and stopped here.
//
//   OWNERSHIP   each timer is a kernel lease on `timer:<name>`, claimed before its first tick and
//               heartbeated every tick: two workers on one store run each timer once, a second
//               worker stands down (`skipped`, naming the holder), and a dead worker's timer is
//               taken over with the kernel's `lease.reclaimed` event naming it. The heartbeat IS
//               the timer's persisted pulse, which the Runs calendar row reads (timerStatusIn).
//   THE GAP     on taking the lease the roster reads the timer's own last beat - the stale
//               holder's heartbeat after a crash, the release's instant after a clean stop - and a
//               silence past two cadences is a `timer.gap` event, handed to the first tick
//               (scheduling: missed-run-semantics; the publish tick marks what it cost).
//   ISOLATION   a throw is `crashed`, an error `failed`, a deadline `timed-out` (the tick is told to
//               stop and abandoned: everything it writes is fenced, so a late write is refused, not
//               corrupting), a tick still running when it is due again is `skipped` - and none of
//               it stops this timer or any other (./timers-core.ts settle, backoff, quarantine).
//   STOP        single-use: `stop()` closes the door, aborts in-flight ticks, waits a bounded grace,
//               names what it abandoned and releases the leases. A stopped roster never starts
//               again, so no callback of an old generation can find the door open behind it.

export type Worked = {
  /** How much the tick did, and of what: "2 due slots published" (count-carries-predicate). */
  readonly count: number;
  readonly what: string;
  /** Wake sooner: the next due item's distance in ms (adaptive cadence). */
  readonly wakeInMs?: number;
  /** Detail for the run's line (never an event). */
  readonly detail?: EventData;
};

export type TickContext = {
  readonly now: Date;
  readonly signal: AbortSignal;
  /** Keep the timer's lease alive through a long tick; throws once it is lost. */
  readonly beat: () => Promise<void>;
  readonly gap?: Gap;
};

export type TimerEntry = { readonly spec: TimerSpec; readonly tick: (ctx: TickContext) => Promise<Result<Worked>> };

export type TimerLine = TickEnd & { readonly timer: string; readonly holder?: Holder; readonly gap?: Gap; readonly detail?: EventData };

export type RosterIo = {
  readonly store: Store;
  readonly holder: Holder;
  readonly alive: Alive;
  readonly clock: () => Date;
  readonly say: (line: TimerLine) => void;
};

export type Roster = {
  /** Arm every timer; each fires after its first delay, then on its own cadence. */
  start(): void;
  /** Run every timer once, now, in roster order (`--once`). */
  once(): Promise<TimerLine[]>;
  /** Close, abort, wait at most `graceMs`, release; resolves to the timers it abandoned. */
  stop(graceMs: number): Promise<string[]>;
  state(name: string): TimerState | undefined;
};

type Own = { readonly kind: "mine"; readonly fence: number; readonly gap?: Gap; readonly seeded?: boolean } | { readonly kind: "held"; readonly holder?: Holder };

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

function lastReleaseAt(t: Tx, resource: string): string | undefined {
  const at = t.get("SELECT at FROM events WHERE subject_id = ? AND type = 'lease.released' ORDER BY seq DESC LIMIT 1", resource)?.["at"];
  return typeof at === "string" ? at : undefined;
}

export function timerRoster(entries: readonly TimerEntry[], io: RosterIo): Roster {
  const by = actorOf(io.holder);
  const ac = new AbortController();
  const states = new Map<string, TimerState>(entries.map((e) => [e.spec.name, FRESH]));
  const fences = new Map<TimerName, number>();
  const handles = new Map<string, ReturnType<typeof setTimeout>>();
  const inFlight = new Map<string, Promise<TickEnd>>();
  const standing = new Map<string, string>();
  let closed = false;
  let started = false;

  const event = (spec: TimerSpec, type: string, data: EventData): void => {
    const r = io.store.tx((t) => void append(t, { actor: by, type, subject: { kind: "lease", id: timerResource(spec.name) }, data: { timer: spec.name, ...data } }));
    if (!r.ok) io.say({ timer: spec.name, outcome: "failed", at: io.clock().toISOString(), ms: 0, error: `the ${type} event was not written: ${r.error.message}` });
  };

  /** Heartbeat the lease this roster holds, or take it - reading the timer's last beat first. */
  const own = (spec: TimerSpec): Result<Own> =>
    io.store.tx((t): Own => {
      // A stopped roster takes nothing: an abandoned tick's beat must not re-claim behind the stop.
      if (closed) return { kind: "held" };
      const resource = timerResource(spec.name);
      const mine = fences.get(spec.name);
      const snap = snapshotOf(t, resource);
      if (mine !== undefined && fenceLoss(snap.row, mine, Date.parse(t.at)) === undefined) {
        heartbeatIn(t, resource, mine);
        return { kind: "mine", fence: mine };
      }
      fences.delete(spec.name);
      const lastBeat = snap.row?.held?.heartbeatAt ?? lastReleaseAt(t, resource);
      const o = claimIn(t, { resource, holder: io.holder, ticket: randomUUID(), ttlS: timerTtlS(spec), wait: false }, io.alive);
      if (o.kind !== "granted") return { kind: "held", ...(o.holder === undefined ? {} : { holder: o.holder }) };
      fences.set(spec.name, o.lease.fence);
      const gap = gapOf(lastBeat, t.at, spec.everyMs);
      if (gap !== undefined) {
        const gapS = Math.round((Date.parse(gap.to) - Date.parse(gap.from)) / 1000);
        append(t, { actor: by, type: "timer.gap", subject: { kind: "lease", id: resource }, data: { timer: spec.name, from: gap.from, to: gap.to, gapS, everyS: spec.everyMs / 1000 } });
      }
      // A failure the store still shows standing (written before a restart) is this run's to clear.
      const seeded = timerStatusIn(t, spec, io.holder, io.alive).failing !== null;
      return { kind: "mine", fence: o.lease.fence, ...(gap === undefined ? {} : { gap }), ...(seeded ? { seeded } : {}) };
    });

  const record = (spec: TimerSpec, t: Transition): void => {
    if (t.kind === "fail") event(spec, "timer.fail", { outcome: t.outcome, error: t.error });
    else if (t.kind === "recover") event(spec, "timer.recover", { after: t.after, error: t.error });
    else event(spec, "timer.quarantine", { failing: t.failing, error: t.error });
  };

  async function runTick(entry: TimerEntry): Promise<TimerLine> {
    const { spec } = entry;
    const started0 = io.clock();
    const end = (outcome: Outcome, extra: Partial<TickEnd> = {}): TickEnd => ({ outcome, at: started0.toISOString(), ms: io.clock().getTime() - started0.getTime(), ...extra });
    if (inFlight.has(spec.name)) return { timer: spec.name, ...end("skipped", { error: "the previous tick is still running" }) };
    const owned = own(spec);
    if (!owned.ok) return { timer: spec.name, ...end("failed", { error: `the timer's lease could not be read: ${owned.error.message}` }) };
    if (owned.value.kind === "held") {
      const h = owned.value.holder;
      return { timer: spec.name, ...end("skipped", { error: h === undefined ? "another runner holds this timer" : `held by ${h.host}/${h.pid}` }), ...(h === undefined ? {} : { holder: h }) };
    }
    const { gap, seeded } = owned.value;
    if (seeded === true && (states.get(spec.name)?.failing ?? 0) === 0) states.set(spec.name, { ...(states.get(spec.name) ?? FRESH), failing: 1, firstError: "standing before this run" });
    const tickAc = new AbortController();
    const stopTick = (): void => tickAc.abort();
    ac.signal.addEventListener("abort", stopTick, { once: true });
    const beat = async (): Promise<void> => {
      const b = own(spec);
      if (!b.ok) throw b.error;
      if (b.value.kind !== "mine") throw new AppError("conflict", `the ${spec.name} timer was taken over`);
    };
    let detail: EventData | undefined;
    const body = (async (): Promise<TickEnd> => {
      try {
        const r = await entry.tick({ now: started0, signal: tickAc.signal, beat, ...(gap === undefined ? {} : { gap }) });
        if (!r.ok) return end("failed", { error: r.error.message });
        detail = r.value.detail;
        const wake = r.value.wakeInMs === undefined ? {} : { wakeInMs: r.value.wakeInMs };
        return end(r.value.count > 0 ? "succeeded" : "succeeded-empty", { what: `${r.value.count} ${r.value.what}`, ...wake });
      } catch (e) {
        return end("crashed", { error: isAppError(e) ? `${e.code}: ${e.message}` : messageOf(e) });
      }
    })();
    inFlight.set(spec.name, body);
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<TickEnd>((resolve) => {
      deadline = setTimeout(() => {
        tickAc.abort();
        resolve(end("timed-out", { error: `no answer in ${Math.round(spec.deadlineMs / 1000)} s; abandoned (its writes are fenced)` }));
      }, spec.deadlineMs);
    });
    const ended = await Promise.race([body, timedOut]);
    clearTimeout(deadline);
    ac.signal.removeEventListener("abort", stopTick);
    // An abandoned tick stays in flight until it settles: the next firing skips rather than stacks.
    if (ended.outcome === "timed-out") void body.finally(() => inFlight.delete(spec.name));
    else inFlight.delete(spec.name);
    const s = settle(states.get(spec.name) ?? FRESH, ended);
    states.set(spec.name, s.state);
    if (s.transition !== undefined) record(spec, s.transition);
    return { timer: spec.name, ...ended, ...(gap === undefined ? {} : { gap }), ...(detail === undefined ? {} : { detail }) };
  }

  const arm = (entry: TimerEntry, ms: number): void => {
    if (closed) return;
    handles.set(
      entry.spec.name,
      setTimeout(() => {
        handles.delete(entry.spec.name);
        void fire(entry);
      }, ms),
    );
  };

  async function fire(entry: TimerEntry): Promise<void> {
    if (closed) return;
    const line = await runTick(entry);
    // A quiet tick (found nothing) and a skip (another runner holds the timer) are said once per
    // change, not every cadence: thirty-second silence is not news, its start and end are.
    const key = `${line.outcome}:${line.error ?? ""}`;
    const quiet = line.outcome === "skipped" || line.outcome === "succeeded-empty";
    if (!quiet || standing.get(entry.spec.name) !== key) io.say(line);
    standing.set(entry.spec.name, key);
    const next = delayAfter(states.get(entry.spec.name) ?? FRESH, entry.spec.everyMs);
    if (next !== undefined) arm(entry, next);
  }

  return {
    start() {
      if (started || closed) throw new AppError("refused", "a timer roster starts once; make a new one");
      started = true;
      for (const e of entries) arm(e, e.spec.firstDelayMs);
    },
    async once() {
      const lines: TimerLine[] = [];
      for (const e of entries) {
        if (closed) break;
        const line = await runTick(e);
        io.say(line);
        lines.push(line);
      }
      return lines;
    },
    async stop(graceMs) {
      closed = true;
      for (const h of handles.values()) clearTimeout(h);
      handles.clear();
      ac.abort();
      const pending = [...inFlight.entries()];
      let grace: ReturnType<typeof setTimeout> | undefined;
      const late = await Promise.race([
        Promise.all(pending.map(([, p]) => p)).then(() => [] as string[]),
        new Promise<string[]>((resolve) => (grace = setTimeout(() => resolve(pending.filter(([n]) => inFlight.has(n)).map(([n]) => n)), graceMs))),
      ]);
      clearTimeout(grace);
      for (const [name, fence] of fences) {
        const r = io.store.tx((t) => releaseIn(t, timerResource(name), fence));
        if (!r.ok) io.say({ timer: name, outcome: "failed", at: io.clock().toISOString(), ms: 0, error: `the timer's lease was not released: ${r.error.message}` });
      }
      fences.clear();
      return late;
    },
    state: (name) => states.get(name),
  };
}
