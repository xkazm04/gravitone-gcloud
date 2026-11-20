// A SPAN OF A REEL - `count` frames from `from`, captured and encoded, with the middle one kept as a still.
// The full render (strips/render.mts `renderStrip`) is the only thing that runs the gates and makes a cut;
// this is the look at the middle of a video before anyone spends a full render on it. No gate, no stage.

import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Browser } from "playwright";

import { makeWorkDir, videoArgs, withEncoderFallback } from "../../lib/export/headless";
import { STRIP_FPS, type StripLane } from "../../lib/foundry/strips/types";
import { BUDGET, ffmpegTo } from "../strips/deadline.mts";
import { drawFrame, openStrip, shot } from "../strips/render.mts";

export interface SpanResult {
  readonly video: string;
  readonly still: string;
  readonly from: number;
  readonly count: number;
  readonly renderMs: number;
}

export async function renderSpan(opts: { browser: Browser; htmlPath: string; lane: StripLane; from: number; count: number; outDir: string }): Promise<SpanResult> {
  const { browser, htmlPath, lane, from, count, outDir } = opts;
  const t0 = Date.now();
  const work = await makeWorkDir("reel-span-");
  await mkdir(outDir, { recursive: true });
  const name = (k: number): string => path.join(work, `f${String(k).padStart(6, "0")}.png`);
  const still = path.join(outDir, "still.png");
  const video = path.join(outDir, "shot.mp4");
  const page = await openStrip(browser, htmlPath, lane);
  try {
    for (let k = 0; k < count; k++) {
      await drawFrame(page, from + k);
      const png = await shot(page);
      await writeFile(name(k), png);
      if (k === count >> 1) await writeFile(still, png);
    }
    await withEncoderFallback("reel/span", async (enc) => {
      await ffmpegTo(["-framerate", String(STRIP_FPS), "-i", path.join(work, "f%06d.png"), ...videoArgs(enc), "-pix_fmt", "yuv420p", "-movflags", "+faststart"], video, BUDGET.mp4(count));
    });
    return { video, still, from, count, renderMs: Date.now() - t0 };
  } finally {
    await page.close().catch(() => {});
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}
