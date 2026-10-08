// RENDER ONE STRIP — headless capture, encode, contact sheet, and the four
// automated pre-gates. Built on the shared export kernel
// (lib/export/headless.ts) the music-video export already stands on.
//
// The page is LLM-authored code, so it is loaded with every network request
// aborted: only file: and data: may resolve. It draws into the DOM and the
// harness screenshots the viewport — SVG, CSS and DOM type cannot be read back
// from a canvas, and a screenshot is what a viewer sees.
//
// The gates are RECORDED, never enforced: a failed gate is a badge on the
// triage card, because the gate decides what may land in the registry, never
// what the operator is allowed to look at (intake render-proof v2.12).

import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { chromium, type Browser, type Page } from "playwright";

import { makeWorkDir, run, videoArgs, withEncoderFallback } from "../../lib/export/headless";
import { STRIP_FPS, STRIP_FRAMES, STRIP_SIZE, type StripGates, type StripLane } from "../../lib/foundry/strips/types";

/**
 * Chromium for strips, with incremental rasterization switched off.
 *
 * Measured 2026-10-06 on a pure strip (every value derived from t): two
 * identical sequential walks 0..180 ended on DIFFERENT pixels (about 0.05%,
 * anti-aliasing at tile seams), while cold renders were identical. Partial
 * raster reuses tiles across frames, so a frame's pixels depended on the
 * frames before it - the exact property the seek gate measures - and the
 * gate failed authors for the renderer's history. With these three flags
 * cold, sequential and repeated walks are byte-identical.
 */
export async function launchHeadless(): Promise<Browser> {
  return chromium.launch({ headless: true, args: ["--disable-partial-raster", "--disable-gpu", "--disable-lcd-text"] });
}

const READY_TIMEOUT_MS = 30_000;
const FRAME_TIMEOUT_MS = 15_000;
/** Frames the seek gate re-renders cold, deliberately out of order. */
const SEEK_FRAMES = [180, 0, 120];
/** Frames the legibility gate measures text on. */
const LEGIBILITY_FRAMES = [30, 120, 210];
const SAFE_INSET = 0.06;
const FLOOR_AT_1080 = 26;
const KEEP_NAMES_SHIM = "window.__name = window.__name || function (f) { return f; };";

export interface RenderResult {
  ok: boolean;
  gates?: StripGates;
  files: Partial<Record<"mp4" | "webm" | "poster" | "sheet", string>>;
  renderMs: number;
  error?: string;
}

async function openStrip(browser: Browser, htmlPath: string, lane: StripLane): Promise<Page> {
  const { width, height } = STRIP_SIZE[lane];
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.route("**/*", (route) => {
    const u = route.request().url();
    return u.startsWith("file:") || u.startsWith("data:") ? route.continue() : route.abort();
  });
  // tsx (esbuild keepNames) wraps named inner functions of an evaluate
  // callback in `__name(...)`, which does not exist in the page.
  await page.addInitScript(KEEP_NAMES_SHIM);
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load", timeout: READY_TIMEOUT_MS });
  await page.evaluate(
    async (ms) => {
      const w = window as unknown as { STRIP_READY?: unknown; renderFrameAt?: unknown };
      const t0 = performance.now();
      while (w.STRIP_READY === undefined || w.STRIP_READY === false) {
        if (performance.now() - t0 > ms) throw new Error("window.STRIP_READY was never set");
        await new Promise((r) => setTimeout(r, 50));
      }
      await w.STRIP_READY;
      await document.fonts.ready;
      if (typeof w.renderFrameAt !== "function") throw new Error("window.renderFrameAt is not a function");
    },
    READY_TIMEOUT_MS,
  );
  const dims = await page.evaluate(() => (window as unknown as { STRIP?: { width: number; height: number } }).STRIP);
  if (!dims || dims.width !== width || dims.height !== height) {
    throw new Error(`window.STRIP is ${JSON.stringify(dims)}, the ${lane} lane is ${width}x${height}`);
  }
  if (pageErrors.length) throw new Error(`page error at load: ${pageErrors[0]}`);
  return page;
}

async function drawFrame(page: Page, i: number): Promise<void> {
  await page.evaluate(
    async ({ i, ms }) => {
      const w = window as unknown as { renderFrameAt: (i: number) => unknown };
      await Promise.race([
        Promise.resolve(w.renderFrameAt(i)),
        new Promise((_, rej) => setTimeout(() => rej(new Error(`renderFrameAt(${i}) took over ${ms} ms`)), ms)),
      ]);
    },
    { i, ms: FRAME_TIMEOUT_MS },
  );
}

const shot = (page: Page) => page.screenshot({ type: "png", animations: "disabled", caret: "hide" });

/** Text measured as rendered: the first line box of every visible text node,
 *  converted to an approximate font size and scaled to a 1080-wide frame. */
async function measureText(page: Page): Promise<{ minPx: number; sample: string; outside: number; measured: number; canvases: number }> {
  return page.evaluate(
    ({ inset }) => {
      const W = innerWidth;
      const H = innerHeight;
      const scale = 1080 / W;
      let minPx = Infinity;
      let sample = "";
      let outside = 0;
      let measured = 0;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n: Node | null;
      while ((n = walker.nextNode())) {
        const text = (n.textContent ?? "").trim();
        const el = n.parentElement;
        if (!el || text.length < 2) continue;
        if (el.closest("script,style,title,defs,desc,metadata")) continue;
        let op = 1;
        for (let e: Element | null = el; e; e = e.parentElement) {
          const cs = getComputedStyle(e);
          if (cs.display === "none" || cs.visibility === "hidden") op = 0;
          op *= parseFloat(cs.opacity || "1");
        }
        if (op < 0.35) continue;
        let rect: DOMRect | undefined;
        if (el instanceof SVGElement) rect = el.getBoundingClientRect();
        else {
          const r = document.createRange();
          r.selectNodeContents(n);
          rect = r.getClientRects()[0];
        }
        if (!rect || rect.width < 1 || rect.height < 1) continue;
        if (rect.right < 0 || rect.bottom < 0 || rect.left > W || rect.top > H) continue;
        measured++;
        const px = (rect.height / 1.2) * scale;
        if (px < minPx) {
          minPx = px;
          sample = text.slice(0, 40);
        }
        if (rect.left < W * inset - 1 || rect.right > W * (1 - inset) + 1 || rect.top < H * inset - 1 || rect.bottom > H * (1 - inset) + 1) outside++;
      }
      return { minPx, sample, outside, measured, canvases: document.querySelectorAll("canvas").length };
    },
    { inset: SAFE_INSET },
  );
}

/** Pixel comparison and motion statistics, computed in a blank page. */
async function imageLab(browser: Browser) {
  const page = await browser.newPage();
  await page.setContent("<!doctype html><body></body>");
  await page.evaluate(KEEP_NAMES_SHIM);
  const toUrl = (b: Buffer, mime = "image/png") => `data:${mime};base64,${b.toString("base64")}`;
  return {
    async diffFraction(a: Buffer, b: Buffer): Promise<number> {
      if (a.equals(b)) return 0;
      return page.evaluate(
        async ([ua, ub]) => {
          const load = (u: string) =>
            new Promise<HTMLImageElement>((res, rej) => {
              const im = new Image();
              im.onload = () => res(im);
              im.onerror = () => rej(new Error("decode"));
              im.src = u;
            });
          const [ia, ib] = await Promise.all([load(ua), load(ub)]);
          const c = document.createElement("canvas");
          c.width = ia.naturalWidth;
          c.height = ia.naturalHeight;
          const x = c.getContext("2d", { willReadFrequently: true })!;
          x.drawImage(ia, 0, 0);
          const da = x.getImageData(0, 0, c.width, c.height).data;
          x.clearRect(0, 0, c.width, c.height);
          x.drawImage(ib, 0, 0);
          const db = x.getImageData(0, 0, c.width, c.height).data;
          let diff = 0;
          for (let k = 0; k < da.length; k += 4) {
            if (Math.abs(da[k] - db[k]) > 2 || Math.abs(da[k + 1] - db[k + 1]) > 2 || Math.abs(da[k + 2] - db[k + 2]) > 2) diff++;
          }
          return diff / (da.length / 4);
        },
        [toUrl(a), toUrl(b)],
      );
    },
    /** Mean luminance per sample and mean absolute change between neighbours, at 96 px wide. */
    async motion(samples: Buffer[]): Promise<{ luma: number[]; delta: number[] }> {
      return page.evaluate(async (urls) => {
        const c = document.createElement("canvas");
        const x = c.getContext("2d", { willReadFrequently: true })!;
        const grays: Float32Array[] = [];
        const luma: number[] = [];
        for (const u of urls) {
          const im = await new Promise<HTMLImageElement>((res) => {
            const i = new Image();
            i.onload = () => res(i);
            i.src = u;
          });
          c.width = 96;
          c.height = Math.round((96 * im.naturalHeight) / im.naturalWidth);
          x.drawImage(im, 0, 0, c.width, c.height);
          const d = x.getImageData(0, 0, c.width, c.height).data;
          const g = new Float32Array(d.length / 4);
          let sum = 0;
          for (let k = 0, j = 0; k < d.length; k += 4, j++) {
            g[j] = 0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2];
            sum += g[j];
          }
          grays.push(g);
          luma.push(sum / g.length);
        }
        const delta: number[] = [];
        for (let k = 1; k < grays.length; k++) {
          let s = 0;
          for (let j = 0; j < grays[k].length; j++) s += Math.abs(grays[k][j] - grays[k - 1][j]);
          delta.push(s / grays[k].length);
        }
        return { luma, delta };
      }, samples.map((b) => toUrl(b)));
    },
    close: () => page.close(),
  };
}

const ff = (args: string[]) => run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { maxBuffer: 1 << 26 });

export async function renderStrip(opts: { browser: Browser; htmlPath: string; outDir: string; lane: StripLane }): Promise<RenderResult> {
  const { browser, htmlPath, outDir, lane } = opts;
  const t0 = Date.now();
  const work = await makeWorkDir("strip-");
  const framesDir = path.join(work, "frames");
  await mkdir(framesDir, { recursive: true });
  await mkdir(outDir, { recursive: true });
  const fname = (i: number) => path.join(framesDir, `f${String(i).padStart(6, "0")}.png`);
  let page: Page | undefined;
  let cold: Page | undefined;
  try {
    // 1. Sequential capture, measuring text on the way past.
    page = await openStrip(browser, htmlPath, lane);
    const legibility: Awaited<ReturnType<typeof measureText>>[] = [];
    for (let i = 0; i < STRIP_FRAMES; i++) {
      await drawFrame(page, i);
      await writeFile(fname(i), await shot(page));
      if (LEGIBILITY_FRAMES.includes(i)) legibility.push(await measureText(page));
    }

    // 2. Seek gate: a fresh page, entered cold and out of order.
    cold = await openStrip(browser, htmlPath, lane);
    const lab = await imageLab(browser);
    const seekDiffs: number[] = [];
    for (const i of SEEK_FRAMES) {
      await drawFrame(cold, i);
      seekDiffs.push(await lab.diffFraction(await shot(cold), await readFile(fname(i))));
    }

    // 3. Motion gate: samples every half second.
    const sampleIdx = Array.from({ length: STRIP_FRAMES / 15 }, (_, k) => k * 15).concat(STRIP_FRAMES - 1);
    const mo = await lab.motion(await Promise.all(sampleIdx.map((i) => readFile(fname(i)))));
    await lab.close();

    // 4. Encode: master mp4, grid webm, poster, contact sheet.
    const { width } = STRIP_SIZE[lane];
    const mp4 = path.join(outDir, "strip.mp4");
    await withEncoderFallback("strips/render", async (enc) => {
      await ff(["-framerate", String(STRIP_FPS), "-i", path.join(framesDir, "f%06d.png"), ...videoArgs(enc), "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4]);
    });
    await ff([
      "-framerate", String(STRIP_FPS), "-i", path.join(framesDir, "f%06d.png"),
      "-vf", `scale=${Math.round(width / 2)}:-2`, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "36",
      "-row-mt", "1", "-deadline", "good", "-cpu-used", "4", "-an", path.join(outDir, "strip.webm"),
    ]);
    await ff(["-i", fname(120), "-vf", `scale=${Math.round(width / 2)}:-2`, "-q:v", "3", path.join(outDir, "poster.jpg")]);
    const cell = lane === "edu" ? "480:-2" : "270:-2";
    await ff([
      "-framerate", String(STRIP_FPS), "-i", path.join(framesDir, "f%06d.png"),
      "-vf", `select='not(mod(n\\,20))',scale=${cell},tile=4x3:padding=6:color=0x111111`,
      "-frames:v", "1", "-update", "1", path.join(outDir, "sheet.png"),
    ]);
    await copyFile(fname(0), path.join(outDir, "frame0.png")).catch(() => {});

    // 5. Gates, recorded.
    const maxSeek = Math.max(...seekDiffs);
    const minPx = Math.min(...legibility.map((l) => l.minPx));
    const smallest = legibility.find((l) => l.minPx === minPx);
    const outsideMax = Math.max(...legibility.map((l) => l.outside));
    const measured = legibility.reduce((s, l) => s + l.measured, 0);
    const canvases = legibility[0]?.canvases ?? 0;
    const activeSeconds = new Set(mo.delta.map((d, k) => (d > 0.6 ? Math.floor((sampleIdx[k + 1] - 1) / STRIP_FPS) : -1)).filter((s) => s >= 0)).size;
    const darkest = Math.min(...mo.luma);
    const gates: StripGates = {
      seek: {
        ok: maxSeek <= 0.0005,
        detail: `cold frames ${SEEK_FRAMES.join(",")}: max ${(maxSeek * 100).toFixed(3)}% pixels differ (bar 0.05%)`,
      },
      legibility:
        measured === 0
          ? { ok: canvases > 0, detail: canvases > 0 ? "text drawn on canvas, not measured" : "no visible text found" }
          : {
              ok: minPx >= FLOOR_AT_1080 - 1 && outsideMax === 0,
              detail: `smallest ${minPx.toFixed(0)}px at 1080w ("${smallest?.sample ?? ""}"), bar ${FLOOR_AT_1080}; ${outsideMax} text box(es) outside the safe box`,
            },
      motion: {
        ok: activeSeconds >= 3 && darkest > 2,
        detail: `motion in ${activeSeconds}/8 s (bar 3); darkest sample luma ${darkest.toFixed(1)}`,
      },
      length: { ok: true, detail: `${STRIP_FRAMES} frames at ${STRIP_FPS} fps` },
    };
    return { ok: true, gates, files: { mp4: "strip.mp4", webm: "strip.webm", poster: "poster.jpg", sheet: "sheet.png" }, renderMs: Date.now() - t0 };
  } catch (e) {
    return { ok: false, files: {}, renderMs: Date.now() - t0, error: e instanceof Error ? e.message : String(e) };
  } finally {
    await page?.close().catch(() => {});
    await cold?.close().catch(() => {});
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

/** Mean absolute grey difference between contact sheets, pairwise, at 160 px
 *  wide — the replica-discrimination instrument. Same-lane sheets share a size. */
export async function sheetDistances(browser: Browser, sheets: string[]): Promise<number[][]> {
  const page = await browser.newPage();
  try {
    await page.setContent("<!doctype html><body></body>");
    await page.evaluate(KEEP_NAMES_SHIM);
    const urls = await Promise.all(sheets.map(async (f) => `data:image/png;base64,${(await readFile(f)).toString("base64")}`));
    return await page.evaluate(async (us) => {
      const c = document.createElement("canvas");
      const x = c.getContext("2d", { willReadFrequently: true })!;
      const g: Float32Array[] = [];
      for (const u of us) {
        const im = await new Promise<HTMLImageElement>((res) => {
          const i = new Image();
          i.onload = () => res(i);
          i.src = u;
        });
        c.width = 160;
        c.height = Math.round((160 * im.naturalHeight) / im.naturalWidth);
        x.drawImage(im, 0, 0, c.width, c.height);
        const d = x.getImageData(0, 0, c.width, c.height).data;
        const a = new Float32Array(d.length / 4);
        for (let k = 0, j = 0; k < d.length; k += 4, j++) a[j] = 0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2];
        g.push(a);
      }
      return g.map((a) =>
        g.map((b) => {
          const n = Math.min(a.length, b.length);
          let s = 0;
          for (let j = 0; j < n; j++) s += Math.abs(a[j] - b[j]);
          return s / n;
        }),
      );
    }, urls);
  } finally {
    await page.close();
  }
}
