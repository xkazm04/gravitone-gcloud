// THE REEL'S BROWSER - the GPU first, the CPU when there is none.
//
// The strips harness runs Chromium with the GPU off (render.mts `launchHeadless`: byte-identical frames were
// measured that way), so a WebGL canvas renders black and a three.js form is impossible. A reel asks for the
// GPU instead: `--use-angle=d3d11 --enable-gpu --ignore-gpu-blocklist` gives headless Chromium this box's card
// (measured 2026-10-30, lib/music-clip/gpuShot.ts), and the two raster flags that made frames reproducible
// stay on. The renderer string is READ BACK, never assumed: a launch that fell to SwiftShader is closed and
// replaced by the CPU launch, and the caller is told which one drew the frames.
//
// What the GPU does not promise is the strips' byte-identical guarantee, so nothing here loosens a gate: the
// seek check in `proof` and the seek gate in `cut` measure the page on the browser that actually drew it.

import { chromium, type Browser } from "playwright";

import { launchHeadless } from "../strips/render.mts";

export const GPU_ARGS = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--disable-partial-raster", "--disable-lcd-text"];

export interface ReelBrowser {
  readonly browser: Browser;
  /** The WebGL renderer string the browser reported, or why there is none. */
  readonly renderer: string;
  readonly gpu: boolean;
}

async function rendererOf(browser: Browser): Promise<string> {
  const page = await browser.newPage();
  try {
    await page.setContent("<!doctype html><canvas></canvas>");
    return await page.evaluate(() => {
      const g = document.querySelector("canvas")?.getContext("webgl2") ?? null;
      const d = g?.getExtension("WEBGL_debug_renderer_info");
      return g && d ? String(g.getParameter(d.UNMASKED_RENDERER_WEBGL)) : "no webgl2";
    });
  } finally {
    await page.close();
  }
}

const SOFTWARE = /swiftshader|llvmpipe|software|no webgl2/i;

/** The browser a reel is drawn on. `cpu` forces the strips' launch; otherwise the GPU, checked. */
export async function launchReelBrowser(prefer: "gpu" | "cpu"): Promise<ReelBrowser> {
  if (prefer === "gpu") {
    const browser = await chromium.launch({ headless: true, args: GPU_ARGS }).catch(() => undefined);
    if (browser !== undefined) {
      const renderer = await rendererOf(browser).catch(() => "no webgl2");
      if (!SOFTWARE.test(renderer)) return { browser, renderer, gpu: true };
      await browser.close().catch(() => {});
    }
  }
  return { browser: await launchHeadless(), renderer: "cpu (GPU off: WebGL draws black)", gpu: false };
}
