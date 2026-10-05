// THE HEADLESS EXPORT KERNEL — what every local render shares. Server-only.
//
// Factored out of lib/musicVideoExport.ts (card frames-score-cut-B) WITHOUT a
// behaviour change, so the Cut's animatic export (lib/cutExport.ts) and the
// music-video export stand on one copy of each of these:
//
//   posture      a render spawns ffmpeg (and, for the music video, Chromium);
//                `canSpawnLocalBinaries()` (lib/deployment.ts) answers whether
//                this process may, and the refusal names the posture.
//   browser      headless Chromium, with a launch failure turned into the one
//                remedy that fixes it.
//   scratch      a temp work dir per export, removed whether the export lands
//                or not.
//   encoder      h264_nvenc first, libx264 when NVENC cannot start — and the
//                fallback is LOGGED, because a silent one hides a driver
//                regression behind "it worked anyway".
//   landing      written under `<id>.partial.mp4`, a name no listing accepts
//                (lib/publish/exports.ts lists `<id>.mp4`), then renamed in one
//                directory, which is atomic. The sidecar lands BEFORE the
//                rename, so a listed export never lacks the record that says
//                whose it is.
//
// Every comment that explains a choice below was moved here from
// musicVideoExport.ts with the code it explains.

import { execFile } from "node:child_process";
import { mkdtemp, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { chromium, type Browser } from "playwright";

import { canSpawnLocalBinaries, describePosture, localPosture } from "../deployment";

export const run = promisify(execFile);

export class ExportError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = "ExportError";
  }
}

export type Encoder = "h264_nvenc" | "libx264";

/** Refuse, naming the posture, when this process may not spawn local
 *  binaries. `lead` says what the caller needed to spawn. */
export function assertCanSpawn(lead: string): void {
  if (!canSpawnLocalBinaries()) {
    throw new ExportError(`${lead}, and it cannot: ${describePosture(localPosture())}.`, "local-binaries-forbidden");
  }
}

export async function launchHeadless(): Promise<Browser> {
  try {
    return await chromium.launch({ headless: true });
  } catch (e) {
    throw new ExportError(
      `Headless Chromium failed to launch: ${e instanceof Error ? e.message : String(e)}. ` +
        `Run "npx playwright install chromium" on this machine.`,
      "playwright-launch-failed",
    );
  }
}

/** A fresh scratch directory under the OS temp dir. */
export function makeWorkDir(prefix: string): Promise<string> {
  return mkdtemp(path.join(tmpdir(), prefix));
}

/** ffmpeg's video-codec arguments per encoder. */
export function videoArgs(encoder: Encoder): string[] {
  return encoder === "h264_nvenc"
    ? ["-c:v", "h264_nvenc", "-preset", "p5", "-rc", "vbr", "-cq", "19", "-b:v", "0"]
    : ["-c:v", "libx264", "-preset", "medium", "-crf", "18"];
}

/**
 * Run one encode with NVENC, falling back to libx264 once.
 *
 * NVENC can fail to init for reasons that have nothing to do with the encode
 * itself (driver mismatch, another process holding the session the
 * consumer-grade NVENC concurrency cap allows) — fall back to the software
 * encoder rather than failing the whole export, and SAY which one actually ran.
 * The original failure still goes to the server log under `logTag`.
 */
export async function withEncoderFallback(logTag: string, encode: (encoder: Encoder) => Promise<void>): Promise<Encoder> {
  try {
    await encode("h264_nvenc");
    return "h264_nvenc";
  } catch (e) {
    console.warn(`[${logTag}] h264_nvenc failed, falling back to libx264:`, e instanceof Error ? e.message : e);
    await encode("libx264");
    return "libx264";
  }
}

/** Where an export is encoded before it is landed: a name no listing accepts,
 *  keeping the extension ffmpeg infers the container from. */
export const partialPath = (root: string, id: string) => path.join(root, `${id}.partial.mp4`);

/** Write the `<id>.json` sidecar (when there is one), then rename the partial
 *  file to `finalPath`. Returns the landed size. */
export async function landExport(opts: {
  root: string;
  id: string;
  finalPath: string;
  sidecar?: unknown;
}): Promise<{ sizeBytes: number }> {
  const { root, id, finalPath, sidecar } = opts;
  if (sidecar !== undefined) {
    await writeFile(path.join(root, `${id}.json`), JSON.stringify(sidecar, null, 2));
  }
  await rename(partialPath(root, id), finalPath);
  const st = await stat(finalPath);
  return { sizeBytes: st.size };
}

/** The `finally` every export runs: close the browser, drop the scratch dir,
 *  and remove a partial file a dead encode left (a no-op after a landing). */
export async function cleanUpExport(opts: { browser?: Browser; workDir: string; root: string; id: string }): Promise<void> {
  await opts.browser?.close().catch(() => {});
  await rm(opts.workDir, { recursive: true, force: true }).catch(() => {});
  await rm(partialPath(opts.root, opts.id), { force: true }).catch(() => {});
}
