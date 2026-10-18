// THE MUSIC-VIDEO QUEUE - the operator's acts on mv.json's records, and the
// snapshot the Settled column reads. Server-only.
//
// SINCE PHASE 4 (L31) A TRACK'S VIDEO IS A KERNEL JOB. The v1 worker that lived
// here - the `globalThis.__gtMvWorker` singleton, its mv.json pid lease,
// `kickMvWorker`, the first-start recovery that switched the whole queue off -
// is gone; packages/producers/src/mv is the definition (step order, redo table,
// never-re-spend), lib/producers/mv.ts binds it to ./steps.ts and to this
// store, and the kernel leases box.render, recovers crashes and holds the
// spend. mv.json stays the ARTEFACT store: every record, file, treatment and
// verdict is written here as before, so the board, the batch, the ledger and
// the decision readers read what they always read. The kernel job is the
// truth for RUNNING state, and `mvSnapshot` overlays it onto the records.
//
// WHAT AN ACT DOES, NOW:
//   enqueue     a record per track, `queued` - FREE, as v1: queueing a track
//               never starts it. Idempotent per track while a job is live.
//   Start       the column's switch on: every queued record without a job is
//               LAUNCHED (a receipt, confirmed by the press - the board's arm
//               was the confirmation), paused jobs resume, and an interrupted
//               one is retried (Start was v1's "I have looked").
//   Stop        every waiting or running job pauses; the step in flight
//               finishes and lands, and the next Start does only what is missing.
//   regenerate  a NEW attempt (a new job): the record re-queued with its part's
//               redo; launched at once while the switch is on.
//   retry       the SAME job back in line (kernel retry, attempt++), every file
//               and redo kept: the run resumes at the step that failed.
//   delete      a waiting job cancelled; a finished record removed with its
//               folder; a job being made right now refused (409).
// Nothing here drives a job: the worker (L27) or the CLI does.

import { rm } from "node:fs/promises";

import type { Job } from "@gt/domain/job";
import { PHASE_OF, isMvStep } from "@gt/producers/mv/plan";

import type { Receipt } from "@gt/domain/produce";

import { cancelMvJob, launchMv, launchMvNow, mvKernelId, mvKernelJobs, pauseMvJob, pauseMvJobs, resumeMvJobs, retryMvJob } from "@/lib/producers/mv";
import { OPERATOR } from "@/lib/producers/sound";

import { filePathAbs, safeId, SoundError } from "../store";
import { assertSourceHasAudio } from "./fetchAudio";
import { applyMetadataPatch } from "./metadata";
import { DEFAULT_ENGINES } from "./steps";
import { cleanTitle, DROPPED_FILES, isLiveJob, jobDirRel, mintMvId, readMv, withMv, type MvFile } from "./store";
import type { MvLookId } from "./looks";
import { MV_PARTS, type MvJob, type MvPart, type MvQueueState, type MvSnapshot, type MvSource } from "./types";

export { PHASE_OF, planOf, REDO_STEPS, STEP_ORDER } from "@gt/producers/mv/plan";
export type { MvEngines, StillImage, StillRequest } from "./steps";

/* ── the running-state overlay ────────────────────────────────────────────── */

/**
 * The records as the kernel has them running: a job's state wins over the
 * record's mirror of it (decision 9). An interrupted job reads `queued` with
 * the column's `interrupted` sentence naming it and its phase - the wire the
 * board and lib/ledger/v1/sources/mv.ts `interruptedMv` already read.
 */
export function overlayMv(jobs: readonly MvJob[], kernel: ReadonlyMap<string, Job>): { jobs: MvJob[]; interrupted?: string } {
  let interrupted: string | undefined;
  const out = jobs.map((j): MvJob => {
    const k = kernel.get(mvKernelId(j));
    const { phase: _phase, ...still } = j;
    if (k === undefined) {
      // A record left `active` with no job is a v1 worker's crash from before the
      // kernel drove this queue: v1's recover() said so and waited for Start, and
      // so does this - Start launches it, and it resumes at its missing step.
      if (j.state !== "active") return j;
      const look = j.phase === "imaging" ? "; a still may have been spent in the Leonardo studio - check it before starting" : "; check it before starting";
      interrupted ??= `"${cleanTitle(j.source.title)}" was interrupted${j.phase ? ` while ${j.phase}` : ""} when the server stopped${look}`;
      return { ...still, state: "queued" };
    }
    switch (k.state) {
      case "running":
        return { ...j, state: "active" };
      case "planned":
      case "queued":
      case "paused":
        return { ...still, state: "queued" };
      case "interrupted": {
        const stage = k.interruption?.stage;
        const while_ = stage !== undefined && isMvStep(stage) ? ` while ${PHASE_OF[stage]}` : "";
        const look = stage === "still" ? "; a still may have been spent in the Leonardo studio - check it before starting" : "; check it before starting";
        interrupted ??= `"${cleanTitle(j.source.title)}" was interrupted${while_} when its driver stopped${look}`;
        return { ...still, state: "queued" };
      }
      case "failed":
        return { ...still, state: "failed", error: j.error ?? k.error?.message ?? "failed" };
      case "cancelled":
        return { ...still, state: "cancelled" };
      case "done":
        return j;
    }
  });
  return interrupted === undefined ? { jobs: out } : { jobs: out, interrupted };
}

/** The records with the kernel's running state on them. */
export async function readMvLive(): Promise<{ file: MvFile; jobs: MvJob[]; interrupted?: string }> {
  const file = await readMv();
  return { file, ...overlayMv(file.jobs, mvKernelJobs()) };
}

/* ── enqueue / regenerate / retry / patch / delete ────────────────────────── */

function parseSource(v: unknown, i: number): MvSource {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  if (o.kind !== "take" && o.kind !== "clip") throw new SoundError(`sources[${i}].kind must be "take" or "clip"`, 400);
  if (typeof o.id !== "string" || !o.id) throw new SoundError(`sources[${i}].id must be the take or clip id`, 400);
  safeId(o.id);
  const title = typeof o.title === "string" ? o.title.replace(/\s+/g, " ").trim().slice(0, 200) : "";
  if (!title) throw new SoundError(`sources[${i}].title must be the track's title`, 400);
  return { kind: o.kind, id: o.id, title };
}

export function parseEnqueue(body: unknown): MvSource[] {
  const list = body && typeof body === "object" ? (body as { sources?: unknown }).sources : undefined;
  if (!Array.isArray(list) || !list.length) throw new SoundError('"sources" must be a non-empty list of { kind, id, title }', 400);
  return list.map(parseSource);
}

const sameSource = (a: MvSource, b: MvSource) => a.kind === b.kind && a.id === b.id;

/** The column's mode: a process that may only run dry (every test lane, the
 *  fixture universe) launches dry; otherwise Start is the operator's live arm. */
const columnMode = (): "dry" | "live" => (process.env["GRAVITONE_DRY_ONLY"] === "1" ? "dry" : "live");

/** While the switch is on, what was just queued is launched at once (v1: the kick drained it). */
async function launchIfRunning(ids: readonly string[]): Promise<void> {
  if (!ids.length || !(await readMv()).queue.running) return;
  await launchMvNow(ids, { mode: columnMode(), actor: OPERATOR });
}

/** Queue a record per track, in the order given. Idempotent: a track already
 *  holding a queued or active record returns it instead of a second one. A
 *  track with a FINISHED record gets a new one - another video of the same song
 *  is a legitimate ask; Regenerate is the edit of an existing one. */
export async function enqueueMv(sources: readonly MvSource[], now = Date.now(), opts: { prompt?: string; stillFrom?: string; look?: MvLookId; launch?: boolean } = {}): Promise<MvJob[]> {
  for (const s of sources) await assertSourceHasAudio(s);
  const prompt = opts.prompt?.replace(/\s+/g, " ").trim();
  const made: string[] = [];
  const jobs = await withMv((f) =>
    sources.map((s, i) => {
      const live = f.jobs.find((j) => sameSource(j.source, s) && isLiveJob(j));
      if (live) return { ...live };
      const job: MvJob = { id: mintMvId(), source: { ...s }, state: "queued", files: {}, verdict: null, enqueuedAt: now + i, ...(prompt ? { prompt } : {}), ...(opts.stillFrom ? { stillFrom: opts.stillFrom } : {}), ...(opts.look ? { look: opts.look } : {}) };
      f.jobs.push(job);
      made.push(job.id);
      return { ...job };
    }),
  );
  // The batch launches its own records under its own mode and ceiling.
  if (opts.launch !== false) await launchIfRunning(made);
  return jobs;
}

async function existing(id: string): Promise<void> {
  safeId(id);
  // Read-only existence check BEFORE the lock, so a bad id is a 404 that
  // never creates the store directory.
  if (!(await readMv()).jobs.some((j) => j.id === id)) throw new SoundError(`no music-video job ${id}`, 404);
}

function find(f: MvFile, id: string): MvJob {
  const j = f.jobs.find((x) => x.id === id);
  if (!j) throw new SoundError(`no music-video job ${id}`, 404);
  return j;
}

/** The record's state with its job's running state on it. */
async function liveState(id: string): Promise<{ j: MvJob; k: Job | undefined }> {
  const { file, jobs } = await readMvLive();
  const j = jobs.find((x) => x.id === id);
  if (!j) throw new SoundError(`no music-video job ${id}`, 404);
  const raw = find(file, id);
  return { j, k: mvKernelJobs().get(mvKernelId(raw)) };
}

export function parseRegenerate(body: unknown): { part: MvPart; note?: string; prompt?: string } {
  const o = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const part = MV_PARTS.find((p) => p === o.part);
  if (!part) throw new SoundError(`"part" must be one of ${MV_PARTS.join(", ")}`, 400);
  if (o.note !== undefined && o.note !== null && typeof o.note !== "string") throw new SoundError('"note" must be a string', 400);
  const note = typeof o.note === "string" ? o.note.replace(/\s+/g, " ").trim().slice(0, 500) : "";
  if (o.prompt !== undefined && o.prompt !== null && typeof o.prompt !== "string") throw new SoundError('"prompt" must be a string', 400);
  const prompt = typeof o.prompt === "string" ? o.prompt.replace(/\s+/g, " ").trim() : "";
  if (prompt && part !== "image") throw new SoundError(`"prompt" is the still's prompt; it goes with part "image" only`, 400);
  // The treatment's ceiling minus room for the welded no-text clause.
  if (prompt.length > 1400) throw new SoundError(`"prompt" is ${prompt.length} characters; the still's prompt holds 1400`, 400);
  return { part, ...(note ? { note } : {}), ...(prompt ? { prompt } : {}) };
}

export type RegenerateAsk = { readonly part: MvPart; readonly note?: string; readonly prompt?: string };

/**
 * THE REGENERATE RECORD EDIT, ONCE: a done or failed record as its next attempt, stamped `at`.
 * Pure, so the receipt can price exactly the record the confirm will write - the new-world act
 * (lib/producers/mvActs.ts regenerateMvAct) prices it on the read and writes it on the confirm;
 * `regenerateMv` below writes it at once. It used to be written twice, field for field, and two
 * copies of "which fields a new attempt clears" are two that can disagree. A new attempt is a new
 * job: the old one's id, error, phase and end go; the note and the still's own prompt are this
 * ask's or nothing (a later regenerate without a prompt forgets it); the verdict is unjudged.
 */
export function regeneratedRecord(j: MvJob, ask: RegenerateAsk, at: number): MvJob {
  const { note: _n, prompt: _p, job: _j, error: _e, phase: _ph, endedAt: _end, ...rest } = j;
  return { ...rest, state: "queued", redo: [ask.part], verdict: null, enqueuedAt: at, ...(ask.note ? { note: ask.note } : {}), ...(ask.prompt && ask.part === "image" ? { prompt: ask.prompt } : {}) };
}

/** Re-queue one part of a done or failed record, as a new attempt - v1's receipt-less act, kept
 *  for the probe lane's v1 route harness and the CLI drive tests; the Runs inspector's Regenerate
 *  is regenerateMvAct, which never launches without a receipt. */
export async function regenerateMv(id: string, req: RegenerateAsk, now = Date.now()): Promise<MvJob> {
  await existing(id);
  const { j: live, k } = await liveState(id);
  if (live.state !== "done" && live.state !== "failed") throw new SoundError(`this job is ${live.state}; only a finished or failed video can be regenerated`, 409);
  // The failed attempt's job is closed, so nobody retries it into a record that has moved on.
  if (k !== undefined && k.state === "failed") cancelMvJob(k.id, OPERATOR);
  const job = await withMv((f) => {
    const cur = find(f, id);
    const next = regeneratedRecord(cur, req, Math.max(now, cur.enqueuedAt + 1));
    f.jobs[f.jobs.indexOf(cur)] = next;
    delete f.progress[id];
    return { ...next };
  });
  // A new attempt: a new job, launched by Start (or at once while the switch is on).
  await launchIfRunning([job.id]);
  return job;
}

/** A failed record back in line as it stands: its job is retried (the same
 *  attempt), every file and redo kept, so it resumes at the step that failed
 *  instead of re-rolling a part (Regenerate is the re-roll). */
export async function retryMv(id: string, now = Date.now(), opts: { launch?: boolean } = {}): Promise<MvJob> {
  await existing(id);
  const { j: live, k } = await liveState(id);
  if (live.state !== "failed") throw new SoundError(`this job is ${live.state}; only a failed video is retried`, 409);
  const job = await withMv((f) => {
    const j = find(f, id);
    j.state = "queued";
    delete j.error;
    delete j.phase;
    delete j.endedAt;
    if (k === undefined) j.enqueuedAt = now;
    return { ...j };
  });
  if (k === undefined) {
    if (opts.launch !== false) await launchIfRunning([job.id]);
    return job;
  }
  retryMvJob(k.id, OPERATOR);
  // The switch is off: the job waits paused, as a v1 retry waited for Start.
  if (opts.launch !== false && !(await readMv()).queue.running) pauseMvJob(k.id, OPERATOR);
  return job;
}

export interface MvPatch {
  verdict?: MvJob["verdict"];
  metadata?: unknown;
}

export function parsePatch(body: unknown): MvPatch {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new SoundError("a patch must be a JSON object", 400);
  const b = body as Record<string, unknown>;
  const out: MvPatch = {};
  if ("verdict" in b) {
    if (!(b.verdict === "keep" || b.verdict === "drop" || b.verdict === null)) throw new SoundError('"verdict" must be "keep", "drop" or null', 400);
    out.verdict = b.verdict;
  }
  if ("metadata" in b) out.metadata = b.metadata;
  if (!("verdict" in out) && !("metadata" in out)) throw new SoundError('name a change: "verdict" ("keep", "drop" or null) and/or "metadata"', 400);
  return out;
}

/** The gate's moves on a finished video. Drop deletes the render files and
 *  KEEPS the record (registry law gate-record-outlives-the-media): the
 *  treatment, metadata and verdict are what a later look at "what did we
 *  throw away, and why" reads. */
export async function patchMv(id: string, patch: MvPatch): Promise<MvJob> {
  await existing(id);
  const gone: string[] = [];
  const job = await withMv((f) => {
    const j = find(f, id);
    if (j.state !== "done" && j.state !== "failed") throw new SoundError(`this job is ${j.state}; it can be judged or edited once it has finished`, 409);
    if (patch.metadata !== undefined) {
      if (!j.metadata) throw new SoundError("this job has no metadata to edit yet", 409);
      j.metadata = applyMetadataPatch(j.metadata, patch.metadata);
    }
    if (patch.verdict !== undefined) {
      j.verdict = patch.verdict;
      if (patch.verdict === "drop")
        for (const k of DROPPED_FILES) {
          const rel = j.files[k];
          if (rel) gone.push(rel);
          delete j.files[k];
        }
    }
    return { ...j };
  });
  // After the record: a crash between the two leaves files nobody points at,
  // never a record pointing at files that are gone.
  for (const rel of gone) await rm(filePathAbs(rel), { force: true });
  return job;
}

/** Queued -> cancelled (its job too). Finished -> the record and its folder
 *  removed. Being made right now -> 409: its step is spending. */
export async function deleteMv(id: string, now = Date.now()): Promise<void> {
  await existing(id);
  const { j: live, k } = await liveState(id);
  if (live.state === "active") throw new SoundError("this video is being made right now; stop the queue and delete it once it is back in the queue", 409);
  if (k !== undefined && k.state !== "done" && k.state !== "cancelled") cancelMvJob(k.id, OPERATOR);
  const removeDir = await withMv((f) => {
    const j = find(f, id);
    if (live.state === "queued") {
      j.state = "cancelled";
      j.endedAt = now;
      delete j.phase;
      delete f.progress[id];
      return false;
    }
    f.jobs = f.jobs.filter((x) => x.id !== id);
    delete f.progress[id];
    return true;
  });
  if (removeDir) await rm(filePathAbs(jobDirRel(id)), { recursive: true, force: true });
}

/* ── the switch ───────────────────────────────────────────────────────────── */

/** The operator's switch (the column's Start / Stop). Its state stays in
 *  mv.json for the board to draw; what it DOES is to the jobs (header). */
export async function setMvQueue(running: boolean): Promise<MvQueueState> {
  const state = await withMv((f) => {
    f.queue = { running };
    return { ...f.queue };
  });
  if (!running) {
    const paused = new Set(pauseMvJobs(OPERATOR));
    // The mirror: a record whose job paused waits in the queue, with no phase.
    await withMv((f) => {
      for (const j of f.jobs) {
        if (!paused.has(mvKernelId(j)) || j.state !== "active") continue;
        j.state = "queued";
        delete j.phase;
      }
    });
    return state;
  }
  resumeMvJobs(OPERATOR);
  const waiting = await waitingIds();
  if (waiting.length) await launchMvNow(waiting, { mode: columnMode(), actor: OPERATOR });
  return state;
}

/** Queued records whose current attempt has no job yet (a v1 crash's included): what Start launches. */
async function waitingIds(): Promise<string[]> {
  const kernel = mvKernelJobs();
  return (await readMvLive()).jobs.filter((j) => j.state === "queued" && !kernel.has(mvKernelId(j))).map((j) => j.id);
}

/** What Start would launch, as a receipt (decision 3): GET /api/sound/mv/run. */
export async function mvStartReceipt(): Promise<Receipt> {
  const r = await launchMv(await waitingIds(), { mode: columnMode(), actor: OPERATOR });
  if (r.kind !== "receipt") throw new SoundError("a receipt read launched something", 500);
  return r.receipt;
}

/** Start, confirming a receipt by its token. A stale token launches nothing and returns the fresh receipt. */
export async function startMvWith(token: string): Promise<{ queue: MvQueueState } | { stale: Receipt }> {
  const r = await launchMv(await waitingIds(), { mode: columnMode(), actor: OPERATOR, token });
  if (r.kind === "stale") return { stale: r.fresh };
  return { queue: await setMvQueue(true) };
}

/* ── the snapshot ─────────────────────────────────────────────────────────── */

/** A READ: the studio's reachability and the records with their jobs' running
 *  state. It starts nothing - v1's snapshot kicked the worker; a read is a read. */
export async function mvSnapshot(): Promise<MvSnapshot> {
  const driver = await DEFAULT_ENGINES.health().catch((e: unknown) => ({ ok: false, reason: e instanceof Error ? e.message : String(e) }));
  const { file, jobs, interrupted } = await readMvLive();
  return { jobs, queue: { running: file.queue.running, ...(interrupted === undefined ? {} : { interrupted }) }, driver };
}
