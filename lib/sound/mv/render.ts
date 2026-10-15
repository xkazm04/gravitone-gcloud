// THE MUSIC-VIDEO RENDER ENTRY POINTS - server side, called by the queue
// (lib/sound/mv/queue.ts) once per job phase, with file paths, never by a
// browser.
//
// ONE ENGINE, NOT TWO. Everything here stands on the studio's own export
// machinery in lib/musicVideoExport.ts: the same headless page, the same
// transpiled-in-isolation `compositor.ts` (`renderFrame`, the seeded
// particles, the low-band edge bloom, the flash limiter), the same numbered
// PNG sequence, the same peak-limited single gain and the same
// mux (NVENC-then-libx264 for the studio; the queue asks for the compact
// libx264 master, see compactVideoArgs). What the queue adds is passed in as optional render
// inputs - `fit: "cover"`, `particleHue` - which the studio never sets, so its
// frames are the frames they were (mv-render.probe pins that against the
// pre-change compositor). The compositor's third input, the pulsing `focal`
// element, is DESCOPED (operator, 2026-10-12: low quality beside the light
// effects): it is never passed, even for an old job whose treatment names one.
// `pulseStrength`, which only ever drove that element, now scales the edge
// bloom instead (bloomIntensityFor).
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

import { MV_LOOKS, type MvLookId } from "./looks";
import { detectSections, energyShape } from "./sections";
import type { MvAnalysis, MvMotion } from "./types";

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
  /** Multiplies the edge bloom on top of `motion.pulseStrength`; 1 (the
   *  default) is the approved look. A trial knob, not a treatment number. */
  bloomGain?: number;
  /** The album's look: placed rain, fire, voice threads and glow over the still. */
  look?: MvLookId;
  /** Absolute path of the finished mp4 (1920x1080, the master audio under the
   *  peak-limited single gain of lib/musicVideoExport.ts). */
  outPath: string;
  /** 0..1 progress, for the card's phase line. */
  onProgress?: (fraction: number) => void;
}

const VIDEO = { width: 1920, height: 1080 } as const;

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
 *  where the engine owns the ranges. A descoped `focal` is dropped. */
function clampMotion(m: MvMotion): MvMotion {
  return {
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
  return {
    ...DEFAULT_EFFECT_PARAMS,
    particleCount: Math.round(DEFAULT_EFFECT_PARAMS.particleCount * 2 * m.particleDensity),
    bloomIntensity: bloomIntensityFor(m.pulseStrength),
  };
}

/** `pulseStrength` against the compositor's default bloom: 0.5 IS the
 *  default (the light the operator approved on 2026-10-12), 0 is 0.6x, 1 is
 *  1.4x - a nudge, not a different look. */
export function bloomIntensityFor(pulseStrength: number): number {
  return Math.round(DEFAULT_EFFECT_PARAMS.bloomIntensity * (0.6 + 0.8 * pulseStrength) * 1000) / 1000;
}

function withBloomGain(p: EffectParams, gain: number | undefined): EffectParams {
  const g = clamp(gain, 0, 5, 1);
  return g === 1 ? p : { ...p, bloomIntensity: Math.round(p.bloomIntensity * g * 1000) / 1000 };
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

/** The still + seeded particles + the low-band edge bloom, frame by frame,
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
      effectParams: withBloomGain(effectParamsFor(motion), args.bloomGain ?? (args.look ? MV_LOOKS[args.look].intensity : undefined)),
      fit: "cover",
      particleHue: (args.look ? MV_LOOKS[args.look].particleHue : undefined) ?? motion.particleHue,
      ...(args.look ? { scene: MV_LOOKS[args.look] } : {}),
    });

    // Frames are nearly all of the wall time; the mux is the last 5%.
    const frameCount = envelope.frameCount;
    await captureFrameSequence(page, frameCount, framesDir, (done) => report((done / frameCount) * 0.95));
    await browser.close().catch(() => {});
    browser = undefined;

    await muxFrameSequence({ framesDir, fps: envelope.fps, audioPath: args.audioPath, outPath: partialPath(root, id), logTag: "mv/render", compact: true, ...(args.look && MV_LOOKS[args.look].crf ? { crf: MV_LOOKS[args.look].crf } : {}) });
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

