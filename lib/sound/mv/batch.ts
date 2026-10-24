// THE ALBUM BATCH — a folder of tracks in, a music video beside each one out.
// Server-only; the engine behind pipeline/music-video.mts and the
// /music-video skill. It owns no rendering: every track becomes the same kernel
// job the Settled column launches (lib/producers/mv.ts), so a batch and the
// canvas see one store, one job per track, and one driver per job at a time
// (the kernel's fenced lease on box.render - v1's mv.json pid lease is gone).
//
// THE PLAN IS READ-ONLY. `planBatch` lists the folder and matches each file to
// the import index (path and size) and that take's newest job, and says what a
// run would do with it - without importing, queueing or spending. A run then:
//
//   import    the folder (free; a file already imported is skipped)
//   queue     each planned track: a new record, or `retryMv` for a failed one
//             (its job resumes at the step that failed - no part is re-rolled)
//   launch    the records without a job, as ONE receipt confirmed by the run
//             (the CLI's --yes was the confirm; --dry launches dry jobs)
//   drive     every owned job in folder order on this process, unless
//             `detach` leaves them to the worker
//   collect   copy each finished video beside its source file (never for a
//             dry run: its still is a placeholder, not the album's video)
//
// WHAT A TRACK'S ROW SAYS, newest job first:
//   done       skipped - its video exists (`again` queues another one)
//   failed     retried from its failed step
//   queued / active   left alone; the drain runs it
//   none / cancelled  queued
// Past `limit`, a track that would be queued or retried is `skip-limit`.
// Versions: a file whose track title ends "(instrumental)" is the
// instrumental; every other file is the main version (./store.ts trackTitle).
//
// COLLECT writes `<source name>.mp4` and `<source name> - youtube.txt` next to
// `<source name>.<ext>`. A file already there is replaced: these two names are
// the batch's own output, and a re-run after a regenerate must hand over the
// new video, not keep the old one.

import { copyFile, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Receipt, ReceiptMode } from "@gt/domain/produce";

import { driveMv, launchMvNow, mvKernelId, mvKernelJobs, resumeMvJobs } from "@/lib/producers/mv";
import { OPERATOR } from "@/lib/producers/sound";

import { SoundError } from "../store";
import { expandHome, IMPORT_EXTS, importFolder } from "./importFolder";
import { enqueueMv, readMvLive, retryMv } from "./queue";
import { filePathAbs } from "../store";
import { isLookId, MV_LOOK_IDS, type MvLookId } from "./looks";
import type { MvEngines } from "./steps";
import { readMv, trackTitle } from "./store";
import type { MvJob, MvMetadata } from "./types";

export type BatchVersions = "all" | "main" | "instrumental";
export const BATCH_VERSIONS: readonly BatchVersions[] = ["all", "main", "instrumental"];

/** Studio credits one still costs (lib/imaging/studio/selectors.ts: GPT Image
 *  2.5 Sunburst at Small/High read "Generate 71" on 2026-10-12). A planning
 *  figure; the spend each job made is on its still's provenance. */
export const CREDITS_PER_STILL = 71;

export type BatchAction = "queue" | "retry" | "running" | "skip-done" | "skip-version" | "skip-limit";

export interface BatchRow {
  /** Absolute path of the source file. */
  file: string;
  title: string;
  version: "main" | "instrumental";
  /** The take the import made, when the file was imported already. */
  takeId?: string;
  /** The take's newest job. */
  job?: { id: string; state: MvJob["state"] };
  action: BatchAction;
}

export interface BatchPlan {
  dir: string;
  rows: BatchRow[];
  /** Rows that will spend a still (queued fresh; a retry spends one only if
   *  its still is missing). */
  newJobs: number;
  retries: number;
  estimatedCredits: number;
  /** The supplied picture and look the run will use, when there are any. */
  still?: string;
  look?: MvLookId;
  /** Two text turns per new job (treatment, metadata); none when a prompt is given for the treatment. */
  textTurns: number;
}

/** An album folder's own defaults, `mv-album.json` beside the tracks:
 *  {"still": "cover.jpg", "look": "siren-rain"}. The still is the one picture
 *  every track's video is made over (no studio credits); the look is the
 *  placed light and weather drawn on it. An album that fills up over time
 *  keeps its look because the file is in the folder, not in anyone's
 *  command line. Command-line flags win over the file. */
export const ALBUM_FILE = "mv-album.json";

export async function readAlbumFile(dir: string): Promise<{ still?: string; look?: MvLookId }> {
  const raw = await readFile(path.join(dir, ALBUM_FILE), "utf8").catch(() => null);
  if (raw === null) return {};
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new SoundError(`${ALBUM_FILE} in ${dir} is not valid JSON`, 400);
  }
  const out: { still?: string; look?: MvLookId } = {};
  if (typeof o.still === "string" && o.still.trim()) {
    const abs = path.resolve(dir, o.still.trim());
    if (!(await stat(abs).catch(() => null))?.isFile()) throw new SoundError(`${ALBUM_FILE}: there is no picture at ${abs}`, 400);
    out.still = abs;
  }
  if (o.look !== undefined) {
    if (!isLookId(o.look)) throw new SoundError(`${ALBUM_FILE}: look must be one of ${MV_LOOK_IDS.join(", ")}`, 400);
    out.look = o.look;
  }
  return out;
}

/** The options with the folder's file filled in under them. */
async function withAlbum(dir: string, opts: BatchOptions): Promise<BatchOptions> {
  const album = await readAlbumFile(dir);
  return { ...opts, ...(opts.still ?? album.still ? { still: opts.still ?? album.still } : {}), ...(opts.look ?? album.look ? { look: opts.look ?? album.look } : {}) };
}

export interface BatchOptions {
  /** One picture for every new track (absolute path): copied, not bought. */
  still?: string;
  /** The placed light and weather over it (lib/sound/mv/looks.ts). */
  look?: MvLookId;
  versions?: BatchVersions;
  /** Queue another video for a track whose video is done already. */
  again?: boolean;
  /** At most this many tracks are queued or retried, in folder order. */
  limit?: number;
  /** The operator's own still prompt for every new job (no treatment turn). */
  prompt?: string;
}

export const resolveDir = (dir: string): string => path.resolve(expandHome(dir.trim()));

const versionOf = (title: string): BatchRow["version"] => (/\(instrumental\)$/i.test(title) ? "instrumental" : "main");

async function audioFiles(dir: string): Promise<string[]> {
  const st = await stat(dir).catch(() => null);
  if (!st?.isDirectory()) throw new SoundError(`there is no folder at ${dir}`, 400);
  return (await readdir(dir, { withFileTypes: true }))
    .filter((e) => e.isFile() && IMPORT_EXTS.includes(path.extname(e.name).toLowerCase()))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((n) => path.join(dir, n));
}

/** What a run over `dirIn` would do. Reads only. */
export async function planBatch(dirIn: string, optsIn: BatchOptions = {}): Promise<BatchPlan> {
  const dir = resolveDir(dirIn);
  const opts = await withAlbum(dir, optsIn);
  const versions = opts.versions ?? "all";
  const f = await readMv();
  // A job's running state is the kernel's: an interrupted or paused job reads queued, never "failed".
  f.jobs = (await readMvLive()).jobs;
  const byPath = new Map(f.imports.map((r) => [r.path.toLowerCase(), r]));
  const rows: BatchRow[] = [];
  let budget = opts.limit ?? Infinity;
  for (const file of await audioFiles(dir)) {
    const title = trackTitle(path.basename(file, path.extname(file)));
    const version = versionOf(title);
    const rec = byPath.get(file.toLowerCase());
    const bytes = (await stat(file)).size;
    // A re-exported file (same path, new size) is a new take on import.
    const takeId = rec && rec.bytes === bytes ? rec.takeId : undefined;
    const newest = takeId
      ? f.jobs.filter((j) => j.source.kind === "take" && j.source.id === takeId).sort((a, b) => b.enqueuedAt - a.enqueuedAt)[0]
      : undefined;
    let action: BatchAction;
    if (versions !== "all" && version !== versions) action = "skip-version";
    else if (newest?.state === "queued" || newest?.state === "active") action = "running";
    else if (newest?.state === "done" && !opts.again) action = "skip-done";
    else if (newest?.state === "failed" && !opts.again) action = "retry";
    else action = "queue";
    if ((action === "queue" || action === "retry") && budget <= 0) action = "skip-limit";
    if (action === "queue" || action === "retry") budget--;
    rows.push({ file, title, version, ...(takeId ? { takeId } : {}), ...(newest ? { job: { id: newest.id, state: newest.state } } : {}), action });
  }
  const newJobs = rows.filter((r) => r.action === "queue").length;
  const retries = rows.filter((r) => r.action === "retry").length;
  return {
    dir,
    rows,
    newJobs,
    retries,
    estimatedCredits: opts.still ? 0 : newJobs * CREDITS_PER_STILL,
    ...(opts.still ? { still: opts.still } : {}),
    ...(opts.look ? { look: opts.look } : {}),
    textTurns: newJobs * (opts.still || opts.prompt?.trim() ? 1 : 2),
  };
}

export interface BatchResult {
  plan: BatchPlan;
  /** Every job this run queued, retried or found running, as it ended. */
  jobs: { file: string; id: string; state: MvJob["state"]; error?: string; video?: string }[];
  /** Why the drive stopped short (the lane's, the vendor's or the interruption's sentence), if it did. */
  paused?: string;
  /** The receipt the run confirmed, when it launched anything. */
  receipt?: Receipt;
  mode: ReceiptMode;
}

/** How a run spends and who drives it (pipeline/music-video.mts flags). */
export interface BatchRun {
  /** `dry`: every paid call answered by its stand-in, nothing collected. Default live. */
  mode?: ReceiptMode;
  /** The job ceiling (--budget-usd). */
  ceilingUsd?: number;
  /** Launch and return: the worker drives (--detach). */
  detach?: boolean;
  /** Engines bound for this drive (a test's fakes). */
  engines?: Partial<MvEngines>;
  dryOnly?: boolean;
}

/** The YouTube proposal as one paste-ready text file. */
export function youtubeText(m: MvMetadata): string {
  return ["TITLE", m.title, "", "DESCRIPTION", m.description, "", "TAGS", m.tags.join(", "), ""].join("\n");
}

/** Copy one finished job's video and metadata beside its source file.
 *  Returns the video's path there. */
export async function collectJob(job: MvJob, sourceFile: string): Promise<string | undefined> {
  if (job.state !== "done" || !job.files.video) return undefined;
  const base = path.join(path.dirname(sourceFile), path.basename(sourceFile, path.extname(sourceFile)));
  const out = `${base}.mp4`;
  await copyFile(filePathAbs(job.files.video), out);
  if (job.metadata) await writeFile(`${base} - youtube.txt`, youtubeText(job.metadata), "utf8");
  return out;
}

/** Import, queue, launch, drive, collect. Live spends a still and up to two
 *  text turns per new track. `onTick` is called as each job's drive lands. */
export async function runBatch(dirIn: string, optsIn: BatchOptions = {}, onTick?: (jobs: MvJob[]) => void, run: BatchRun = {}): Promise<BatchResult> {
  const mode = run.mode ?? "live";
  const dir = resolveDir(dirIn);
  const opts = await withAlbum(dir, optsIn);
  await importFolder(dir);
  const plan = await planBatch(dir, opts);
  const owned = new Map<string, string>(); // record id -> source file

  for (const r of plan.rows) {
    if (r.action === "retry" && r.job) {
      await retryMv(r.job.id, Date.now(), { launch: false });
      owned.set(r.job.id, r.file);
    } else if (r.action === "running" && r.job) {
      owned.set(r.job.id, r.file);
    }
  }
  const fresh = plan.rows.filter((r) => r.action === "queue" && r.takeId);
  if (fresh.length) {
    const jobs = await enqueueMv(
      fresh.map((r) => ({ kind: "take" as const, id: r.takeId!, title: r.title })),
      Date.now(),
      { ...(opts.prompt?.trim() ? { prompt: opts.prompt } : {}), ...(opts.still ? { stillFrom: opts.still } : {}), ...(opts.look ? { look: opts.look } : {}), launch: false },
    );
    jobs.forEach((j, i) => owned.set(j.id, fresh[i].file));
  }

  let paused: string | undefined;
  let receipt: Receipt | undefined;
  if (owned.size) {
    const records = (await readMv()).jobs.filter((j) => owned.has(j.id));
    const kernel = mvKernelJobs();
    const unlaunched = records.filter((j) => !kernel.has(mvKernelId(j))).map((j) => j.id);
    if (unlaunched.length) {
      const launched = await launchMvNow(unlaunched, { mode, actor: OPERATOR, ...(run.ceilingUsd === undefined ? {} : { ceilingUsd: run.ceilingUsd }), ...(run.dryOnly === undefined ? {} : { dryOnly: run.dryOnly }) });
      receipt = launched.receipt;
    }
    const ids = records.map((j) => mvKernelId(j));
    // v1's batch switched the queue on: a job the switch paused runs again. An
    // interrupted one does NOT - v1's crash recovery stopped the batch short over it.
    resumeMvJobs(OPERATOR, { retryInterrupted: false, only: new Set(ids) });
    if (!run.detach) {
      const tick = (): void => {
        if (onTick === undefined) return;
        void readMvLive().then((l) => onTick(l.jobs.filter((j) => owned.has(j.id))), () => undefined);
      };
      const drive = await driveMv(ids, { ...(run.engines === undefined ? {} : { engines: run.engines }), ...(run.dryOnly === undefined ? {} : { dryOnly: run.dryOnly }), onReport: tick });
      paused = drive.stopped;
    }
  }

  const f = await readMvLive();
  paused ??= owned.size && f.interrupted !== undefined ? f.interrupted : undefined;
  const jobs: BatchResult["jobs"] = [];
  for (const [id, file] of owned) {
    const j = f.jobs.find((x) => x.id === id);
    if (!j) continue;
    // A dry run's still is a placeholder: nothing is copied beside the album.
    const video = mode === "dry" ? undefined : await collectJob(j, file);
    jobs.push({ file, id, state: j.state, ...(j.error ? { error: j.error } : {}), ...(video ? { video } : {}) });
  }
  return { plan, jobs, mode, ...(paused ? { paused } : {}), ...(receipt ? { receipt } : {}) };
}

/** Copy every finished video of the folder's tracks beside its source,
 *  without queueing anything. */
export async function collectBatch(dirIn: string): Promise<{ file: string; video: string }[]> {
  const plan = await planBatch(dirIn, { again: false });
  const f = await readMv();
  const out: { file: string; video: string }[] = [];
  for (const r of plan.rows) {
    const j = r.job && f.jobs.find((x) => x.id === r.job!.id);
    const video = j ? await collectJob(j, r.file) : undefined;
    if (video) out.push({ file: r.file, video });
  }
  return out;
}
