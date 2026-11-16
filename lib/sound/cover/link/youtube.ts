// A COVER'S SONG FROM A YOUTUBE LINK (cover from a link, WP-C): the video's length and title read first, a video
// past ingest's 20 minutes refused before a byte is downloaded, then its best audio extracted to mp3 by yt-dlp
// (with ffmpeg) into a temp folder this function owns and removes on every path. Server only, but no `server-only`
// marker: the tests import it under vitest.
//
// The yt-dlp seam is the scout's (lib/foundry/scout/ingest.ts): its spawn port (no shell, args whole, a timeout,
// an output cap, no window), its binaries from YTDLP / FFMPEG, `--no-playlist`, and `--js-runtimes node`, without
// which YouTube answers the download HTTP 403 (measured 2026-10-22). A failure is yt-dlp's own last stderr line,
// verbatim; a missing binary is refused with the doctor's install line.
//
// The download's timeout is NOT ingest's 20 minutes: this runs inside a route whose budget is 300 s, and a child
// killed by nothing outlives the route and keeps its temp folder. So the download is held to 270 s and fails in
// words before the route's deadline does.
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { err, errorMessage, ok, type Result } from "@gt/domain/errors";

import { BIN_REMEDY, binsFrom, MAX_VIDEO_S, realSpawn, YTDLP_JS, type Spawn } from "../../../foundry/scout/ingest.ts";
import { MAX_UPLOAD_BYTES } from "../../takes.ts";

export { parseYouTubeUrl, canonicalYouTubeUrl, type YouTubeLink } from "./parse.ts";

export type LinkDeps = {
  readonly spawn: Spawn;
  readonly ytdlp: string;
  /** FFMPEG when set: handed to yt-dlp as --ffmpeg-location. Unset, yt-dlp finds ffmpeg on PATH. */
  readonly ffmpeg?: string;
  /** Where the temp folder is made (default the OS's). */
  readonly tmpRoot?: string;
};

export const linkDepsFrom = (env: Readonly<Record<string, string | undefined>> = process.env): LinkDeps => {
  const ffmpeg = env["FFMPEG"]?.trim();
  return { spawn: realSpawn, ytdlp: binsFrom(env).ytdlp, ...(ffmpeg === undefined || ffmpeg === "" ? {} : { ffmpeg }) };
};

export type LinkAudio = { readonly bytes: Uint8Array; readonly mime: "audio/mpeg"; readonly name: string; readonly title: string; readonly durationS: number };

const PROBE_MS = 60_000;
/** Under the link route's 300 s budget, so the route answers yt-dlp's words rather than its own deadline. */
export const DOWNLOAD_MS = 270_000;
const MIN = 60;
const clock = (s: number): string => `${Math.floor(s / MIN)}m${String(Math.round(s % MIN)).padStart(2, "0")}s`;

/** A spawn that never started: the binary is not where it was looked for. */
const missing = (error: string): boolean => /ENOENT|not recognized|cannot find/i.test(error);

async function ytdlp(deps: LinkDeps, args: readonly string[], timeoutMs: number, maxBuffer: number): Promise<Result<{ stdout: string; stderr: string }>> {
  const r = await deps.spawn(deps.ytdlp, args, { timeoutMs, maxBuffer });
  if (r.ok) return ok({ stdout: r.stdout.toString("utf8"), stderr: r.stderr });
  if (missing(r.error)) return err("unavailable", `yt-dlp: ${r.error} -> ${BIN_REMEDY.ytdlp}`);
  return err("unavailable", `yt-dlp: ${r.error}`);
}

/** The probe: duration on the first line, the title on the second. */
async function probe(url: string, deps: LinkDeps): Promise<Result<{ durationS: number; title: string }>> {
  const r = await ytdlp(deps, ["--no-warnings", "--no-playlist", ...YTDLP_JS, "--skip-download", "--print", "duration", "--print", "title", url], PROBE_MS, 1024 * 1024);
  if (!r.ok) return r;
  const [first = "", ...rest] = r.value.stdout.trim().split(/\r?\n/);
  const durationS = Number(first.trim());
  if (!Number.isFinite(durationS) || durationS <= 0) return err("unavailable", `yt-dlp: no duration for ${url} (${first.trim() || "empty"}); a live stream has none`);
  if (durationS > MAX_VIDEO_S) return err("invalid", `the video runs ${clock(durationS)}; a cover's link takes at most ${clock(MAX_VIDEO_S)}`);
  const title = rest.join(" ").trim();
  return ok({ durationS, title: title === "" || title === "NA" ? "untitled" : title });
}

/** The one mp3 yt-dlp left: its printed path when it is a file, else the folder's only .mp3. */
async function fileLeft(dir: string, printed: string): Promise<string | undefined> {
  for (const line of printed.split(/\r?\n/).reverse()) {
    const p = line.trim();
    if (p !== "" && (await stat(p).catch(() => null))?.isFile() === true) return p;
  }
  const mp3 = (await readdir(dir)).find((n) => n.toLowerCase().endsWith(".mp3"));
  return mp3 === undefined ? undefined : path.join(dir, mp3);
}

const fileName = (title: string, id: string): string => {
  const tail = ` [${id}].mp3`;
  return `${title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 255 - tail.length)}${tail}`;
};

/**
 * The video's audio as an mp3 and what yt-dlp said of it. `url` must already be the canonical link
 * (./parse.ts parseYouTubeUrl); its id names the file.
 */
export async function fetchYouTubeAudio(url: string, deps: LinkDeps): Promise<Result<LinkAudio>> {
  const id = new URL(url).searchParams.get("v") ?? "video";
  const said = await probe(url, deps);
  if (!said.ok) return said;
  let dir: string;
  try {
    dir = await mkdtemp(path.join(deps.tmpRoot ?? os.tmpdir(), "gt-cover-link-"));
  } catch (e) {
    return err("unavailable", `a temp folder for the download could not be made: ${errorMessage(e)}`);
  }
  try {
    const args = [
      "--no-warnings",
      "--no-playlist",
      ...YTDLP_JS,
      ...(deps.ffmpeg === undefined ? [] : ["--ffmpeg-location", deps.ffmpeg]),
      "-f",
      "bestaudio",
      "-x",
      "--audio-format",
      "mp3",
      "--audio-quality",
      "0",
      "--max-filesize",
      "60M",
      "-o",
      path.join(dir, "%(id)s.%(ext)s"),
      "--print",
      "after_move:filepath",
      url,
    ];
    const r = await ytdlp(deps, args, DOWNLOAD_MS, 4 * 1024 * 1024);
    if (!r.ok) return r;
    const file = await fileLeft(dir, r.value.stdout);
    // --max-filesize skips a file past it and exits 0: no file is how that says so.
    if (file === undefined) return err("unavailable", `yt-dlp: finished and left no mp3 (${r.value.stderr.trim().split(/\r?\n/).pop() || "the audio may be over 60 MB"})`);
    const size = (await stat(file)).size;
    if (size > MAX_UPLOAD_BYTES) return err("invalid", `the audio is ${Math.round(size / 1048576)} MB; a cover's song is at most ${MAX_UPLOAD_BYTES / 1048576} MB`);
    const bytes = new Uint8Array(await readFile(file));
    return ok({ bytes, mime: "audio/mpeg", name: fileName(said.value.title, id), title: said.value.title, durationS: said.value.durationS });
  } catch (e) {
    return err("unavailable", `the download could not be read: ${errorMessage(e)}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
