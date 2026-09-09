// THE CLIP LIBRARY — how a rendered video becomes something this repo can carry.
//
//     import { makeClip, probe, formatBytes } from "./pipeline/video/transcode.mjs";
//     await makeClip(src, { outDir: "public/clips/presets", slug: "blueprint" });
//
// One place, because the app is going to want short looping clips in a dozen
// surfaces and each one would otherwise invent its own ffmpeg line. The rule
// this encodes: a clip that ships in the repository is a BUDGETED artefact.
// It has a target size, and the encoder is asked to hit it rather than the
// author being asked to notice.
//
// ── WHY NOT GIF ────────────────────────────────────────────────────────────
//
// A GIF is the obvious answer and it is the wrong one by a factor of sixty.
// Measured 2026-09-09 on `blueprint`, the fattest of the six preset clips,
// 5 s at 640×360:
//
//     GIF, 256 colours, 12 fps      8,107,657 B   banded, dithered, 8 fps slower
//     MP4 / H.264, crf 22           117,833 B     full colour
//     WebM / VP9, crf 28            126,022 B     full colour
//
// GIF also cannot be paused, cannot be seeked, decodes on the main thread, and
// ignores `prefers-reduced-motion` because the browser does not know it is
// motion. Every one of those is a real defect on a page that shows six of them.
//
// ── WHY ONE FILE, AND WHAT THE FALLBACK IS ─────────────────────────────────
//
// VP9-in-WebM only, by default. Chromium and Firefox have taken it for a
// decade; Safari has since 16. Everything older gets no playable source — and
// what it shows is the POSTER, which is this clip's own first frame, which is
// the still the surface displayed before it had a clip at all. That is a real
// fallback, not a blank rectangle, and it costs nothing.
//
// The alternative was shipping an H.264 twin beside every clip, and it was
// measured rather than assumed: on this repo's first six clips it added ~50% to
// the committed weight to serve browsers that already see the correct picture.
// The encoder still knows how (`formats: ["webm", "mp4"]`), so a surface where
// the motion IS the content — a tutorial, a result the user is judging — can
// buy the twin deliberately. A decorative loop does not need to.
//
// ── THE BUDGET ─────────────────────────────────────────────────────────────
//
// Each encoder is run at increasing CRF until the file fits `budgetKB`, and the
// search is reported. A clip that cannot fit its budget at the worst quality in
// the ladder FAILS rather than shipping fat — the caller then lowers the
// resolution or the duration, which are the honest levers.
//
// Audio is stripped unconditionally (`-an`). These are silent by definition,
// and a silent AAC track is 15 KB of nothing plus an autoplay hazard.

import { execFile } from "node:child_process";
import { mkdirSync, statSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/** The one profile the app uses today. A second surface adds a second entry
 *  here rather than a second set of flags at its own call site. */
export const PROFILES = {
  /** A preset showcase: a wide card, seen at ~420 CSS px, looping forever. */
  showcase: { width: 640, fps: 20, seconds: 5, budgetKB: 260, formats: ["webm"] },
};

/** VP9 first (smaller), H.264 second (universal). Order is the order the
 *  <source> elements are written in, and the browser takes the first it can. */
export const LADDER = {
  webm: {
    ext: "webm",
    type: 'video/webm; codecs="vp9"',
    crfs: [28, 32, 36, 40, 44, 48],
    args: (crf, fps) => [
      "-c:v", "libvpx-vp9",
      "-crf", String(crf),
      "-b:v", "0",
      "-row-mt", "1",
      "-deadline", "good",
      "-cpu-used", "2",
      // One keyframe every two seconds. A loop that seeks back to 0 on a
      // sparse GOP stalls visibly; this costs a few KB and removes the hitch.
      "-g", String(fps * 2),
      "-pix_fmt", "yuv420p",
    ],
  },
  mp4: {
    ext: "mp4",
    type: 'video/mp4; codecs="avc1.4D401E"',
    crfs: [22, 26, 29, 32, 35, 38],
    args: (crf, fps) => [
      "-c:v", "libx264",
      "-crf", String(crf),
      "-preset", "slow",
      "-profile:v", "main",
      "-g", String(fps * 2),
      "-pix_fmt", "yuv420p",
      // The index in front of the payload, so playback can start on the first
      // packet instead of after the whole file has landed.
      "-movflags", "+faststart",
    ],
  },
};

export function formatBytes(n) {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(2)}MB` : `${Math.round(n / 1024)}KB`;
}

/** Duration, dimensions and fps of any video ffmpeg can open. */
export async function probe(src) {
  const { stdout } = await run("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height,r_frame_rate,nb_frames:format=duration",
    "-of", "json", src,
  ]);
  const j = JSON.parse(stdout);
  const s = j.streams?.[0] ?? {};
  const [num, den] = String(s.r_frame_rate ?? "0/1").split("/").map(Number);
  return {
    width: s.width ?? 0,
    height: s.height ?? 0,
    fps: den ? num / den : 0,
    frames: Number(s.nb_frames) || 0,
    seconds: Number(j.format?.duration) || 0,
  };
}

/**
 * Encode one source video into the repository's clip pair plus a poster.
 *
 * Returns `{ slug, sources: [{src, type, bytes}], poster, totalBytes, tries }`.
 * Throws when a format cannot reach its budget — silence there would be how a
 * 4 MB file gets committed.
 */
export async function makeClip(src, opts) {
  const {
    outDir,
    slug,
    profile = "showcase",
    width = PROFILES[profile].width,
    fps = PROFILES[profile].fps,
    seconds = PROFILES[profile].seconds,
    budgetKB = PROFILES[profile].budgetKB,
    /** Which of LADDER's encoders to run, best first. */
    formats = PROFILES[profile].formats,
    /** Seconds to skip at the head. The first frames of an i2v render are the
     *  source still holding perfectly still; starting a loop there reads as a
     *  stall. */
    start = 0,
    log = () => {},
  } = opts;

  mkdirSync(outDir, { recursive: true });
  // `-ss` before `-i` seeks on keyframes and is fast; the source is short
  // enough that accuracy costs nothing, so it goes after, decoded.
  const trim = start > 0 ? ["-ss", String(start)] : [];
  // scale to an EVEN height: yuv420p cannot represent an odd one, and ffmpeg
  // fails late and confusingly when asked to.
  const vf = `fps=${fps},scale=${width}:-2:flags=lanczos`;

  const sources = [];
  let tries = 0;

  for (const name of formats) {
    const fmt = LADDER[name];
    if (!fmt) throw new Error(`no encoder called "${name}" — have ${Object.keys(LADDER).join(", ")}`);
    const out = path.join(outDir, `${slug}.${fmt.ext}`);
    let landed = null;
    for (const crf of fmt.crfs) {
      tries++;
      if (existsSync(out)) rmSync(out);
      await run("ffmpeg", [
        "-hide_banner", "-loglevel", "error", "-y",
        ...trim, "-i", src,
        "-t", String(seconds),
        "-vf", vf,
        "-an",
        ...fmt.args(crf, fps),
        out,
      ], { maxBuffer: 1 << 24 });
      const bytes = statSync(out).size;
      log(`      ${fmt.ext} crf ${crf} → ${formatBytes(bytes)}${bytes <= budgetKB * 1024 ? " ✓" : ""}`);
      if (bytes <= budgetKB * 1024) {
        landed = { src: `${slug}.${fmt.ext}`, type: fmt.type, bytes, crf };
        break;
      }
    }
    if (!landed) {
      throw new Error(
        `${slug}.${fmt.ext} will not fit ${budgetKB}KB even at crf ${fmt.crfs.at(-1)}. ` +
          `Lower the width (now ${width}) or the duration (now ${seconds}s) rather than raising the budget.`,
      );
    }
    sources.push(landed);
  }

  // The poster, cut from the same trimmed head the clip starts on, so the
  // still the user sees before the first frame decodes IS the first frame.
  const poster = path.join(outDir, `${slug}.jpg`);
  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    ...trim, "-i", src,
    "-frames:v", "1",
    "-vf", `scale=${width}:-2:flags=lanczos`,
    "-q:v", "6",
    poster,
  ]);

  return {
    slug,
    sources,
    poster: `${slug}.jpg`,
    posterBytes: statSync(poster).size,
    totalBytes: sources.reduce((n, s) => n + s.bytes, 0) + statSync(poster).size,
    tries,
  };
}
