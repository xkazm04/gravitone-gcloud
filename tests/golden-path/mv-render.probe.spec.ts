// LANE — THE MUSIC-VIDEO QUEUE'S RENDER, ON THIS MACHINE (node + headless
// Chromium + ffmpeg). lib/sound/mv/render.ts and the focal element it added to
// app/_phases/frames/music-video/compositor.ts. The queue no longer passes the
// focal element (descoped 2026-10-12) and draws no thumbnail; cases 3-5 hold
// the compositor's own contract, which stays for a later return.
//
// The fixture is synthetic and made here: a 4 s WAV (a quiet 660 Hz bed with
// a pitched-down kick every half second, 120 BPM) and two small PNG stills
// from ffmpeg lavfi - a dark flat one where a pulse is easy to measure, and
// `testsrc` for the studio-identity case, whose hard edges give the bloom
// something to draw. Every file lives in one mkdtemp directory, removed at
// the end.
//
// What is held:
//   1. sections: a quiet-loud-quiet energy array is three sections from 0;
//   2. analyseTrack: the envelope is baked in the page, written to disk, and
//      its tempo candidates hold 120 BPM (or an octave of it);
//   3. the focal pulse follows the low band: a kick frame is brighter in the
//      focal region than the quietest frame between kicks, by a stated margin;
//   4. the same frame index renders the same pixels, in one page and across
//      two;
//   5. without the queue's extras the studio's frame is byte-identical to the
//      compositor as it stood before the focal element (pinned commit below);
//   6. a full render lands a 1920x1080 mp4 with audio, within 0.2 s of the
//      track; the wall clock is printed; pulseStrength scales the bloom with
//      0.5 as the compositor's default.
//
// No ffmpeg/ffprobe or no Chromium: skip locally, FAIL when CI is set, so a
// runner that lost its binaries cannot turn this into a green no-op.

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test, expect } from "@playwright/test";
import ts from "typescript";
import type { Browser, Page } from "playwright";

import { keepEnv } from "./_helpers";
import type { AudioEnvelope } from "@/lib/audioEnvelope";
import { launchHeadless } from "@/lib/export/headless";
import { setUpRenderPage } from "@/lib/musicVideoExport";
import { analyseTrack, bloomIntensityFor, renderMusicVideo } from "@/lib/sound/mv/render";
import { detectSections, energyShape } from "@/lib/sound/mv/sections";
import {
  DEFAULT_EFFECT_PARAMS,
  focalPulseTrack,
  limitFlashRate,
} from "@/app/_phases/frames/music-video/compositor";

keepEnv(["LOCAL_BINARIES"]);

/** The last commit whose compositor.ts had no focal element - the "today's
 *  frame" that case 5 compares against. Read with `git show`, so it needs the
 *  history (not a shallow clone). */
const PRE_FOCAL_COMMIT = "0b8e858";
const COMPOSITOR = "app/_phases/frames/music-video/compositor.ts";

function hasCommit(sha: string): boolean {
  try {
    execFileSync("git", ["cat-file", "-e", `${sha}^{commit}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const BPM = 120;
const TRACK_S = 4;
const SAMPLE_RATE = 48000;

/* ── binaries ───────────────────────────────────────────────────────────── */

function onPath(bin: string): boolean {
  try {
    execFileSync(bin, ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
const HAVE_FFMPEG = onPath("ffmpeg") && onPath("ffprobe");

function needBinaries(chromiumOk: boolean): void {
  const missing = !HAVE_FFMPEG ? "ffmpeg/ffprobe are not on PATH" : !chromiumOk ? "headless Chromium did not launch" : null;
  if (!missing) return;
  if (process.env.CI) throw new Error(`CI is set and ${missing}: this probe may not skip here`);
  test.skip(true, `${missing} on this machine: the render cannot run here`);
}

/* ── fixtures ───────────────────────────────────────────────────────────── */

/** 16-bit mono PCM WAV: a quiet bed and a kick on every beat (first at 0.25 s,
 *  so frame 0 is bed only). The kick sweeps 110 -> 45 Hz under a 90 ms decay:
 *  low-band energy with a sharp attack, which is what a kick is. */
function synthWav(file: string): void {
  const n = TRACK_S * SAMPLE_RATE;
  const pcm = Buffer.alloc(n * 2);
  const beatS = 60 / BPM;
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    let v = 0.08 * Math.sin(2 * Math.PI * 660 * t);
    const sinceBeat = (t - 0.25 + beatS * 1000) % beatS;
    if (t >= 0.25 && sinceBeat < 0.4) {
      const k = sinceBeat;
      const phase = 2 * Math.PI * (45 * k + (65 * 0.03) * (1 - Math.exp(-k / 0.03)));
      v += 0.85 * Math.exp(-k / 0.09) * Math.sin(phase);
    }
    pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 2);
  }
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SAMPLE_RATE, 24);
  h.writeUInt32LE(SAMPLE_RATE * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  writeFileSync(file, Buffer.concat([h, pcm]));
}

const ff = (args: string[]) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);

interface Probed {
  streams: { codec_type: string; codec_name: string; width?: number; height?: number }[];
  format: { duration: string };
}
const ffprobe = (file: string): Probed =>
  JSON.parse(
    execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height:format=duration", "-of", "json", file], {
      encoding: "utf8",
    }),
  );

/* ── the page ───────────────────────────────────────────────────────────── */

const pngDataUrl = (file: string) => `data:image/png;base64,${readFileSync(file).toString("base64")}`;

const frameAt = (page: Page, i: number) =>
  page.evaluate((k: number) => (window as unknown as { renderFrameAt: (k: number) => string }).renderFrameAt(k), i);

/** Mean Rec. 601 luma (0..255) of the square around (cx, cy) of the canvas,
 *  after rendering frame `i`. */
const regionLuma = (page: Page, i: number, cx: number, cy: number, half: number) =>
  page.evaluate(
    ({ i, cx, cy, half }: { i: number; cx: number; cy: number; half: number }) => {
      (window as unknown as { renderFrameAt: (k: number) => string }).renderFrameAt(i);
      const c = document.getElementById("c") as HTMLCanvasElement;
      const d = c.getContext("2d")!.getImageData(cx - half, cy - half, half * 2, half * 2).data;
      let sum = 0;
      for (let p = 0; p < d.length; p += 4) sum += 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
      return sum / (d.length / 4);
    },
    { i, cx, cy, half },
  );

/** The compositor at `PRE_FOCAL_COMMIT`, transpiled the way the export page
 *  transpiles today's, set up with the export page's own recipe. */
async function setUpPreFocalPage(page: Page, posterDataUrl: string, envelope: AudioEnvelope, seed: number, width: number, height: number) {
  const source = execFileSync("git", ["show", `${PRE_FOCAL_COMMIT}:${COMPOSITOR}`], { encoding: "utf8" });
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  await page.setContent(`<!doctype html><html><body style="margin:0;background:#000">
    <canvas id="c" width="${width}" height="${height}"></canvas></body></html>`);
  await page.addScriptTag({
    content: `(function(){var exports={};var module={exports:exports};(function(exports,module){\n${outputText}\n})(exports,module);window.__Old=exports;})();`,
  });
  await page.evaluate(
    async ({ posterDataUrl, envelope, seed, params }) => {
      const old = (window as unknown as { __Old: Record<string, (...a: unknown[]) => unknown> }).__Old;
      const canvas = document.getElementById("c") as HTMLCanvasElement;
      const ctx = canvas.getContext("2d")!;
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = () => rej(new Error("poster"));
        i.src = posterDataUrl;
      });
      const longEdge = Math.max(img.naturalWidth, img.naturalHeight);
      const scale = longEdge > 640 ? 640 / longEdge : 1;
      const aw = Math.max(1, Math.round(img.naturalWidth * scale));
      const ah = Math.max(1, Math.round(img.naturalHeight * scale));
      const a = document.createElement("canvas");
      a.width = aw;
      a.height = ah;
      const actx = a.getContext("2d", { willReadFrequently: true })!;
      actx.drawImage(img, 0, 0, aw, ah);
      const bloomTexture = old.buildBloomTexture(old.computeEdgeMask(actx.getImageData(0, 0, aw, ah)), params);
      const boundedLow = old.limitFlashRate(envelope.bands.low, envelope.fps, params.flashThreshold, params.flashMaxPerWindow);
      (window as unknown as { renderFrameAt: (k: number) => string }).renderFrameAt = (frameIndex: number) => {
        old.renderFrame(ctx, {
          poster: img, posterWidth: img.naturalWidth, posterHeight: img.naturalHeight, bloomTexture, seed,
          effectParams: params, fps: envelope.fps, boundedLow, highBand: envelope.bands.high, frameIndex, reducedMotion: false,
        });
        return canvas.toDataURL("image/png");
      };
    },
    { posterDataUrl, envelope, seed, params: DEFAULT_EFFECT_PARAMS },
  );
}

/* ── 1. sections, pure ──────────────────────────────────────────────────── */

test("sections: quiet-loud-quiet is three sections from 0, labelled by energy", () => {
  const fps = 30;
  const seg = (s: number, v: number) => Array.from({ length: s * fps }, (_, i) => v + 0.02 * Math.sin(i * 0.7));
  const low = [...seg(60, 0.1), ...seg(60, 0.9), ...seg(60, 0.1)];
  const env = { fps, bands: { low, mid: low, high: low } };
  const sections = detectSections(env);
  expect(sections.map((s) => s.startS)).toEqual([0, 60, 120]);
  expect(sections.map((s) => s.label)).toEqual(["intro", "chorus", "outro"]);

  // A track with no structure is one section, not its loudest ripple.
  const flat = seg(200, 0.5);
  expect(detectSections({ fps, bands: { low: flat, mid: flat, high: flat } })).toEqual([{ startS: 0, label: "verse" }]);

  // No section under 20 s, the last included: a 15 s burst is absorbed.
  const short = [...seg(50, 0.1), ...seg(15, 0.9), ...seg(50, 0.1)];
  const s2 = detectSections({ fps, bands: { low: short, mid: short, high: short } });
  const ends = [...s2.slice(1).map((s) => s.startS), short.length / fps];
  s2.forEach((s, k) => expect(ends[k] - s.startS).toBeGreaterThanOrEqual(20));

  const shape = energyShape(env);
  expect(shape).toHaveLength(10);
  expect(Math.max(...shape)).toBe(1);
  expect(shape[0]).toBeLessThan(0.3);
});

/* ── 2..6, on the real engine ───────────────────────────────────────────── */

test.describe.serial("the render engine on this machine", () => {
  let dir = "";
  let wav = "";
  let darkPng = "";
  let edgePng = "";
  let envPath = "";
  let envelope: AudioEnvelope | null = null;
  let browser: Browser | undefined;
  let chromiumOk = true;

  test.beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "mv-render-probe-"));
    wav = join(dir, "track.wav");
    darkPng = join(dir, "dark.png");
    edgePng = join(dir, "edge.png");
    envPath = join(dir, "job", "envelope.json");
    synthWav(wav);
    if (HAVE_FFMPEG) {
      // 4:3 stills, so the queue's cover and the studio's contain both have
      // something to do.
      ff(["-f", "lavfi", "-i", "color=c=0x141c26:s=640x480", "-frames:v", "1", darkPng]);
      ff(["-f", "lavfi", "-i", "testsrc=s=640x480", "-frames:v", "1", edgePng]);
    }
    try {
      browser = await launchHeadless();
    } catch {
      chromiumOk = false;
    }
  });

  test.afterAll(async () => {
    await browser?.close().catch(() => {});
    rmSync(dir, { recursive: true, force: true });
  });

  test("analyseTrack bakes the envelope in the page and finds the tempo", async () => {
    test.setTimeout(120_000);
    needBinaries(chromiumOk);
    process.env.LOCAL_BINARIES = "on";
    const analysis = await analyseTrack({ audioPath: wav, envelopePath: envPath });

    expect(existsSync(envPath)).toBe(true);
    envelope = JSON.parse(readFileSync(envPath, "utf8")) as AudioEnvelope;
    expect(envelope.fps).toBe(30);
    expect(envelope.frameCount).toBe(TRACK_S * 30);

    expect(Math.abs(analysis.durationS - TRACK_S)).toBeLessThan(0.05);
    expect(analysis.energyShape).toHaveLength(10);
    expect(analysis.sections[0]?.startS).toBe(0);
    // Octave siblings are the same answer to this probe (the registry's
    // second accuracy figure): 120, 60 or 240 within 4%.
    const near = analysis.tempoBpm.some((b) => [BPM / 2, BPM, BPM * 2].some((t) => Math.abs(b - t) / t <= 0.04));
    expect(near, `tempo candidates ${JSON.stringify(analysis.tempoBpm)}`).toBe(true);
  });

  test("the focal pulse follows the low band; one frame index is one picture", async () => {
    test.setTimeout(120_000);
    needBinaries(chromiumOk);
    expect(envelope, "analyseTrack must have run").not.toBeNull();
    const env = envelope!;
    const W = 1920;
    const H = 1080;
    const focal = { kind: "halo" as const, x: 0.5, y: 0.5, r: 0.18, hue: 30, pulseStrength: 1 };
    const setup = {
      width: W, height: H, posterDataUrl: pngDataUrl(darkPng), envelope: env, seed: 7,
      effectParams: { ...DEFAULT_EFFECT_PARAMS, particleCount: 0 }, fit: "cover" as const, particleHue: 200, focal,
    };

    // The same pulse the page derives, computed here to choose the frames:
    // the strongest frame, and the weakest one after the first kick.
    const p = DEFAULT_EFFECT_PARAMS;
    const pulse = focalPulseTrack(limitFlashRate(env.bands.low, env.fps, p.flashThreshold, p.flashMaxPerWindow), env.fps, p.flashThreshold, p.flashMaxPerWindow);
    const kick = pulse.indexOf(Math.max(...pulse));
    const after = pulse.slice(10);
    const quiet = 10 + after.indexOf(Math.min(...after));

    const page = await browser!.newPage({ viewport: { width: W, height: H } });
    await setUpRenderPage(page, setup);
    const half = Math.round(0.18 * H * 0.6);
    const kickL = await regionLuma(page, kick, W / 2, H / 2, half);
    const quietL = await regionLuma(page, quiet, W / 2, H / 2, half);
    const MARGIN = 20;
    console.log(`[mv-render] focal luma: kick frame ${kick} = ${kickL.toFixed(1)}, quiet frame ${quiet} = ${quietL.toFixed(1)} (pulse ${pulse[kick].toFixed(2)} vs ${pulse[quiet].toFixed(2)})`);
    expect(kickL - quietL, `kick ${kickL.toFixed(1)} vs quiet ${quietL.toFixed(1)}`).toBeGreaterThan(MARGIN);

    // Determinism: frame 37 rendered, then others, then 37 again - and in a
    // second page that never rendered anything before it.
    const a = await frameAt(page, 37);
    await frameAt(page, kick);
    await frameAt(page, 5);
    expect(await frameAt(page, 37)).toBe(a);
    const page2 = await browser!.newPage({ viewport: { width: W, height: H } });
    await setUpRenderPage(page2, setup);
    expect(await frameAt(page2, 37)).toBe(a);

    // Never frozen: two quiet frames a second apart differ (the idle breath).
    const env0 = await frameAt(page2, 0);
    expect(await frameAt(page2, 30)).not.toBe(env0);
    await page.close();
    await page2.close();
  });

  test("without the queue's extras the studio's frame is the pre-focal frame, byte for byte", async () => {
    test.setTimeout(120_000);
    needBinaries(chromiumOk);
    // The reference is the compositor as it was BEFORE the focal element,
    // read out of history. CI checks out at depth 1 (.github/workflows/gates.yml,
    // actions/checkout default), where that commit does not exist: skip there,
    // with the reason, rather than fail over the checkout's depth.
    test.skip(!hasCommit(PRE_FOCAL_COMMIT), `commit ${PRE_FOCAL_COMMIT} is not in this checkout (shallow clone): no pre-focal reference to compare against`);
    expect(envelope, "analyseTrack must have run").not.toBeNull();
    const env = envelope!;
    const W = 960;
    const H = 540;
    const poster = pngDataUrl(edgePng);
    const now = await browser!.newPage({ viewport: { width: W, height: H } });
    await setUpRenderPage(now, { width: W, height: H, posterDataUrl: poster, envelope: env, seed: 11, effectParams: DEFAULT_EFFECT_PARAMS });
    const then = await browser!.newPage({ viewport: { width: W, height: H } });
    await setUpPreFocalPage(then, poster, env, 11, W, H);
    for (const i of [0, 8, 9, 60, env.frameCount - 1]) {
      expect(await frameAt(now, i), `frame ${i}`).toBe(await frameAt(then, i));
    }
    await now.close();
    await then.close();
  });

  test("renderMusicVideo lands a 1920x1080 mp4 with audio", async () => {
    test.setTimeout(600_000);
    needBinaries(chromiumOk);
    process.env.LOCAL_BINARIES = "on";
    expect(existsSync(envPath), "analyseTrack must have run").toBe(true);
    const out = join(dir, "job", "video.mp4");
    const progress: number[] = [];
    const t0 = Date.now();
    const { durationS } = await renderMusicVideo({
      audioPath: wav,
      stillPath: darkPng,
      envelopePath: envPath,
      motion: { particleDensity: 0.5, particleHue: 40, pulseStrength: 0.8 },
      outPath: out,
      onProgress: (f) => progress.push(f),
    });
    const wallMs = Date.now() - t0;
    const frames = TRACK_S * 30;
    console.log(
      `[mv-render] ${TRACK_S}s clip (${frames} frames at 1920x1080) rendered in ${(wallMs / 1000).toFixed(1)}s = ${(wallMs / frames).toFixed(0)} ms/frame; ` +
        `a 4-minute track extrapolates to ~${((wallMs / frames) * 240 * 30 / 60000).toFixed(1)} min`,
    );

    const probed = ffprobe(out);
    const video = probed.streams.find((s) => s.codec_type === "video");
    expect(video?.codec_name).toBe("h264");
    expect([video?.width, video?.height]).toEqual([1920, 1080]);
    expect(probed.streams.some((s) => s.codec_type === "audio")).toBe(true);
    expect(Math.abs(Number(probed.format.duration) - TRACK_S)).toBeLessThanOrEqual(0.2);
    expect(Math.abs(durationS - TRACK_S)).toBeLessThanOrEqual(0.2);
    expect(existsSync(`${join(dir, "job", "video")}.partial.mp4`)).toBe(false);
    expect(progress.at(-1)).toBe(1);
    expect(progress.every((f, k) => k === 0 || f >= progress[k - 1])).toBe(true);

    expect(bloomIntensityFor(0.5)).toBe(DEFAULT_EFFECT_PARAMS.bloomIntensity);
    expect(bloomIntensityFor(0)).toBeLessThan(bloomIntensityFor(1));
  });
});
