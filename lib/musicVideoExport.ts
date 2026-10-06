// THE CUT PHASE'S EXPORT PIPELINE (WP5) — server-only.
//
// WHAT THIS DOES, IN ONE SENTENCE: launch a headless Chromium page, make it run
// the EXACT SAME `renderFrame` function the live preview uses
// (`app/_phases/frames/music-video/compositor.ts`), walk it frame-by-frame at
// an explicit index (never real-time — the determinism law), write each frame
// to disk, then mux the sequence with the original mp3 via ffmpeg.
//
// WHY THE COMPOSITOR IS BUNDLED RATHER THAN RE-IMPLEMENTED. The brief is
// explicit: "you call this exact function for export — you do NOT reimplement
// compositing server-side." `compositor.ts` is pure TypeScript with zero
// imports (no DOM lib types beyond `CanvasRenderingContext2D`/`ImageData`,
// which the browser page supplies natively), so it can be transpiled in
// isolation — `ts.transpileModule` strips types and turns the `export`
// keywords into a CommonJS `exports` object, which is then exposed on the
// PAGE's `window` so `page.evaluate` can call it. This is NOT a second
// implementation: it is the same source file, loaded into a real browser
// context instead of this app's own bundler, which is exactly what the
// repo's own live-preview/headless-export duality already assumes
// (compositor.ts's own header: "the same component is rendered twice").
//
// WHY A JSON PAYLOAD, NOT A SERVER-SIDE READ OF IndexedDB. Every record this
// route needs — the poster bytes, the mp3 bytes, the baked envelope, the seed,
// the effect params — lives in the browser's IndexedDB
// (`lib/assets.ts`/`lib/studioDb.ts`), which a Node route cannot reach. This is
// not a shortcut invented for export: every other money route in this app
// (`/api/imaging/generate`, `/api/music/compose`) already takes its inputs as
// a JSON body rather than reading the client's database, because the server
// never has one. The caller (the Cut step's export hook) reads what it needs
// out of IndexedDB and sends it once, same as `useMusicVideoComposition.ts`
// already does when it posts a prompt to `/api/imaging/generate`.
//
// WHY PNG FRAMES ON DISK, NOT image2pipe. `image2pipe` would save the
// round-trip through the filesystem, but it requires the whole frame sequence
// to be written into ffmpeg's stdin in order while Playwright produces them
// one at a time over a separate async channel — coordinating that backpressure
// correctly (ffmpeg's stdin can block, and an unconsumed/blocked pipe is
// exactly the bug this spark's WP1 Director fix already found once in the agy
// adapter) is real complexity for a saving that measured in the tens of
// milliseconds per frame. A numbered PNG sequence on a scratch temp dir, read
// by ffmpeg's own `-i frame_%06d.png` glob, is the boring and correct choice;
// the directory is removed in a `finally` whether the mux succeeds or not.

import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";

import ts from "typescript";
import type { Browser, Page } from "playwright";

import {
  ExportError,
  assertCanSpawn,
  cleanUpExport,
  landExport,
  launchHeadless,
  makeWorkDir,
  partialPath,
  run,
  videoArgs,
  withEncoderFallback,
  type Encoder,
} from "./export/headless";
import type { AudioEnvelope } from "./audioEnvelope";
import type { EffectParams } from "@/app/_phases/frames/music-video/compositor";

// The browser launch, scratch dir, encoder fallback, atomic landing and sidecar
// live in the shared kernel (lib/export/headless.ts) since the Cut's animatic
// export needed the same five. `ExportError` is re-exported so every caller
// that catches it from here keeps catching the one class.
export { ExportError };

/** `resolution-as-stage-property` (the registry law the idea note cites): the
 *  ladder varies SIZE, never shape. Every tier keeps the poster's own aspect by
 *  construction — `renderFrame` already letterboxes the poster into whatever
 *  canvas it is handed (compositor.ts's "BASE LAYER" comment) — so this table
 *  only has to name pixel budgets, not aspect ratios. 4K is the poster's own
 *  content scaled past its native ceiling by the browser's `drawImage` (a real
 *  upscale, never a native 4K render) — the idea note's "state it honestly"
 *  decision is satisfied by the UI's label, not by anything in this file
 *  pretending otherwise. */
export const EXPORT_RESOLUTIONS = {
  "1080p": { width: 1920, height: 1080 },
  "1440p": { width: 2560, height: 1440 },
  "4k": { width: 3840, height: 2160 },
} as const;
export type ExportResolution = keyof typeof EXPORT_RESOLUTIONS;

export interface ExportRequest {
  resolution: ExportResolution;
  posterBase64: string;
  posterMime: string;
  audioBase64: string;
  audioMime: string;
  envelope: AudioEnvelope;
  seed: number;
  effectParams: EffectParams;
  /** The project the export came from, written to a `<id>.json` sidecar so the
   *  publishing calendar (lib/publish/exports.ts) can say which project an mp4
   *  belongs to. Optional: an export with no project is still an export. */
  projectId?: string | null;
}

export interface ExportResult {
  id: string;
  encoder: Encoder;
  width: number;
  height: number;
  frameCount: number;
  fps: number;
  durationS: number;
  /** Wall-clock milliseconds for the whole call — what the Cut step's "how
   *  long did this really take" report reads. */
  wallMs: number;
  captureMs: number;
  muxMs: number;
  sizeBytes: number;
}

const OUT_ROOT = path.join(process.cwd(), "foundry-out", "music-video-exports");
const AUDIO_EXT: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "audio/webm": "webm",
};

/** Where the finished mp4 for `id` lives on disk. Exported so the download
 *  route resolves the SAME path this module wrote, rather than reconstructing
 *  the convention a second time. */
export function exportFilePath(id: string): string {
  // `id` is always a `randomUUID()` this module minted (never a caller-
  // supplied string) — see `runExport` below — so there is no path-traversal
  // surface to guard against here the way `lib/foundry/store.ts#resolveInRun`
  // has to for a run id the UI's own URL exposes.
  return path.join(OUT_ROOT, `${id}.mp4`);
}

/** `compositor.ts`, transpiled in isolation and wrapped so its `export`ed
 *  functions land on the PAGE's `window.__Compositor` rather than in a module
 *  graph the browser page has no bundler to resolve. Read from disk once per
 *  export call — this file is small (a few hundred lines) and re-reading it
 *  guarantees a Playwright page always runs whatever is on disk right now,
 *  never a copy cached across a long-running Node process that might be
 *  serving a hot-reloaded dev build. */
function bundleCompositorScript(): string {
  const srcPath = path.join(process.cwd(), "app", "_phases", "frames", "music-video", "compositor.ts");
  const source = readFileSync(srcPath, "utf8");
  const { outputText, diagnostics } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    reportDiagnostics: true,
  });
  if (diagnostics && diagnostics.length) {
    const first = diagnostics[0];
    throw new ExportError(
      `compositor.ts failed to transpile for the export page: ${ts.flattenDiagnosticMessageText(first.messageText, "\n")}`,
      "compositor-transpile-failed",
    );
  }
  return `(function(){
    var exports = {};
    var module = { exports: exports };
    (function(exports, module){
${outputText}
    })(exports, module);
    window.__Compositor = exports;
  })();`;
}

/** One frame, captured from the page's own `window.renderFrameAt`. Returns the
 *  raw PNG bytes — the `data:image/png;base64,` prefix is stripped here so the
 *  hot loop below does one string slice per frame, not a regex. */
async function captureFrame(page: Page, frameIndex: number): Promise<Buffer> {
  const dataUrl = await page.evaluate((i: number) => (window as unknown as { renderFrameAt: (i: number) => string }).renderFrameAt(i), frameIndex);
  const comma = dataUrl.indexOf(",");
  return Buffer.from(dataUrl.slice(comma + 1), "base64");
}

/** Set up the render page: load the compositor, decode the poster, build the
 *  edge mask + bloom texture ONCE (same 640px analysis cap as
 *  `EffectsStudio.tsx#buildPosterRig`, for the same reason — a full-resolution
 *  Sobel pass spends CPU on detail the blur erases immediately), compute the
 *  flash-rate-limited low band once, and expose `window.renderFrameAt`. */
async function setUpRenderPage(page: Page, req: ExportRequest, width: number, height: number): Promise<void> {
  await page.setContent(`<!doctype html><html><body style="margin:0;background:#000">
    <canvas id="c" width="${width}" height="${height}"></canvas>
  </body></html>`);
  await page.addScriptTag({ content: bundleCompositorScript() });

  const posterDataUrl = `data:${req.posterMime};base64,${req.posterBase64}`;
  const setupError = await page.evaluate(
    async ({ posterDataUrl, effectParams, envelope, seed }: {
      posterDataUrl: string;
      effectParams: EffectParams; envelope: AudioEnvelope; seed: number;
    }) => {
      try {
        const canvas = document.getElementById("c") as HTMLCanvasElement;
        const ctx = canvas.getContext("2d")!;
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const i = new Image();
          i.onload = () => resolve(i);
          i.onerror = () => reject(new Error("the poster image did not decode in the render page"));
          i.src = posterDataUrl;
        });

        // ONCE PER POSTER — identical derivation to EffectsStudio.tsx's
        // `buildPosterRig`: a capped analysis canvas feeds the edge mask, which
        // feeds the bloom texture.
        const longEdge = Math.max(img.naturalWidth, img.naturalHeight);
        const scale = longEdge > 640 ? 640 / longEdge : 1;
        const aw = Math.max(1, Math.round(img.naturalWidth * scale));
        const ah = Math.max(1, Math.round(img.naturalHeight * scale));
        const analysis = document.createElement("canvas");
        analysis.width = aw;
        analysis.height = ah;
        const actx = analysis.getContext("2d", { willReadFrequently: true })!;
        actx.drawImage(img, 0, 0, aw, ah);
        const compositor = (window as unknown as {
          __Compositor: {
            computeEdgeMask: (d: ImageData) => unknown;
            buildBloomTexture: (m: unknown, p: EffectParams) => CanvasImageSource;
            limitFlashRate: (low: number[], fps: number, t: number, m: number) => number[];
            renderFrame: (ctx: CanvasRenderingContext2D, input: Record<string, unknown>) => void;
          };
        }).__Compositor;
        const edgeMask = compositor.computeEdgeMask(actx.getImageData(0, 0, aw, ah));
        const bloomTexture = compositor.buildBloomTexture(edgeMask, effectParams);

        // ONCE PER ENVELOPE — same single pass EffectsStudio.tsx takes.
        const boundedLow = compositor.limitFlashRate(
          envelope.bands.low, envelope.fps, effectParams.flashThreshold, effectParams.flashMaxPerWindow,
        );

        (window as unknown as { renderFrameAt: (i: number) => string }).renderFrameAt = (frameIndex: number) => {
          compositor.renderFrame(ctx, {
            poster: img,
            posterWidth: img.naturalWidth,
            posterHeight: img.naturalHeight,
            bloomTexture,
            seed,
            effectParams,
            fps: envelope.fps,
            boundedLow,
            highBand: envelope.bands.high,
            frameIndex,
            // Export always renders the full, undampened motion — "reduced
            // motion" is a PREVIEW accommodation for a human watching a live
            // screen (`prefers-reduced-motion`), not a property of a baked
            // export file nobody is passively exposed to while it renders.
            reducedMotion: false,
          });
          return canvas.toDataURL("image/png");
        };
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : String(e);
      }
    },
    { posterDataUrl, effectParams: req.effectParams, envelope: req.envelope, seed: req.seed },
  );
  if (setupError) throw new ExportError(`Render page setup failed: ${setupError}`, "render-setup-failed");
}

/** The YouTube ingest target this export aims at: -14 LUFS integrated, true
 *  peak at or under -1 dBTP. */
const TARGET_LUFS = -14;
const TARGET_TRUE_PEAK_DB = -1;

/** ONE LINEAR GAIN FOR THE WHOLE TRACK, LIMITED BY PEAK HEADROOM — never a
 *  dynamic normalizer. The effects were baked against this track's own
 *  envelope (`lib/audioEnvelope.ts`): a chorus louder than its verse blooms
 *  harder. ffmpeg's single-pass `loudnorm` is DYNAMIC — it rides the gain
 *  through the track — and so is two-pass `linear=true` whenever the gain
 *  the target asks for would push the true peak over its ceiling (it falls
 *  back silently). Measured 2026-10-05 on a verse/chorus fixture at
 *  -18.4 LUFS / -2.4 dBTP: single-pass took the verse-to-chorus contrast from
 *  8.2 dB to 2.7 dB, two-pass linear to 3.0 dB, this gain kept all 8.2 dB at
 *  -1.0 dBTP. So the gain is the smaller of "reach the target" and "keep the
 *  peak under the ceiling": a master with headroom lands on -14, one without
 *  lands as close as its peaks allow and keeps its dynamics. A track louder
 *  than the target is turned down to it. Pure, so it is checkable without
 *  ffmpeg. */
export function peakLimitedGainDb(integratedLufs: number, truePeakDb: number): number {
  if (!Number.isFinite(integratedLufs) || !Number.isFinite(truePeakDb)) return 0;
  return Math.min(TARGET_LUFS - integratedLufs, TARGET_TRUE_PEAK_DB - truePeakDb);
}

/** Integrated loudness and true peak of the uploaded track, from ffmpeg's own
 *  loudnorm measurement pass (`print_format=json`, printed on stderr). Returns
 *  `null` when the measurement cannot be read, and the caller then muxes the
 *  track untouched — a missing number must not become a guessed gain. */
async function measureLoudness(audioPath: string): Promise<{ integratedLufs: number; truePeakDb: number } | null> {
  try {
    const { stderr } = await run(
      "ffmpeg",
      ["-hide_banner", "-nostats", "-i", audioPath,
        "-af", `loudnorm=I=${TARGET_LUFS}:TP=${TARGET_TRUE_PEAK_DB}:print_format=json`, "-f", "null", "-"],
      { maxBuffer: 1 << 26 },
    );
    const json = stderr.slice(stderr.lastIndexOf("{"), stderr.lastIndexOf("}") + 1);
    const m = JSON.parse(json) as { input_i?: string; input_tp?: string };
    const integratedLufs = Number(m.input_i);
    const truePeakDb = Number(m.input_tp);
    return Number.isFinite(integratedLufs) && Number.isFinite(truePeakDb) ? { integratedLufs, truePeakDb } : null;
  } catch (e) {
    console.warn("[music-video/export] loudness measurement failed; muxing the track untouched:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** ffmpeg's `-i … -c:v h264_nvenc …` for one attempt; throws on a non-zero
 *  exit so the caller can fall back. `maxBuffer` is generous — `execFile`
 *  buffers ffmpeg's stderr in memory, and `-loglevel error` keeps that small
 *  regardless, but a bad mux can still print a lot on the way out. */
async function muxOnce(opts: {
  framesDir: string; fps: number; audioPath: string; outPath: string; encoder: Encoder; gainDb: number;
}): Promise<void> {
  const { framesDir, fps, audioPath, outPath, encoder, gainDb } = opts;
  await run(
    "ffmpeg",
    [
      "-hide_banner", "-loglevel", "error", "-y",
      "-framerate", String(fps),
      "-i", path.join(framesDir, "f%06d.png"),
      "-i", audioPath,
      ...videoArgs(encoder),
      "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "384k", "-ar", "48000",
      // One linear gain, measured once per export (see `peakLimitedGainDb`).
      "-af", `volume=${gainDb.toFixed(2)}dB`,
      "-shortest",
      "-movflags", "+faststart",
      outPath,
    ],
    { maxBuffer: 1 << 26 },
  );
}

/**
 * Run one real export, end to end. Throws `ExportError` for every refusal
 * this module can name; anything else (an unexpected ffmpeg/Playwright
 * failure) is left to wrap into a generic 500 by the route.
 */
export async function runExport(req: ExportRequest): Promise<ExportResult> {
  assertCanSpawn("Export needs to spawn a headless browser and ffmpeg on this machine");

  const { width, height } = EXPORT_RESOLUTIONS[req.resolution];
  const id = randomUUID();
  const t0 = Date.now();
  const workDir = await makeWorkDir("mv-export-");
  const framesDir = path.join(workDir, "frames");
  let browser: Browser | undefined;

  try {
    await mkdir(framesDir, { recursive: true });

    browser = await launchHeadless();

    const page = await browser.newPage({ viewport: { width, height } });
    await setUpRenderPage(page, req, width, height);

    const captureStart = Date.now();
    const frameCount = req.envelope.frameCount;
    for (let i = 0; i < frameCount; i++) {
      const png = await captureFrame(page, i);
      await writeFile(path.join(framesDir, `f${String(i).padStart(6, "0")}.png`), png);
    }
    const captureMs = Date.now() - captureStart;

    const audioExt = AUDIO_EXT[req.audioMime] ?? "mp3";
    const audioPath = path.join(workDir, `audio.${audioExt}`);
    await writeFile(audioPath, Buffer.from(req.audioBase64, "base64"));

    await mkdir(OUT_ROOT, { recursive: true });
    const finalPath = exportFilePath(id);
    // MUXED UNDER A NAME NO LISTING ACCEPTS, THEN RENAMED. ffmpeg writes the
    // mp4 progressively, and lib/publish/exports.ts lists every `<uuid>.mp4`
    // in this directory as a finished export a slot may pin — so a file still
    // being written must not carry that name. `<uuid>.partial.mp4` fails the
    // listing's id pattern and keeps the extension ffmpeg infers the container
    // from; the rename within one directory is atomic.
    const outPath = partialPath(OUT_ROOT, id);

    const muxStart = Date.now();
    const loudness = await measureLoudness(audioPath);
    const gainDb = loudness ? peakLimitedGainDb(loudness.integratedLufs, loudness.truePeakDb) : 0;
    // NVENC first, libx264 once if NVENC cannot start; the kernel logs the
    // NVENC failure and the result SAYS which encoder actually ran.
    const encoder = await withEncoderFallback("music-video/export", (enc) =>
      muxOnce({ framesDir, fps: req.envelope.fps, audioPath, outPath, encoder: enc, gainDb }),
    );
    const muxMs = Date.now() - muxStart;

    const { sizeBytes } = await landExport({
      root: OUT_ROOT,
      id,
      finalPath,
      ...(req.projectId ? { sidecar: { projectId: req.projectId } } : {}),
    });
    return {
      id,
      encoder,
      width,
      height,
      frameCount,
      fps: req.envelope.fps,
      durationS: req.envelope.durationS,
      wallMs: Date.now() - t0,
      captureMs,
      muxMs,
      sizeBytes,
    };
  } finally {
    // a mux that died leaves its partial file; after a successful rename this is a no-op
    await cleanUpExport({ browser, workDir, root: OUT_ROOT, id });
  }
}

/** Read back a finished export's bytes for the download route. `null` means
 *  no such export (never written, or already cleaned up). */
export async function readExportFile(id: string): Promise<Buffer | null> {
  try {
    return await readFile(exportFilePath(id));
  } catch {
    return null;
  }
}
