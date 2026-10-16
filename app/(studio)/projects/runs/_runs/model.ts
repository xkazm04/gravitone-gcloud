// WHAT RUNS SHOWS - pure: v1's live work, the kernel's own jobs and the ledger's recent past,
// placed in time on the resource they hold (Phase 2, lot 18).
//
// Three readings, one shape. The page's loader (./load.ts) reads; this decides, with the
// clock as a parameter, so the probe (tests/golden-path/runs-live.probe.spec.ts) can hand it
// the same live read the CLI prints and check that nothing v1 calls live goes missing here.
//
//   live    lib/ledger/v1 `liveNow()`: every source's in-flight work, Weir piles, unsettled
//           Calendar slots and open spend holds, read at render time and written nowhere
//           (COMMON decision 4). A source that could not be read is a FAILURE in the model,
//           drawn as a gap with its own words - never as "nothing running".
//   kernel  @gt/kernel/job `list()`: empty until Phase 4 producers enqueue, merged here now so
//           Phase 4 needs no new path (a kernel job wins over nothing; it never shares an id
//           with a v1 record, whose key carries its source).
//   ledger  run.start/run.end pairs and commits inside the window: the day-line's past. A run
//           still live is drawn from `live`, not twice.
//
// TIME IS NEVER INVENTED. A bar needs two ends:
//   - a running job has its recorded start and NOW, and its end is OPEN (it grows with the
//     page) - v1 records no ETA, so none is drawn;
//   - a job with no recorded start (queued, never stamped) sits at NOW, `approx`, at the
//     packer's minimum width - where it is in time is "now, waiting", and the ≈ says so;
//   - an ended run's ends are the ledger's `occurredAt`, ≈ when either is `derived`;
//   - a run.end whose start the window does not hold is not a bar (half a bar would draw a
//     duration nobody recorded), and a ledger run with no `lane` on either event is counted
//     as UNPLACED, not drawn on a guessed row.
// DEPENDENCIES are drawn only where v1 recorded them. LiveJob carries none today; a source
// that records order (`after`) or a project (`projectId`) lights a thread the day it says so.

import type { Event } from "@gt/domain/event";
import type { JobState } from "@gt/domain/job.machine";
import { RESOURCE_LANES, type MediaLane, type ResourceLane } from "@gt/domain/lane";

import type { LiveHold, LiveJob, LiveSlot, WeirItem } from "../../../../../lib/ledger/v1/types.ts";
import type { ProduceJob } from "../../_port/contract.ts";

/** Days of past and future the day-line spans around NOW. */
export const PAST_MS = 4.5 * 86_400_000;
export const FUTURE_MS = 2.5 * 86_400_000;

/** A live job as Runs reads it: LiveJob, plus the two facts a source may record for the thread. */
export type LiveInput = LiveJob & { readonly projectId?: string; readonly after?: readonly string[] };

export type LiveReadInput = {
  readonly jobs: readonly LiveInput[];
  readonly weir: readonly WeirItem[];
  readonly slots: readonly LiveSlot[];
  readonly holds: readonly LiveHold[];
  readonly failures: readonly { readonly source: string; readonly error: string }[];
};

/** A kernel job, in the fields Runs draws (the loader maps @gt/domain Job onto this). */
export type KernelJobInput = {
  readonly id: string;
  readonly title: string;
  readonly lane: ResourceLane;
  readonly state: JobState;
  readonly startedAt?: string;
  readonly progress: { readonly done: number; readonly total: number; readonly stage?: string };
  readonly attempt: number;
  readonly error?: string;
};

export type RunsInput = {
  readonly now: number;
  readonly live: LiveReadInput;
  readonly kernel: readonly KernelJobInput[];
  readonly ledger: readonly Event[];
  /** The produce port's jobs (Phase 4): kernel jobs with their schedule and their acts. */
  readonly produce?: readonly ProduceJob[];
};

export type RunJob = {
  /** `<source>:<record id>` - unique across sources, and the `?job=` value. */
  readonly key: string;
  readonly source: string;
  readonly id: string;
  readonly title: string;
  readonly lane: ResourceLane;
  readonly laneFrom?: string;
  readonly media?: MediaLane;
  readonly state: JobState;
  readonly s: number;
  readonly e: number;
  /** The end is NOW and moves with it. */
  readonly open: boolean;
  /** A time on this bar is derived, not recorded: drawn ≈. */
  readonly approx: boolean;
  readonly progress?: { readonly done: number; readonly total: number; readonly stage?: string };
  readonly attempt?: number;
  readonly error?: string;
  readonly href: string;
  readonly projectId?: string;
  /** Keys of the jobs this one waits for, as v1 recorded them. */
  readonly after: readonly string[];
  readonly from: "live" | "kernel" | "ledger";
  /** The port's view of a produce job: what the inspector's acts read (route, queue, cost). */
  readonly act?: ProduceJob;
};

/** A pile on the Weir now (from `live`), or a pile committed inside the window (from the ledger). */
export type RunWeir = {
  readonly key: string;
  readonly source: string;
  readonly id: string;
  readonly title: string;
  readonly at: number;
  readonly approx: boolean;
  readonly done: boolean;
  readonly href: string;
  readonly kind?: WeirItem["kind"];
  readonly media?: MediaLane;
  readonly decided?: number;
  readonly pending?: number;
};
export type RunPin = LiveSlot & { readonly key: string; readonly at: number };

export type RunsModel = {
  readonly now: number;
  readonly span: { readonly from: number; readonly to: number };
  readonly jobs: readonly RunJob[];
  readonly weir: readonly RunWeir[];
  readonly pins: readonly RunPin[];
  readonly holds: readonly LiveHold[];
  readonly failures: readonly { readonly source: string; readonly error: string }[];
  /** Ledger runs in the window with no lane on record: counted, not drawn. */
  readonly unplaced: number;
};

const keyOf = (source: string, id: string): string => `${source}:${id}`;
const ms = (iso: string | undefined): number | null => {
  if (iso === undefined) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};
const isLane = (v: unknown): v is ResourceLane => RESOURCE_LANES.some((l) => l === v);
const sourceOf = (e: Event): string => (e.key ?? "").split(":")[0] ?? "";
const runIdOf = (e: Event): string => {
  const v = e.data["runId"];
  return typeof v === "string" ? v : e.subject.id;
};
const timeOf = (e: Event): number => Date.parse(e.occurredAt ?? e.at);

function fromLive(j: LiveInput, now: number): RunJob {
  const start = ms(j.startedAt);
  const ends = j.state === "running" || j.state === "interrupted" || j.state === "paused";
  return {
    key: keyOf(j.source, j.id),
    source: j.source,
    id: j.id,
    title: j.title,
    lane: j.lane,
    ...(j.laneFrom === undefined ? {} : { laneFrom: j.laneFrom }),
    media: j.media,
    state: j.state,
    s: start ?? now,
    e: ends ? Math.max(now, start ?? now) : (start ?? now),
    open: ends,
    approx: start === null,
    ...(j.progress === undefined ? {} : { progress: j.progress }),
    ...(j.attempt === undefined ? {} : { attempt: j.attempt }),
    ...(j.error === undefined ? {} : { error: j.error }),
    href: j.href,
    ...(j.projectId === undefined ? {} : { projectId: j.projectId }),
    after: (j.after ?? []).map((id) => (id.includes(":") ? id : keyOf(j.source, id))),
    from: "live",
  };
}

function fromKernel(j: KernelJobInput, now: number): RunJob {
  const start = ms(j.startedAt);
  const running = j.state === "running";
  return {
    key: keyOf("kernel", j.id),
    source: "kernel",
    id: j.id,
    title: j.title,
    lane: j.lane,
    state: j.state,
    s: start ?? now,
    e: running ? now : (start ?? now),
    open: running,
    approx: start === null,
    progress: j.progress,
    attempt: j.attempt,
    ...(j.error === undefined ? {} : { error: j.error }),
    href: `/ledger?q=${encodeURIComponent(j.id)}`,
    after: [],
    from: "kernel",
  };
}

/**
 * A produce job (Phase 4): a kernel job with a SCHEDULE, so a queued one is drawn where the
 * queue places it rather than at NOW. A placed time that is not a recorded one is ≈ (approx).
 */
function fromProduce(j: ProduceJob): RunJob {
  const recorded = j.state === "running" || j.state === "done" || j.state === "failed" || j.state === "interrupted";
  return {
    key: keyOf("kernel", j.id),
    source: "kernel",
    id: j.id,
    title: j.title,
    lane: j.lane,
    ...(j.media === undefined ? {} : { media: j.media }),
    state: j.state,
    s: j.s,
    e: j.e,
    open: j.state === "running",
    approx: !recorded,
    attempt: j.attempt,
    ...(j.error === undefined ? {} : { error: j.error }),
    href: `/ledger?q=${encodeURIComponent(j.id)}`,
    ...(j.projectId === undefined ? {} : { projectId: j.projectId }),
    after: j.after.map((a) => keyOf("kernel", a)),
    from: "kernel",
    act: j,
  };
}

/** The ledger's ended runs and commits in the window, minus what is live now. */
function fromLedger(events: readonly Event[], live: ReadonlySet<string>, span: RunsModel["span"]): { jobs: RunJob[]; weir: RunWeir[]; unplaced: number } {
  const starts = new Map<string, Event>();
  const ends = new Map<string, Event>();
  const weir: RunWeir[] = [];
  for (const e of events) {
    const k = keyOf(sourceOf(e), runIdOf(e));
    if (e.type === "run.start") starts.set(k, e);
    else if (e.type === "run.end") ends.set(k, e);
    else if (e.type === "commit" && timeOf(e) >= span.from) {
      const at = timeOf(e);
      weir.push({ key: `${k}#commit`, source: sourceOf(e), id: runIdOf(e), title: `${sourceOf(e)} ${runIdOf(e)}`, href: `/ledger?q=${encodeURIComponent(runIdOf(e))}`, at, approx: e.atSrc === "derived", done: true });
    }
  }
  const jobs: RunJob[] = [];
  let unplaced = 0;
  for (const [k, end] of ends) {
    const start = starts.get(k);
    if (start === undefined || live.has(k)) continue;
    const e = timeOf(end);
    if (e < span.from) continue;
    const lane = isLane(end.lane) ? end.lane : isLane(start.lane) ? start.lane : null;
    if (lane === null) {
      unplaced++;
      continue;
    }
    const error = end.data["error"];
    jobs.push({
      key: k,
      source: sourceOf(end),
      id: runIdOf(end),
      title: `${sourceOf(end)} ${runIdOf(end)}`,
      lane,
      state: typeof error === "string" ? "failed" : "done",
      s: timeOf(start),
      e,
      open: false,
      approx: start.atSrc === "derived" || end.atSrc === "derived",
      ...(typeof error === "string" ? { error } : {}),
      href: `/ledger?q=${encodeURIComponent(runIdOf(end))}`,
      after: [],
      from: "ledger",
    });
  }
  return { jobs, weir, unplaced };
}

export function spanAround(now: number): RunsModel["span"] {
  const hour = 3_600_000;
  return { from: Math.floor((now - PAST_MS) / hour) * hour, to: Math.ceil((now + FUTURE_MS) / hour) * hour };
}

export function buildRuns(input: RunsInput): RunsModel {
  const { now } = input;
  const span = spanAround(now);
  const live = input.live.jobs.map((j) => fromLive(j, now));
  const produced = (input.produce ?? []).map(fromProduce);
  const owned = new Set(produced.map((j) => j.id));
  const kernel = [...produced, ...input.kernel.filter((j) => !owned.has(j.id)).map((j) => fromKernel(j, now))];
  const past = fromLedger(input.ledger, new Set(live.map((j) => j.key)), span);
  const weir: RunWeir[] = input.live.weir.map((w) => {
    const since = ms(w.since);
    return { key: `${keyOf(w.source, w.id)}#weir`, source: w.source, id: w.id, title: w.title, kind: w.kind, media: w.media, decided: w.decided, pending: w.pending, href: w.href, at: since ?? now, approx: since === null, done: false };
  });
  const pins: RunPin[] = input.live.slots.flatMap((sl) => {
    const at = ms(sl.publishAt);
    return at === null ? [] : [{ ...sl, key: keyOf(sl.source, sl.id), at }];
  });
  return {
    now,
    span,
    jobs: [...live, ...kernel, ...past.jobs],
    weir: [...weir, ...past.weir],
    pins,
    holds: input.live.holds,
    failures: input.live.failures,
    unplaced: past.unplaced,
  };
}

/** The keys Runs shows as live work: what the exit probe compares with v1's own predicates. */
export const liveKeys = (m: RunsModel): string[] => m.jobs.filter((j) => j.from === "live").map((j) => j.key);
