#!/usr/bin/env node
// A STRIP RUN TO DEVELOP THE /foundry STRIPS TAB AGAINST — no model, no
// browser capture, no Leonardo: ffmpeg's `testsrc2` stands in for the frames.
//
//   node tests/fixtures/strips/make-dev-fixture.mjs [--fresh] [--id <runId>]
//
// Writes foundry-out/strips/<runId>/ (default `dev-fixture`, gitignored) in the
// shape lib/foundry/strips/types.ts declares and pipeline/strips/run.mts
// writes: run.json plus one directory per card holding strip.html, style.json,
// strip.mp4, strip.webm, poster.jpg, sheet.png and meta.json.
//
// Six cards, one of each case the tab has to draw:
//   edu-edu-01--E01       edu, rendered, every gate passes
//   edu-edu-01--E02       edu, rendered, legibility gate FAILED, 2 fix rounds, a Leonardo asset
//   edu-edu-01--ctrl      edu, the brief's positive control (approach CTRL)
//   stat-stat-01--S01     stat, rendered, a chart seat
//   stat-stat-01--S01--r2 stat, a replica of S01
//   stat-stat-01--S07     stat, render-failed — no media, an error
//
// Media are small (edu 320×180, stat 180×320) but the full 8 s × 30 fps = 240
// frames, so the scrubber, the sheet and Range requests are exercised for real.
// Without --fresh a verdicts.json with one decided card is written too, so a
// revealed card and a blind one are both on screen.
//
// The strip.html is trivial and honours the contract's `strip-frame` message
// (pipeline/strips/CONTRACT.md), so the lightbox's live scrubber can be seen
// working. It lives here, not in pipeline/strips/, which another lane owns.

import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const fresh = args.includes("--fresh");
const idAt = args.indexOf("--id");
const RUN_ID = idAt >= 0 ? args[idAt + 1] : "dev-fixture";
if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/.test(RUN_ID)) throw new Error(`not a run id: ${RUN_ID}`);

const ROOT = path.join(process.cwd(), "foundry-out", "strips", RUN_ID);
const FPS = 30;
const FRAMES = 240;
const SIZE = { edu: [320, 180], stat: [180, 320] };

function ffmpeg(argv) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...argv], { stdio: ["ignore", "inherit", "inherit"] });
  if (r.status !== 0) throw new Error(`ffmpeg failed (${r.status}): ffmpeg ${argv.join(" ")}`);
}

function page(lane, label, hue) {
  const [w, h] = SIZE[lane];
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;background:hsl(${hue} 40% 12%);font-family:sans-serif}
#dot{position:absolute;width:${Math.round(w / 8)}px;height:${Math.round(w / 8)}px;border-radius:50%;background:hsl(${hue} 90% 60%)}
#f{position:absolute;left:8px;top:8px;color:#fff;font-size:${Math.round(h / 9)}px}
</style></head><body><div id="dot"></div><div id="f"></div><script>
window.STRIP = { width: ${w}, height: ${h}, fps: ${FPS}, frames: ${FRAMES} };
window.renderFrameAt = function (i) {
  var t = i / (${FRAMES} - 1);
  var d = document.getElementById("dot");
  d.style.left = (t * (${w} - d.offsetWidth)) + "px";
  d.style.top = ((Math.sin(t * Math.PI * 2) * 0.35 + 0.5) * (${h} - d.offsetHeight)) + "px";
  document.getElementById("f").textContent = ${JSON.stringify(label)} + " f" + i;
};
window.addEventListener("message", function (e) {
  if (e.data && e.data.type === "strip-frame" && typeof e.data.i === "number") window.renderFrameAt(e.data.i);
});
window.renderFrameAt(0);
</script></body></html>
`;
}

const style = (name, hue) => ({
  name,
  palette: [
    { role: "ground", hex: "#141c26" },
    { role: "accent", hex: `#${((hue * 4567) & 0xffffff).toString(16).padStart(6, "0")}` },
  ],
  type: [{ family: "sans-serif", role: "label", weight: 600 }],
  motion: { easing: "linear", cues: ["traverse"], tempo: "one pass in 8 s" },
  primitives: ["circle"],
  textures: [],
});

const ok = (detail) => ({ ok: true, detail });
const gatesAllOk = () => ({
  seek: ok("frames 180, 0, 120 cold equal sequential (0 px differ)"),
  legibility: ok("smallest text 40 px at 1080 wide (bar 26); inside safe box"),
  motion: ok("motion in 8 of 8 s; no black frames"),
  length: ok("240 frames (bar 240)"),
});

const approaches = [
  { id: "E01", lane: "edu", case: "edu-01", name: "Ink diagram", medium: "svg", grammar: "draw-on", density: "low", leonardo: "none", direction: "Cream ground, one ink line, the loop drawn as it is explained.", falsifier: "Reads as a textbook figure with no motion idea." },
  { id: "E02", lane: "edu", case: "edu-01", name: "Particle heat", medium: "canvas", grammar: "particle", density: "high", leonardo: "texture", leonardoPrompt: "warm grain paper texture, no text", direction: "Heat as particles crossing a membrane, grain texture under it.", falsifier: "Too busy to read the one beat." },
  { id: "S01", lane: "stat", case: "stat-01", name: "Stepped bars", medium: "dom", grammar: "stepped", density: "mid", seat: "chart", leonardo: "none", direction: "Tall bars stepping in, one figure per beat, the source line low.", falsifier: "Generic template chart." },
  { id: "S07", lane: "stat", case: "stat-01", name: "Globe camera", medium: "webgl", grammar: "camera", density: "mid", seat: "concept", leonardo: "none", vendored: ["three"], direction: "A slow camera across a globe landing on the figure.", falsifier: "WebGL fails headless." },
];

const base = { effort: "medium", rounds: 0, authorMs: 84000, renderMs: 21000 };
const MEDIA = { html: "strip.html", style: "style.json", mp4: "strip.mp4", webm: "strip.webm", poster: "poster.jpg", sheet: "sheet.png" };
const cards = [
  { ...base, id: "edu-edu-01--E01", lane: "edu", case: "edu-01", approach: "E01", status: "rendered", gates: gatesAllOk(), files: { ...MEDIA }, costUsd: 0.41 },
  {
    ...base,
    id: "edu-edu-01--E02",
    lane: "edu",
    case: "edu-01",
    approach: "E02",
    status: "rendered",
    rounds: 2,
    gates: { ...gatesAllOk(), legibility: { ok: false, detail: "smallest text 18 px at 1080 wide (bar 26)" } },
    asset: { file: "asset.png", provider: "leonardo", costUsd: 0.02 },
    files: { ...MEDIA },
    costUsd: 0.88,
  },
  { ...base, id: "edu-edu-01--ctrl", lane: "edu", case: "edu-01", approach: "CTRL", status: "rendered", gates: gatesAllOk(), files: { ...MEDIA } },
  { ...base, id: "stat-stat-01--S01", lane: "stat", case: "stat-01", approach: "S01", status: "rendered", gates: gatesAllOk(), files: { ...MEDIA }, costUsd: 0.37 },
  { ...base, id: "stat-stat-01--S01--r2", lane: "stat", case: "stat-01", approach: "S01", replicaOf: "stat-stat-01--S01", status: "rendered", gates: gatesAllOk(), files: { ...MEDIA }, costUsd: 0.39 },
  {
    ...base,
    id: "stat-stat-01--S07",
    lane: "stat",
    case: "stat-01",
    approach: "S07",
    status: "render-failed",
    rounds: 1,
    renderMs: 3000,
    files: { html: "strip.html", style: "style.json" },
    error: "page threw during renderFrameAt(0): WebGL context could not be created (headless, no GPU)",
  },
];

rmSync(ROOT, { recursive: true, force: true });
mkdirSync(ROOT, { recursive: true });

const HUE = { "edu-edu-01--E01": 200, "edu-edu-01--E02": 20, "edu-edu-01--ctrl": 280, "stat-stat-01--S01": 140, "stat-stat-01--S01--r2": 150, "stat-stat-01--S07": 330 };
for (const c of cards) {
  const dir = path.join(ROOT, c.id);
  mkdirSync(dir, { recursive: true });
  const hue = HUE[c.id];
  writeFileSync(path.join(dir, "strip.html"), page(c.lane, c.approach, hue));
  writeFileSync(path.join(dir, "style.json"), JSON.stringify(style(`${c.approach} fixture`, hue), null, 2));
  writeFileSync(path.join(dir, "meta.json"), JSON.stringify(c, null, 2));
  if (c.status !== "rendered") continue;
  const [w, h] = SIZE[c.lane];
  const src = ["-f", "lavfi", "-i", `testsrc2=size=${w}x${h}:rate=${FPS}:duration=${FRAMES / FPS},hue=h=${hue}`];
  ffmpeg([...src, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", path.join(dir, "strip.mp4")]);
  ffmpeg([...src, "-c:v", "libvpx", "-b:v", "300k", "-deadline", "realtime", "-cpu-used", "8", path.join(dir, "strip.webm")]);
  ffmpeg(["-i", path.join(dir, "strip.mp4"), "-vf", "select=eq(n\\,120)", "-frames:v", "1", path.join(dir, "poster.jpg")]);
  ffmpeg(["-i", path.join(dir, "strip.mp4"), "-vf", `select=not(mod(n\\,${FRAMES / 12})),scale=${Math.round(w / 2)}:-2,tile=4x3`, "-frames:v", "1", path.join(dir, "sheet.png")]);
}

const run = {
  version: 1,
  id: RUN_ID,
  at: new Date().toISOString(),
  width: { edu: SIZE.edu[0], stat: SIZE.stat[0] },
  height: { edu: SIZE.edu[1], stat: SIZE.stat[1] },
  fps: FPS,
  frames: FRAMES,
  approaches,
  cards,
  discrimination: { S01: 1.72 },
  status: "awaiting-triage",
};
writeFileSync(path.join(ROOT, "run.json"), JSON.stringify(run, null, 2));
if (!fresh) {
  writeFileSync(
    path.join(ROOT, "verdicts.json"),
    JSON.stringify({ "stat-stat-01--S01": { verdict: "keep", at: new Date().toISOString(), chips: ["concept", "craft"], note: "the steps land on the beat" } }, null, 2),
  );
}
console.log(`[strips fixture] ${ROOT} — ${cards.length} cards`);
