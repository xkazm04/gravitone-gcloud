// THE MUSIC-VIDEO RENDER ENTRY POINTS - server side, called by the queue
// (lib/sound/mv/queue.ts) once per job phase, with file paths, never by a
// browser.
//
// ONE ENGINE, NOT TWO. Everything here stands on the studio's own export
// machinery in lib/musicVideoExport.ts: the same headless page, the same
// transpiled-in-isolation `compositor.ts` (`renderFrame`, the seeded
// particles, the low-band edge bloom, the flash limiter), the same numbered
// PNG sequence, the same peak-limited single gain and the same
// NVENC-then-libx264 mux. What the queue adds is passed in as three optional
// render inputs - `fit: "cover"`, `particleHue`, `focal` - which the studio
// never sets, so its frames are the frames they were (mv-render.probe pins
// that against the pre-change compositor).
//
// The envelope is computed INSIDE the headless page (`bakeEnvelopeInPage`):
// lib/audioEnvelope.ts needs OfflineAudioContext, and a node port of it would
// be a second analysis that could disagree with the studio's. `analyseTrack`
// bakes it once and writes it to `envelopePath`; `renderMusicVideo` reads it
// back, so a motion-only regenerate never decodes the track again.

import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Browser } from "playwright";

import type { AudioEnvelope } from "@/lib/audioEnvelope";
import {
  ExportError,
  assertCanSpawn,
  cleanUpExport,
  landExport,
  launchHeadless,
  makeWorkDir,
  partialPath,
  run,
} from "@/lib/export/headless";
import {
  bakeEnvelopeInPage,
  captureFrameSequence,
  muxFrameSequence,
  setUpRenderPage,
} from "@/lib/musicVideoExport";
import { DEFAULT_EFFECT_PARAMS, type EffectParams } from "@/app/_phases/frames/music-video/compositor";

import { detectSections, energyShape } from "./sections";
import { MV_FOCAL_KINDS, type MvAnalysis, type MvMotion } from "./types";

export interface AnalyseArgs {
  /** Absolute path of the track (mp3/wav/flac/m4a). */
  audioPath: string;
  /** Absolute path the baked envelope is written to (JSON), for the render to reuse. */
  envelopePath: string;
}

export interface RenderArgs {
  audioPath: string;
  /** The Leonardo still (PNG), any size; covered to 1920x1080. */
  stillPath: string;
  /** The envelope written by `analyseTrack`. */
  envelopePath: string;
  motion: MvMotion;
  /** Absolute path of the finished mp4 (1920x1080, the master audio under the
   *  peak-limited single gain of lib/musicVideoExport.ts). */
  outPath: string;
  /** 0..1 progress, for the card's phase line. */
  onProgress?: (fraction: number) => void;
}

export interface ThumbnailArgs {
  stillPath: string;
  /** Drawn by code (registry law checkability-routes-the-pixel). */
  title: string;
  /** Absolute path of a 1280x720 jpg. */
  outPath: string;
}

const VIDEO = { width: 1920, height: 1080 } as const;
const THUMB = { width: 1280, height: 720 } as const;

const IMAGE_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

async function stillDataUrl(stillPath: string): Promise<string> {
  const mime = IMAGE_MIME[path.extname(stillPath).toLowerCase()] ?? "image/png";
  return `data:${mime};base64,${(await readFile(stillPath)).toString("base64")}`;
}

/** Write through a sibling temp name and rename, so a reader never sees half
 *  a file under the real name. */
async function writeAtomically(target: string, bytes: Buffer | string): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.partial`;
  await writeFile(tmp, bytes);
  await rename(tmp, target);
}

const clamp = (v: number | undefined, lo: number, hi: number, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;

/** The LLM's numbers are proposals (types.ts): every one is clamped here,
 *  where the engine owns the ranges, and an unknown focal kind falls back to
 *  the softest one rather than failing a render over a word. */
function clampMotion(m: MvMotion): MvMotion {
  return {
    focal: {
      kind: m.focal && MV_FOCAL_KINDS.includes(m.focal.kind) ? m.focal.kind : "halo",
      x: clamp(m.focal?.x, 0, 1, 0.5),
      y: clamp(m.focal?.y, 0, 1, 0.5),
      r: clamp(m.focal?.r, 0.02, 0.5, 0.15),
      hue: clamp(m.focal?.hue, 0, 360, 200),
    },
    particleDensity: clamp(m.particleDensity, 0, 1, 0.5),
    particleHue: clamp(m.particleHue, 0, 360, 200),
    pulseStrength: clamp(m.pulseStrength, 0, 1, 0.6),
  };
}

/** `particleDensity` against the compositor's default count: 0.5 IS the
 *  default, 1 doubles it, 0 is none - "relative to the default" with the
 *  default in the middle of the range, so the treatment can ask for less or
 *  more. */
function effectParamsFor(m: MvMotion): EffectParams {
  return { ...DEFAULT_EFFECT_PARAMS, particleCount: Math.round(DEFAULT_EFFECT_PARAMS.particleCount * 2 * m.particleDensity) };
}

/** The particle seed, from the motion itself: the same job re-renders the
 *  same frames, and a motion regenerate (new numbers) also gets a new field. */
function seedFor(m: MvMotion): number {
  return createHash("sha256").update(JSON.stringify(m)).digest().readUInt32LE(0);
}

function summarise(env: AudioEnvelope): MvAnalysis {
  const r1 = (v: number) => Math.round(v * 10) / 10;
  // Strongest first: the base bucket, then its octave siblings - kept, never
  // collapsed (lib/audioEnvelope.ts's own header). No onsets, no candidates.
  const tempoBpm = env.tempo.confidence > 0 && env.tempo.baseBpm > 0
    ? [r1(env.tempo.baseBpm), r1(env.tempo.halfBpm), r1(env.tempo.doubleBpm)]
    : [];
  return {
    durationS: Math.round(env.durationS * 1000) / 1000,
    tempoBpm,
    energyShape: energyShape(env),
    sections: detectSections(env),
  };
}

function asEnvelope(raw: string, from: string): AudioEnvelope {
  const env = JSON.parse(raw) as AudioEnvelope;
  if (!env || typeof env.fps !== "number" || !(env.frameCount > 0) || !Array.isArray(env.bands?.low)) {
    throw new ExportError(`${from} is not an envelope analyseTrack wrote.`, "envelope-invalid");
  }
  return env;
}

/** Decode, bake the envelope, write it to `envelopePath`, and summarise it:
 *  duration, tempo candidates, a ten-step energy shape, and sections (the
 *  chapters' source). */
export async function analyseTrack(args: AnalyseArgs): Promise<MvAnalysis> {
  assertCanSpawn("Analysing a track needs a headless browser on this machine");
  const audio = await readFile(args.audioPath);
  let browser: Browser | undefined;
  let envelope: AudioEnvelope;
  try {
    browser = await launchHeadless();
    const page = await browser.newPage();
    await page.setContent("<!doctype html><html><body></body></html>");
    envelope = await bakeEnvelopeInPage(page, audio, path.basename(args.audioPath));
  } finally {
    await browser?.close().catch(() => {});
  }
  await writeAtomically(args.envelopePath, JSON.stringify(envelope));
  return summarise(envelope);
}

/** The still + seeded particles + the pulsing focal element, frame by frame,
 *  muxed with the track. Returns the rendered duration. */
export async function renderMusicVideo(args: RenderArgs): Promise<{ durationS: number }> {
  assertCanSpawn("Rendering a music video needs a headless browser and ffmpeg on this machine");
  const envelope = asEnvelope(await readFile(args.envelopePath, "utf8"), args.envelopePath);
  const motion = clampMotion(args.motion);
  const posterDataUrl = await stillDataUrl(args.stillPath);

  // The kernel's landing is (root, id) -> `<root>/<id>.partial.mp4` renamed
  // onto the final path, so the job's own directory is the root and the file
  // name without its extension the id.
  const root = path.dirname(args.outPath);
  const id = path.basename(args.outPath, path.extname(args.outPath));
  const workDir = await makeWorkDir("mv-render-");
  const framesDir = path.join(workDir, "frames");
  let browser: Browser | undefined;
  const report = (f: number) => {
    try {
      args.onProgress?.(Math.min(1, Math.max(0, f)));
    } catch {
      // a progress listener's failure is the listener's, never the render's
    }
  };

  try {
    await mkdir(framesDir, { recursive: true });
    await mkdir(root, { recursive: true });
    browser = await launchHeadless();
    const page = await browser.newPage({ viewport: { ...VIDEO } });
    await setUpRenderPage(page, {
      ...VIDEO,
      posterDataUrl,
      envelope,
      seed: seedFor(motion),
      effectParams: effectParamsFor(motion),
      fit: "cover",
      particleHue: motion.particleHue,
      focal: { ...motion.focal, pulseStrength: motion.pulseStrength },
    });

    // Frames are nearly all of the wall time; the mux is the last 5%.
    const frameCount = envelope.frameCount;
    await captureFrameSequence(page, frameCount, framesDir, (done) => report((done / frameCount) * 0.95));
    await browser.close().catch(() => {});
    browser = undefined;

    await muxFrameSequence({ framesDir, fps: envelope.fps, audioPath: args.audioPath, outPath: partialPath(root, id), logTag: "mv/render" });
    await landExport({ root, id, finalPath: args.outPath });
    report(1);
    return { durationS: await probedDuration(args.outPath, envelope.durationS) };
  } finally {
    await cleanUpExport({ browser, workDir, root, id });
  }
}

/** The container's own duration, from ffprobe; the envelope's when ffprobe
 *  cannot say. */
async function probedDuration(file: string, fallback: number): Promise<number> {
  try {
    const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
    const d = Number(stdout.trim());
    return Number.isFinite(d) && d > 0 ? d : fallback;
  } catch {
    return fallback;
  }
}

/** 1280x720 jpg: the still covered to 16:9, a scrim on the lower third, the
 *  title over it in a system face (no network font: the page is offline). The
 *  title is drawn by code, never generated into the image. */
export async function renderThumbnail(args: ThumbnailArgs): Promise<void> {
  assertCanSpawn("Drawing a thumbnail needs a headless browser on this machine");
  const posterDataUrl = await stillDataUrl(args.stillPath);
  let browser: Browser | undefined;
  try {
    browser = await launchHeadless();
    const page = await browser.newPage({ viewport: { ...THUMB } });
    await page.setContent(`<!doctype html><html><body style="margin:0;background:#000">
      <canvas id="t" width="${THUMB.width}" height="${THUMB.height}"></canvas>
    </body></html>`);
    const res = await page.evaluate(
      async ({ posterDataUrl, title }: { posterDataUrl: string; title: string }) => {
        try {
          const canvas = document.getElementById("t") as HTMLCanvasElement;
          const ctx = canvas.getContext("2d")!;
          const w = canvas.width;
          const h = canvas.height;
          const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const i = new Image();
            i.onload = () => resolve(i);
            i.onerror = () => reject(new Error("the still did not decode in the thumbnail page"));
            i.src = posterDataUrl;
          });
          // Cover: fill the frame, crop the overhang, centred.
          const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
          const dw = img.naturalWidth * s;
          const dh = img.naturalHeight * s;
          ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);

          // The scrim: transparent at 45% height to near-black at the bottom,
          // so white type reads over any still.
          const scrim = ctx.createLinearGradient(0, h * 0.45, 0, h);
          scrim.addColorStop(0, "rgba(0,0,0,0)");
          scrim.addColorStop(1, "rgba(0,0,0,0.78)");
          ctx.fillStyle = scrim;
          ctx.fillRect(0, h * 0.45, w, h * 0.55);

          // Largest size from 88px down that fits in two lines; past the
          // floor, the second line ends in an ellipsis.
          const margin = 72;
          const maxW = w - margin * 2;
          const face = '"Segoe UI", "Helvetica Neue", Arial, "Liberation Sans", sans-serif';
          const words = title.trim().split(/\s+/).filter(Boolean);
          // No named helper in here: this function is serialised into the
          // page, and a bundler that keeps function names (tsx's esbuild
          // does) wraps a named arrow in a `__name` call the page never
          // defined. Measured: "__name is not defined".
          let size = 92;
          let lines: string[] = [];
          do {
            size -= 4;
            ctx.font = `700 ${size}px ${face}`;
            lines = [];
            let line = "";
            for (const word of words) {
              const next = line ? `${line} ${word}` : word;
              if (ctx.measureText(next).width <= maxW || !line) line = next;
              else {
                lines.push(line);
                line = word;
              }
            }
            if (line) lines.push(line);
          } while ((lines.length > 2 || lines.some((l) => ctx.measureText(l).width > maxW)) && size > 44);
          if (lines.length > 2) {
            let second = lines.slice(1).join(" ");
            while (second.length > 1 && ctx.measureText(`${second}…`).width > maxW) second = second.slice(0, -1);
            lines = [lines[0], `${second.trimEnd()}…`];
          }

          ctx.fillStyle = "#ffffff";
          ctx.textBaseline = "alphabetic";
          ctx.shadowColor = "rgba(0,0,0,0.55)";
          ctx.shadowBlur = size * 0.25;
          const lineH = size * 1.12;
          const baseY = h - 64 - (lines.length - 1) * lineH;
          lines.forEach((l, k) => ctx.fillText(l, margin, baseY + k * lineH, maxW));
          return { jpg: canvas.toDataURL("image/jpeg", 0.9) };
        } catch (e) {
          return { error: e instanceof Error ? e.message : String(e) };
        }
      },
      { posterDataUrl, title: args.title },
    );
    if ("error" in res) throw new ExportError(`Thumbnail page failed: ${res.error}`, "thumbnail-failed");
    const jpg = Buffer.from(res.jpg.slice(res.jpg.indexOf(",") + 1), "base64");
    await writeAtomically(args.outPath, jpg);
  } finally {
    await browser?.close().catch(() => {});
  }
}
