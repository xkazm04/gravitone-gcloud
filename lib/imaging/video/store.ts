// THE CLIP STORE — server-only. One JSON record and one mp4 per clip under
// foundry-out/clips/ (gitignored, like every foundry output); CLIP_STORE_DIR
// moves it, read lazily per call so a probe can point it at a temp directory.
//
// The two path functions are the contract the render service (lib/adRender.ts)
// reads, and their signatures are WP0's; everything below them is the record
// I/O, in lib/sound/store.ts's discipline:
//
//   ATOMIC WRITES. tmp + rename for the record and for the mp4 — a reader (the
//   poll, the file route, the render service) sees the old file or the new one,
//   never half of either.
//   A CORRUPT RECORD IS NOT AN ABSENT ONE. It throws rather than reading as
//   "no such clip": a clip somebody paid for must not vanish because its JSON
//   was cut short.
//   WRITES TO ONE RECORD ARE SERIALISED in this process (`patchClipRecord`), so
//   the runner's status write and its cost write cannot interleave into a
//   record that has lost one of them.

import { randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ClipRecord } from "./types";

export function clipRoot(): string {
  const env = process.env.CLIP_STORE_DIR;
  return env ? path.resolve(env) : path.join(process.cwd(), "foundry-out", "clips");
}

/** Clip ids are minted by the store; anything else is refused before it can
 *  name a path. */
export function isClipId(id: unknown): id is string {
  return typeof id === "string" && /^clip-[a-z0-9-]{6,64}$/.test(id);
}

/** Where a finished clip's mp4 lives. Throws on an id the store did not mint. */
export function clipPath(clipId: string): string {
  if (!isClipId(clipId)) throw new Error(`not a clip id: ${String(clipId).slice(0, 40)}`);
  return path.join(clipRoot(), `${clipId}.mp4`);
}

/** Where a clip's JSON record lives. */
export function clipRecordPath(clipId: string): string {
  if (!isClipId(clipId)) throw new Error(`not a clip id: ${String(clipId).slice(0, 40)}`);
  return path.join(clipRoot(), `${clipId}.json`);
}

/** A fresh id: time-ordered base36 plus 8 hex of randomness, so two clips
 *  minted in one millisecond still differ. Always matches `isClipId`. */
export function mintClipId(now: number = Date.now()): string {
  return `clip-${now.toString(36)}-${randomBytes(4).toString("hex")}`;
}

let tmpCounter = 0;
const tmpOf = (file: string) => `${file}.${process.pid}.${++tmpCounter}.tmp`;

/** Windows refuses to rename over a file another handle has open for reading
 *  (EPERM/EACCES/EBUSY) — and the poll route reads this record every few
 *  seconds while the runner writes it. Measured 2026-10-06 in the probe: a
 *  status write lost to a concurrent read closed a healthy clip as failed. The
 *  reader's handle is open for milliseconds, so the rename is retried briefly
 *  rather than reported. */
const RENAME_RETRYABLE = new Set(["EPERM", "EACCES", "EBUSY"]);

async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(from, to);
      return;
    } catch (e) {
      if (attempt >= 20 || !RENAME_RETRYABLE.has((e as NodeJS.ErrnoException).code ?? "")) throw e;
      await new Promise((r) => setTimeout(r, 5 + attempt * 5));
    }
  }
}

async function writeAtomic(file: string, data: string | Uint8Array): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = tmpOf(file);
  await writeFile(tmp, data);
  await renameWithRetry(tmp, file);
}

export async function writeClipRecord(rec: ClipRecord): Promise<void> {
  await writeAtomic(clipRecordPath(rec.clipId), `${JSON.stringify(rec, null, 2)}\n`);
}

/** The record, or null when no clip by that id was ever written. Throws on a
 *  record that exists and cannot be read as one. */
export async function readClipRecord(clipId: string): Promise<ClipRecord | null> {
  const file = clipRecordPath(clipId);
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
  try {
    const rec = JSON.parse(raw) as ClipRecord;
    if (rec?.clipId !== clipId) throw new Error(`names ${String(rec?.clipId).slice(0, 40)}`);
    return rec;
  } catch (e) {
    throw new Error(`${file} is not a readable clip record (${(e as Error).message})`);
  }
}

/** One promise chain per clip id: a patch waits for the one before it. */
const chains = new Map<string, Promise<unknown>>();

/** Read, change, write — one at a time per clip. Returns the record written. */
export function patchClipRecord(clipId: string, fn: (rec: ClipRecord) => ClipRecord): Promise<ClipRecord> {
  const prev = chains.get(clipId) ?? Promise.resolve();
  const next = prev
    .catch(() => undefined)
    .then(async () => {
      const cur = await readClipRecord(clipId);
      if (!cur) throw new Error(`no clip record ${clipId} to patch`);
      const out = fn(cur);
      await writeClipRecord(out);
      return out;
    });
  chains.set(clipId, next);
  // The map holds a chain only while it is live; the last link removes it.
  void next.then(
    () => chains.get(clipId) === next && chains.delete(clipId),
    () => chains.get(clipId) === next && chains.delete(clipId),
  );
  return next;
}

/** Write the finished mp4. Returns its absolute path (`clipPath`). */
export async function writeClipBytes(clipId: string, bytes: Uint8Array): Promise<string> {
  const file = clipPath(clipId);
  await writeAtomic(file, bytes);
  return file;
}

/** The mp4's path and size, or null when there is no file (yet). */
export async function clipFileStat(clipId: string): Promise<{ abs: string; size: number } | null> {
  const abs = clipPath(clipId);
  try {
    const s = await stat(abs);
    return s.isFile() ? { abs, size: s.size } : null;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

/** Every readable record, newest first; `projectId` narrows it. A record that
 *  cannot be read is skipped and counted, never fatal to the listing. */
export async function listClipRecords(projectId?: string): Promise<{ clips: ClipRecord[]; unreadable: number }> {
  let names: string[];
  try {
    names = await readdir(clipRoot());
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return { clips: [], unreadable: 0 };
    throw e;
  }
  const clips: ClipRecord[] = [];
  let unreadable = 0;
  for (const n of names) {
    if (!n.endsWith(".json")) continue;
    const id = n.slice(0, -".json".length);
    if (!isClipId(id)) continue;
    try {
      const rec = await readClipRecord(id);
      if (rec && (!projectId || rec.projectId === projectId)) clips.push(rec);
    } catch {
      unreadable++;
    }
  }
  clips.sort((a, b) => b.createdAt - a.createdAt);
  return { clips, unreadable };
}
