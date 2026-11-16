import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

import { err, ok, type Result } from "@gt/domain/errors";

import { canSpawnLocalBinaries, describePosture } from "../../deployment.ts";
import { renameRetry } from "../../renameRetry.ts";
import { JITTERED_RENAME } from "../store.ts";

// A COVER'S AUDIO CUTS (spark track-mirror-studio): ffmpeg and ffprobe spawned with no shell (lib/audio/layers.ts's
// pattern), each argument whole, refused when this machine may not spawn local binaries (lib/deployment.ts). Every
// output is written beside its target and renamed in, so a killed cut leaves no half file under the real name.
//
//   ffmpeg   `FFMPEG`, else `ffmpeg` on the PATH.
//   ffprobe  `FFPROBE`, else the ffprobe beside `FFMPEG`, else `ffprobe` on the PATH.

const TIMEOUT_MS = 10 * 60_000;

const ffmpegBin = (): string => process.env["FFMPEG"]?.trim() || "ffmpeg";

export function ffprobeBin(env: Readonly<Record<string, string | undefined>> = process.env): string {
  const own = env["FFPROBE"]?.trim();
  if (own) return own;
  const ff = env["FFMPEG"]?.trim();
  if (ff) {
    const ext = path.extname(ff);
    const beside = path.join(path.dirname(ff), `ffprobe${ext}`);
    if (existsSync(beside)) return beside;
  }
  return "ffprobe";
}

/** `exited`: the code when the binary ran and exited non-zero (it read the input and refused it). A binary that could
 *  not be started, or was killed at the timeout, is always `unavailable`. */
function run(bin: string, args: readonly string[], what: string, exited: "invalid" | "unavailable" = "unavailable"): Promise<Result<string>> {
  if (!canSpawnLocalBinaries()) return Promise.resolve(err("refused", `${what}: ${describePosture()}`));
  return new Promise((resolve) => {
    execFile(bin, [...args], { encoding: "utf8", timeout: TIMEOUT_MS, maxBuffer: 1024 * 1024, windowsHide: true }, (e, stdout, stderr) => {
      const ran = e !== null && typeof e.code === "number" && !e.killed;
      if (e !== null) return resolve(err(ran ? exited : "unavailable", `${what}: ${stderr.trim().split("\n").pop() || e.message}`));
      resolve(ok(stdout));
    });
  });
}

/** Run ffmpeg into a temp file beside `out`, then rename it in. */
async function into(out: string, args: (tmp: string) => readonly string[], what: string): Promise<Result<void>> {
  await mkdir(path.dirname(out), { recursive: true });
  const tmp = `${out}.${process.pid}.part${path.extname(out)}`;
  const r = await run(ffmpegBin(), args(tmp), what);
  if (!r.ok) {
    await rm(tmp, { force: true }).catch(() => undefined);
    return r;
  }
  try {
    await renameRetry(tmp, out, JITTERED_RENAME);
  } catch (e) {
    await rm(tmp, { force: true }).catch(() => undefined);
    return err("unavailable", `${what}: ${e instanceof Error ? e.message : String(e)}`);
  }
  return ok(undefined);
}

export async function probeDurationS(abs: string): Promise<Result<number>> {
  const r = await run(ffprobeBin(), ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", abs], "ffprobe duration", "invalid");
  if (!r.ok) return r;
  const s = Number.parseFloat(r.value.trim());
  return Number.isFinite(s) && s > 0 ? ok(s) : err("invalid", `ffprobe read no duration from ${path.basename(abs)}: ${JSON.stringify(r.value.trim()).slice(0, 80)}`);
}

/** The section as 44.1 kHz stereo wav: what SheetSage2 reads. */
export async function cutSection(abs: string, startS: number, endS: number, out: string): Promise<Result<void>> {
  if (!(endS > startS) || startS < 0) return err("invalid", `section ${startS}-${endS} s is empty`);
  return into(out, (tmp) => ["-y", "-v", "error", "-ss", startS.toFixed(3), "-t", (endS - startS).toFixed(3), "-i", abs, "-vn", "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le", tmp], "ffmpeg section");
}

/** The winner as a 320 kbps mp3. */
export async function exportMp3(abs: string, out: string): Promise<Result<void>> {
  return into(out, (tmp) => ["-y", "-v", "error", "-i", abs, "-vn", "-c:a", "libmp3lame", "-b:a", "320k", tmp], "ffmpeg mp3");
}
