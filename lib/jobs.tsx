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

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

export type JobKind = "research" | "followup" | "recalibrate";
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
  error?: string;
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
  cancel: (jobId: string) => void;
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
const SERIALISED = new Set<JobKind>(["followup", "recalibrate"]);

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

interface Persisted { jobs: Job[]; events: JobEvent[] }

/** The shared record as written, with NO judgement applied. Used by everything
 *  that is asking what another tab currently believes. */
function parseStore(raw: string | null): Persisted {
  if (!raw) return { jobs: [], events: [] };
  try {
    const p = JSON.parse(raw) as Persisted;
    // `measured` post-dates the first store; a record written before it exists
    // was a timer job, and calling it measured is the truth about that record.
    return { jobs: (p.jobs ?? []).map((j) => ({ ...j, measured: j.measured ?? true })), events: p.events ?? [] };
  } catch {
    return { jobs: [], events: [] };
  }
}

/** The record as THIS TAB should read it on mount. */
function readStore(): Persisted {
  if (typeof localStorage === "undefined") return { jobs: [], events: [] };
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
  return { jobs, events: p.events };
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

function mergeJobs(mine: Job[], theirs: Job[]): Job[] {
  const byId = new Map<string, Job>();
  for (const j of mine) byId.set(j.id, j);
  for (const j of theirs) {
    const own = byId.get(j.id);
    // A job THIS tab started is this tab's to describe, full stop. Another tab's
    // copy is at best stale, and at worst the mount-time interruption above
    // applied to a run that is very much alive — after which `settle` would
    // no-op on the real result and the work would land nowhere.
    if (own?.ownerTab === TAB) continue;
    byId.set(j.id, own ? fresher(own, j) : j);
  }
  return [...byId.values()].sort((a, b) => b.startedAt - a.startedAt);
}

/** Union by id. `read` is sticky: dismissing a notification in one tab dismisses
 *  it everywhere, which is what "I have seen this" means. */
function mergeEvents(mine: JobEvent[], theirs: JobEvent[]): JobEvent[] {
  const byId = new Map<string, JobEvent>();
  for (const e of [...mine, ...theirs]) {
    const prev = byId.get(e.id);
    byId.set(e.id, prev ? { ...prev, read: prev.read || e.read } : e);
  }
  return [...byId.values()].sort((a, b) => b.at - a.at);
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
      }),
    );
  } catch {
    // Quota or private mode. The in-tab guard below still holds; only the
    // cross-tab half is lost, and losing it is survivable where crashing is not.
  }
}

export function JobsProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [events, setEvents] = useState<JobEvent[]>([]);
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
    setHydrated(true);
  }, []);

  // Persist on every change, but never before rehydration — and never a record
  // we just received, which is what `lastWritten` is for.
  useEffect(() => {
    if (!hydrated || typeof localStorage === "undefined") return;
    const raw = JSON.stringify({ jobs: jobs.slice(0, 50), events: events.slice(0, 50) });
    if (raw === lastWritten.current) return;
    try {
      localStorage.setItem(STORE_KEY, raw);
      lastWritten.current = raw;
    } catch {
      // Quota or private mode. Losing persistence is survivable; crashing is not.
    }
  }, [jobs, events, hydrated]);

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
          title: `${job.kind === "research" ? "Research" : job.kind === "recalibrate" ? "Recalibration" : "Follow-up"} ${
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

  const busy = useCallback(
    (projectId: string, kind: JobKind) =>
      jobs.some((j) => j.projectId === projectId && j.kind === kind && j.status === "running"),
    [jobs],
  );

  const followupBusy = useCallback((projectId: string) => busy(projectId, "followup"), [busy]);

  const start = useCallback<JobsApi["start"]>(
    (kind, projectId, label, opts) => {
      // Recalibrate has a real process behind it, so it is driven by nature —
      // a caller cannot opt it back onto a clock that would lie about it.
      const driven = kind === "recalibrate" || opts?.driven === true;
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
        if (jobs.some((j) => j.projectId === projectId && j.kind === kind && j.status === "running")) return null;
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
    [jobs],
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
    const j = jobsRef.current.find((x) => x.id === jobId);
    if (j) live.current.delete(`${j.projectId}:${j.kind}`);
    setJobs((js) => js.map((j) => (j.id === jobId ? { ...j, status: "failed", endedAt: Date.now(), error: "Stopped by you." } : j)));
  }, []);

  const value = useMemo<JobsApi>(
    () => ({
      jobs,
      events,
      unread: events.filter((e) => !e.read),
      start,
      settle,
      cancel,
      followupBusy,
      busy,
      runningFor: (projectId, kind) =>
        jobs.filter((j) => j.projectId === projectId && j.status === "running" && (!kind || j.kind === kind)),
      markRead: (id) => setEvents((es) => es.map((e) => (e.id === id ? { ...e, read: true } : e))),
      markAllRead: () => setEvents((es) => es.map((e) => ({ ...e, read: true }))),
    }),
    [jobs, events, start, settle, cancel, followupBusy, busy],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useJobs(): JobsApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useJobs must be used inside <JobsProvider>");
  return v;
}

export const elapsed = (j: Job) =>
  `${Math.round(((j.endedAt ?? Date.now()) - j.startedAt) / 1000)}s`;
