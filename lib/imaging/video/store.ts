// THE CLIP STORE — server-only. One JSON record and one mp4 per clip under
// foundry-out/clips/ (gitignored, like every foundry output); CLIP_STORE_DIR
// moves it, read lazily per call so a probe can point it at a temp directory.
//
// WP0 STUB: the paths below are the contract the render service (lib/adRender.ts)
// reads. WP3 fills in the record I/O (atomic tmp + rename, lib/sound/store.ts's
// pattern) without changing these two signatures.

import path from "node:path";

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
