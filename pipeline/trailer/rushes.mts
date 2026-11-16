// Rushes of a /trailer-clip: every concept in the plan as one whole-clip cut with its native sound, a sheet per concept and
// one verdict page, for the side-by-side stage before a pick or a fusion.
//
//   npx tsx pipeline/trailer/rushes.mts <folder> [--only concept,concept]
//
// Output in <folder>/music-clip/rushes/: <concept>.mp4, <concept>.json (its edit), <concept>.png, verdict.html, verdict.png.
//
// No trims, no gain and native pixels, so a seam or a level swing reads as H3 made it. Each clip plays exactly its video
// frames: its AAC runs about 50 ms past the picture (163 frames at 32 kHz against 124 at 24 fps), and cut.mts takes a clip's
// length from the container, so without an `out` every seam would gain one cloned frame.
//
// A jump is the largest frame-to-frame scene score in a clip. At 0.3 or above it may be a cut H3 drew inside the shot or an
// end frame arriving in a snap (registry: generated-shot-sourcing). A blast's flash scores high too, so it is a place to
// look, not a finding.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { Concepts } from "./board.mts";
import type { Keys, Frame } from "./keys.mts";

const FRAMES = 124, FPS = 24, W = 1280, H = 704, TIMES = [0.1, 2.6, 5.0], JUMP = 0.3;
const argv = process.argv.slice(2);
const onlyAt = argv.indexOf("--only");
const only = onlyAt >= 0 ? argv.splice(onlyAt, 2)[1].split(",") : undefined;
const folder = argv[0];
if (!folder) { console.error('usage: rushes.mts "<folder>" [--only concept,concept]'); process.exit(2); }

const clip = path.join(path.resolve(folder), "music-clip");
const out = path.join(clip, "rushes"), framesDir = path.join(out, "frames");
fs.mkdirSync(framesDir, { recursive: true });
const read = <T,>(f: string) => JSON.parse(fs.readFileSync(path.join(clip, f), "utf8")) as T;
const concepts = read<Concepts>("concepts.json").concepts;
const keys = read<Keys>("keyframes.json");
const planned = new Set(read<{ id: string }[]>("clips-plan.json").map((s) => s.id));
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const ff = (...a: string[]) => spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-y", ...a], { encoding: "utf8", maxBuffer: 1 << 28 });

type Shot = Frame & { mean: number; peak: number; jump: number; jumpAt: number };

function measure(f: Frame): Shot {
  const mp4 = path.join(clip, "clips", `${f.id}.mp4`);
  TIMES.forEach((t, i) => ff("-ss", String(t), "-i", mp4, "-frames:v", "1", "-vf", "scale=640:-2", "-q:v", "3", "-update", "1", path.join(framesDir, `${f.id}-${i}.jpg`)));
  ff("-i", mp4, "-filter_complex", "aformat=channel_layouts=mono,showwavespic=s=1152x56:colors=#d8b36a:scale=lin:filter=peak", "-frames:v", "1", "-update", "1", path.join(framesDir, `${f.id}-wave.png`));
  const level = ff("-i", mp4, "-map", "0:a:0", "-af", "volumedetect", "-f", "null", "-").stderr;
  const scored = ff("-i", mp4, "-an", "-vf", "select='gte(scene,0)',metadata=print:file=-", "-f", "null", "-").stdout;
  let jump = 0, jumpAt = 0, at = 0;
  for (const line of scored.split(/\r?\n/)) {
    const t = line.match(/pts_time:([\d.]+)/);
    if (t) at = Number(t[1]);
    const s = line.match(/lavfi\.scene_score=([\d.]+)/);
    if (s && Number(s[1]) > jump) { jump = Number(s[1]); jumpAt = at; }
  }
  return { ...f, mean: Number(level.match(/mean_volume: (-?[\d.]+)/)?.[1] ?? NaN), peak: Number(level.match(/max_volume: (-?[\d.]+)/)?.[1] ?? NaN), jump, jumpAt };
}

function cut(id: string, shots: Frame[]) {
  const scenes = shots.map((f) => ({ id: f.id, in: 0, out: Number((FRAMES / FPS).toFixed(4)) }));
  fs.writeFileSync(path.join(out, `${id}.json`), JSON.stringify({ scenes }, null, 2));
  const cutter = path.join(import.meta.dirname, "cut.mts");
  const r = spawnSync(process.execPath, [...process.execArgv, cutter,path.resolve(folder), path.join(out, `${id}.mp4`), "--edit", `rushes/${id}.json`, "--size", `${W}x${H}`], { stdio: "inherit" });
  if (r.status !== 0) { console.error(`${id}: the cut failed`); process.exit(1); }
  const n = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v", "-count_frames", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", path.join(out, `${id}.mp4`)], { encoding: "utf8" }).stdout.trim();
  if (Number(n) !== shots.length * FRAMES) { console.error(`${id}: ${n} frames, ${shots.length * FRAMES} planned`); process.exit(1); }
}

const CSS = `body{margin:0;padding:20px;background:#0e0f11;color:#e8e4da;font:14px/1.35 system-ui,sans-serif}h1{margin:0 0 4px;font-size:24px}h2{margin:22px 0 4px;font-size:20px}p{margin:0 0 6px;color:#bdbbb1;max-width:1500px}
img{display:block;width:100%;background:#000}.mono{font:12px/1.4 ui-monospace,Consolas,monospace;color:#bdbbb1}b{color:#e8e4da}.flag{color:#f0a35e}`;
const dB = (n: number) => n.toFixed(1);
const jumpText = (s: Shot) => s.jump >= JUMP ? `<span class="flag">jump ${s.jump.toFixed(2)} at ${s.jumpAt.toFixed(1)} s</span>` : `largest step ${s.jump.toFixed(2)}`;

function sheet(c: Concepts["concepts"][number], shots: Shot[]): string {
  const head = ["start key", ...TIMES.map((t) => `${t.toFixed(1)} s`), "end key"].map((h) => `<div class="mono">${h}</div>`).join("");
  const rows = shots.map((s) => `<div class="label mono"><b>${esc(s.id)}</b> ${esc(s.beat)} &middot; mean ${dB(s.mean)} dB &middot; peak ${dB(s.peak)} dB &middot; ${jumpText(s)}</div>
<img src="../keyframes/${esc(s.id)}.jpg" alt="${esc(s.scene)}">${TIMES.map((_, i) => `<img src="frames/${esc(s.id)}-${i}.jpg" alt="${esc(s.id)} at ${TIMES[i]} s">`).join("")}${s.end ? `<img src="../keyframes/${esc(s.end)}.jpg" alt="${esc(s.end)}">` : "<div></div>"}
<div></div><img class="wave" src="frames/${esc(s.id)}-wave.png" alt="${esc(s.id)} waveform"><div></div>`).join("\n");
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>${esc(c.name)}</title><style>${CSS}
.grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:3px 4px}.label{grid-column:1/-1;margin-top:8px}.wave{grid-column:2/5;height:44px}</style>
<h1>${esc(c.name)}</h1><p>${esc(c.logline)}</p><div class="grid">${head}${rows}</div></html>`;
}

function verdict(all: { c: Concepts["concepts"][number]; shots: Shot[] }[]): string {
  const blocks = all.map(({ c, shots }) => {
    const means = shots.map((s) => s.mean), jumps = shots.filter((s) => s.jump >= JUMP);
    const strip = shots.map((s) => `<figure><img src="frames/${esc(s.id)}-1.jpg" alt="${esc(s.scene)}"><figcaption class="mono">${esc(s.id)}${s.beat === "blast" ? " blast" : ""}</figcaption></figure>`).join("");
    return `<h2>${esc(c.name)}</h2><p>${esc(c.device)}</p><p>${esc(c.sound)}</p>
<div class="mono">${shots.length} shots &middot; ${(shots.length * FRAMES / FPS).toFixed(1)} s &middot; mean ${dB(Math.min(...means))} to ${dB(Math.max(...means))} dB &middot; ${jumps.length ? `<span class="flag">jumps ${jumps.map((s) => s.id).join(" ")}</span>` : "no jump"}</div>
<div class="wrap"><video controls preload="none" src="${esc(c.id)}.mp4" poster="frames/${esc(shots[0].id)}-1.jpg"></video><div class="strip">${strip}</div></div>`;
  }).join("\n");
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>RTAI verdict</title><style>${CSS}
.wrap{display:grid;grid-template-columns:560px 1fr;gap:8px;margin-top:6px}video{width:100%;background:#000}.strip{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px;align-content:start}figure{margin:0}</style>
<h1>RTAI: Shift and Blast</h1>${blocks}</html>`;
}

async function shot(html: string, png: string) {
  const { chromium } = await import("playwright");
  const b = await chromium.launch({ headless: true, args: ["--disable-gpu"] });
  try {
    const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
    await p.goto("file:///" + html.replace(/\\/g, "/"));
    // A still of a video element carries the player's spinner across the picture: the sheet shows the poster instead.
    await p.evaluate(`document.querySelectorAll("video").forEach((v) => { const i = new Image(); i.src = v.poster; v.replaceWith(i); })`);
    await p.waitForLoadState("networkidle");
    await p.evaluate(`Promise.all([...document.images].map((i) => i.decode().catch(() => {})))`);
    await p.screenshot({ path: png, fullPage: true });
  } finally { await b.close(); }
}

const all: { c: Concepts["concepts"][number]; shots: Shot[] }[] = [];
for (const c of concepts) {
  const frames = keys.frames.filter((f) => f.concept === c.id && !f.endOnly && planned.has(f.id));
  if (!frames.length || (only && !only.includes(c.id))) continue;
  const missing = frames.filter((f) => !fs.existsSync(path.join(clip, "clips", `${f.id}.mp4`)));
  if (missing.length) { console.error(`${c.id}: no clip for ${missing.map((f) => f.id).join(" ")}`); process.exit(2); }
  cut(c.id, frames);
  const shots = frames.map(measure);
  all.push({ c, shots });
  const html = path.join(out, `${c.id}.html`);
  fs.writeFileSync(html, sheet(c, shots));
  await shot(html, path.join(out, `${c.id}.png`));
  console.log(`${c.id}: ${shots.length} shots, ${path.join(out, `${c.id}.png`)}`);
  for (const s of shots) console.log(`  ${s.id} mean ${dB(s.mean)} peak ${dB(s.peak)} step ${s.jump.toFixed(2)} at ${s.jumpAt.toFixed(2)} s`);
}
const page = path.join(out, "verdict.html");
fs.writeFileSync(page, verdict(all));
await shot(page, path.join(out, "verdict.png"));
console.log(page);
