// RENDER A FILM FACE - the night tool (.contest/r3/tools/render.mjs) as a module the reel-render job calls, on the
// reel's GPU browser (./gpu.mts launchReelBrowser: the card, read back; the CPU launch when there is none).
//
// The page contract is the night's, unchanged, so the fifteen films made that night render here byte for byte:
//
//   window.REEL = { width, height, fps: 30, frames }   frames = the whole timeline at desktop speed
//   window.renderFrameAt = (i) => void | Promise       frame i drawn completely, a pure function of i
//   window.REEL_READY = true | Promise                 set once fonts, images, shaders and data are loaded
//
// Served over http on 127.0.0.1 with three mounts, tried in order: `/data/` from the film's own `data/`, then
// the reels' shared data (`<reelsRoot>/_shared/data/`: flags, geo, fonts); `/three/` from the repo's `three`
// package (r187); `/` from the film folder. Every request to any other origin is aborted: nothing loads from the
// network at render time.
//
// The master is the night's encode: PNG frames streamed to ffmpeg over image2pipe (a 100 s film is 3,000 PNGs:
// gigabytes on disk otherwise), libx264 preset slow, CRF 16, yuv420p, +faststart, at the page's fps. `step` 2
// draws every second frame of the timeline at the same fps: the phone film is the same timeline at 2x.

import { spawn } from "node:child_process";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Browser, Page } from "playwright";

import { launchReelBrowser } from "./gpu.mts";

const MIME: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".css": "text/css",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2",
  ".woff": "font/woff", ".ttf": "font/ttf", ".otf": "font/otf", ".glb": "model/gltf-binary", ".gltf": "model/gltf+json",
  ".bin": "application/octet-stream", ".wasm": "application/wasm", ".csv": "text/csv", ".txt": "text/plain",
};

/** Where one face is drawn from. */
export interface FilmSite {
  /** The film folder: the pages, their module, `data/`. */
  readonly filmDir: string;
  /** The reels' shared data folder, answered after the film's own `data/`. */
  readonly sharedData: string;
  /** The page, film-relative (`reel-desktop.html`, `reel.html`). */
  readonly page: string;
  readonly width: number;
  readonly height: number;
  /** `cpu` forces the strips' launch (WebGL draws black there); default the GPU, checked. */
  readonly prefer?: "gpu" | "cpu";
}

export interface RenderFilmInput extends FilmSite {
  /** Draw every `step`-th frame of the timeline (2: the phone film). */
  readonly step: number;
  /** The mp4 to write. Written beside as `<name>.partial.mp4` and renamed when ffmpeg closed clean. */
  readonly out: string;
  /** The first timeline frame (default 0). */
  readonly from?: number;
  /** How many frames to write (default: to the end of the timeline). */
  readonly frames?: number;
  /** Told after each frame: the frames written so far and how many the render writes. */
  readonly onProgress?: (frame: number, frames: number) => void | Promise<void>;
}

export interface RenderReport {
  /** The WebGL renderer that drew the frames, read back. */
  readonly renderer: string;
  readonly gpu: boolean;
  /** `window.REEL.frames`: the timeline at desktop speed. */
  readonly timeline: number;
  /** Frames written. */
  readonly frames: number;
  readonly msPerFrame: number;
  readonly pageErrors: readonly string[];
}

const threeRoot = (): string => path.resolve(path.dirname(createRequire(import.meta.url).resolve("three")), "..");

type Mount = { readonly prefix: string; readonly root: string };

async function serve(mounts: readonly Mount[]): Promise<{ origin: string; close: () => Promise<void> }> {
  const server: Server = createServer((req, res) => {
    const rel = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
    // Every mount that matches is tried in order, so a film's own data/ answers before the shared folder does.
    const inside = mounts
      .filter((m) => rel === m.prefix.slice(0, -1) || rel.startsWith(m.prefix))
      .map((m) => ({ root: path.resolve(m.root), file: path.resolve(m.root, `.${path.posix.sep}${rel.slice(m.prefix.length)}`) }))
      .filter((c) => c.file.startsWith(c.root))
      .map((c) => c.file);
    const next = (k: number): void => {
      const file = inside[k];
      if (file === undefined) return void res.writeHead(404).end();
      readFile(file).then(
        (buf) => res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream", "cache-control": "no-store" }).end(buf),
        () => next(k + 1),
      );
    };
    next(0);
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const addr = server.address();
  const port = typeof addr === "object" && addr !== null ? addr.port : 0;
  return { origin: `http://127.0.0.1:${port}`, close: () => new Promise<void>((ok) => server.close(() => ok())) };
}

async function open(browser: Browser, url: string, site: FilmSite, errors: string[]): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: site.width, height: site.height }, deviceScaleFactor: 1 });
  const origin = new URL(url).origin;
  await page.route("**/*", (route) => {
    const u = route.request().url();
    return u.startsWith(origin) || u.startsWith("data:") || u.startsWith("blob:") ? route.continue() : route.abort();
  });
  page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 300)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text().slice(0, 300));
  });
  const res = await page.goto(url, { waitUntil: "load", timeout: 60_000 });
  if (res !== null && !res.ok()) throw new Error(`${site.page} answered ${res.status()}: it is not in ${site.filmDir}`);
  const ready = page.evaluate(async () => {
    const w = window as unknown as { REEL_READY?: unknown; renderFrameAt?: unknown };
    const t0 = performance.now();
    while (w.REEL_READY === undefined || w.REEL_READY === false) {
      if (performance.now() - t0 > 90_000) throw new Error("window.REEL_READY was never set");
      await new Promise((r) => setTimeout(r, 50));
    }
    await w.REEL_READY;
    await document.fonts.ready;
    if (typeof w.renderFrameAt !== "function") throw new Error("window.renderFrameAt is not a function");
  });
  // A page that never got ready says why when it can: its own errors are the sentence the operator needs.
  await ready.catch((e: unknown) => {
    const said = [...new Set(errors)].slice(0, 4).join(" | ");
    throw new Error(`${e instanceof Error ? e.message.replace(/^page\.evaluate: (Error: )?/, "") : String(e)}${said === "" ? "" : `; the page said: ${said}`}`);
  });
  return page;
}

const draw = (page: Page, i: number): Promise<void> =>
  page.evaluate(async (k) => {
    await (window as unknown as { renderFrameAt: (i: number) => unknown }).renderFrameAt(k);
  }, i);
const shoot = (page: Page): Promise<Buffer> => page.screenshot({ type: "png", animations: "disabled", caret: "hide" });

type Reel = { readonly width?: number; readonly height?: number; readonly fps?: number; readonly frames?: number };

/** One page of a film opened on the reel's browser, its site served; `fn` draws, and everything is closed after. */
async function withPage<T>(site: FilmSite, fn: (page: Page, reel: Required<Pick<Reel, "fps" | "frames">>, meta: { renderer: string; gpu: boolean; errors: string[] }) => Promise<T>): Promise<T> {
  const host = await serve([
    { prefix: "/data/", root: path.join(site.filmDir, "data") },
    { prefix: "/data/", root: site.sharedData },
    { prefix: "/three/", root: threeRoot() },
    { prefix: "/", root: site.filmDir },
  ]);
  const rb = await launchReelBrowser(site.prefer ?? "gpu");
  const errors: string[] = [];
  try {
    const page = await open(rb.browser, `${host.origin}/${site.page}`, site, errors);
    const reel = (await page.evaluate(() => (window as unknown as { REEL?: Reel }).REEL)) ?? {};
    if (reel.width !== site.width || reel.height !== site.height) throw new Error(`window.REEL is ${JSON.stringify(reel)}; this face is ${site.width}x${site.height}`);
    if (typeof reel.frames !== "number" || !Number.isInteger(reel.frames) || reel.frames < 1) throw new Error(`window.REEL.frames is ${JSON.stringify(reel.frames)}, not a whole number of frames`);
    return await fn(page, { fps: reel.fps ?? 30, frames: reel.frames }, { renderer: rb.renderer, gpu: rb.gpu, errors });
  } finally {
    await rb.browser.close().catch(() => {});
    await host.close();
  }
}

/** The name ffmpeg writes before the render is whole: an mp4 extension, so the muxer is chosen by it. */
export const partialOf = (out: string): string => out.replace(/\.mp4$/i, "") + ".partial.mp4";

/** One face, whole (or `frames` from `from`), streamed into ffmpeg. A failed render leaves no file at `out`. */
export async function renderFilm(o: RenderFilmInput): Promise<RenderReport> {
  const step = Math.max(1, Math.floor(o.step));
  return withPage(o, async (page, reel, meta) => {
    const from = Math.max(0, Math.min(reel.frames - 1, o.from ?? 0));
    const left = Math.ceil((reel.frames - from) / step);
    const count = Math.max(1, Math.min(left, o.frames ?? left));
    await mkdir(path.dirname(o.out), { recursive: true });
    const tmp = partialOf(o.out);
    await rm(tmp, { force: true });
    const args = ["-hide_banner", "-loglevel", "error", "-y", "-f", "image2pipe", "-framerate", String(reel.fps), "-i", "-", "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart", tmp];
    const enc = spawn("ffmpeg", args, { stdio: ["pipe", "ignore", "pipe"] });
    let stderr = "";
    enc.stderr.on("data", (b: Buffer) => {
      stderr = (stderr + b.toString()).slice(-2000);
    });
    const closed = new Promise<void>((ok, no) => {
      enc.on("error", no);
      enc.on("close", (c) => (c === 0 ? ok() : no(new Error(`ffmpeg exited ${c}: ${stderr.trim() || "no message"}`))));
    });
    const t0 = Date.now();
    try {
      for (let k = 0; k < count; k++) {
        await draw(page, from + k * step);
        const png = await shoot(page);
        if (!enc.stdin.write(png)) await new Promise<void>((r) => enc.stdin.once("drain", () => r()));
        await o.onProgress?.(k + 1, count);
      }
      enc.stdin.end();
      await closed;
    } catch (e) {
      enc.kill("SIGKILL");
      await closed.catch(() => {});
      await rm(tmp, { force: true });
      throw e;
    }
    await rename(tmp, o.out);
    return { renderer: meta.renderer, gpu: meta.gpu, timeline: reel.frames, frames: count, msPerFrame: Math.round((Date.now() - t0) / count), pageErrors: [...new Set(meta.errors)].slice(0, 8) };
  });
}

/** Timeline frames drawn as PNGs on one page load. */
export async function renderStills(o: FilmSite & { readonly shots: readonly { readonly frame: number; readonly out: string }[] }): Promise<RenderReport> {
  return withPage(o, async (page, reel, meta) => {
    const t0 = Date.now();
    for (const s of o.shots) {
      await draw(page, Math.max(0, Math.min(reel.frames - 1, s.frame)));
      await mkdir(path.dirname(s.out), { recursive: true });
      await writeFile(s.out, await shoot(page));
    }
    const n = Math.max(1, o.shots.length);
    return { renderer: meta.renderer, gpu: meta.gpu, timeline: reel.frames, frames: o.shots.length, msPerFrame: Math.round((Date.now() - t0) / n), pageErrors: [...new Set(meta.errors)].slice(0, 8) };
  });
}

/** One timeline frame as a PNG. */
export const renderStill = (o: FilmSite & { readonly frame: number; readonly out: string }): Promise<RenderReport> => renderStills({ ...o, shots: [{ frame: o.frame, out: o.out }] });

/** `window.REEL.frames` of a page, read on the reel's browser (nothing drawn). */
export const timelineOf = (site: FilmSite): Promise<number> => withPage(site, async (_page, reel) => reel.frames);

// A CLI for the acceptance render and a look by hand:
//   node --experimental-strip-types pipeline/reel/film-render.mts <filmDir> <out.mp4> [--page p] [--width w] [--height h]
//        [--step s] [--from f] [--frames n] [--shared dir] [--cpu]
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [filmDir, out, ...rest] = process.argv.slice(2);
  const flag = (k: string): string | undefined => {
    const i = rest.indexOf(`--${k}`);
    return i < 0 ? undefined : rest[i + 1];
  };
  const num = (k: string): number | undefined => (flag(k) === undefined ? undefined : Number(flag(k)));
  if (filmDir === undefined || out === undefined) {
    process.stderr.write("usage: film-render.mts <filmDir> <out.mp4> [--page p] [--width w] [--height h] [--step s] [--from f] [--frames n] [--shared dir] [--cpu]\n");
    process.exitCode = 2;
  } else {
    const from = num("from");
    const frames = num("frames");
    renderFilm({
      filmDir: path.resolve(filmDir),
      sharedData: path.resolve(flag("shared") ?? path.join(filmDir, "..", "_shared", "data")),
      page: flag("page") ?? "reel-desktop.html",
      width: num("width") ?? 1920,
      height: num("height") ?? 1080,
      step: num("step") ?? 1,
      out: path.resolve(out),
      ...(from === undefined ? {} : { from }),
      ...(frames === undefined ? {} : { frames }),
      prefer: rest.includes("--cpu") ? "cpu" : "gpu",
    }).then(
      (r) => process.stdout.write(`${JSON.stringify(r)}\n`),
      (e: unknown) => {
        process.stderr.write(`film-render: ${e instanceof Error ? e.message : String(e)}\n`);
        process.exitCode = 1;
      },
    );
  }
}
