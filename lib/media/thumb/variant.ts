// A BLOB'S RESIZED VARIANT, MADE ONCE AND KEPT ON DISK - server only.
//
// The blob route (app/api/blob/[sha]) answers `?w=<320|640|1280>` with a WebP of an image
// blob at that width. The variant is DERIVED data, and it carries the obligations derived data
// carries (ai-registry ui-surfaces/data-display/file-browsing, thumbnails-and-previews):
//   - THE KEY NAMES THE RECOMPUTATION: sha (the content version, by construction) plus width.
//     A blob never changes under its address, so a variant never goes stale and needs no
//     invalidation; one source at three widths is three files.
//   - NEVER LARGER THAN ITS SOURCE: `withoutEnlargement` - the asked width is a maximum.
//   - FAILURE IS REMEMBERED: a blob sharp cannot read as a raster (a video, a wav, an svg, a
//     corrupt png) answers `null` and the route serves the original; the verdict is kept in a
//     small in-memory set so a grid scrolling over 120 clips does not ask libvips 120 times a
//     pass. A process restart forgets it, which costs one header sniff per blob.
//   - GENERATION IS CAPPED: at most RESIZES_AT_ONCE decodes run at a time - a cold Library
//     block is 120 first requests landing together, and libvips on a 4096 square is ~100 MB.
//   - ONE RESIZE PER VARIANT, NOT N: concurrent requests in this process share one promise; a
//     second process (the worker, another server) racing the same variant writes its own temp
//     file and renames it over - both temps hold the same pixels, and a reader only ever sees
//     a whole file (temp + rename, the kernel blob store's own discipline).
//
// THE CACHE LIVES BESIDE THE BLOB STORE (`<store dir>/thumbs`, a sibling of `<store dir>/blobs`),
// derived from the same root the route resolves blobs from - which comes from
// GRAVITONE_STORE_PATH - so a test pointing the store at a temp dir never writes into the
// operator's foundry-out. Not inside `blobs/`: that tree's layout is the kernel's, and a
// variant is not a blob (no ref names it). No reaper: blobs are never deleted, and a variant is
// a few tens of KB beside a source of MBs, so the cache is bounded by the store it shadows.

import { randomBytes } from "node:crypto";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { err, ok, type Result } from "@gt/domain/errors";
import type { ThumbWidth } from "@gt/domain/blob.thumb";

import { renameRetry } from "../../renameRetry.ts";

/** How a variant's pixels are made; `null` when the source is not a raster this can read. Seam for tests. */
export type Resize = (src: string, w: ThumbWidth) => Promise<Uint8Array | null>;

const RESIZES_AT_ONCE = 2;
const NOT_RASTER_KEPT = 4096;
// The formats a grid draws as a picture. svg is readable by sharp but is not a raster: it is
// served as itself (as octet-stream, by the route's own rule), never rasterised here.
const RASTER = new Set(["jpeg", "png", "webp", "gif", "avif", "heif", "tiff"]);
const WEBP_QUALITY = 80;

/** The variants' root for a blob root: a sibling directory, so it moves with the store. */
export const thumbRootOf = (blobRoot: string): string => path.join(path.dirname(blobRoot), "thumbs");

/** Where the `w`-wide variant of blob `sha` lives under `thumbRoot`. The width is in the name. */
export const variantPathOf = (thumbRoot: string, sha: string, w: ThumbWidth): string => path.join(thumbRoot, sha.slice(0, 2), `${sha.slice(2)}.w${w}.webp`);

/** libvips, loaded on first resize only: a door that never asks for `w` never loads it. */
export const sharpResize: Resize = async (src, w) => {
  const { default: sharp } = await import("sharp");
  try {
    const meta = await sharp(src).metadata();
    if (!RASTER.has(meta.format)) return null;
    // `autoOrient` applies EXIF orientation before the resize, so `width` is the width as seen.
    // An animated gif/webp decodes its first page only (sharp's default `pages: 1`): a still.
    return new Uint8Array(await sharp(src).autoOrient().resize({ width: w, withoutEnlargement: true }).webp({ quality: WEBP_QUALITY }).toBuffer());
  } catch {
    // Unreadable as an image (truncated, a codec this build lacks, over sharp's pixel limit):
    // the caller serves the original, as it does for a video.
    return null;
  }
};

const inFlight = new Map<string, Promise<Result<string | null>>>();
const notRaster = new Set<string>();
let running = 0;
const waiting: (() => void)[] = [];

async function capped<T>(work: () => Promise<T>): Promise<T> {
  if (running >= RESIZES_AT_ONCE) await new Promise<void>((go) => waiting.push(go));
  running++;
  try {
    return await work();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

async function isWholeFile(file: string): Promise<boolean> {
  try {
    const s = await stat(file);
    return s.isFile() && s.size > 0;
  } catch {
    return false;
  }
}

/** Write `bytes` at `file` so no reader ever sees part of it. */
export async function writeAtomic(file: string, bytes: Uint8Array): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
  try {
    // Exclusive create of a name no other writer can hold (pid + random): a temp file, not a
    // lock - the one lock loop under lib/ is lib/diskTx (foundry-catalogue-tx, case 6).
    await writeFile(tmp, bytes, { flag: "wx" });
    // Windows refuses a rename onto a file a reader holds open for a moment; a whole variant
    // another writer already put there is as good as ours.
    await renameRetry(tmp, file, { retries: 8, delayMs: (a) => 15 * (a + 1) }).catch(async (e: unknown) => {
      if (!(await isWholeFile(file))) throw e;
    });
  } finally {
    await rm(tmp, { force: true }).catch(() => undefined);
  }
}

async function make(src: string, file: string, sha: string, w: ThumbWidth, resize: Resize): Promise<Result<string | null>> {
  const bytes = await capped(() => resize(src, w));
  if (bytes === null) {
    if (notRaster.size >= NOT_RASTER_KEPT) notRaster.clear();
    notRaster.add(sha);
    return ok(null);
  }
  try {
    await writeAtomic(file, bytes);
    return ok(file);
  } catch (e) {
    return err("unavailable", `thumb: cannot write the ${w}px variant of ${sha}`, { cause: e });
  }
}

/**
 * The path of blob `sha`'s `w`-wide WebP variant, made on first ask; `ok(null)` when the blob
 * is not a raster image (serve the original). `src` is the blob's own file, already resolved.
 */
export async function variant(src: string, thumbRoot: string, sha: string, w: ThumbWidth, resize: Resize = sharpResize): Promise<Result<string | null>> {
  if (notRaster.has(sha)) return ok(null);
  const file = variantPathOf(thumbRoot, sha, w);
  if (await isWholeFile(file)) return ok(file);
  // No source is not a verdict on its pixels: the route's serveFile answers not-found, and the
  // blob may be put later, so nothing is remembered.
  if (!(await isWholeFile(src))) return ok(null);
  const pending = inFlight.get(file);
  if (pending !== undefined) return pending;
  const p = make(src, file, sha, w, resize).finally(() => inFlight.delete(file));
  inFlight.set(file, p);
  return p;
}

/** Forget the not-a-raster verdicts. Tests only. */
export const forgetVariantVerdicts = (): void => notRaster.clear();
