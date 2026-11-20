// THE FILM'S FFMPEG HALF (spark reel-studio): the bed laid under a face, the publish copy encoded to a size, the
// thumbnails, and the one sha of a file. Node only; the producers and pipeline/reel-import.mts call these, the
// screen never does. ffmpeg is spawned with an argument ARRAY, never through a shell: a path is a value, not code.
//
// Measured 2026-11-18 on The Strait's desktop master (1920x1080, 100 s, 743 MB, h264 59 Mb/s): 2-pass libx264 slow
// to 3.95 Mb/s landed 49.3 MB in 44 s, VMAF mean 93.7 / min 87.0; text legible at frame 1500. That is why the copy
// is 2-pass x264 and not CRF: nothing else holds a size.

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, readFile, rename, rm, stat } from "node:fs/promises";
import { availableParallelism, tmpdir } from "node:os";
import path from "node:path";

import { ReelError, type FilmFace } from "./types.ts";

const FFMPEG = process.env["FFMPEG_BIN"]?.trim() || "ffmpeg";
const FFPROBE = process.env["FFPROBE_BIN"]?.trim() || "ffprobe";

/** Run a binary with an argument array; resolve its stdout, reject with the last lines of stderr verbatim. */
function run(bin: string, args: readonly string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    const out: Buffer[] = [];
    let errTail = "";
    child.stdout.on("data", (c: Buffer) => out.push(c));
    child.stderr.on("data", (c: Buffer) => {
      errTail = (errTail + c.toString("utf8")).slice(-4000);
    });
    child.on("error", (e) => reject(new ReelError(`${bin} did not start: ${e.message}`, "ffmpeg")));
    child.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(out).toString("utf8"));
      else reject(new ReelError(`${bin} exited ${String(code)}: ${errTail.trim().split(/\r?\n/).slice(-3).join(" | ")}`, "ffmpeg"));
    });
  });
}

const ff = (args: readonly string[], cwd?: string): Promise<string> => run(FFMPEG, ["-hide_banner", "-loglevel", "error", "-nostdin", ...args], cwd);

/** What ffprobe says about a file: its length, its first video stream's frames and size, whether it has sound. */
export async function probeMedia(file: string): Promise<{ seconds: number; frames?: number; width?: number; height?: number; hasAudio: boolean }> {
  const raw = await run(FFPROBE, ["-v", "error", "-show_entries", "format=duration:stream=codec_type,nb_frames,width,height", "-of", "json", file]);
  const j = JSON.parse(raw) as { format?: { duration?: string }; streams?: { codec_type?: string; nb_frames?: string; width?: number; height?: number }[] };
  const seconds = Number(j.format?.duration);
  if (!Number.isFinite(seconds) || seconds <= 0) throw new ReelError(`${file}: ffprobe reads no duration`, "ffmpeg");
  const v = j.streams?.find((s) => s.codec_type === "video");
  const frames = v?.nb_frames === undefined ? undefined : Number(v.nb_frames);
  return {
    seconds,
    ...(frames !== undefined && Number.isInteger(frames) && frames > 0 ? { frames } : {}),
    ...(v?.width === undefined ? {} : { width: v.width }),
    ...(v?.height === undefined ? {} : { height: v.height }),
    hasAudio: j.streams?.some((s) => s.codec_type === "audio") ?? false,
  };
}

/** Stage a write beside its target and rename it in: nothing half-written is ever left at the name. */
async function staged(out: string, write: (tmp: string) => Promise<void>): Promise<void> {
  await mkdir(path.dirname(out), { recursive: true });
  const ext = path.extname(out);
  const tmp = `${out.slice(0, out.length - ext.length)}.partial${ext}`;
  try {
    await write(tmp);
    await rename(tmp, out);
  } catch (e) {
    await rm(tmp, { force: true }).catch(() => {});
    throw e;
  }
}

const FADE = 1.2;

/** The audio chain under a face: (phone: twice as fast,) loudness to -14 LUFS, trimmed to the face, faded out. */
export function bedFilter(face: FilmFace, seconds: number): string {
  const s = Math.max(seconds, FADE);
  const t = (x: number): string => x.toFixed(3);
  return `${face === "phone" ? "atempo=2," : ""}loudnorm=I=-14:TP=-1.5:LRA=11,atrim=0:${t(s)},afade=t=out:st=${t(s - FADE)}:d=${FADE}`;
}

/**
 * Lay `bed` under `film` and write `out`. Desktop: the bed as-is; phone: the bed at atempo 2 (the phone film is the
 * timeline at 2x). Loudness to I -14 LUFS, TP -1.5; trimmed to the film's length with a 1.2 s fade-out. The picture
 * is copied, never re-encoded.
 */
export async function muxBed(o: { readonly film: string; readonly bed: string; readonly out: string; readonly face: FilmFace; readonly seconds: number }): Promise<void> {
  await staged(o.out, (tmp) =>
    ff(["-y", "-i", o.film, "-i", o.bed, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-af", bedFilter(o.face, o.seconds), "-ar", "48000", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", tmp]).then(() => undefined),
  );
}

/** The video bitrate (kbps) that lands `targetBytes` over `seconds` beside `audioKbps` of sound, with 2% headroom for the container. */
export function videoKbpsFor(targetBytes: number, seconds: number, audioKbps: number): number {
  const kbps = Math.floor(Math.floor((targetBytes * 8) / seconds / 1000 - audioKbps) * 0.98);
  if (!(kbps > 50)) throw new ReelError(`${targetBytes} bytes over ${seconds.toFixed(1)} s leaves ${kbps} kbps for the picture: too small to encode`);
  return kbps;
}

/** 2-pass libx264 (slow, yuv420p, +faststart, aac `audioKbps`) aimed at `targetBytes`. Returns the bytes written. */
export async function encodeToSize(o: { readonly src: string; readonly out: string; readonly targetBytes: number; readonly seconds: number; readonly audioKbps?: number }): Promise<number> {
  const { hasAudio } = await probeMedia(o.src);
  const audioKbps = hasAudio ? (o.audioKbps ?? 192) : 0;
  const kbps = videoKbpsFor(o.targetBytes, o.seconds, audioKbps);
  const video = ["-c:v", "libx264", "-preset", "slow", "-b:v", `${kbps}k`, "-pix_fmt", "yuv420p", "-profile:v", "high"];
  // The pass log is per encode, in its own temp folder: two encodes at once must not read each other's statistics.
  const logDir = await mkdtemp(path.join(tmpdir(), "gt-reel-2pass-"));
  const log = path.join(logDir, "pass");
  try {
    await ff(["-y", "-i", o.src, ...video, "-pass", "1", "-passlogfile", log, "-an", "-f", "null", "-"]);
    const audio = hasAudio ? ["-c:a", "aac", "-b:a", `${audioKbps}k`] : ["-an"];
    await staged(o.out, (tmp) => ff(["-y", "-i", o.src, ...video, "-pass", "2", "-passlogfile", log, ...audio, "-movflags", "+faststart", tmp]).then(() => undefined));
  } finally {
    await rm(logDir, { recursive: true, force: true }).catch(() => {});
  }
  return (await stat(o.out)).size;
}

/** VMAF of `dist`'s picture against `ref` (libvmaf), mean and minimum over frames. */
export async function measureVmaf(o: { readonly ref: string; readonly dist: string }): Promise<{ mean: number; min: number }> {
  const ref = await probeMedia(o.ref);
  if (ref.width === undefined || ref.height === undefined) throw new ReelError(`${o.ref} has no picture to measure against`, "ffmpeg");
  // The log goes to a temp folder named relative to it: a Windows drive colon inside a filter argument is a separator.
  const dir = await mkdtemp(path.join(tmpdir(), "gt-reel-vmaf-"));
  try {
    const threads = Math.max(1, Math.min(16, availableParallelism() - 2));
    const graph = `[0:v]scale=${ref.width}:${ref.height}:flags=bicubic,setpts=PTS-STARTPTS[d];[1:v]setpts=PTS-STARTPTS[r];[d][r]libvmaf=log_fmt=json:log_path=vmaf.json:n_threads=${threads}`;
    await ff(["-i", path.resolve(o.dist), "-i", path.resolve(o.ref), "-lavfi", graph, "-f", "null", "-"], dir);
    const j = JSON.parse(await readFile(path.join(dir, "vmaf.json"), "utf8")) as { pooled_metrics?: { vmaf?: { mean?: number; min?: number } } };
    const mean = j.pooled_metrics?.vmaf?.mean;
    const min = j.pooled_metrics?.vmaf?.min;
    if (typeof mean !== "number" || typeof min !== "number") throw new ReelError("libvmaf wrote no pooled vmaf", "ffmpeg");
    return { mean: Math.round(mean * 100) / 100, min: Math.round(min * 100) / 100 };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** One frame of `src` at `at` seconds, `width` px wide, as a jpg (a fast seek: the input is opened at the moment). */
export async function filmFrame(o: { readonly src: string; readonly out: string; readonly at: number; readonly width: number }): Promise<void> {
  await staged(o.out, (tmp) => ff(["-y", "-ss", Math.max(0, o.at).toFixed(3), "-i", o.src, "-frames:v", "1", "-vf", `scale=${o.width}:-2`, "-q:v", "3", tmp]).then(() => undefined));
}

/** `count` frames spread evenly across `src`, as `<dir>/<prefix>-NN.jpg` at `width` px wide. Returns dir-relative names in order. */
export async function filmThumbs(o: { readonly src: string; readonly dir: string; readonly prefix: string; readonly count: number; readonly width: number }): Promise<string[]> {
  const { seconds } = await probeMedia(o.src);
  const names = Array.from({ length: o.count }, (_, k) => `${o.prefix}-${String(k + 1).padStart(2, "0")}.jpg`);
  // The middle of each of `count` equal spans: never the black first frame, never past the last. Each seek is its
  // own short ffmpeg; four at a time, since most of a seek is the process starting.
  let next = 0;
  const worker = async (): Promise<void> => {
    for (let k = next++; k < o.count; k = next++) await filmFrame({ src: o.src, out: path.join(o.dir, names[k] as string), at: (seconds * (k + 0.5)) / o.count, width: o.width });
  };
  await Promise.all(Array.from({ length: Math.min(4, o.count) }, worker));
  return names;
}

/** sha256 of a file, streamed (a master is up to 750 MB). */
export function sha256File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    createReadStream(file)
      .on("data", (c) => h.update(c))
      .on("error", reject)
      .on("end", () => resolve(h.digest("hex")));
  });
}
