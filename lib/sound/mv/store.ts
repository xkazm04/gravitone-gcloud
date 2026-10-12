// THE MUSIC-VIDEO QUEUE'S STORE — one JSON file beside suno.json, and one
// folder of files per job. Server-only (node:fs).
//
//   <root>/mv.json            { version, queue: MvQueueState, jobs: MvJob[], imports, progress }
//   <root>/mv/<jobId>/        audio.<ext>, still.<ext>, video.mp4, thumb.jpg, envelope.json
//
// <root> is lib/sound/store.ts's storeRoot(), read per call, so a probe can
// point it at a temp dir. `MvJob.files` holds store-relative paths, resolved
// through filePathAbs - the same guard that keeps a hand-edited path from
// turning the file route into a reader of the whole machine.
//
// ONE LOCK, THE SOUND STORE'S. Every mutation runs inside `withStore`, for the
// reason lib/sound/suno/store.ts gives: a folder import writes takes.json and
// this file in one breath, and two locks over one directory would let them
// interleave in a way neither lock's author reasoned about.
//
// TWO KEYS THE WIRE NEVER SEES. `imports` is the folder import's dedupe index
// (a SoundTake has `fileName` but no source path, so "this exact file was
// imported already" cannot be read off the takes). `progress` records, per
// job, the steps of a Regenerate run that have already landed - so a Stop or a
// crash in the middle of one resumes at the missing step instead of spending
// the text turn or the still again. Neither belongs on MvJob: the contract is
// what the canvas reads, and neither is something the canvas draws.
//
// A CORRUPT FILE THROWS and is never overwritten (as readSuno): an empty
// replacement would erase finished videos the operator has not judged.

import { mkdir, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";

import type { MvFileKind, MvFiles, MvJob, MvQueueState } from "./types";
import { filePathAbs, safeId, SoundError, storeRoot, withStore, writeJsonAtomic } from "../store";

/** One worker step. A phase can hold more than one (`treating` writes a
 *  treatment or, for a motion regenerate, only new motion). The thumbnail step
 *  was removed on 2026-10-12: the operator takes the thumbnail from a frame of
 *  the video. */
export type MvStep = "fetch" | "analyse" | "treat" | "motion" | "still" | "metadata" | "video";

export interface MvImportRecord {
  /** Absolute source path, as the import read it. */
  path: string;
  bytes: number;
  takeId: string;
  at: number;
}

export interface MvFile {
  version: 1;
  queue: MvQueueState;
  jobs: MvJob[];
  imports: MvImportRecord[];
  progress: Record<string, MvStep[]>;
  /** The process draining the queue (./queue.ts lease); absent when none. */
  worker?: { pid: number; at: number };
}

const empty = (): MvFile => ({ version: 1, queue: { running: false }, jobs: [], imports: [], progress: {} });

function queueOf(v: unknown): MvQueueState {
  const o = v && typeof v === "object" ? (v as Partial<MvQueueState>) : {};
  return { running: o.running === true, ...(typeof o.interrupted === "string" && o.interrupted ? { interrupted: o.interrupted } : {}) };
}

/** A job as the file holds it, with the two keys every reader relies on
 *  present: `files` an object, `verdict` a value (null = not judged). */
function jobOf(j: MvJob): MvJob {
  return { ...j, files: j.files && typeof j.files === "object" ? j.files : {}, verdict: j.verdict === "keep" || j.verdict === "drop" ? j.verdict : null };
}

export const mvFile = (): string => path.join(storeRoot(), "mv.json");

/** Unlocked snapshot read, for GETs and the worker's look-ahead. */
export async function readMv(): Promise<MvFile> {
  const file = mvFile();
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return empty();
    throw e;
  }
  let parsed: Partial<MvFile>;
  try {
    parsed = JSON.parse(raw) as Partial<MvFile>;
  } catch (e) {
    throw new SoundError(`${file} is not valid JSON (${(e as Error).message}); refusing to overwrite it`, 500);
  }
  return {
    version: 1,
    queue: queueOf(parsed.queue),
    jobs: Array.isArray(parsed.jobs) ? parsed.jobs.map(jobOf) : [],
    imports: Array.isArray(parsed.imports) ? parsed.imports : [],
    progress: parsed.progress && typeof parsed.progress === "object" ? parsed.progress : {},
    ...(parsed.worker && typeof parsed.worker.pid === "number" ? { worker: { pid: parsed.worker.pid, at: Number(parsed.worker.at) || 0 } } : {}),
  };
}

/** Read-modify-write under the sound store's lock. `fn` mutates the file in
 *  place; it is written back only if `fn` returns without throwing. */
export function withMv<T>(fn: (f: MvFile) => T | Promise<T>): Promise<T> {
  return withStore(async () => {
    const f = await readMv();
    const out = await fn(f);
    await writeJsonAtomic(mvFile(), f);
    return out;
  });
}

/** `mj-` + 10 hex, the sound store's id shape. */
export function mintMvId(): string {
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => b.toString(16).padStart(2, "0")).join("");
  return `mj-${hex}`;
}

/** The job's folder, store-relative, forward slashes (as MvFiles holds it). */
export const jobDirRel = (id: string): string => `mv/${id}`;
export const jobFileRel = (id: string, name: string): string => `${jobDirRel(id)}/${name}`;

export const LIVE_STATES: ReadonlySet<MvJob["state"]> = new Set(["queued", "active"]);
export const isLiveJob = (j: MvJob): boolean => LIVE_STATES.has(j.state);

/** The render files Drop deletes. The envelope stays: it is the analysis, and
 *  a regenerate of a dropped job renders from it without decoding again. */
export const DROPPED_FILES: readonly (keyof MvFiles)[] = ["audio", "still", "video", "thumb"];

/* ── landing a file an engine wrote ───────────────────────────────────────── */

let tmpN = 0;

/** Where an engine writes a file before it lands: beside its final name, so
 *  the rename is on one volume, and named so nothing reads it as the file. */
export function stagingAbs(rel: string): string {
  const abs = filePathAbs(rel);
  const ext = path.extname(abs);
  return `${abs.slice(0, abs.length - ext.length)}.${process.pid}.${++tmpN}.partial${ext}`;
}

// Windows refuses a rename onto a file a reader holds open (a <video> seeking
// the old render, an indexer) with EPERM/EBUSY/EACCES, and the refusal clears
// in milliseconds - lib/sound/store.ts renameInto measured it on takes.json.
// That helper is private to the sound store, so the same retry is spoken here.
const RENAME_RETRY = new Set(["EPERM", "EBUSY", "EACCES"]);

/** Move a staged file over its final name: the old file is replaced only now,
 *  when the new one exists whole (a Regenerate keeps the old render until the
 *  new one lands). A failed rename removes the staged file and throws. */
export async function landFile(stagedAbs: string, rel: string): Promise<string> {
  const abs = filePathAbs(rel);
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(stagedAbs, abs);
      return rel;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code ?? "";
      if (RENAME_RETRY.has(code) && attempt < 10) {
        await new Promise((r) => setTimeout(r, Math.min(400, 10 * 2 ** attempt) * (0.5 + Math.random())));
        continue;
      }
      await rm(stagedAbs, { force: true }).catch(() => {});
      throw e;
    }
  }
}

/** Make sure the job's folder exists (engines write into it directly). */
export async function ensureJobDir(id: string): Promise<void> {
  await mkdir(filePathAbs(jobDirRel(id)), { recursive: true });
}

/* ── the title the text turns see ─────────────────────────────────────────── */

/** A track's display title without its file-system bookkeeping: the leading
 *  "NN_" running-order prefix, and a trailing "(main)", "(instrumental)" or
 *  bare "Instrumental" version tag ("10_Let the Small Hours Pass Us
 *  Instrumental" -> "Let the Small Hours Pass Us"). Two versions of one track
 *  share a clean title on purpose: it is the song's name, and the version is
 *  not something a viewer of the video needs read to them. A title that would
 *  clean to nothing is returned trimmed, untouched. */
export function cleanTitle(raw: string): string {
  const t = raw.trim().replace(/\.(mp3|wav|flac|m4a|ogg)$/i, "");
  const out = t
    .replace(/^\d{1,3}\s*[_.\-]\s*/, "")
    .replace(/[\s_\-]*(\((main|instrumental)\)|\binstrumental)\s*$/i, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return out || t;
}

/** A track's NAME as a person tells two files apart: the file's own name
 *  without its number prefix and extension, a trailing "Instrumental" written
 *  as "(instrumental)", and "(main)" dropped (it is the song itself). Unlike
 *  `cleanTitle` it KEEPS the version: the Misu folder holds "Walls Unwind
 *  (main)" and "Walls Unwind (instrumental)", and the 2026-10-12 live import
 *  labelled both "Walls Unwind" - two cards nobody could tell apart, and the
 *  smoke queued the wrong one. The text turns still get `cleanTitle`. */
export function trackTitle(raw: string): string {
  const t = raw.trim().replace(/\.(mp3|wav|flac|m4a|ogg)$/i, "");
  const out = t
    .replace(/^\d{1,3}\s*[_.\-]\s*/, "")
    .replace(/[\s_\-]*\(main\)\s*$/i, "")
    .replace(/[\s_\-]*(?:\(instrumental\)|\binstrumental)\s*$/i, " (instrumental)")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return out || t;
}

/* ── a job's file, for the file route ─────────────────────────────────────── */

const MIME_OF_EXT: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
  ".aac": "audio/aac",
  ".webm": "audio/webm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
};

export const MV_FILE_KINDS: readonly MvFileKind[] = ["audio", "still", "video", "thumb"];

/** The absolute path and content type of one of a job's files, or a 4xx. */
export async function mvFileOf(id: string, kind: string | null): Promise<{ abs: string; mime: string }> {
  safeId(id);
  const k = MV_FILE_KINDS.find((x) => x === kind);
  if (!k) throw new SoundError(`"kind" must be one of ${MV_FILE_KINDS.join(", ")}`, 400);
  const job = (await readMv()).jobs.find((j) => j.id === id);
  if (!job) throw new SoundError(`no music-video job ${id}`, 404);
  const rel = job.files[k];
  if (!rel) throw new SoundError(`this job has no ${k} file${job.verdict === "drop" ? " - it was dropped" : " yet"}`, 404);
  return { abs: filePathAbs(rel), mime: MIME_OF_EXT[path.extname(rel).toLowerCase()] ?? "application/octet-stream" };
}
