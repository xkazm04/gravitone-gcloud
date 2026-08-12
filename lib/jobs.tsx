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
// This is a mock of a local Claude Code process, but the SHAPE is the real one:
// jobs are started, they run without the UI, they can fail, and the app finds out
// afterwards.

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
  /** 0–1. Mocked, but a real run streams its phases the same way. */
  progress: number;
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
  /** Rejects (returns null) when a rule forbids it — see followupBusy. */
  start: (kind: JobKind, projectId: string, label: string, opts?: { failAfter?: boolean }) => Job | null;
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

/** Mocked durations. Research is deliberately the long one. */
const DURATION: Record<JobKind, number> = { research: 14_000, followup: 7_000, recalibrate: 9_000 };

/** Kinds limited to one in flight per project. Research is deliberately absent. */
const SERIALISED = new Set<JobKind>(["followup", "recalibrate"]);
const TICK = 250;

/** Where the record lives across reloads. Jobs are LONG — minutes for a real
 *  research run — and a refresh mid-run used to lose the whole thing silently,
 *  including any unread notification about work that had already finished. */
const STORE_KEY = "gravitone.jobs.v1";

interface Persisted { jobs: Job[]; events: JobEvent[] }

function readStore(): Persisted {
  if (typeof localStorage === "undefined") return { jobs: [], events: [] };
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return { jobs: [], events: [] };
    const p = JSON.parse(raw) as Persisted;
    // A job that was RUNNING when the page died is not running now — this
    // prototype's timer went with the tab. Do not resurrect it as live and do
    // not quietly call it done: say it was interrupted, which is the only thing
    // we actually know. (A real local CLI process might well still be going;
    // reattaching to one is a backend problem this prototype does not have.)
    const jobs = (p.jobs ?? []).map((j) =>
      j.status === "running"
        ? { ...j, status: "interrupted" as const, endedAt: Date.now(),
            error: "The page reloaded while this was running. The prototype cannot reattach to it." }
        : j,
    );
    return { jobs, events: p.events ?? [] };
  } catch {
    return { jobs: [], events: [] };
  }
}

export function JobsProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [events, setEvents] = useState<JobEvent[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setInterval>>());
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

  // Persist on every change, but never before rehydration.
  useEffect(() => {
    if (!hydrated || typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ jobs: jobs.slice(0, 50), events: events.slice(0, 50) }));
    } catch {
      // Quota or private mode. Losing persistence is survivable; crashing is not.
    }
  }, [jobs, events, hydrated]);

  useEffect(() => {
    const t = timers.current;
    return () => { t.forEach(clearInterval); t.clear(); };
  }, []);

  const finish = useCallback((job: Job, ok: boolean, detail: string) => {
    setJobs((js) =>
      js.map((j) =>
        j.id === job.id
          ? { ...j, status: ok ? "done" : "failed", progress: 1, endedAt: Date.now(), error: ok ? undefined : detail }
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
        title: `${job.kind === "research" ? "Research" : job.kind === "recalibrate" ? "Recalibration" : "Follow-up"} ${ok ? "returned" : "failed"}`,
        detail,
        at: Date.now(),
        read: false,
      },
      ...es,
    ]);
  }, []);

  const busy = useCallback(
    (projectId: string, kind: JobKind) =>
      jobs.some((j) => j.projectId === projectId && j.kind === kind && j.status === "running"),
    [jobs],
  );

  const followupBusy = useCallback((projectId: string) => busy(projectId, "followup"), [busy]);

  const start = useCallback<JobsApi["start"]>(
    (kind, projectId, label, opts) => {
      // The one refusal. Stated as a rule rather than a disabled button alone,
      // because a caller needs to be able to find out WHY nothing happened.
      if (SERIALISED.has(kind) && jobs.some((j) => j.projectId === projectId && j.kind === kind && j.status === "running"))
        return null;

      const job: Job = {
        id: `j-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        projectId, kind, label, status: "running", startedAt: Date.now(), progress: 0,
      };
      setJobs((js) => [job, ...js]);

      const total = DURATION[kind];
      const started = Date.now();
      const iv = setInterval(() => {
        const p = Math.min(1, (Date.now() - started) / total);
        setJobs((js) => js.map((j) => (j.id === job.id ? { ...j, progress: p } : j)));
        if (p >= 1) {
          clearInterval(iv);
          timers.current.delete(job.id);
          if (opts?.failAfter) {
            finish(job, false, "The local process exited during phase 3. Nothing was written; the notebook is unchanged.");
          } else {
            finish(
              job,
              true,
              kind === "research"
                ? "A notebook is ready for review."
                : kind === "recalibrate"
                  ? "A recalibrated set of scripts is staged — compare it, then accept or run again."
                  : "Results are staged against the notebook — nothing applied yet.",
            );
          }
        }
      }, TICK);
      timers.current.set(job.id, iv);
      return job;
    },
    [jobs, finish],
  );

  const cancel = useCallback((jobId: string) => {
    const iv = timers.current.get(jobId);
    if (iv) { clearInterval(iv); timers.current.delete(jobId); }
    setJobs((js) => js.map((j) => (j.id === jobId ? { ...j, status: "failed", endedAt: Date.now(), error: "Stopped by you." } : j)));
  }, []);

  const value = useMemo<JobsApi>(
    () => ({
      jobs,
      events,
      unread: events.filter((e) => !e.read),
      start,
      cancel,
      followupBusy,
      busy,
      runningFor: (projectId, kind) =>
        jobs.filter((j) => j.projectId === projectId && j.status === "running" && (!kind || j.kind === kind)),
      markRead: (id) => setEvents((es) => es.map((e) => (e.id === id ? { ...e, read: true } : e))),
      markAllRead: () => setEvents((es) => es.map((e) => ({ ...e, read: true }))),
    }),
    [jobs, events, start, cancel, followupBusy, busy],
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
