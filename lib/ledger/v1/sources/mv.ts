import "server-only";

import { z } from "zod";

import { parseAt, type Parsed } from "@gt/domain/door";
import { err, errorMessage, ok, type Result } from "@gt/domain/errors";
import type { Actor, EventData } from "@gt/domain/event";
import type { JobState } from "@gt/domain/job";

import { pidAlive } from "../../../../lib/gpu/lease.ts";
import { cleanTitle, readMv } from "../../../../lib/sound/mv/store.ts";
import { readSuno } from "../../../../lib/sound/suno/store.ts";
import { isScoutSunoJob } from "../../../../lib/foundry/scout/types.ts";
import { bump, digest, facts, instant } from "../facts.ts";
import type { IngestEvent, LiveJob, ProjectCtx, Projection, Source, WeirItem } from "../types.ts";

// THE MUSIC-VIDEO QUEUE, PROJECTED - <sound store>/mv.json (lib/sound/mv/store.ts),
// read through `readMv`. Not `mvSnapshot`: like Suno's, it probes the still
// vendor and kicks the worker, which spends two text turns and a Leonardo
// still per job (lib/sound/mv/queue.ts header).
//
// THE ATTEMPT IS THE KEY. Retry and Regenerate DELETE `endedAt` and restamp
// `enqueuedAt` (queue.ts retryMv, regenerateMv), and every run restamps
// `startedAt`; a job's clocks are rewritten once per attempt. So each clock is
// keyed by the attempt it belongs to - `enqueue.<enqueuedAt>`,
// `start.<startedAt>`, `end.<startedAt>.<endedAt>` - and an `endedAt` the
// ledger saw survives the retry that erased it from mv.json, as the event it
// already is. An attempt a sync never saw (retried between two syncs) is lost
// to the ledger; mv.json kept no trace of it either.
// The verdict has no instant and is reset by Regenerate: observed, keyed by
// the attempt and the value.
//
// LIVE: queued and active jobs. `active` is running - unless mv.json's
// `worker` lease names a pid that is gone, which is a crashed run v1 will
// recover on its next start: interrupted. `queued` is queued while the switch
// is on, paused while it is off, and interrupted when `queue.interrupted`
// names it (recover() quotes cleanTitle(source.title), so the same function
// matches it here). Lane box.render: the 1080p render dominates the job,
// though a job also spends text turns and a Leonardo still - those are booked
// by the spend source on their own lanes.
//
// SINCE PHASE 4 (L31) A RECORD WHOSE CURRENT ATTEMPT IS A KERNEL JOB (`job`) is the
// kernel's to show live: the Runs view reads that job (state, slot, step,
// interruption) straight from the job store, so it is left out of `live` here
// rather than drawn twice from a mirror that lags the job. Its clocks, verdict
// and the weir still project from mv.json, which stays the artefact store.
// `queue.running`, `queue.interrupted` and `worker` are only ever v1's now.
//
// THE WEIR: finished videos with no verdict are one cull pile (Board > Settled).

const jobSchema = z.object({
  id: z.string().min(1),
  source: z.object({ kind: z.string(), id: z.string(), title: z.string() }),
  state: z.enum(["queued", "active", "done", "failed", "cancelled"]),
  phase: z.string().optional(),
  redo: z.array(z.string()).optional(),
  look: z.string().optional(),
  verdict: z.enum(["keep", "drop"]).nullable(),
  error: z.string().optional(),
  slotId: z.string().optional(),
  enqueuedAt: z.number(),
  /** The kernel job of the current attempt (lib/producers/mv.ts); absent on a v1-only record. */
  job: z.string().optional(),
  startedAt: z.number().optional(),
  endedAt: z.number().optional(),
});
const fileSchema = z.object({
  queue: z.object({ running: z.boolean(), interrupted: z.string().optional() }),
  jobs: z.array(jobSchema),
  worker: z.object({ pid: z.number(), at: z.number() }).optional(),
});

export type MvSnapshot = Parsed<z.output<typeof fileSchema>> & {
  /** Whether mv.json's worker lease names a live process; null when no lease is held. Probed by the reader. */
  readonly workerAlive: boolean | null;
  /** Suno clip ids of scout tracks: a visualizer over one is judged on its night's packet, not in this pile. */
  readonly scoutClips: ReadonlySet<string>;
};
type Job = MvSnapshot["jobs"][number];

const QUEUE: Actor = { kind: "machine", id: "mv-queue" };
const OPERATOR: Actor = { kind: "operator", id: "operator" };
const HREF = "/board";
/** The phases in the order a first run walks them (queue.ts header: writing runs BEFORE rendering, not MV_PHASES' list order). */
const RUN_ORDER: readonly string[] = ["fetching", "analysing", "treating", "imaging", "writing", "rendering"];

async function read(): Promise<Result<MvSnapshot>> {
  let raw: unknown;
  try {
    raw = await readMv();
  } catch (e) {
    return err("unavailable", `mv: readMv failed: ${errorMessage(e)}`, { cause: e });
  }
  const p = parseAt("mv.json", fileSchema, raw);
  if (!p.ok) return p;
  let scoutClips: ReadonlySet<string>;
  try {
    scoutClips = new Set((await readSuno()).clips.filter((c) => isScoutSunoJob(c.jobId)).map((c) => c.id));
  } catch (e) {
    return err("unavailable", `mv: readSuno failed: ${errorMessage(e)}`, { cause: e });
  }
  return ok({ ...p.value, workerAlive: p.value.worker === undefined ? null : pidAlive(p.value.worker.pid), scoutClips });
}

/** The queued job recover() named in `queue.interrupted`, by its cleaned, quoted title. */
export function interruptedMv(jobs: readonly Job[], sentence: string | undefined): string | null {
  if (sentence === undefined) return null;
  return jobs.find((j) => j.state === "queued" && sentence.startsWith(`"${cleanTitle(j.source.title)}"`))?.id ?? null;
}

function eventsOf(s: MvSnapshot, ctx: ProjectCtx): IngestEvent[] {
  const f = facts("mv", ctx);
  const out: IngestEvent[] = [];
  for (const j of s.jobs) {
    const subject = { kind: "job", id: j.id };
    const data: EventData = { runId: j.id, title: j.source.title, track: `${j.source.kind}:${j.source.id}`, ...(j.redo === undefined ? {} : { redo: j.redo }) };
    const at = { subject, lane: "box.render" } as const;
    const attempt = String(j.startedAt ?? "unstarted");
    out.push(f.recorded(j.id, `enqueue.${j.enqueuedAt}`, j.enqueuedAt, { ...at, actor: OPERATOR, type: "job.enqueue", data }));
    if (j.startedAt !== undefined) out.push(f.recorded(j.id, `start.${j.startedAt}`, j.startedAt, { ...at, actor: QUEUE, type: "job.start", data }));
    if (j.endedAt !== undefined) {
      out.push(f.recorded(j.id, `end.${attempt}.${j.endedAt}`, j.endedAt, { ...at, actor: QUEUE, type: "job.end", data: { ...data, state: j.state, ...(j.error === undefined ? {} : { error: j.error }) } }));
    }
    if (j.verdict !== null) out.push(f.observed(j.id, `verdict.${attempt}.${j.verdict}`, { actor: OPERATOR, type: `verdict.${j.verdict}`, subject, data: { runId: j.id } }));
  }
  const why = s.queue.interrupted;
  if (why !== undefined) out.push(f.observed("queue", `interrupt.${digest(why)}`, { actor: QUEUE, type: "queue.interrupt", subject: { kind: "queue", id: "mv" }, data: { error: why } }));
  return out;
}

function tallyOf(s: MvSnapshot): Projection["tally"] {
  const records: Record<string, number> = {};
  const fs: Record<string, number> = {};
  for (const j of s.jobs) {
    bump(records, `job.${j.state}`);
    bump(fs, "job.enqueue");
    if (j.startedAt !== undefined) bump(fs, "job.start");
    if (j.endedAt !== undefined) bump(fs, "job.end");
    if (j.verdict !== null) bump(fs, `verdict.${j.verdict}`);
  }
  if (s.queue.interrupted !== undefined) bump(fs, "queue.interrupt");
  return { records, facts: fs };
}

function stateOf(j: Job, s: MvSnapshot, named: string | null): JobState {
  if (j.state === "active") return s.workerAlive === false ? "interrupted" : "running";
  if (j.id === named) return "interrupted";
  return s.queue.running ? "queued" : "paused";
}

function liveOf(s: MvSnapshot): LiveJob[] {
  const named = interruptedMv(s.jobs, s.queue.interrupted);
  return s.jobs
    .filter((j) => (j.state === "queued" || j.state === "active") && j.job === undefined)
    .map((j) => {
      const state = stateOf(j, s, named);
      const startedAt = j.state === "active" ? instant(j.startedAt) : null;
      const error = j.id === named ? s.queue.interrupted : state === "interrupted" && s.worker !== undefined ? `the worker process ${s.worker.pid} that held mv.json is gone` : j.error;
      return {
        source: "mv",
        id: j.id,
        title: `video ${j.source.title}`,
        lane: "box.render" as const,
        media: "video" as const,
        state,
        ...(startedAt === null ? {} : { startedAt }),
        ...(j.phase === undefined ? {} : { progress: { done: Math.max(0, RUN_ORDER.indexOf(j.phase)), total: RUN_ORDER.length, stage: j.phase } }),
        ...(error === undefined ? {} : { error }),
        href: HREF,
      };
    });
}

function weirOf(s: MvSnapshot): WeirItem[] {
  const done = s.jobs.filter((j) => j.state === "done" && !(j.source.kind === "clip" && s.scoutClips.has(j.source.id)));
  const pending = done.filter((j) => j.verdict === null);
  if (pending.length === 0) return [];
  const oldest = instant(Math.min(...pending.map((j) => j.endedAt ?? j.enqueuedAt)));
  return [{ source: "mv", id: "mv/settled", title: "videos to judge", media: "video", kind: "cull", ...(oldest === null ? {} : { since: oldest }), decided: done.length - pending.length, pending: pending.length, href: HREF }];
}

export function projectMv(s: MvSnapshot, ctx: ProjectCtx): Projection {
  return { events: eventsOf(s, ctx), live: liveOf(s), weir: weirOf(s), tally: tallyOf(s), skipped: [] };
}

export const mvSource: Source<MvSnapshot> = { id: "mv", read, project: projectMv };
