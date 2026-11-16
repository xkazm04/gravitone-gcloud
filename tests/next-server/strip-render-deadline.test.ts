import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LIVE_REEL_ENGINES } from "../../lib/producers/scoutReel.ts";
import { renderMotion, reelVideoOf, withMotion } from "../../lib/producers/scoutReelMotion.ts";
import { BUDGET, bounded, ffmpegTo } from "../../pipeline/strips/deadline.mts";
import { launchHeadless, renderFrame, renderStrip } from "../../pipeline/strips/render.mts";

// A STRIP PAGE THAT NEVER YIELDS (spark scout-producers, reel-render-cannot-hang). Real Chromium and a real
// ffmpeg, no mock: a page whose renderFrameAt spins in a synchronous loop blocks its own timers, so the in-page
// race of drawFrame cannot fire, and only a deadline held by this process can end the render. Killing the
// browser from outside must end the hung evaluate, and the renderer's thrown sentence is what the reel records.

const dir = mkdtempSync(path.join(tmpdir(), "gt-strip-deadline-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const stripPage = (name: string, body: string): string => {
  const file = path.join(dir, `${name}.html`);
  writeFileSync(file, `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#111"><script>
window.STRIP = { width: 1080, height: 1920, frames: 240 };
window.STRIP_READY = true;
window.renderFrameAt = function (i) { ${body} };
</script>`);
  return file;
};

beforeAll(() => {
  // Every deadline at a twentieth: the frame's 25 s is 1.25 s, the page open's 75 s is 3.75 s.
  process.env["STRIP_DEADLINE_SCALE"] = "0.05";
});
afterAll(() => {
  delete process.env["STRIP_DEADLINE_SCALE"];
});

describe("terminate from outside: a page stuck in a synchronous loop", () => {
  it("bounded ends a hung evaluate by killing the browser, inside its deadline and with the sentence a reader needs", async () => {
    const browser = await launchHeadless();
    try {
      const page = await browser.newPage();
      const t0 = Date.now();
      const hung = page.evaluate(() => { for (;;) { /* never yields */ } });
      const ended = hung.then(() => "returned", (e: unknown) => String(e));
      await expect(bounded(browser, 1_500, "the planted loop", () => hung)).rejects.toThrow("the planted loop did not finish within 2 s: the page never yielded, so the browser was killed");
      expect(Date.now() - t0).toBeLessThan(15_000);
      // The work itself ended, not only the wait for it: the evaluate settles because its browser is gone.
      const verdict = await Promise.race([ended, new Promise<string>((r) => setTimeout(() => r("still hung"), 10_000))]);
      expect(verdict).not.toBe("still hung");
      expect(verdict).not.toBe("returned");
      await expect.poll(() => browser.isConnected(), { timeout: 10_000 }).toBe(false);
      // The caller's finally closes a dead browser: it must resolve, not throw over the sentence.
      await expect(browser.close()).resolves.toBeUndefined();
    } finally {
      await browser.close().catch(() => {});
    }
  }, 60_000);

  it("a frame that spins forever is renderFrame's thrown sentence, not a hang", async () => {
    const html = stripPage("spin-frame", "for (;;) {}");
    const browser = await launchHeadless();
    try {
      const t0 = Date.now();
      await expect(renderFrame({ browser, htmlPath: html, lane: "stat", i: 120 })).rejects.toThrow(/renderFrameAt\(120\) did not finish within \d+ s: the page never yielded, so the browser was killed/);
      expect(Date.now() - t0).toBeLessThan(20_000);
    } finally {
      await browser.close().catch(() => {});
    }
  }, 60_000);

  it("renderStrip returns ok:false with that sentence and writes no mp4, webm, poster or sheet; the caller's close still resolves", async () => {
    const html = stripPage("spin-strip", "if (i === 5) { for (;;) {} } document.body.style.background = 'rgb(' + (i % 255) + ',40,40)';");
    const out = path.join(dir, "out-spin");
    const browser = await launchHeadless();
    try {
      const r = await renderStrip({ browser, htmlPath: html, outDir: out, lane: "stat" });
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/^renderFrameAt\(5\) did not finish within \d+ s: the page never yielded, so the browser was killed$/);
      expect(r.files).toEqual({});
      expect(readdirSync(out).filter((f) => /\.(mp4|webm|jpg|png)$/.test(f))).toEqual([]);
      await expect(browser.close()).resolves.toBeUndefined();
    } finally {
      await browser.close().catch(() => {});
    }
  }, 90_000);

  it("scoutReelActs' path: the live render throws that sentence, renderMotion records it as videoError, the still stands and no strip.mp4 sits beside the strip", async () => {
    const storeDir = mkdtempSync(path.join(dir, "nights-"));
    const prior = process.env["SCOUT_STORE_DIR"];
    process.env["SCOUT_STORE_DIR"] = storeDir;
    try {
      const night = "2026-11-08";
      const rel = "reels/c-01/strip.html";
      const abs = path.join(storeDir, night, rel);
      mkdirSync(path.dirname(abs), { recursive: true });
      copyFileSync(stripPage("spin-reel", "for (;;) {}"), abs);
      const render = LIVE_REEL_ENGINES.render;
      if (render === undefined) throw new Error("the live engines carry no render");
      const m = await renderMotion(render, "stat", night, rel);
      expect(m).toEqual({ videoError: expect.stringMatching(/^renderFrameAt\(0\) did not finish within \d+ s: the page never yielded, so the browser was killed$/) });
      // The backfill takes an mp4 beside the strip as rendered: none can be there after a killed render.
      expect(existsSync(path.join(storeDir, night, reelVideoOf(rel)))).toBe(false);
      const reel = { id: "c-01", kind: "reel", status: "rendered", files: { strip: rel, tile: "reels/c-01.png" } };
      expect(withMotion(reel, m)).toMatchObject({ files: { tile: "reels/c-01.png" }, videoError: expect.stringContaining("renderFrameAt(0)") });
      expect(withMotion(reel, m)).not.toHaveProperty("video");
    } finally {
      if (prior === undefined) delete process.env["SCOUT_STORE_DIR"];
      else process.env["SCOUT_STORE_DIR"] = prior;
    }
  }, 90_000);

  it("a page whose top-level script never returns is bounded at the open, not waited on", async () => {
    const file = path.join(dir, "spin-load.html");
    writeFileSync(file, `<!doctype html><script>window.STRIP = { width: 1080, height: 1920 }; for (;;) {}</script>`);
    const browser = await launchHeadless();
    try {
      await expect(renderFrame({ browser, htmlPath: file, lane: "stat", i: 0 })).rejects.toThrow(/(opening the strip page|Timeout) /);
    } finally {
      await browser.close().catch(() => {});
    }
  }, 90_000);

  it("the deadlines leave room: 240 frames get 13 min to capture against the 216 s measured, and a 2 minute film more still", () => {
    delete process.env["STRIP_DEADLINE_SCALE"];
    try {
      expect(BUDGET.capture(240)).toBe(780_000);
      expect(BUDGET.capture(240)).toBeGreaterThan(3 * 216_000);
      expect(BUDGET.capture(3600)).toBeGreaterThan(BUDGET.capture(240) * 10);
      expect(BUDGET.mp4(240)).toBeGreaterThan(300_000);
    } finally {
      process.env["STRIP_DEADLINE_SCALE"] = "0.05";
    }
  });
});

describe("an ffmpeg that is killed or fails leaves nothing at the final name", () => {
  const final = (n: string): string => path.join(dir, n);

  it("a hung encode is killed at its deadline: no file at the name, none left behind", async () => {
    const t0 = Date.now();
    await expect(ffmpegTo(["-f", "lavfi", "-i", "testsrc=size=640x360:rate=30", "-c:v", "libx264"], final("hung.mp4"), 1_500)).rejects.toThrow("ffmpeg writing hung.mp4 did not finish within 2 s and was killed");
    expect(Date.now() - t0).toBeLessThan(15_000);
    expect(existsSync(final("hung.mp4"))).toBe(false);
    expect(existsSync(final("hung.partial.mp4"))).toBe(false);
  }, 30_000);

  it("a failed encode leaves nothing, and its own error is thrown", async () => {
    await expect(ffmpegTo(["-i", path.join(dir, "no-such-input.png")], final("bad.mp4"), 20_000)).rejects.toThrow();
    expect(existsSync(final("bad.mp4"))).toBe(false);
    expect(readdirSync(dir).filter((f) => f.startsWith("bad"))).toEqual([]);
  }, 30_000);

  it("a finished encode lands by rename, replacing an earlier file whole", async () => {
    writeFileSync(final("ok.mp4"), "an earlier, different file");
    await ffmpegTo(["-f", "lavfi", "-i", "testsrc=size=320x180:rate=30:duration=1", "-c:v", "libx264", "-pix_fmt", "yuv420p"], final("ok.mp4"), 60_000);
    expect(existsSync(final("ok.partial.mp4"))).toBe(false);
    expect(readdirSync(dir).filter((f) => f.startsWith("ok"))).toEqual(["ok.mp4"]);
    const { size } = await import("node:fs").then((m) => m.statSync(final("ok.mp4")));
    expect(size).toBeGreaterThan(1_000);
  }, 90_000);
});
