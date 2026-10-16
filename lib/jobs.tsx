"use client";

// THE BELL'S JOBS - a view of the server's Jobs (Phase 4 wave D; plan §6: "retire `lib/jobs.tsx`
// serialisation").
//
// WHAT RETIRED. This file used to BE a job system: a browser-side queue that started research,
// follow-up, recalibrate, poster, export and ad runs from the studio steps, serialised one per
// project across tabs through a localStorage record (`gravitone.jobs.v1`, merged on `storage`
// events), watched server turns by polling, and settled driven jobs by hand. Every one of those
// starters lived in the v1 studio, which retired; work now runs as kernel Jobs (`@gt/kernel/job`)
// launched from the Plan and the composers, and the serialisation rules it enforced in the browser
// are the kernel's lanes and leases (one slot per paid lane, fenced) - enforced where the work
// runs, for every tab and every CLI at once, which the browser record could only approximate.
//
// WHAT IS LEFT is the part that was always a view: "is it still going?" and "what happened while
// I was not looking?". The provider reads the server's job list through a server action the root
// layout hands it (`read`, app/(studio)/_shell/bellJobs.ts) and re-reads when the event ledger
// says a job moved (the realtime-events rule the studio pages keep: events carry advice, reads
// carry truth - app/(studio)/_shell/liveFeed.ts). Nothing about a job is written here.
//
// THE ONE THING KEPT IN THE BROWSER is this viewer's read marks: which settled jobs they have seen.
// That is a per-viewer convenience, not state anyone else needs, and it lives under the same key
// the job record did so lib/identityEviction.ts clears it with the account (its `JOBS_KEY`), and
// the eviction door below drops the in-memory copy - the next account must not read the last
// one's job list off a mounted provider.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { usePolling } from "./usePolling";

export type JobStatus = "running" | "done" | "failed" | "interrupted";

/** One server Job as the bell draws it (projected server-side from the produce port's job view). */
export interface Job {
  /** The kernel job id (`job:<run|part>:<id>`). */
  id: string;
  /** The media lane, or `part` for a project's part: what the bell calls the work. */
  kind: string;
  label: string;
  status: JobStatus;
  startedAt: number;
  endedAt?: number;
  projectId?: string;
  /** Where the job is read in full: its row in Runs. */
  href: string;
  error?: string;
  /** Kernel jobs report no fraction; kept so a card can choose between a track and a shimmer. */
  measured: boolean;
  progress: number;
  clearedAt?: number;
}

/** A settled job the viewer has not looked at yet. */
export interface JobEvent {
  id: string;
  jobId: string;
  projectId?: string;
  kind: string;
  ok: boolean;
  title: string;
  detail: string;
  at: number;
  href: string;
  read: boolean;
}

/** What the server action answers: the jobs, and the ledger seq they were read at. */
export type BellRead = { readonly jobs: readonly Job[]; readonly head: number };
export type BellReader = () => Promise<{ readonly ok: true; readonly value: BellRead } | { readonly ok: false; readonly error: { readonly error: string } }>;

interface JobsApi {
  jobs: Job[];
  events: JobEvent[];
  unread: JobEvent[];
  /** Hide an interrupted job's card here; acknowledging its lane is Runs' act (`ackLane`). */
  clear: (jobId: string) => void;
  markRead: (eventId: string) => void;
  markAllRead: () => void;
}

const Ctx = createContext<JobsApi | null>(null);

const NOUN: Readonly<Record<string, string>> = { image: "Image run", video: "Video run", audio: "Audio run", article: "Article", part: "Part" };

/** The name a job goes by in the bell, running and settled alike. */
export function jobNoun(kind: string): string {
  return NOUN[kind] ?? kind;
}

/** A settled job as an event: its identity includes the ending, so a retried job that ends
 *  again is news again. */
export function eventsOf(jobs: readonly Job[], marks: Marks): JobEvent[] {
  const out: JobEvent[] = [];
  for (const j of jobs) {
    if ((j.status !== "done" && j.status !== "failed") || j.endedAt === undefined) continue;
    const id = `${j.id}@${j.endedAt}`;
    const ok = j.status === "done";
    out.push({
      id,
      jobId: j.id,
      ...(j.projectId === undefined ? {} : { projectId: j.projectId }),
      kind: j.kind,
      ok,
      title: `${jobNoun(j.kind)} ${ok ? "finished" : "failed"}`,
      detail: ok ? j.label : (j.error ?? j.label),
      at: j.endedAt,
      href: j.href,
      read: j.endedAt <= marks.seenAt || marks.read.includes(id),
    });
  }
  return out.sort((a, b) => b.at - a.at || a.id.localeCompare(b.id));
}

// ── the viewer's read marks ──────────────────────────────────────────────────

/** `seenAt`: every ending at or before it is read. `read`: endings read one by one after it. */
export type Marks = { readonly seenAt: number; readonly read: readonly string[] };
const STORE_KEY = "gravitone.jobs.v1";
const MARKS_V = 2;
const READ_CAP = 200;

/** The stored marks' door, by hand. THIS PROVIDER IS MOUNTED BY THE ROOT LAYOUT, so whatever it
 *  imports ships on every route: a zod door here (`zod/mini`'s namespace plus `@gt/domain/door`)
 *  measured +56 KB gzip of first-load JS on each page (L44's final verify) to check three fields.
 *  The jobs themselves arrive already parsed (the server action's answer); the marks are the one
 *  thing read off the browser, and a three-field shape is checked here directly. The retired job
 *  store's v1 record (a jobs array, no `v`) is not marks. */
function marksOf(v: unknown): Marks | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const { v: version, seenAt, read } = v as { v?: unknown; seenAt?: unknown; read?: unknown };
  if (version !== MARKS_V || typeof seenAt !== "number" || !Number.isFinite(seenAt)) return null;
  if (!Array.isArray(read) || !read.every((x): x is string => typeof x === "string")) return null;
  return { seenAt, read: read.slice(-READ_CAP) };
}

/** Parse the stored marks. A v1 record (the retired job store) or anything unreadable is not
 *  marks: the watermark starts at `now`, so a first visit is not a flood of old endings. */
export function parseMarks(raw: string | null, now: number): Marks {
  if (raw === null) return { seenAt: now, read: [] };
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    // A torn write is no marks, the same answer as a missing record.
    return { seenAt: now, read: [] };
  }
  return marksOf(v) ?? { seenAt: now, read: [] };
}

function loadMarks(): Marks {
  try {
    return parseMarks(window.localStorage.getItem(STORE_KEY), Date.now());
  } catch {
    // Storage blocked (a private window): marks live for this page only.
    return { seenAt: Date.now(), read: [] };
  }
}

function saveMarks(m: Marks): void {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify({ v: MARKS_V, seenAt: m.seenAt, read: m.read.slice(-READ_CAP) }));
  } catch {
    // The marks are a convenience: unsaved, they last as long as the page.
  }
}

// ── the eviction door (kept from the job store; lib/identityEviction.ts calls in) ──
//
// THE DIRECTION OF THE IMPORT IS THE DESIGN: identityEviction imports every store it clears and
// none imports it. This module publishes a subscription; the provider registers on mount, and the
// eviction calls in.
const evictionListeners = new Set<() => void>();

export function onIdentityEvicted(fn: () => void): () => void {
  evictionListeners.add(fn);
  return () => void evictionListeners.delete(fn);
}

/** Tell every mounted provider the identity is gone. Returns how many were told (zero is a real
 *  answer: no provider mounted). Called ONLY by lib/identityEviction.ts. */
export function __announceIdentityEvicted(): number {
  let told = 0;
  for (const fn of evictionListeners) {
    fn();
    told++;
  }
  return told;
}

/** How many providers `__announceIdentityEvicted` would tell, without telling them (the dry run). */
export function __identityEvictionListenerCount(): number {
  return evictionListeners.size;
}

// ── the provider ─────────────────────────────────────────────────────────────

const COALESCE_MS = 1_500;

export function JobsProvider({ children, read }: { children: React.ReactNode; read?: BellReader }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [head, setHead] = useState<number | null>(null);
  const [marks, setMarks] = useState<Marks>({ seenAt: Number.MAX_SAFE_INTEGER, read: [] });
  const [cleared, setCleared] = useState<ReadonlySet<string>>(new Set());
  const reading = useRef(false);
  // The marks are read with the first answer, not on mount: they matter only once there are jobs to
  // mark, and a server render must not read a browser's storage.
  const marksRead = useRef(false);

  const reread = useCallback(async () => {
    if (read === undefined || reading.current) return;
    reading.current = true;
    try {
      const r = await read();
      // A refused read (signed out, the kernel down) leaves the bell as it was: the stream's
      // next advice, or the next visible moment, asks again.
      if (r.ok) {
        if (!marksRead.current) {
          marksRead.current = true;
          setMarks(loadMarks());
        }
        setJobs([...r.value.jobs]);
        setHead(r.value.head);
      }
    } finally {
      reading.current = false;
    }
  }, [read]);

  useEffect(() => {
    void reread();
    return onIdentityEvicted(() => {
      setJobs([]);
      setCleared(new Set());
      marksRead.current = true;
      setMarks({ seenAt: Date.now(), read: [] });
    });
  }, [reread]);

  // ADVICE: the ledger's stream from the seq the list was read at. A job.* event is a reason to
  // re-read; a burst is one re-read. Closed on pagehide (back/forward cache), reopened on show.
  useEffect(() => {
    if (head === null || read === undefined) return;
    let es: EventSource | null = null;
    let timer: number | null = null;
    const soon = (): void => {
      if (timer !== null) return;
      timer = window.setTimeout(() => {
        timer = null;
        void reread();
      }, COALESCE_MS);
    };
    const open = (): void => {
      if (es !== null) return;
      es = new EventSource(`/api/events/stream?after=${head}`);
      es.onmessage = (m: MessageEvent<string>) => {
        if (/"type":"job\./.test(m.data)) soon();
      };
      es.addEventListener("reset", soon);
      // An erroring stream (signed out, a restart) is closed rather than retried forever; the
      // next visible moment re-reads and reopens from the new head.
      es.onerror = () => shut();
    };
    const shut = (): void => {
      es?.close();
      es = null;
    };
    const shown = (): void => {
      if (document.visibilityState === "visible") void reread();
    };
    open();
    window.addEventListener("pagehide", shut);
    window.addEventListener("pageshow", open);
    document.addEventListener("visibilitychange", shown);
    return () => {
      shut();
      window.removeEventListener("pagehide", shut);
      window.removeEventListener("pageshow", open);
      document.removeEventListener("visibilitychange", shown);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [head, read, reread]);

  const shown = useMemo(() => jobs.filter((j) => !cleared.has(j.id)), [jobs, cleared]);
  const events = useMemo(() => eventsOf(shown, marks), [shown, marks]);
  const unread = useMemo(() => events.filter((e) => !e.read), [events]);

  const markRead = useCallback((eventId: string) => {
    setMarks((m) => {
      if (m.read.includes(eventId)) return m;
      const next = { seenAt: m.seenAt, read: [...m.read, eventId].slice(-READ_CAP) };
      saveMarks(next);
      return next;
    });
  }, []);
  const markAllRead = useCallback(() => {
    setMarks((m) => {
      const latest = events.reduce((t, e) => Math.max(t, e.at), m.seenAt);
      const next = { seenAt: latest, read: [] };
      saveMarks(next);
      return next;
    });
  }, [events]);
  const clear = useCallback((jobId: string) => setCleared((s) => new Set([...s, jobId])), []);

  const api = useMemo<JobsApi>(() => ({ jobs: shown, events, unread, clear, markRead, markAllRead }), [shown, events, unread, clear, markRead, markAllRead]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useJobs(): JobsApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useJobs must be used inside <JobsProvider>");
  return v;
}

/** How many jobs there are and how many still run: the server's jobs, plus turn-backed work read
 *  from the turn ledger (counted once by id; the harness snapshot, lib/harness/protocol.ts). */
export function jobCounts(local: readonly Job[], ledger: readonly { readonly id: string; readonly status: string }[]): { running: number; total: number } {
  const live = new Set(["accepted", "running"]);
  const ids = new Set(local.map((j) => j.id));
  let running = local.filter((j) => j.status === "running").length;
  let total = local.length;
  for (const t of ledger) {
    if (ids.has(t.id)) continue;
    total++;
    if (live.has(t.status)) running++;
  }
  return { running, total };
}

/** m:ss from a minute up (the repo's duration convention), bare seconds below it. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) return `${total}s`;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** The clock runs only while the job runs (and the tab is visible, via usePolling). */
export function useElapsed(j: Job): string {
  const [now, setNow] = useState(() => Date.now());
  usePolling(() => setNow(Date.now()), 1000, j.status === "running");
  return formatElapsed((j.endedAt ?? now) - j.startedAt);
}

/** The count as a node, for call sites that map over jobs and cannot call a hook. */
export function JobElapsed({ job }: { job: Job }) {
  return <>{useElapsed(job)}</>;
}
