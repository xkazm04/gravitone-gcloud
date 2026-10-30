// GPU KEYFRAMES - photograph a scene page at chosen track times, on the box's GPU.
//
// Why a second capture path beside the strips': those pages are flat DOM and
// canvas 2D, and their Chromium runs with the GPU OFF (`--disable-gpu`, the
// strips' byte-identical rule). A treatment's scene is a lit WebGL world -
// three.js, post-processing, fog, bloom - and on SwiftShader that is either
// unbearably slow or not drawn at all. Measured 2026-10-30 on this box:
// `--use-angle=d3d11 --enable-gpu --ignore-gpu-blocklist` gives headless
// Chromium the NVIDIA RTX Spark (Blackwell) through ANGLE/D3D11; with
// `--disable-gpu` the renderer string reads SwiftShader. The renderer actually
// used is returned with every shot, so a silent fallback is visible.
//
// THE SCENE CONTRACT (board-t/<id>/scene.html, authored by a session):
//   - `window.__TIMELINE__` is the WHOLE timeline.json, injected before the
//     page's scripts run (keyframes sit anywhere on the track).
//   - The page sets `window.__READY__ = true` once every asset, font and
//     shader is loaded and compiled; nothing is shot before that.
//   - `window.render(t)` draws the frame for t seconds on the track clock,
//     synchronously, as a pure function of t (seeded randomness, closed-form
//     motion, mixer.setTime(t) for any animation clip, a fixed delta for any
//     post effect that wants one). The WebGL renderer is created with
//     `preserveDrawingBuffer: true` so the screenshot reads the frame drawn.
//   - three.js is imported through an import map from the clip folder's
//     `vendor/three/` (`vendorThree` copies it there). Chromium refuses ES
//     module scripts from file:// (origin null), so the clip folder is served
//     by a throwaway static server on 127.0.0.1 for the length of the shoot;
//     every request to any other origin is aborted - no network, ever.
// Each keyframe gets a FRESH page, so a scene that only looks right after the
// frames before it is caught here, cold, as it would be in a chunked render.

import { cp, mkdir, readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";

import { chromium } from "playwright";

import type { TimelineV1 } from "./types";

export const GPU_ARGS = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-webgpu"];

const READY_TIMEOUT_MS = 60_000;

export interface ShotResult {
  files: string[];
  renderer: string;
  /** Wall time of render(t) + screenshot per keyframe. */
  ms: number[];
  /** Console errors the page printed, per keyframe. */
  errors: string[][];
}

/** Copy three's module build and its addons into `<clipDir>/vendor/three/`. */
export async function vendorThree(clipDir: string): Promise<string> {
  const req = createRequire(import.meta.url);
  const threeMain = req.resolve("three");
  const root = path.resolve(path.dirname(threeMain), "..");
  const dest = path.join(clipDir, "vendor", "three");
  await mkdir(dest, { recursive: true });
  await cp(path.join(root, "build"), path.join(dest, "build"), { recursive: true });
  await cp(path.join(root, "examples", "jsm"), path.join(dest, "examples", "jsm"), { recursive: true });
  return dest;
}

const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".bin": "application/octet-stream", ".mp3": "audio/mpeg", ".mp4": "video/mp4", ".wasm": "application/wasm", ".woff2": "font/woff2", ".ttf": "font/ttf", ".svg": "image/svg+xml" };

/** A static server over `root` on 127.0.0.1, refusing paths that climb out of it. */
export async function serveDir(root: string): Promise<{ origin: string; close: () => Promise<void> }> {
  const base = path.resolve(root);
  const server: Server = createServer((req, res) => {
    const rel = decodeURIComponent((req.url ?? "/").split("?")[0]);
    const file = path.resolve(base, "." + rel);
    if (!file.startsWith(base)) {
      res.writeHead(403).end();
      return;
    }
    readFile(file).then(
      (buf) => res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream" }).end(buf),
      () => res.writeHead(404).end(),
    );
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  return { origin: `http://127.0.0.1:${port}`, close: () => new Promise((ok) => server.close(() => ok())) };
}

export async function shootKeyframes(opts: {
  pageFile: string;
  /** The folder served as the site root; the page must sit inside it. */
  rootDir: string;
  timeline: TimelineV1;
  times: number[];
  outDir: string;
  width?: number;
  height?: number;
  prefix?: string;
}): Promise<ShotResult> {
  const width = opts.width ?? 1920;
  const height = opts.height ?? 1080;
  await mkdir(opts.outDir, { recursive: true });
  const site = await serveDir(opts.rootDir);
  const url = `${site.origin}/${path.relative(path.resolve(opts.rootDir), path.resolve(opts.pageFile)).split(path.sep).join("/")}`;
  const browser = await chromium.launch({ headless: true, args: GPU_ARGS });
  const files: string[] = [];
  const ms: number[] = [];
  const errors: string[][] = [];
  let renderer = "unknown";
  try {
    for (const t of opts.times) {
      const page = await browser.newPage({ viewport: { width, height } });
      const errs: string[] = [];
      page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
      page.on("pageerror", (e) => errs.push(String(e)));
      await page.route((u) => !u.href.startsWith(site.origin), (r) => r.abort());
      await page.addInitScript((tl) => {
        (window as unknown as { __TIMELINE__: unknown }).__TIMELINE__ = tl;
      }, opts.timeline);
      await page.goto(url);
      await page.waitForFunction(() => (window as unknown as { __READY__?: boolean }).__READY__ === true, null, { timeout: READY_TIMEOUT_MS });
      const t0 = Date.now();
      await page.evaluate((tt) => (window as unknown as { render: (x: number) => void }).render(tt), t);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const file = path.join(opts.outDir, `${opts.prefix ?? "k"}-${t.toFixed(2)}.png`);
      await page.screenshot({ path: file });
      ms.push(Date.now() - t0);
      if (renderer === "unknown") {
        renderer = await page.evaluate(() => {
          const g = document.createElement("canvas").getContext("webgl2");
          const d = g?.getExtension("WEBGL_debug_renderer_info");
          return g && d ? String(g.getParameter(d.UNMASKED_RENDERER_WEBGL)) : "no webgl2";
        });
      }
      files.push(file);
      errors.push(errs);
      await page.close();
    }
  } finally {
    await browser.close();
    await site.close();
  }
  return { files, renderer, ms, errors };
}

/**
 * A span of the scene as a video with the track under it: one page, frames
 * at start + i/fps in order (the scene is pure, so order only saves page
 * loads), PNGs piped to ffmpeg, the mp3 slice muxed in. NVENC first, libx264
 * when this ffmpeg or GPU refuses it - the encoder that ran is returned.
 * The audio is the track itself, cut at the same start: never re-timed.
 */
export async function renderSpan(opts: {
  pageFile: string;
  rootDir: string;
  timeline: TimelineV1;
  audioPath: string;
  startS: number;
  endS: number;
  outFile: string;
  fps?: number;
  width?: number;
  height?: number;
}): Promise<{ frames: number; renderer: string; encoder: string; ms: number }> {
  const { spawn } = await import("node:child_process");
  const fps = opts.fps ?? 30;
  const width = opts.width ?? 1920;
  const height = opts.height ?? 1080;
  const n = Math.round((opts.endS - opts.startS) * fps);
  const t0 = Date.now();
  const site = await serveDir(opts.rootDir);
  const url = `${site.origin}/${path.relative(path.resolve(opts.rootDir), path.resolve(opts.pageFile)).split(path.sep).join("/")}`;
  const browser = await chromium.launch({ headless: true, args: GPU_ARGS });
  const encodeWith = async (encoder: string): Promise<void> => {
    const vArgs = encoder === "h264_nvenc" ? ["-c:v", "h264_nvenc", "-preset", "p5", "-cq", "19"] : ["-c:v", "libx264", "-preset", "medium", "-crf", "18"];
    const ff = spawn("ffmpeg", ["-y", "-v", "error", "-f", "image2pipe", "-framerate", String(fps), "-i", "-", "-ss", String(opts.startS), "-t", String(n / fps), "-i", opts.audioPath, "-map", "0:v", "-map", "1:a", ...vArgs, "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "256k", "-shortest", opts.outFile], { stdio: ["pipe", "ignore", "pipe"] });
    let err = "";
    ff.stderr.on("data", (d) => (err += String(d)));
    const done = new Promise<void>((ok, bad) => ff.on("close", (code) => (code === 0 ? ok() : bad(new Error(`ffmpeg ${encoder}: ${err.trim()}`)))));
    const page = await browser.newPage({ viewport: { width, height } });
    try {
      await page.route((u) => !u.href.startsWith(site.origin), (r) => r.abort());
      await page.addInitScript((tl) => {
        (window as unknown as { __TIMELINE__: unknown }).__TIMELINE__ = tl;
      }, opts.timeline);
      await page.goto(url);
      await page.waitForFunction(() => (window as unknown as { __READY__?: boolean }).__READY__ === true, null, { timeout: READY_TIMEOUT_MS });
      for (let i = 0; i < n; i++) {
        await page.evaluate((tt) => (window as unknown as { render: (x: number) => void }).render(tt), opts.startS + i / fps);
        const png = await page.screenshot({ type: "png" });
        if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once("drain", r));
      }
    } finally {
      ff.stdin.end();
      await page.close();
    }
    await done;
  };
  let encoder = "h264_nvenc";
  let renderer = "unknown";
  try {
    const probe = await browser.newPage();
    renderer = await probe.evaluate(() => {
      const g = document.createElement("canvas").getContext("webgl2");
      const d = g?.getExtension("WEBGL_debug_renderer_info");
      return g && d ? String(g.getParameter(d.UNMASKED_RENDERER_WEBGL)) : "no webgl2";
    });
    await probe.close();
    try {
      await encodeWith(encoder);
    } catch {
      encoder = "libx264";
      await encodeWith(encoder);
    }
  } finally {
    await browser.close();
    await site.close();
  }
  return { frames: n, renderer, encoder, ms: Date.now() - t0 };
}
