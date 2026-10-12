// THE FETCHING PHASE — the track's bytes into the job's own folder.
// Server-only.
//
// A take's bytes are COPIED, not referenced: the job renders from
// mv/<jobId>/audio.<ext>, so judging, re-filing or deleting the take later
// cannot pull the audio out from under a finished video's Regenerate. A Suno
// clip is a reference to suno.com (lib/suno/types.ts SunoClipRef - "never a
// file"), so its `audioUrl` is downloaded once, when the job first runs, to
// audio.mp3 - Suno serves mp3 there.

import { copyFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { readSuno } from "../suno/store";
import { filePathAbs, SoundError } from "../store";
import { getTake } from "../takes";
import { ensureJobDir, jobFileRel, landFile, stagingAbs } from "./store";
import type { MvSource } from "./types";

/** The download, injectable (the probe never reaches suno.com). */
export type FetchClipFn = (url: string) => Promise<Uint8Array>;

/** Suno's CDN answers a few MB in a second or two; ninety seconds is a stall. */
const CLIP_TIMEOUT_MS = 90_000;

export const fetchClipBytes: FetchClipFn = async (url) => {
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(CLIP_TIMEOUT_MS) });
  } catch (e) {
    throw new Error(`the clip's audio could not be downloaded from ${new URL(url).host}: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!res.ok) throw new Error(`the clip's audio at ${new URL(url).host} answered HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!bytes.byteLength) throw new Error(`the clip's audio at ${new URL(url).host} was empty`);
  return bytes;
};

const AUDIO_EXTS = new Set([".mp3", ".wav", ".flac", ".m4a", ".ogg", ".aac", ".webm"]);

/** Does the source still exist, with audio? Asked at enqueue, so a card that
 *  names a deleted take is a 404 then rather than a failed job later. */
export async function assertSourceHasAudio(src: MvSource): Promise<void> {
  if (src.kind === "take") {
    const take = await getTake(src.id);
    if (!take.file) throw new SoundError(`take ${src.id} has no audio file`, 409);
    return;
  }
  const clip = (await readSuno()).clips.find((c) => c.id === src.id);
  if (!clip) throw new SoundError(`no Suno clip ${src.id}`, 404);
  if (!clip.audioUrl) throw new SoundError(`Suno clip "${clip.title}" has no audio URL yet`, 409);
}

/** Copy or download the source's audio into the job's folder; returns the
 *  store-relative path. */
export async function fetchAudio(jobId: string, src: MvSource, fetchClip: FetchClipFn): Promise<string> {
  await ensureJobDir(jobId);
  if (src.kind === "take") {
    const take = await getTake(src.id);
    if (!take.file) throw new Error(`take ${src.id} has no audio file`);
    const ext = path.extname(take.file.path).toLowerCase();
    const rel = jobFileRel(jobId, `audio${AUDIO_EXTS.has(ext) ? ext : ".mp3"}`);
    const staged = stagingAbs(rel);
    await copyFile(filePathAbs(take.file.path), staged);
    return landFile(staged, rel);
  }
  const clip = (await readSuno()).clips.find((c) => c.id === src.id);
  if (!clip) throw new Error(`the Suno clip ${src.id} is no longer in the store`);
  if (!clip.audioUrl) throw new Error(`Suno clip "${clip.title}" has no audio URL`);
  const bytes = await fetchClip(clip.audioUrl);
  const rel = jobFileRel(jobId, "audio.mp3");
  const staged = stagingAbs(rel);
  await writeFile(staged, bytes);
  return landFile(staged, rel);
}
