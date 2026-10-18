// THE BELL'S JOBS - the shape of a server Job as the bell and the harness read it (Phase 4 wave D;
// plan §6: "retire `lib/jobs.tsx` serialisation").
//
// WHAT RETIRED, IN TWO STEPS. This file used to BE a job system: a browser-side queue that started
// the v1 studio's runs and serialised them one per project across tabs through a localStorage
// record (`gravitone.jobs.v1`); Phase 4 wave D cut it down to a view - a root-mounted
// `JobsProvider` that read the server's jobs, re-read on the event stream, and kept this viewer's
// read marks - because the serialisation it approximated is the kernel's lanes and leases now.
// Phase 6 wave C took the provider out of the root layout (it subscribed every page, the
// landing's included, to /api/events/stream for a bell only v1's StudioFrame drew), and L74
// swept what nothing reached after that: the provider and `useJobs`, `jobNoun` and `eventsOf`
// (the bell's settled-job news), the read marks, the elapsed clock (`formatElapsed`,
// `useElapsed`, `JobElapsed`), and the identity-eviction door the provider listened on - with no
// provider mounted there is no in-memory copy of anyone's jobs in the browser to evict;
// lib/identityEviction.ts still removes the `gravitone.jobs.v1` key a v1 browser left behind.
//
// WHAT IS LEFT is the shape (`Job`, `BellRead`), read by the bell's server read
// (app/(studio)/_shell/bell.ts, bellJobs.ts) and the live harness's snapshot
// (components/ui/HarnessBridge.tsx), and the one count the harness takes over it.

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

/** What the server action answers: the jobs, and the ledger seq they were read at. */
export type BellRead = { readonly jobs: readonly Job[]; readonly head: number };
export type BellReader = () => Promise<{ readonly ok: true; readonly value: BellRead } | { readonly ok: false; readonly error: { readonly error: string } }>;

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
