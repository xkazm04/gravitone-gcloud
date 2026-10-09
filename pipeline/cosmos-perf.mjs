#!/usr/bin/env node
// THE LANDING'S PERFORMANCE INSTRUMENT — what "works flawlessly on a CPU machine
// and beautifully on a GPU" means, as numbers somebody can re-run.
//
// The owner's bar for the Paper Cosmos landing (spark landing-galaxy,
// 2026-10-07) was two-sided: no lag on CPU-dominant machines, full beauty on
// GPUs. A bar like that is argued forever unless it is measured, so this file
// drives the real page in real Chromium under two machine profiles and prints
// the same table every time:
//
//   cpu   — `--disable-gpu --disable-gpu-compositing` (software raster AND
//           software compositing: what a GPU-less VM, a remote desktop or a
//           blocklisted driver gets), plus an optional CDP CPU throttle.
//   gpu   — hardware ANGLE (d3d11 on Windows), the owner's own machine.
//
// Per profile it reports: the tier the page chose (`data-tier` on the root),
// boot (navigation → the root's `data-ready`), the longest main-thread task
// and total blocking time during boot, and frame-time p50/p95/max plus the
// share of frames over 33 ms while it (a) sweeps the pointer for parallax,
// (b) opens a project type and (c) steps back — the three moments a stranger
// feels lag. Long tasks come from PerformanceObserver('longtask'); frame times
// from a rAF sampler injected before the page's own scripts.
//
// Usage (a server must already be running; the instrument never starts one):
//   node pipeline/cosmos-perf.mjs --base http://localhost:3141 [--profiles cpu,gpu]
//        [--throttle 4] [--galaxy tests/fixtures/galaxy-projected.json] [--tier full|lite|still]
//        [--width 1920 --height 1080] [--json out.json]
//
// Measure a PRODUCTION build (`next build && next start`): a dev server's
// React and HMR overhead lands in every number and on the CPU profile it is
// most of them.

import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d;
};
const base = arg("base", "http://localhost:3141");
const profiles = arg("profiles", "cpu,gpu").split(",");
const throttle = Number(arg("throttle", "1"));
const galaxyPath = arg("galaxy", "");
const forcedTier = arg("tier", "");
const W = Number(arg("width", "1920"));
const H = Number(arg("height", "1080"));
const jsonOut = arg("json", "");

const PROFILE_ARGS = {
  cpu: ["--disable-gpu", "--disable-gpu-compositing"],
  gpu: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"],
};

// Injected before any page script: a rAF frame sampler that runs for the whole
// visit, and a long-task observer. Segments are marked from the driver.
const SAMPLER = () => {
  const w = window;
  w.__perf = { frames: [], marks: [], longtasks: [] };
  let last = 0;
  const tick = (t) => {
    if (last) w.__perf.frames.push([t, t - last]);
    last = t;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) w.__perf.longtasks.push([e.startTime, e.duration]);
    }).observe({ type: "longtask", buffered: true });
  } catch {
    // no longtask support (non-Chromium): boot rows read 0, frames still sampled
  }
  w.__mark = (name) => w.__perf.marks.push([name, performance.now()]);
};

const pct = (a, p) => (a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] : NaN);
const f1 = (n) => (Number.isFinite(n) ? n.toFixed(1) : "—");

async function run(profile) {
  const browser = await chromium.launch({ args: PROFILE_ARGS[profile] ?? [] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  const page = await ctx.newPage();
  await page.addInitScript(SAMPLER);
  if (galaxyPath) {
    const g = JSON.parse(readFileSync(galaxyPath, "utf8"));
    await page.addInitScript((data) => { window.__PC_GALAXY__ = data; }, g);
  }
  const cdp = await ctx.newCDPSession(page);
  if (throttle > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  const url = base + "/" + (forcedTier ? `?tier=${forcedTier}` : "");
  await page.goto(url, { waitUntil: "load", timeout: 120_000 });
  await page.waitForSelector(".pc[data-ready]", { timeout: 120_000 });
  const boot = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    return { ready: performance.now(), domContentLoaded: nav ? nav.domContentLoadedEventEnd : NaN };
  });
  const tier = await page.getAttribute(".pc", "data-tier");
  // Let the intro finish and the page settle before the interaction segments.
  await page.waitForTimeout(4500);

  // (a) parallax sweep: 3 s of pointer motion across the stage.
  await page.evaluate(() => window.__mark("parallax:start"));
  for (let i = 0; i <= 90; i++) {
    const t = i / 90;
    await page.mouse.move(W * (0.15 + 0.7 * t), H * (0.3 + 0.25 * Math.sin(t * Math.PI * 2)));
    await page.waitForTimeout(33);
  }
  await page.evaluate(() => window.__mark("parallax:end"));
  await page.mouse.move(W - 4, H / 2);
  await page.waitForTimeout(600);

  // (b) open the first project type through its accessible button (dispatched
  // click: the medallions bob, and a pointer click waits for "stable").
  await page.evaluate(() => window.__mark("open:start"));
  await page.evaluate(() => { document.querySelector(".pc .med")?.click(); });
  await page.waitForTimeout(2600);
  await page.evaluate(() => window.__mark("open:end"));

  // (c) step back to the overview.
  await page.evaluate(() => window.__mark("back:start"));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.__mark("back:end"));

  const perf = await page.evaluate(() => window.__perf);
  const metrics = await cdp.send("Performance.enable").then(() => cdp.send("Performance.getMetrics"));
  await browser.close();

  const mark = (n) => perf.marks.find((m) => m[0] === n)?.[1];
  const seg = (name) => {
    const a = mark(`${name}:start`), b = mark(`${name}:end`);
    const ft = perf.frames.filter(([t]) => t >= a && t <= b).map(([, d]) => d);
    return { p50: pct(ft, 0.5), p95: pct(ft, 0.95), max: Math.max(...ft), jank: ft.length ? ft.filter((d) => d > 33.4).length / ft.length : NaN, n: ft.length };
  };
  const bootLT = perf.longtasks.filter(([s]) => s <= boot.ready + 4500);
  const heap = metrics.metrics.find((m) => m.name === "JSHeapUsedSize")?.value;
  return {
    profile, throttle, tier, errors,
    bootMs: boot.ready,
    bootLongestTask: bootLT.length ? Math.max(...bootLT.map(([, d]) => d)) : 0,
    bootTBT: bootLT.reduce((s, [, d]) => s + Math.max(0, d - 50), 0),
    parallax: seg("parallax"), open: seg("open"), back: seg("back"),
    heapMB: heap ? heap / 1048576 : NaN,
  };
}

const results = [];
for (const p of profiles) results.push(await run(p));

console.log(`cosmos-perf  ${base}  ${W}x${H}  throttle x${throttle}  galaxy=${galaxyPath || "registry"}${forcedTier ? "  forced tier=" + forcedTier : ""}`);
console.log("profile tier   boot  longest  TBT   | parallax p50/p95/max jank% | open p50/p95/max jank% | back p50/p95/max jank% | heapMB errors");
for (const r of results) {
  const s = (x) => `${f1(x.p50)}/${f1(x.p95)}/${f1(x.max)} ${f1(x.jank * 100)}%`;
  console.log(`${r.profile.padEnd(7)} ${String(r.tier).padEnd(6)} ${f1(r.bootMs).padStart(6)} ${f1(r.bootLongestTask).padStart(7)} ${f1(r.bootTBT).padStart(6)} | ${s(r.parallax)} | ${s(r.open)} | ${s(r.back)} | ${f1(r.heapMB)} ${r.errors.length}`);
  for (const e of r.errors) console.log("   pageerror: " + e.slice(0, 200));
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(results, null, 1));
