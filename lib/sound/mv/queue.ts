// THE MUSIC-VIDEO QUEUE — serial, FIFO, persisted, one worker per server
// process. Server-only. The Suno queue's shape and discipline
// (lib/sound/suno/queue.ts), for its reasons:
//
// THE WORKER IS A SINGLETON ON globalThis (`__gtMvWorker`): Next dev
// re-evaluates this module on every HMR edit, and a module-level `let` would
// start a second loop rendering into the same job folder. It starts lazily -
// on an enqueue, on the operator's Start and on every snapshot read.
//
// THE QUEUE DRAINS ONLY WHILE IT IS SWITCHED ON (mv.json `queue.running`, the
// Settled column's Start / Stop). Queueing a track never starts it: a job
// spends two text turns and a Leonardo still. Stop is checked BETWEEN steps;
// the step in flight finishes (a still being generated cannot be called back)
// and the job returns to `queued` holding every file it has. The next Start
// does only what is missing.
//
// THE FIRST START IN A PROCESS turns any `active` job back into `queued` and
// switches the queue OFF, naming the job and its phase (`queue.interrupted`):
// a crash in `imaging` may have spent a still in the Leonardo studio that
// never reached the store, and the operator looks before pressing Start.
//
// THE STEPS, and the order they run in (a phase can hold two):
//
//   fetching   fetch     the track's bytes into mv/<jobId>/audio.<ext>
//   analysing  analyse   envelope + MvAnalysis           (lib/sound/mv/render.ts)
//   treating   treat     the still prompt + motion       (./treatment.ts, a text turn)
//              motion    new motion only, same still     (a Regenerate · motion)
//   imaging    still     one Leonardo still              (lib/imaging generate)
//   writing    metadata  title, description, tags        (./metadata.ts, a text turn)
//   rendering  video     the 1080p mp4
//              thumb     the 1280x720 thumbnail
//
// WRITING RUNS BEFORE RENDERING, which is not MV_PHASES' list order, for two
// reasons: the thumbnail draws the METADATA title, so metadata has to exist
// before it; and a metadata answer that fails the YouTube validator fails the
// job in seconds instead of after a multi-minute render.
//
// A FIRST RUN DOES WHAT IS MISSING. A step runs when its output is absent, so
// a stopped or crashed job resumes at the missing step with no bookkeeping.
// A REGENERATE (`redo`) also runs its part's steps although their outputs
// exist - and records each one that lands in mv.json `progress`, so a Stop in
// the middle of a regenerate resumes at the missing step instead of spending
// the turn or the still again:
//
//   image     treat + still + video + thumb   (the note goes to the treatment)
//   motion    motion + video                  (still and thumbnail untouched)
//   metadata  metadata + thumb                (the title on the thumbnail may change)
//
// Everything a part does not name is left byte-identical (registry law
// edit-do-not-regenerate), and an old file is replaced only when its new one
// lands whole (./store.ts landFile). Analysis is never redone.
//
// ANY THROW fails the job with the engine's sentence VERBATIM and the loop
// goes on. A still vendor that is not reachable PAUSES the loop before a job
// that needs a still (no job is failed for it); the next kick looks again.

import { rm, writeFile } from "node:fs/promises";

import { leonardoStudioHealth } from "@/lib/imaging/providers/leonardoStudio";
import { generate } from "@/lib/imaging/router";

import { filePathAbs, safeId, SoundError } from "../store";
import { assertSourceHasAudio, fetchAudio, fetchClipBytes, type FetchClipFn } from "./fetchAudio";
import { applyMetadataPatch, writeMetadata } from "./metadata";
import { analyseTrack, renderMusicVideo, renderThumbnail, type AnalyseArgs, type RenderArgs, type ThumbnailArgs } from "./render";
import { cleanTitle, DROPPED_FILES, ensureJobDir, isLiveJob, jobDirRel, jobFileRel, landFile, mintMvId, readMv, stagingAbs, withMv, type MvFile, type MvStep } from "./store";
import { treatmentInput, writeMotion, writeTreatment, type ReasonFn } from "./treatment";
import { MV_PARTS, type MvAnalysis, type MvDriverHealth, type MvFiles, type MvJob, type MvPart, type MvPhase, type MvQueueState, type MvSnapshot, type MvSource } from "./types";

/* ── the engines ──────────────────────────────────────────────────────────── */

export interface StillRequest {
  prompt: string;
  negativePrompt?: string;
}
export interface StillImage {
  bytes: Uint8Array;
  mime: "image/png" | "image/jpeg" | "image/webp";
}

/** Everything the worker reaches outside this process. Production uses the
 *  defaults; a probe swaps any of them for fakes (`__setMvEngines`). */
export interface MvEngines {
  analyse(args: AnalyseArgs): Promise<MvAnalysis>;
  render(args: RenderArgs): Promise<{ durationS: number }>;
  thumbnail(args: ThumbnailArgs): Promise<void>;
  still(req: StillRequest): Promise<StillImage>;
  fetchClip: FetchClipFn;
  reason?: ReasonFn;
  /** Is the still vendor reachable? Asked by the snapshot, and before a job
   *  that needs a still. */
  health(): Promise<MvDriverHealth>;
}

/** The studio pool, by name. The router reaches `leonardo-studio` ONLY when a
 *  request prefers it, and then alone (lib/imaging/router.ts PREFER_ONLY): a
 *  closed studio browser fails this still with the studio's own sentence and
 *  never moves it onto a vendor billed in dollars. The real studio answers
 *  JPEG, so the mime travels with the bytes and names the file. */
async function studioStill(req: StillRequest): Promise<StillImage> {
  const out = await generate({ prompt: req.prompt, ...(req.negativePrompt ? { negativePrompt: req.negativePrompt } : {}), aspect: "16:9", count: 1, prefer: "leonardo-studio" });
  const img = out.images[0];
  if (!img) throw new Error(`${out.provenance.provider} returned no image`);
  return { bytes: Buffer.from(img.base64, "base64"), mime: img.mime };
}

const DEFAULTS: MvEngines = {
  analyse: analyseTrack,
  render: renderMusicVideo,
  thumbnail: renderThumbnail,
  still: studioStill,
  fetchClip: fetchClipBytes,
  health: leonardoStudioHealth,
};

/* ── the worker's singleton ───────────────────────────────────────────────── */

interface WorkerState {
  loop: Promise<void> | null;
  recovered: boolean;
  /** The vendor's reason while the loop is paused on it. */
  paused: string | null;
  again: boolean;
  /** Probe overrides; empty in production. */
  engines: Partial<MvEngines>;
}

const G = globalThis as typeof globalThis & { __gtMvWorker?: WorkerState };
const worker = (): WorkerState => (G.__gtMvWorker ??= { loop: null, recovered: false, paused: null, again: false, engines: {} });
const engines = (): MvEngines => ({ ...DEFAULTS, ...worker().engines });

/** Probes only: swap engines for fakes. Merges; `null` clears every override. */
export function __setMvEngines(partial: Partial<MvEngines> | null): void {
  const w = worker();
  w.engines = partial === null ? {} : { ...w.engines, ...partial };
}

/** Probes only: forget the singleton (and its overrides), as a fresh process would. */
export function __resetMvWorker(): void {
  delete G.__gtMvWorker;
}

/* ── steps and plans ──────────────────────────────────────────────────────── */

export const STEP_ORDER: readonly MvStep[] = ["fetch", "analyse", "treat", "motion", "still", "metadata", "video", "thumb"];

export const PHASE_OF: Record<MvStep, MvPhase> = {
  fetch: "fetching",
  analyse: "analysing",
  treat: "treating",
  motion: "treating",
  still: "imaging",
  metadata: "writing",
  video: "rendering",
  thumb: "rendering",
};

export const REDO_STEPS: Record<MvPart, readonly MvStep[]> = {
  image: ["treat", "still", "video", "thumb"],
  motion: ["motion", "video"],
  metadata: ["metadata", "thumb"],
};

/** Steps whose output is absent. */
function missingSteps(j: MvJob): Set<MvStep> {
  const out = new Set<MvStep>();
  if (!j.files.audio) out.add("fetch");
  if (!j.analysis || !j.files.envelope) out.add("analyse");
  if (!j.treatment) out.add("treat");
  if (!j.files.still) out.add("still");
  if (!j.metadata) out.add("metadata");
  if (!j.files.video) out.add("video");
  if (!j.files.thumb) out.add("thumb");
  return out;
}

/** What this run still has to do, in order. Exported for the probe. */
export function planOf(j: MvJob, done: readonly MvStep[] = []): MvStep[] {
  const missing = missingSteps(j);
  const redo = new Set((j.redo ?? []).flatMap((p) => REDO_STEPS[p]));
  // A motion redo on a job with no treatment at all is a first run's treat.
  if (missing.has("treat")) redo.delete("motion");
  return STEP_ORDER.filter((s) => missing.has(s) || (redo.has(s) && !done.includes(s)));
}

/* ── enqueue / regenerate / cancel / patch / delete ───────────────────────── */

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

/** Queue a job per track, in the order given. Idempotent: a track already
 *  holding a queued or active job returns that job instead of a second one.
 *  A track with a FINISHED job gets a new one - another video of the same
 *  song is a legitimate ask; Regenerate is the edit of an existing one. */
export async function enqueueMv(sources: readonly MvSource[], now = Date.now()): Promise<MvJob[]> {
  for (const s of sources) await assertSourceHasAudio(s);
  const jobs = await withMv((f) =>
    sources.map((s, i) => {
      const live = f.jobs.find((j) => sameSource(j.source, s) && isLiveJob(j));
      if (live) return { ...live };
      const job: MvJob = { id: mintMvId(), source: { ...s }, state: "queued", files: {}, verdict: null, enqueuedAt: now + i };
      f.jobs.push(job);
      return { ...job };
    }),
  );
  void kickMvWorker();
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

export function parseRegenerate(body: unknown): { part: MvPart; note?: string } {
  const o = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const part = MV_PARTS.find((p) => p === o.part);
  if (!part) throw new SoundError(`"part" must be one of ${MV_PARTS.join(", ")}`, 400);
  if (o.note !== undefined && o.note !== null && typeof o.note !== "string") throw new SoundError('"note" must be a string', 400);
  const note = typeof o.note === "string" ? o.note.replace(/\s+/g, " ").trim().slice(0, 500) : "";
  return note ? { part, note } : { part };
}

/** Re-queue one part of a done or failed job. */
export async function regenerateMv(id: string, req: { part: MvPart; note?: string }, now = Date.now()): Promise<MvJob> {
  await existing(id);
  const job = await withMv((f) => {
    const j = find(f, id);
    if (j.state !== "done" && j.state !== "failed") throw new SoundError(`this job is ${j.state}; only a finished or failed video can be regenerated`, 409);
    j.state = "queued";
    j.redo = [req.part];
    if (req.note) j.note = req.note;
    else delete j.note;
    j.verdict = null;
    j.enqueuedAt = now;
    delete j.error;
    delete j.phase;
    delete j.endedAt;
    delete f.progress[id];
    return { ...j };
  });
  void kickMvWorker();
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

/** Queued -> cancelled. Finished (done, failed, cancelled) -> the record and
 *  its folder removed. Active -> 409: its step is spending now. */
export async function deleteMv(id: string, now = Date.now()): Promise<void> {
  await existing(id);
  const removeDir = await withMv((f) => {
    const j = find(f, id);
    if (j.state === "active") throw new SoundError("this video is being made right now; stop the queue and delete it once it is back in the queue", 409);
    if (j.state === "queued") {
      j.state = "cancelled";
      j.endedAt = now;
      delete f.progress[id];
      return false;
    }
    f.jobs = f.jobs.filter((x) => x.id !== id);
    delete f.progress[id];
    return true;
  });
  if (removeDir) await rm(filePathAbs(jobDirRel(id)), { recursive: true, force: true });
}

/* ── the switch and crash recovery ────────────────────────────────────────── */

async function recover(): Promise<void> {
  await withMv((f) => {
    for (const j of f.jobs) {
      if (j.state !== "active") continue;
      const phase = j.phase ? ` while ${j.phase}` : "";
      const look = j.phase === "imaging" ? "; a still may have been spent in the Leonardo studio - check it before starting" : "; check it before starting";
      f.queue = { running: false, interrupted: `"${cleanTitle(j.source.title)}" was interrupted${phase} when the server stopped${look}` };
      j.state = "queued";
      delete j.phase;
    }
  });
}

/** The operator's switch. Start clears an interruption (they have looked)
 *  and kicks the worker; Stop lets the step in flight finish. */
export async function setMvQueue(running: boolean): Promise<MvQueueState> {
  const state = await withMv((f) => {
    f.queue = { running };
    return { ...f.queue };
  });
  if (running) void kickMvWorker();
  return state;
}

/* ── one job ──────────────────────────────────────────────────────────────── */

async function patchJob(id: string, fn: (j: MvJob, f: MvFile) => void): Promise<MvJob | null> {
  return withMv((f) => {
    const j = f.jobs.find((x) => x.id === id);
    if (!j) return null;
    fn(j, f);
    return { ...j, files: { ...j.files } };
  });
}

const STILL_EXT: Record<StillImage["mime"], string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

const need = <T>(v: T | undefined, what: string): T => {
  if (v === undefined || v === null) throw new Error(`cannot continue: ${what} is missing`);
  return v;
};

/** One step against a fresh read of the job. Returns the patch that lands it. */
async function runStep(step: MvStep, j: MvJob, eng: MvEngines): Promise<(x: MvJob) => void> {
  const abs = (k: keyof MvFiles) => filePathAbs(need(j.files[k], `the ${k} file`));
  const title = cleanTitle(j.source.title);
  const input = () => treatmentInput(title, need(j.analysis, "the analysis"));
  const noteFor = (part: MvPart) => (j.redo?.includes(part) ? j.note : undefined);
  await ensureJobDir(j.id);
  switch (step) {
    case "fetch": {
      const rel = await fetchAudio(j.id, j.source, eng.fetchClip);
      return (x) => void (x.files.audio = rel);
    }
    case "analyse": {
      const rel = jobFileRel(j.id, "envelope.json");
      const analysis = await eng.analyse({ audioPath: abs("audio"), envelopePath: filePathAbs(rel) });
      return (x) => {
        x.analysis = analysis;
        x.files.envelope = rel;
      };
    }
    case "treat": {
      const treatment = await writeTreatment(input(), { note: noteFor("image"), reason: eng.reason });
      return (x) => void (x.treatment = treatment);
    }
    case "motion": {
      const treatment = await writeMotion(input(), need(j.treatment, "the treatment"), { note: noteFor("motion"), reason: eng.reason });
      return (x) => void (x.treatment = treatment);
    }
    case "still": {
      const t = need(j.treatment, "the treatment");
      const img = await eng.still({ prompt: t.prompt, ...(t.negativePrompt ? { negativePrompt: t.negativePrompt } : {}) });
      if (!img.bytes.byteLength) throw new Error("the still came back empty");
      const rel = jobFileRel(j.id, `still.${STILL_EXT[img.mime] ?? "png"}`);
      const staged = stagingAbs(rel);
      await writeFile(staged, img.bytes);
      await landFile(staged, rel);
      const old = j.files.still;
      if (old && old !== rel) await rm(filePathAbs(old), { force: true });
      return (x) => void (x.files.still = rel);
    }
    case "metadata": {
      const metadata = await writeMetadata(input(), { rationale: j.treatment?.rationale, note: noteFor("metadata"), reason: eng.reason });
      return (x) => void (x.metadata = metadata);
    }
    case "video": {
      const rel = jobFileRel(j.id, "video.mp4");
      const staged = stagingAbs(rel);
      try {
        await eng.render({ audioPath: abs("audio"), stillPath: abs("still"), envelopePath: abs("envelope"), motion: need(j.treatment, "the treatment").motion, outPath: staged });
      } catch (e) {
        await rm(staged, { force: true }).catch(() => {});
        throw e;
      }
      await landFile(staged, rel);
      return (x) => void (x.files.video = rel);
    }
    case "thumb": {
      const rel = jobFileRel(j.id, "thumb.jpg");
      const staged = stagingAbs(rel);
      try {
        await eng.thumbnail({ stillPath: abs("still"), title: j.metadata?.title ?? title, outPath: staged });
      } catch (e) {
        await rm(staged, { force: true }).catch(() => {});
        throw e;
      }
      await landFile(staged, rel);
      return (x) => void (x.files.thumb = rel);
    }
  }
}

async function runOne(id: string, eng: MvEngines): Promise<void> {
  const claimed = await patchJob(id, (j) => {
    if (j.state !== "queued") return;
    j.state = "active";
    j.startedAt = Date.now();
    delete j.error;
  });
  if (!claimed || claimed.state !== "active") return;
  try {
    for (;;) {
      const f = await readMv();
      const j = f.jobs.find((x) => x.id === id);
      if (!j || j.state !== "active") return;
      const step = planOf(j, f.progress[id] ?? [])[0];
      if (!step) break;
      // Stopped between steps: back to the queue with what it has; the next
      // Start does only what is missing.
      if (!f.queue.running) {
        await patchJob(id, (x) => {
          x.state = "queued";
          delete x.phase;
        });
        return;
      }
      if (j.phase !== PHASE_OF[step]) await patchJob(id, (x) => void (x.phase = PHASE_OF[step]));
      const land = await runStep(step, j, eng);
      await patchJob(id, (x, file) => {
        land(x);
        if (x.redo?.length) file.progress[id] = [...(file.progress[id] ?? []), step];
      });
    }
    await patchJob(id, (x, file) => {
      x.state = "done";
      x.endedAt = Date.now();
      delete x.phase;
      delete x.redo;
      delete file.progress[id];
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await patchJob(id, (x) => {
      x.state = "failed";
      x.endedAt = Date.now();
      x.error = message;
      delete x.phase;
    });
  }
}

const oldestQueued = (f: MvFile): MvJob | null => f.jobs.filter((j) => j.state === "queued").sort((a, b) => a.enqueuedAt - b.enqueuedAt)[0] ?? null;

async function loop(): Promise<void> {
  const w = worker();
  if (!w.recovered) {
    w.recovered = true;
    await recover();
  }
  for (;;) {
    w.again = false;
    const f = await readMv();
    if (!f.queue.running) {
      w.paused = null;
      return;
    }
    const next = oldestQueued(f);
    if (!next) {
      if (w.again) continue;
      w.paused = null;
      return;
    }
    const eng = engines();
    if (planOf(next, f.progress[next.id] ?? []).includes("still")) {
      const health = await eng.health().catch((e: unknown) => ({ ok: false as const, reason: e instanceof Error ? e.message : String(e) }));
      if (!health.ok) {
        w.paused = health.reason ?? "the still vendor is not reachable";
        return;
      }
    }
    w.paused = null;
    await runOne(next.id, eng);
  }
}

/** Start the loop if it is not running. Returns the running loop, so a probe
 *  can await the queue draining. Never throws to the caller. */
export function kickMvWorker(): Promise<void> {
  const w = worker();
  w.again = true;
  if (!w.loop) {
    w.loop = loop()
      .catch((e: unknown) => console.error(`[mv] worker stopped: ${e instanceof Error ? e.message : String(e)}`))
      .finally(() => {
        w.loop = null;
      });
  }
  return w.loop;
}

/** Why the worker is paused, or null. */
export const mvWorkerPaused = (): string | null => worker().paused;

/* ── the snapshot ─────────────────────────────────────────────────────────── */

export async function mvSnapshot(): Promise<MvSnapshot> {
  const driver = await engines()
    .health()
    .catch((e: unknown) => ({ ok: false, reason: e instanceof Error ? e.message : String(e) }));
  // A snapshot read is a kick: an idle worker with queued work starts here.
  void kickMvWorker();
  const f = await readMv();
  return { jobs: f.jobs, queue: f.queue, driver };
}
