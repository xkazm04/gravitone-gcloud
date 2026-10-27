// THE FOLDER IMPORT — every audio file directly in a folder on the studio
// machine becomes a finalized take, so it lands in Audio's Settled column
// ready to be queued for a video. Server-only; local only (the route refuses
// on a managed platform, where "a folder on this machine" names nothing the
// operator owns).
//
// EACH FILE IS A TAKE through lib/sound/takes.ts createTake - the one door the
// upload route and the CLI use - with the origin that already means "brought
// in from outside" (`import`), kept, staged `finalized`, labelled with its
// track title (./store.ts trackTitle - the version kept, so a main and an
// instrumental stay two names). createTake's own rules then hold: a
// finalized take needs that label, and finalizing stamps finalizedAt. A kept
// take also writes its ledger row, as every judged take does.
//
// DEDUPE BY ABSOLUTE PATH AND SIZE, recorded in mv.json `imports` - a take
// keeps the name its file arrived under (`fileName`) but not where it came
// from, so the index is the only place "this exact file was imported already"
// can be read. Size, not a hash: re-exporting a track from the DAW under the
// same name is a new file the operator wants in, and it nearly always changes
// the size; hashing twenty 8 MB files on every click would cost more than it
// ever catches. NOT RECURSIVE: a sub-folder is usually stems or old versions.

import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { SoundError } from "../store";
import { createTake, MAX_UPLOAD_BYTES } from "../takes";
import { readMv, trackTitle, withMv } from "./store";
import type { MvImportResult } from "./types";

export const IMPORT_EXTS: readonly string[] = [".mp3", ".wav", ".flac", ".m4a", ".ogg"];

/** Parse the request's `dir`. Its existence is checked in `importFolder`,
 *  after the route has asked whether this box may read local folders at all. */
export function parseImportDir(body: unknown): string {
  const dir = body && typeof body === "object" ? (body as { dir?: unknown }).dir : undefined;
  if (typeof dir !== "string" || !dir.trim()) throw new SoundError('"dir" must be the path of a folder of audio files on the studio machine', 400);
  return dir.trim();
}

/** `~` and then this platform's separator: on Windows `~\Music` as well as
 *  `~/Music` (a `\` on POSIX is a file-name character, not a separator). */
const HOME_PREFIX = path.sep === "\\" ? /^~[\\/]/ : /^~\//;

/** A leading `~` is the studio machine's home: the canvas offers
 *  "~/Downloads/Misu" so no tracked file spells one machine's user directory.
 *  The one spelling of it: the batch's plan (./batch.ts resolveDir) reads it too. */
export const expandHome = (dir: string): string => (dir === "~" || HOME_PREFIX.test(dir) ? path.join(homedir(), dir.slice(1)) : dir);

/** The folder's tracks, in running order: every audio file directly in `dir`
 *  (absolute paths). The one listing: the batch's plan reads it too. */
export async function trackFiles(dir: string): Promise<string[]> {
  return (await readdir(dir, { withFileTypes: true }))
    .filter((e) => e.isFile() && IMPORT_EXTS.includes(path.extname(e.name).toLowerCase()))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((n) => path.join(dir, n));
}

/** A file of this size the import makes no take of: an empty file is not a
 *  track, and createTake refuses past its cap. The batch's plan asks the same
 *  question, so it never prices a video the import will not start. */
export const unimportable = (bytes: number): boolean => bytes === 0 || bytes > MAX_UPLOAD_BYTES;

export async function importFolder(dirIn: string, now = Date.now()): Promise<MvImportResult> {
  const dir = path.resolve(expandHome(dirIn));
  const st = await stat(dir).catch(() => null);
  if (!st) throw new SoundError(`there is no folder at ${dir}`, 400);
  if (!st.isDirectory()) throw new SoundError(`${dir} is a file, not a folder`, 400);

  const out: MvImportResult = { added: 0, skipped: 0, takeIds: [] };
  const known = new Map((await readMv()).imports.map((r) => [r.path.toLowerCase(), r.bytes]));
  for (const abs of await trackFiles(dir)) {
    const name = path.basename(abs);
    const bytes = (await stat(abs)).size;
    if (known.get(abs.toLowerCase()) === bytes) {
      out.skipped++;
      continue;
    }
    if (unimportable(bytes)) {
      // Skipped rather than aborting the other nineteen.
      console.warn(`[mv] import skipped ${abs}: ${bytes} bytes`);
      out.skipped++;
      continue;
    }
    const label = trackTitle(path.basename(name, path.extname(name)));
    const { take } = await createTake(
      { origin: "import", kind: "music", title: label, label, verdict: "kept", stage: "finalized", fileName: name },
      { bytes: new Uint8Array(await readFile(abs)), mime: "", name },
    );
    // One index write per file: a crash after the fifth leaves five recorded,
    // and the next import adds the other fifteen instead of doubling five.
    await withMv((f) => {
      f.imports = f.imports.filter((r) => r.path.toLowerCase() !== abs.toLowerCase());
      f.imports.push({ path: abs, bytes, takeId: take.id, at: now });
    });
    known.set(abs.toLowerCase(), bytes);
    out.added++;
    out.takeIds.push(take.id);
  }
  return out;
}
