"use client";

// Background work, and the notifications it produces.
//
// The rule this layer exists to enforce: **research is long, and the user is not
// locked while it runs.** A research run is minutes of careful work, not a
// spinner — so it belongs above the step that started it, survives navigating
// away, and reports back through the bell rather than by holding a screen
// hostage.
//
// Two concurrency rules, deliberately different, because the work is different:
//
//   · RESEARCH — parallel allowed. Different topics are independent, and a
//     creator who wants three subjects investigated at once should get three.
//   · FOLLOW-UP — one per project, serialised. A follow-up mutates the notebook
//     it was launched from; two in flight would race to revise the same document,
//     and the second would be reasoning about a notebook that is already stale.
//   · RECALIBRATE — one per project, serialised, for the same reason: it rewrites
//     the project's scripts from the accumulated notes. A second run launched
//     mid-flight would be recalibrating against a version about to be replaced,
//     and the creator could not tell which set of notes produced what.
//
// Research and follow-up are mocks of a local Claude Code process, but the SHAPE
// is the real one: jobs are started, they run without the UI, they can fail, and
// the app finds out afterwards.
//
// RECALIBRATE IS NOT A MOCK. It has a real `claude` process behind it, and that
// is why `start` takes `driven`. A mocked job used to run on a timer this file
// owned, so it knew both when it would end and how far along it was. A driven
// job knows neither: the caller owns the clock, the caller calls `settle`, and
// until then the job is `running` — which is what makes the one-at-a-time rule
// cover the REAL call rather than a nine-second animation in front of it.
// `measured` says which of the two a job is, so no surface has to guess whether
// `progress` means anything. As of 2026-08-14 every kind is driven and the timer
// is gone; the note further down says what went with it.
//
// THE SERIALISATION RULES SPAN TABS, and that is not decoration either. The
// guard used to be an in-memory ref plus this tab's own React state, neither of
// which can see a second tab — so two tabs could each start a `recalibrate` for
// one project and pay for two minutes-long Opus 5 calls whose results overwrite
// each other, with no surface anywhere able to say it had happened. The
// persisted record below is shared by every tab of this origin, `storage` events
// carry it between them, and `start` reads it synchronously before it claims a
// slot. See `claimedElsewhere` for the window that is left.

import { usePolling } from "./usePolling";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { cancelTurn, isLiveTurn, listTurns, type TurnSummary } from "./turns/client";

// "poster-generate" and "video-export" are the music-video discipline's two
// long-running calls (WP1 of the music-video spark: lib/imaging/providers/agy.ts
// measured ~57s for one poster; export is a headless Playwright frame-capture
// muxed with ffmpeg, minutes for a real track). Neither route exists yet — WP3
// and WP5 build them — but the job-kind constants and the `Job` shape below are
// committed here so both packages build against a stable, compiling contract
// rather than sharing a file with this one later. Both are driven, like
// "recalibrate" — a real process backs them from day one, never a mocked
// clock — and both are listed in SERIALISED below for the same reason
// "recalibrate" is: a second poster/export run for the same project would be a
// second real spend racing the first one's result.
export type JobKind =
  | "research"
  | "followup"
  | "recalibrate"
  | "poster-generate"
  | "video-export"
  | "ad-ideas"
  | "ad-scenarios"
  | "video-clip"
  | "ad-render"
  // Step 3's scene-direction pass. Turn-backed from its first day as a job
  // (AIO-A stage 3): before that it was a fetch no job ever saw.
  | "frames";
export type JobStatus = "running" | "done" | "failed" | "interrupted";

export interface Job {
  id: string;
  projectId: string;
  kind: JobKind;
  /** What the user asked for, in their words where there are any. */
  label: string;
  status: JobStatus;
  startedAt: number;
  endedAt?: number;
  /** 0–1. Meaningless unless `measured` — read that first. */
  progress: number;
  /** Does `progress` mean anything?
   *
   *  FALSE on a driven job, which is waiting on work with no schedule — a local
   *  Claude Opus 5 turn is minutes and nothing here knows how many. Drawing a
   *  fraction over it would be inventing one, so surfaces show elapsed time
   *  instead. True was for a job on a timer this file owned; every kind is
   *  driven now, so the only `measured: true` records left are old ones read
   *  back out of localStorage. */
  measured: boolean;
  /** WHICH TAB IS RUNNING THIS. Not identity and not a lock — it is how a tab
   *  tells its own work from work it is merely watching, now that the persisted
   *  record is shared. A tab may correct the record about a job it owns and must
   *  never be corrected about one, because the only statement another tab can
   *  make about it is "I cannot see it", which is true of that tab and says
   *  nothing about the job. Absent on records written before this existed. */
  ownerTab?: string;
  /** Set on a TURN-BACKED job: the server's turn id, which is also the job's
   *  `id`. Such a job is read from the server ledger, never written here —
   *  see the turn section below. */
  turnId?: string;
  error?: string;
  clearedAt?: number;
}

export interface JobEvent {
  id: string;
  jobId: string;
  projectId: string;
  kind: JobKind;
  ok: boolean;
  title: string;
  detail: string;
  at: number;
  read: boolean;
}

interface JobsApi {
  jobs: Job[];
  events: JobEvent[];
  unread: JobEvent[];
  /** Rejects (returns null) when a rule forbids it — see followupBusy. The
   *  refusal now spans TABS for a serialised kind, not just this one.
   *
   *  `driven` hands the clock to the caller: no timer, no progress fraction, and
   *  the job stays `running` until `settle`. Use it for anything with a real
   *  process behind it. `opts.failAfter` used to sit beside it and drove the
   *  mocked timer's failure branch; both are gone with the timer. */
  start: (
    kind: JobKind,
    projectId: string,
    label: string,
    opts?: { driven?: boolean },
  ) => Job | null;
  /** End a driven job. No-op on a job that is not running, so a late resolve
   *  after a cancel cannot resurrect it. `interrupted` is the honest outcome
   *  when the app can no longer receive the result — the same word a reload
   *  mid-run already uses. */
  settle: (jobId: string, outcome: Exclude<JobStatus, "running">, detail: string) => void;
  /** On a turn-backed job this asks the server to stop the turn, which ends
   *  the engine's process tree (lib/turns/runner.ts). */
  cancel: (jobId: string) => void;
  clear: (jobId: string) => void;
  /** Watch a server-owned turn: it joins `jobs` (and the bell) from the ledger
   *  until it settles. The server minted its id, so there is nothing to
   *  `start` — and nothing to `settle`: the ledger says when it ended. */
  track: (t: { turnId: string; projectId: string; kind: JobKind; label: string; record?: TurnView }) => void;
  /** True while this project already has a follow-up in flight. */
  followupBusy: (projectId: string) => boolean;
  /** True while this project already has a job of this kind in flight. */
  busy: (projectId: string, kind: JobKind) => boolean;
  runningFor: (projectId: string, kind?: JobKind) => Job[];
  markRead: (eventId: string) => void;
  markAllRead: () => void;
}

const Ctx = createContext<JobsApi | null>(null);

// THE MOCKED-DURATION TABLE IS GONE, and so is the timer it fed.
//
// It ended as `Record<string, number> = {}`. `recalibrate` left it when it got a
// real model call; `research` and `followup` left on 2026-08-14 when both became
// DRIVEN — the research trace steps its own clock and the follow-up settles in
// the same tick it writes its results. The file's own comment said to delete the
// table and the interval together once the table stayed empty, and it stayed
// empty. With it went `TICK`, the `timers` ref and its cleanup effect, and
// `opts.failAfter`, which existed only to pick the mocked timer's failure
// branch and had no call site left (checked across every `jobs.start` in the
// repo before removing it).
//
// `opts.driven` STAYS, and still does what it did: it decides `measured`, which
// is what the bell reads to choose between a fraction and a shimmer. What has
// changed is that it no longer has an alternative — every kind now passes it or
// forces it, and a caller that did not would get a job nothing can ever end.
// Adding a mocked kind means adding a clock for it, deliberately.

/** Kinds limited to one in flight per project. Research is deliberately absent. */
const SERIALISED = new Set<JobKind>(["followup", "recalibrate", "poster-generate", "video-export"]);

/** The noun a bell event's title opens with — "<noun> returned/failed/was
 *  interrupted". Exhaustive on `JobKind` on purpose: this used to be a ternary
 *  chain that defaulted anything it did not recognise to "Follow-up", which
 *  would have mislabelled a poster/export notification silently instead of
 *  failing to compile the way an appended kind with no row here now does. */
const JOB_NOUN: Record<JobKind, string> = {
  research: "Research",
  followup: "Follow-up",
  recalibrate: "Recalibration",
  "poster-generate": "Poster generation",
  "video-export": "Export",
  "ad-ideas": "Ad ideas",
  "ad-scenarios": "Ad scenarios",
  "video-clip": "Clip",
  "ad-render": "Ad render",
  frames: "Scene direction",
};

/** The name a job goes by everywhere the bell shows it — running, interrupted
 *  and settled — so one run is not "poster-generate" in flight and "Poster
 *  generation" on return. */
export function jobNoun(kind: JobKind): string {
  return JOB_NOUN[kind];
}

/** Where the record lives across reloads. Jobs are LONG — minutes for a real
 *  research run — and a refresh mid-run used to lose the whole thing silently,
 *  including any unread notification about work that had already finished.
 *
 *  IT IS ALSO THE CROSS-TAB SURFACE, which is the second job it does. Every tab
 *  of this origin reads and writes this one key, and `storage` events tell the
 *  others the instant it moves — which is how two tabs stop being able to start
 *  the same minutes-long Opus 5 call for the same project. No BroadcastChannel,
 *  no leader election: the record already existed and already had to be correct. */
const STORE_KEY = "gravitone.jobs.v1";

/** This page load. Not a user, not a session — it dies with the tab, which is
 *  exactly the lifetime "who is running this" needs. */
const TAB = `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/* ── THE EVICTION DOOR ─────────────────────────────────────────────────────── */
//
// `gravitone.jobs.v1` exists in TWO places at once, and only one of them was
// ever evicted. lib/identityEviction.ts removes the stored record — the tray is
// on its list, with the right reason beside it ("a job label is what the
// previous user asked a model to research, in their own words"). It could not
// remove the OTHER copy: `JobsProvider`'s React state, which holds the same jobs
// and the same notification events, and which does not unmount on an account
// switch because the provider is mounted at the app root and the root is what
// survives everything.
//
// So the wipe left the bell exactly as it was. The previous account's research
// topics stayed legible to the next one, and the first state change afterwards
// wrote them straight back into the key the eviction had just removed.
//
// THE DIRECTION OF THE IMPORT IS THE WHOLE DESIGN. identityEviction's header
// states its own rule: it imports every store it clears, and none of them import
// it. A `useAuth()` call inside JobsProvider would satisfy this fix and invert
// that rule, giving the job store a dependency on the identity layer and the
// import cycle that follows. Instead this module publishes a subscription, the
// provider registers on mount and releases on unmount, and the EVICTION calls
// in — same direction as every other store it clears.
const evictionListeners = new Set<() => void>();

/** Register a listener that drops this store's in-memory copy. Returns its
 *  reaper — the provider calls it on unmount, so a remount does not announce
 *  into a closure that sets state on a component that is gone. */
export function onIdentityEvicted(fn: () => void): () => void {
  evictionListeners.add(fn);
  return () => void evictionListeners.delete(fn);
}

/** Tell every mounted job store that the identity it was holding is gone.
 *  Returns how many were told — zero is a legitimate answer (no provider is
 *  mounted, as in a Node probe) and is what makes a silent no-op countable
 *  rather than invisible. Called ONLY by lib/identityEviction.ts. */
export function __announceIdentityEvicted(): number {
  let told = 0;
  for (const fn of evictionListeners) {
    fn();
    told++;
  }
  return told;
}

/** How many mounted job stores `__announceIdentityEvicted` WOULD tell, read
 *  without telling any of them. The eviction's dry run reports this so its
 *  preview equals the real wipe's report; announcing would empty the tray it is
 *  only meant to count. Called ONLY by lib/identityEviction.ts. */
export function __identityEvictionListenerCount(): number {
  return evictionListeners.size;
}

/** `turns` holds the turn-backed jobs' FLAGS only — which turns this browser
 *  is watching, and whether their bell event was read or cleared. Their status
 *  lives on the server. It sits inside the one key on purpose: the identity
 *  eviction already removes this key, and a second key would be a second thing
 *  for it to remember. */
interface Persisted { jobs: Job[]; events: JobEvent[]; turns: Record<string, TurnFlag> }

/** The shared record as written, with NO judgement applied. Used by everything
 *  that is asking what another tab currently believes. */
function parseStore(raw: string | null): Persisted {
  if (!raw) return { jobs: [], events: [], turns: {} };
  try {
    const p = JSON.parse(raw) as Partial<Persisted>;
    // `measured` post-dates the first store; a record written before it exists
    // was a timer job, and calling it measured is the truth about that record.
    return {
      jobs: (p.jobs ?? []).map((j) => ({ ...j, measured: j.measured ?? true })),
      events: p.events ?? [],
      turns: p.turns && typeof p.turns === "object" ? p.turns : {},
    };
  } catch {
    return { jobs: [], events: [], turns: {} };
  }
}

/** The record as THIS TAB should read it on mount. */
function readStore(): Persisted {
  if (typeof localStorage === "undefined") return { jobs: [], events: [], turns: {} };
  const p = parseStore(localStorage.getItem(STORE_KEY));
  // A job that was RUNNING when the page died is not running HERE now — this
  // prototype's clock went with the tab. Do not resurrect it as live and do
  // not quietly call it done: say it was interrupted, which is the only thing
  // we actually know. (A real local CLI process might well still be going;
  // reattaching to one is a backend problem this prototype does not have.)
  //
  // Unchanged, and deliberately so — but note what it means now that tabs talk:
  // this is a statement about THIS tab's ability to see the job, not about the
  // job. If the tab that actually owns it is still alive, it will contradict us
  // (see the `storage` effect), and its answer wins.
  const jobs = p.jobs.map((j) =>
    j.status === "running"
      ? { ...j, status: "interrupted" as const, endedAt: Date.now(),
          error: "The page reloaded while this was running. The prototype cannot reattach to it." }
      : j,
  );
  return { jobs, events: p.events, turns: p.turns };
}

/** Which of two copies of ONE job to believe. Only ever asked about a job this
 *  tab does not own — see `mergeJobs`. */
function fresher(mine: Job, theirs: Job): Job {
  // `interrupted` is a thing a tab says about ITSELF: "the page reloaded, I
  // cannot reattach to this". It is not evidence the work stopped. So a copy
  // that still says `running` beats one that says `interrupted` — somebody can
  // still see it, which is precisely what our copy claimed nobody could.
  if (mine.status === "interrupted" && theirs.status === "running") return theirs;
  if (theirs.status === "interrupted" && mine.status === "running") return mine;
  const em = mine.endedAt ?? 0;
  const et = theirs.endedAt ?? 0;
  if (em !== et) return em > et ? mine : theirs;
  return theirs.progress > mine.progress ? theirs : mine;
}

export function mergeJobs(mine: Job[], theirs: Job[]): Job[] {
  const byId = new Map<string, Job>();
  for (const j of mine) byId.set(j.id, j);
  for (const j of theirs) {
    const own = byId.get(j.id);
    // A job THIS tab started is this tab's to describe, full stop. Another tab's
    // copy is at best stale, and at worst the mount-time interruption above
    // applied to a run that is very much alive — after which `settle` would
    // no-op on the real result and the work would land nowhere.
    if (own?.ownerTab === TAB) {
      if (j.clearedAt && !own.clearedAt) {
        byId.set(j.id, { ...own, clearedAt: j.clearedAt });
      }
      continue;
    }
    const merged = own ? fresher(own, j) : j;
    const stickyClearedAt =
      own?.clearedAt && j.clearedAt
        ? Math.max(own.clearedAt, j.clearedAt)
        : (own?.clearedAt ?? j.clearedAt);
    byId.set(j.id, stickyClearedAt != null ? { ...merged, clearedAt: stickyClearedAt } : merged);
  }
  return [...byId.values()].sort((a, b) => b.startedAt - a.startedAt || a.id.localeCompare(b.id));
}

/** Union by id. `read` is sticky: dismissing a notification in one tab dismisses
 *  it everywhere, which is what "I have seen this" means. */
function mergeEvents(mine: JobEvent[], theirs: JobEvent[]): JobEvent[] {
  const byId = new Map<string, JobEvent>();
  for (const e of [...mine, ...theirs]) {
    const prev = byId.get(e.id);
    byId.set(e.id, prev ? { ...prev, read: prev.read || e.read } : e);
  }
  return [...byId.values()].sort((a, b) => b.at - a.at || a.id.localeCompare(b.id));
}

/**
 * Is ANOTHER tab running this exact slot right now? Read straight from the
 * shared record rather than from this tab's merged state, because the whole
 * point is to be correct at click time and not one `storage` event later.
 *
 * WHAT WINDOW IS LEFT, stated exactly, because it is narrowed and not closed:
 *
 *  1. localStorage has no compare-and-swap. Two tabs whose clicks land between
 *     this read and the `claimInStore` write that follows it — microseconds,
 *     within one turn of each tab's event loop — can both pass. This is the
 *     irreducible one; closing it needs a lock primitive this prototype does not
 *     have (`navigator.locks`) and a leader election it was told not to grow.
 *  2. A tab that MOUNTS while another tab's job is running applies `readStore`'s
 *     "the page reloaded, I cannot reattach" rule to it and writes `interrupted`
 *     over the shared record. Until the owning tab notices and puts the truth
 *     back — one `storage` round trip — a click in the newly-mounted tab reads a
 *     slot that looks free. The correction is in the `storage` effect below and
 *     is immediate; the exposure is the milliseconds before it lands.
 *
 * Neither window can be reached by a human clicking twice, which is the case
 * this rule exists for. Both would be closed by moving the record server-side,
 * which is where this seam is going anyway.
 */
function claimedElsewhere(projectId: string, kind: JobKind): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    return parseStore(localStorage.getItem(STORE_KEY)).jobs.some(
      (j) =>
        j.status === "running" &&
        j.projectId === projectId &&
        j.kind === kind &&
        j.ownerTab !== TAB,
    );
  } catch {
    return false;
  }
}

/** Publish a serialised claim SYNCHRONOUSLY, inside `start`, before it returns.
 *  The persist effect would get there a frame later, and a frame is the entire
 *  race: this closes it to the microseconds between the read above and the write
 *  here, which localStorage gives no compare-and-swap to close completely. */
function claimInStore(job: Job): void {
  try {
    if (typeof localStorage === "undefined") return;
    const p = parseStore(localStorage.getItem(STORE_KEY));
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({
        jobs: [job, ...p.jobs.filter((j) => j.id !== job.id)].slice(0, 50),
        events: p.events.slice(0, 50),
        turns: p.turns,
      }),
    );
  } catch {
    // Quota or private mode. The in-tab guard below still holds; only the
    // cross-tab half is lost, and losing it is survivable where crashing is not.
  }
}

/**
 * The cancel transition, as a pure function over the list.
 *
 * ONLY A RUNNING JOB CAN BE CANCELLED, which is the same rule `settle` states in
 * its own docstring — "no-op on a job that is not running, so a late resolve
 * after a cancel cannot resurrect it" — and which `cancel` did not hold. It
 * mapped ANY job with the id to `failed` / "Stopped by you.", so the mirror race
 * relabelled work that had already succeeded: a research run settles `done`, the
 * bell says "Research returned", the creator hits stop a beat later while
 * `run.jobId` still names it (app/_phases/research/guided/useEducationalResearch.ts:92-95
 * reads the id, then cancels), and the tray now contradicts the notebook the
 * results are sitting on.
 *
 * Pure and exported so it can be DRIVEN rather than argued about: the guard
 * itself lives in a `useCallback` inside a provider, which the Node probe lane
 * cannot render and the live lane will not take module-level claims about. See
 * tests/golden-path/cancel-settled-job.probe.spec.ts.
 *
 * A non-running job is returned by REFERENCE, not rebuilt — identity is what a
 * memoised row downstream compares on, and a no-op that churns it is not a no-op.
 */
export function applyCancel(jobs: Job[], jobId: string): Job[] {
  return jobs.map((j) =>
    j.id === jobId && j.status === "running"
      ? { ...j, status: "failed" as const, endedAt: Date.now(), error: "Stopped by you." }
      : j,
  );
}

/**
 * The clear transition on interrupted jobs, as a pure function over the list.
 *
 * Sets an additive `clearedAt` timestamp tombstone. Only an interrupted job can
 * be cleared. A running, done, or failed job is returned by reference (===).
 * If the job is not found or is already cleared, the original array reference is returned.
 */
export function applyClear(jobs: Job[], jobId: string): Job[] {
  const target = jobs.find((j) => j.id === jobId);
  if (!target || target.status !== "interrupted" || target.clearedAt != null) {
    return jobs;
  }
  return jobs.map((j) => (j.id === jobId ? { ...j, clearedAt: Date.now() } : j));
}

/* ── TURN-BACKED JOBS (AIO-A stage 2, 2026-10-06) ─────────────────────────── */
//
// A recalibration is no longer a fetch this tab holds open. It is a TURN the
// server owns (lib/turns/runner.ts), with a durable record in the ledger, and
// this provider only WATCHES it: the job's status, its end and its error are
// read from the ledger through usePolling, and nothing here can settle one.
// That is what closes the two windows `claimedElsewhere` documents — the slot
// is claimed on the server, under one lock, against the ledger — and what lets
// a turn finish while no tab is mounted and still reach the bell.
//
// WHAT THIS BROWSER KEEPS is a FLAG per watched turn: which project to poll,
// the label the creator saw, and whether its bell event was read or cleared.
// The bell event itself is DERIVED from the record (`turnEventsOf`), keyed
// `e-<turnId>` — so a second poll, a second tab, or a reload cannot announce
// one turn twice: there is nothing to append, only a record to read.
//
// Scene direction (`frames`) joined in stage 3. Other kinds (poster, export,
// research — a later stage) keep the localStorage path above unchanged.

/** The kinds that run as server-owned turns. */
export const TURN_KINDS: ReadonlySet<JobKind> = new Set<JobKind>(["recalibrate", "frames"]);

export interface TurnFlag {
  turnId: string;
  projectId: string;
  kind: JobKind;
  /** What the creator asked for, as the bell shows it. */
  label: string;
  /** When this browser started watching; the record's own start replaces it
   *  once read. */
  startedAt: number;
  read?: boolean;
  clearedAt?: number;
}

/** The part of a ledger record the provider reads. */
export type TurnView = Pick<TurnSummary, "id" | "kind" | "projectId" | "status" | "startedAt" | "updatedAt" | "endedAt" | "error">;

export interface TurnState {
  flags: Record<string, TurnFlag>;
  /** Records as last read from the ledger. Never persisted: the ledger is the
   *  truth and a mount reads it again. */
  records: Record<string, TurnView>;
}

export const EMPTY_TURNS: TurnState = { flags: {}, records: {} };

/** How many watched turns a browser remembers. */
const TURN_FLAG_CAP = 50;

/** The bell's sentence for a turn that came back. */
const TURN_DONE_DETAIL: Partial<Record<JobKind, string>> = {
  recalibrate: "A recalibrated set of scripts is ready on the Script step — compare it, then accept or run again.",
  frames: "Scene direction for the cut is ready on the Frames step.",
};

const viewOf = (r: TurnView): TurnView => ({
  id: r.id,
  kind: r.kind,
  projectId: r.projectId,
  status: r.status,
  startedAt: r.startedAt,
  updatedAt: r.updatedAt,
  ...(r.endedAt ? { endedAt: r.endedAt } : {}),
  ...(r.error ? { error: r.error } : {}),
});

function capFlags(flags: Record<string, TurnFlag>): Record<string, TurnFlag> {
  const all = Object.values(flags);
  if (all.length <= TURN_FLAG_CAP) return flags;
  const keep = all.sort((a, b) => b.startedAt - a.startedAt).slice(0, TURN_FLAG_CAP);
  return Object.fromEntries(keep.map((f) => [f.turnId, f]));
}

/** Start watching a turn. A turn already watched keeps its flag (and its read
 *  state); a record, when given, is taken as the newest known. */
export function trackTurn(state: TurnState, flag: TurnFlag, record?: TurnView): TurnState {
  const flags = state.flags[flag.turnId] ? state.flags : capFlags({ ...state.flags, [flag.turnId]: flag });
  const next = flags === state.flags ? state : { ...state, flags };
  return record ? mergeTurnRecords(next, [record]) : next;
}

/** Fold ledger records in. Only WATCHED turns are taken — the bell shows what
 *  this browser asked for, not every turn the server has run. Unchanged
 *  records return the state by reference. */
export function mergeTurnRecords(state: TurnState, incoming: readonly TurnView[]): TurnState {
  let records = state.records;
  for (const r of incoming) {
    if (!state.flags[r.id]) continue;
    const prev = records[r.id];
    if (prev && prev.status === r.status && prev.updatedAt === r.updatedAt) continue;
    records = { ...records, [r.id]: viewOf(r) };
  }
  return records === state.records ? state : { ...state, records };
}

/** The projects with a watched turn that is not known to have ended. Empty
 *  means polling stops. */
export function turnsToPoll(state: TurnState): string[] {
  const out = new Set<string>();
  for (const f of Object.values(state.flags)) {
    const r = state.records[f.turnId];
    if (!r || isLiveTurn(r.status)) out.add(f.projectId);
  }
  return [...out].sort();
}

export interface TurnPoll {
  /** When the reads began. A flag tracked after this cannot be judged by
   *  them: the list may predate its turn. */
  at: number;
  projects: string[];
  turns: TurnView[];
}

/** Read the ledger for every project `turnsToPoll` names, through the client
 *  door. A project that cannot be read this round is skipped, not fatal. */
export async function fetchTurns(state: TurnState, list: (projectId: string) => Promise<TurnView[]> = listTurns): Promise<TurnPoll> {
  const at = Date.now();
  const projects: string[] = [];
  const turns: TurnView[] = [];
  for (const projectId of turnsToPoll(state)) {
    try {
      turns.push(...(await list(projectId)));
      projects.push(projectId);
    } catch {
      // offline, or a 401 while the identity settles — the next tick asks again
    }
  }
  return { at, projects, turns };
}

/** Apply one poll. A watched turn the ledger no longer lists for a project it
 *  was asked about (the ledger was cleared, or the turn fell out of the list's
 *  window before this browser ever read it) stops being watched, rather than
 *  being polled for forever. */
export function applyTurnPoll(state: TurnState, poll: TurnPoll): TurnState {
  let next = mergeTurnRecords(state, poll.turns);
  const seen = new Set(poll.turns.map((t) => t.id));
  const asked = new Set(poll.projects);
  const gone = Object.values(next.flags).filter(
    (f) => asked.has(f.projectId) && !seen.has(f.turnId) && !next.records[f.turnId] && f.startedAt < poll.at,
  );
  if (gone.length) {
    const flags = { ...next.flags };
    for (const f of gone) delete flags[f.turnId];
    next = { ...next, flags };
  }
  return next;
}

export async function pollTurns(state: TurnState, list?: (projectId: string) => Promise<TurnView[]>): Promise<TurnState> {
  return applyTurnPoll(state, await fetchTurns(state, list));
}

const msOf = (iso: string | undefined, fallback?: number): number | undefined => {
  const n = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(n) ? n : fallback;
};

/** One watched turn as a Job. `cancelled` reads as the local cancel always has
 *  ("Stopped by you."), `orphaned` as `interrupted` — the server-side twin of
 *  the word a reload uses. */
export function turnJobOf(flag: TurnFlag, rec?: TurnView): Job {
  const base: Job = {
    id: flag.turnId,
    turnId: flag.turnId,
    projectId: flag.projectId,
    kind: flag.kind,
    label: flag.label,
    status: "running",
    startedAt: msOf(rec?.startedAt, flag.startedAt)!,
    progress: 0,
    measured: false,
    ...(flag.clearedAt != null ? { clearedAt: flag.clearedAt } : {}),
  };
  if (!rec || isLiveTurn(rec.status)) return base;
  const endedAt = msOf(rec.endedAt ?? rec.updatedAt);
  if (rec.status === "done") return { ...base, status: "done", endedAt };
  if (rec.status === "cancelled") return { ...base, status: "failed", endedAt, error: "Stopped by you." };
  const error = rec.error?.message || (rec.status === "orphaned" ? "The server stopped before this turn finished." : "The turn failed.");
  return { ...base, status: rec.status === "orphaned" ? "interrupted" : "failed", endedAt, error };
}

export function turnJobsOf(state: TurnState): Job[] {
  return Object.values(state.flags)
    .map((f) => turnJobOf(f, state.records[f.turnId]))
    .sort((a, b) => b.startedAt - a.startedAt || a.id.localeCompare(b.id));
}

/** The bell events the watched turns have earned: one per turn that ENDED,
 *  keyed by its id. A cancel earns none — the creator pressed stop, and being
 *  told so is noise. */
export function turnEventsOf(state: TurnState): JobEvent[] {
  const out: JobEvent[] = [];
  for (const f of Object.values(state.flags)) {
    const r = state.records[f.turnId];
    if (!r || isLiveTurn(r.status) || r.status === "cancelled") continue;
    const ok = r.status === "done";
    const job = turnJobOf(f, r);
    out.push({
      id: `e-${f.turnId}`,
      jobId: f.turnId,
      projectId: f.projectId,
      kind: f.kind,
      ok,
      title: `${JOB_NOUN[f.kind]} ${ok ? "returned" : r.status === "orphaned" ? "was interrupted" : "failed"}`,
      detail: ok ? (TURN_DONE_DETAIL[f.kind] ?? "") : (job.error ?? ""),
      at: job.endedAt ?? job.startedAt,
      read: Boolean(f.read),
    });
  }
  return out.sort((a, b) => b.at - a.at || a.id.localeCompare(b.id));
}

/** How many jobs there are and how many still run, with turn-backed work
 *  counted FROM THE LEDGER rather than from one tab's list.
 *
 *  `local` is what a provider holds (its own jobs plus the turns it watches);
 *  `ledger` is what the server reports for the account's projects. A turn is
 *  counted once, by id, and the ledger's status wins: a turn another tab or
 *  device started is counted though this tab never tracked it, and one that
 *  ended while this tab had not polled yet is not counted as running. A watched
 *  turn the ledger read did not return (a project that could not be read this
 *  time) keeps the tab's view rather than vanishing. What the harness snapshot
 *  reports (lib/harness/protocol.ts `jobs`). */
export function jobCounts(local: readonly Job[], ledger: readonly Pick<TurnView, "id" | "status">[]): { running: number; total: number } {
  const turns = new Map(ledger.map((t) => [t.id, t]));
  let running = 0;
  let total = 0;
  for (const t of turns.values()) {
    total++;
    if (isLiveTurn(t.status)) running++;
  }
  for (const j of local) {
    if (j.turnId && turns.has(j.turnId)) continue;
    total++;
    if (j.status === "running") running++;
  }
  return { running, total };
}

/** Two tabs' flags, unioned. `read` and `clearedAt` are sticky, as for events. */
function mergeTurnFlags(mine: Record<string, TurnFlag>, theirs: Record<string, TurnFlag>): Record<string, TurnFlag> {
  const out = { ...mine };
  for (const [id, t] of Object.entries(theirs)) {
    const m = out[id];
    if (!m) {
      out[id] = t;
      continue;
    }
    const clearedAt = m.clearedAt != null && t.clearedAt != null ? Math.max(m.clearedAt, t.clearedAt) : (m.clearedAt ?? t.clearedAt);
    out[id] = { ...m, read: Boolean(m.read || t.read), ...(clearedAt != null ? { clearedAt } : {}) };
  }
  return capFlags(out);
}

export function JobsProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [events, setEvents] = useState<JobEvent[]>([]);
  // The turn-backed half: flags persisted with the record, records read from
  // the ledger. See the turn section above.
  const [turns, setTurns] = useState<TurnState>(EMPTY_TURNS);
  // The serialisation guard, held SYNCHRONOUSLY. `jobs` is state: two clicks in
  // one tick both read the same pre-update array and both pass a `jobs.some(…)`
  // check, which for recalibrate means two real Claude processes. A ref is
  // updated the instant `start` returns, so the second click loses.
  const live = useRef(new Set<string>());
  // Mirrors `jobs` for callbacks that must stay stable across renders —
  // `settle` is captured inside a minutes-long async closure at click time.
  const jobsRef = useRef<Job[]>([]);
  jobsRef.current = jobs;
  // What this tab last WROTE to (or last READ from) the shared record. Without
  // it the persist effect echoes every incoming `storage` event straight back
  // out, the other tab receives its own record returning, and two tabs write to
  // each other forever.
  const lastWritten = useRef<string | null>(null);
  // STATE, not a ref. As a ref this was set synchronously inside the rehydrate
  // effect, so the persist effect — which runs immediately afterwards on the
  // same mount, while `jobs`/`events` are still the initial [] — saw
  // `hydrated === true` and wrote empty arrays straight over the stored record.
  // Nothing survived a reload. As state, the persist effect cannot run until the
  // rehydrated values have actually landed.
  const [hydrated, setHydrated] = useState(false);

  // Rehydrate once, on the client only — reading localStorage during render
  // would desync the server-rendered HTML.
  useEffect(() => {
    const p = readStore();
    setJobs(p.jobs);
    setEvents(p.events);
    setTurns({ flags: p.turns, records: {} });
    setHydrated(true);
  }, []);

  // Persist on every change, but never before rehydration — and never a record
  // we just received, which is what `lastWritten` is for.
  useEffect(() => {
    if (!hydrated || typeof localStorage === "undefined") return;
    const raw = JSON.stringify({ jobs: jobs.slice(0, 50), events: events.slice(0, 50), turns: turns.flags });
    if (raw === lastWritten.current) return;
    try {
      localStorage.setItem(STORE_KEY, raw);
      lastWritten.current = raw;
    } catch {
      // Quota or private mode. Losing persistence is survivable; crashing is not.
    }
  }, [jobs, events, turns.flags, hydrated]);

  // THE LEDGER, READ. Only while a watched turn is not known to have ended,
  // and only while the tab is visible (usePolling). A mount whose flags name a
  // turn that settled while no tab was open polls once, derives its one bell
  // event, and stops.
  const pollingTurns = useRef(false);
  const pollTurnsNow = useCallback(() => {
    if (pollingTurns.current) return;
    pollingTurns.current = true;
    void fetchTurns(turns)
      .then((poll) => setTurns((cur) => applyTurnPoll(cur, poll)))
      .finally(() => {
        pollingTurns.current = false;
      });
  }, [turns]);
  usePolling(pollTurnsNow, 2000, hydrated && turnsToPoll(turns).length > 0);

  // THE IDENTITY LEAVING. Registered here rather than reached for through auth —
  // see the eviction door above for why the import points this way.
  //
  // `live.current` goes with the state: it is the serialisation guard, and a
  // slot still held by the departed identity's run would refuse the new
  // account's first recalibration for a job it can no longer see. `lastWritten`
  // is nulled so the persist effect that follows this clear actually writes,
  // rather than recognising its own last record and skipping.
  useEffect(
    () =>
      onIdentityEvicted(() => {
        live.current.clear();
        lastWritten.current = null;
        setJobs([]);
        setEvents([]);
        setTurns(EMPTY_TURNS);
      }),
    [],
  );

  // THE OTHER TAB, ARRIVING. `storage` fires in every tab of this origin EXCEPT
  // the one that wrote, so this is the whole cross-tab channel: no polling, no
  // BroadcastChannel, and no second source of truth beside the record that had
  // to be written anyway.
  //
  // Two things happen here. The obvious one is that this tab learns about work
  // it did not start, so `start`'s serialisation check can see it. The less
  // obvious one is the CORRECTION: a tab that mounts while our job is running
  // applies `readStore`'s "the page reloaded, I cannot reattach" rule to it and
  // writes `interrupted` over our live run. We own it, so we ignore that — and
  // then clear `lastWritten` so the persist effect puts the truth back for
  // everyone else, rather than letting a stale "interrupted" stand in the one
  // record `claimedElsewhere` reads.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== null && e.key !== STORE_KEY) return;
      if (!e.newValue) return;
      const incoming = parseStore(e.newValue);
      const contradictsUs = incoming.jobs.some(
        (j) =>
          j.status !== "running" &&
          jobsRef.current.some(
            (m) => m.id === j.id && m.ownerTab === TAB && m.status === "running",
          ),
      );
      lastWritten.current = contradictsUs ? null : e.newValue;
      setJobs((mine) => mergeJobs(mine, incoming.jobs));
      setEvents((mine) => mergeEvents(mine, incoming.events));
      setTurns((mine) => {
        const flags = mergeTurnFlags(mine.flags, incoming.turns);
        return { ...mine, flags };
      });
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const finish = useCallback(
    (job: Pick<Job, "id" | "projectId" | "kind">, outcome: Exclude<JobStatus, "running">, detail: string) => {
      live.current.delete(`${job.projectId}:${job.kind}`);
      const ok = outcome === "done";
      setJobs((js) =>
        js.map((j) =>
          j.id === job.id
            ? {
                ...j,
                status: outcome,
                // A measured job really did reach its end. An interrupted or
                // failed driven job did not, and 100% would be the last thing it
                // said about itself — leave the fraction where it stopped.
                progress: ok && j.measured ? 1 : j.progress,
                endedAt: Date.now(),
                error: ok ? undefined : detail,
              }
            : j,
        ),
      );
      setEvents((es) => [
        {
          id: `e-${job.id}`,
          jobId: job.id,
          projectId: job.projectId,
          kind: job.kind,
          ok,
          title: `${JOB_NOUN[job.kind]} ${
            ok ? "returned" : outcome === "interrupted" ? "was interrupted" : "failed"
          }`,
          detail,
          at: Date.now(),
          read: false,
        },
        ...es,
      ]);
    },
    [],
  );

  // Every job this tab can see: its own and the turn-backed ones the ledger
  // reports. What `busy`, the bell and every surface read.
  const allJobs = useMemo(
    () => [...turnJobsOf(turns), ...jobs].sort((a, b) => b.startedAt - a.startedAt || a.id.localeCompare(b.id)),
    [turns, jobs],
  );
  const allEvents = useMemo(
    () => [...turnEventsOf(turns), ...events].sort((a, b) => b.at - a.at || a.id.localeCompare(b.id)),
    [turns, events],
  );

  const busy = useCallback(
    (projectId: string, kind: JobKind) =>
      allJobs.some((j) => j.projectId === projectId && j.kind === kind && j.status === "running"),
    [allJobs],
  );

  const followupBusy = useCallback((projectId: string) => busy(projectId, "followup"), [busy]);

  const start = useCallback<JobsApi["start"]>(
    (kind, projectId, label, opts) => {
      // Recalibrate, poster-generate and video-export all have a real process
      // behind them, so each is driven by nature — a caller cannot opt one
      // back onto a clock that would lie about it.
      const driven =
        kind === "recalibrate" ||
        kind === "poster-generate" ||
        kind === "video-export" ||
        opts?.driven === true;
      const slot = `${projectId}:${kind}`;

      // THE REFUSAL, in three checks that get progressively wider. Stated as a
      // rule rather than a disabled button alone, because a caller needs to be
      // able to find out WHY nothing happened.
      //
      //  1. the ref — already true for a job started microseconds ago in THIS
      //     tab whose state update has not landed. Two clicks in one tick.
      //  2. this tab's state — the ordinary case.
      //  3. the shared record — ANOTHER TAB. Read synchronously, at click time.
      //     Two tabs could each start a `recalibrate` for one project, which is
      //     two real minutes-long Opus 5 calls whose results overwrite each
      //     other, and neither tab could see the other.
      if (SERIALISED.has(kind)) {
        if (live.current.has(slot)) return null;
        if (allJobs.some((j) => j.projectId === projectId && j.kind === kind && j.status === "running")) return null;
        if (claimedElsewhere(projectId, kind)) return null;
        live.current.add(slot);
      }

      // A driven job's caller owns the clock, calls `settle`, and until then the
      // job is `running`; `measured: false` is how the bell knows not to draw a
      // fraction over work whose length nothing knows.
      //
      // AND THERE IS NO OTHER KIND LEFT. With the mocked timer gone (see the
      // note where DURATION was), nothing in this file can advance or end a job,
      // so an undriven start would sit at `running` with a `measured` progress
      // of 0 forever — a worse lie than the nine-second recalibrate timer that
      // was removed for telling a shorter one. All three kinds pass `driven` or
      // force it; a fourth that forgets needs a clock of its own first.
      const job: Job = {
        id: `j-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        projectId, kind, label, status: "running", startedAt: Date.now(), progress: 0,
        measured: !driven,
        ownerTab: TAB,
      };
      setJobs((js) => [job, ...js]);

      // Publish the claim NOW rather than a frame from now, when the persist
      // effect would. Only for the kinds a second tab is forbidden to duplicate:
      // research is parallel by design and has nothing to claim.
      if (SERIALISED.has(kind)) claimInStore(job);

      return job;
    },
    [allJobs],
  );

  const settle = useCallback<JobsApi["settle"]>(
    (jobId, outcome, detail) => {
      const j = jobsRef.current.find((x) => x.id === jobId);
      if (!j || j.status !== "running") return;
      finish(j, outcome, detail);
    },
    [finish],
  );

  const cancel = useCallback((jobId: string) => {
    // A TURN is stopped on the server, which kills the engine's process tree;
    // the record that comes back is the new truth. A 409 (it had already
    // ended) carries the record too, and is folded in the same way.
    if (jobId.startsWith("tn-")) {
      void cancelTurn(jobId)
        .then((out) => {
          if (out.turn) setTurns((cur) => mergeTurnRecords(cur, [out.turn!]));
        })
        .catch(() => undefined);
      return;
    }
    // The same refusal `settle` makes, in the same words, for the mirror case:
    // a late CANCEL after a settle must not relabel a job that already ended.
    // The slot release moved inside it deliberately — `finish` already released
    // the slot of anything that reached `done`/`failed`/`interrupted`, so a
    // release here could only ever be a second one for a job this call is now
    // declining to touch.
    const j = jobsRef.current.find((x) => x.id === jobId);
    if (!j || j.status !== "running") return;
    live.current.delete(`${j.projectId}:${j.kind}`);
    setJobs((js) => applyCancel(js, jobId));
  }, []);

  const clear = useCallback((jobId: string) => {
    setJobs((js) => applyClear(js, jobId));
    // The same rule for a turn: only an interrupted (orphaned) one is cleared.
    setTurns((cur) => {
      const f = cur.flags[jobId];
      if (!f || f.clearedAt != null || turnJobOf(f, cur.records[jobId]).status !== "interrupted") return cur;
      return { ...cur, flags: { ...cur.flags, [jobId]: { ...f, clearedAt: Date.now() } } };
    });
  }, []);

  const track = useCallback<JobsApi["track"]>(({ turnId, projectId, kind, label, record }) => {
    setTurns((cur) => trackTurn(cur, { turnId, projectId, kind, label, startedAt: Date.now() }, record));
  }, []);

  const markRead = useCallback((id: string) => {
    const turnId = id.startsWith("e-tn-") ? id.slice(2) : null;
    if (turnId)
      setTurns((cur) =>
        cur.flags[turnId] && !cur.flags[turnId]!.read
          ? { ...cur, flags: { ...cur.flags, [turnId]: { ...cur.flags[turnId]!, read: true } } }
          : cur,
      );
    else setEvents((es) => es.map((e) => (e.id === id ? { ...e, read: true } : e)));
  }, []);

  const markAllRead = useCallback(() => {
    setEvents((es) => es.map((e) => ({ ...e, read: true })));
    setTurns((cur) => ({
      ...cur,
      flags: Object.fromEntries(Object.entries(cur.flags).map(([id, f]) => [id, { ...f, read: true }])),
    }));
  }, []);

  const value = useMemo<JobsApi>(
    () => ({
      jobs: allJobs,
      events: allEvents,
      unread: allEvents.filter((e) => !e.read),
      start,
      settle,
      cancel,
      clear,
      track,
      followupBusy,
      busy,
      runningFor: (projectId, kind) =>
        allJobs.filter((j) => j.projectId === projectId && j.status === "running" && (!kind || j.kind === kind)),
      markRead,
      markAllRead,
    }),
    [allJobs, allEvents, start, settle, cancel, clear, track, followupBusy, busy, markRead, markAllRead],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useJobs(): JobsApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useJobs must be used inside <JobsProvider>");
  return v;
}

/** m:ss from a minute up (the repo's duration convention, `fmtDur`), bare
 *  seconds below it. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) return `${total}s`;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** A driven job's record does not change between start and settle, so nothing
 *  re-renders a surface that prints its elapsed time. The clock lives here and
 *  runs only while the job is running (and the tab is visible, via usePolling):
 *  a settled job freezes at its endedAt and holds no interval. */
export function useElapsed(j: Job): string {
  const [now, setNow] = useState(() => Date.now());
  usePolling(() => setNow(Date.now()), 1000, j.status === "running");
  return formatElapsed((j.endedAt ?? now) - j.startedAt);
}

/** The count as a node, for call sites that map over jobs and cannot call a hook. */
export function JobElapsed({ job }: { job: Job }) {
  return <>{useElapsed(job)}</>;
}
