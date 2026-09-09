// Builds the preset showcase clips under public/clips/presets/.
//
// Run:  npx tsx pipeline/build-preset-clips.mts
//       npx tsx pipeline/build-preset-clips.mts --only blueprint
//       npx tsx pipeline/build-preset-clips.mts --render        (render first)
//
// TWO STAGES, ON PURPOSE.
//
//   1. RENDER, on the local Wan stack, by pipeline/video/render_preset_clips.py.
//      Minutes per clip, needs the card, and lands a 1-3 MB raw .webm in
//      pipeline/runs/preset-clips/ which is NOT committed. Run with --render, or
//      run the Python directly; without it this script uses what is already there.
//
//   2. SQUEEZE, here, by pipeline/video/transcode.mjs. Seconds, needs only
//      ffmpeg, and lands the committed artefacts: a VP9 WebM, an H.264 MP4 and
//      a poster JPEG per preset, each under the profile's byte budget.
//
// The split is what makes this re-runnable by anyone. The raws are the
// expensive, machine-specific half; the committed half can be rebuilt on any
// box with ffmpeg, from raws fetched or re-rendered, and the budget is enforced
// on every rebuild rather than trusted from the last one.
//
// Like build-preset-thumbs.mts, these are committed static assets. Six clips
// that never change must not be six generations per page load.

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

import { makeClip, probe, formatBytes, PROFILES } from "./video/transcode.mjs";

const { PRESETS } = await import("../app/library/presets");

const argv = process.argv.slice(2);
const only = argv.includes("--only") ? argv[argv.indexOf("--only") + 1] : null;
const doRender = argv.includes("--render");

const ROOT = process.cwd();
const rawDir = path.join(ROOT, "pipeline", "runs", "preset-clips");
const outDir = path.join(ROOT, "public", "clips", "presets");
const manifestPath = path.join(ROOT, "public", "clips", "manifest.json");

const wanted = PRESETS.filter((p) => !only || p.id === only);

if (doRender) {
  console.log("rendering raws on the local stack — minutes per clip\n");
  const py = spawnSync(
    "python",
    [path.join("pipeline", "video", "render_preset_clips.py"), ...(only ? ["--only", only] : [])],
    { stdio: "inherit" },
  );
  if (py.status !== 0) {
    console.log("\nthe renderer did not finish; squeezing whatever raws exist");
  }
  console.log("");
}

mkdirSync(outDir, { recursive: true });

const profile = "showcase" as const;
const { width, fps, seconds, budgetKB } = PROFILES[profile];
console.log(`preset clips → ${path.relative(ROOT, outDir)}`);
console.log(`profile ${profile} · ${width}px · ${fps}fps · ${seconds}s · ${budgetKB}KB per file\n`);

interface Entry {
  id: string;
  name: string;
  poster: string;
  sources: { src: string; type: string; bytes: number }[];
  bytes: number;
  width: number;
  seconds: number;
}

const built: Entry[] = [];
let failed = 0;

for (const preset of wanted) {
  // Whichever renderer produced it. The local Wan graph saves .webm; a clip
  // bought through pipeline/video/leonardo_reference.py arrives as .mp4.
  const raw = [".webm", ".mp4"]
    .map((ext) => path.join(rawDir, `${preset.id}${ext}`))
    .find((p) => existsSync(p));
  if (!raw) {
    console.log(`MISS  ${preset.id} · no raw render — run with --render`);
    failed++;
    continue;
  }
  try {
    const src = await probe(raw);
    // The renderer's own sidecar. A clip from pipeline/video/compose_clip.py is
    // already the exact loop, forward and back, so trimming its head would cut
    // the loop open and it would snap on repeat. A Wan render is trimmed because
    // its first frames are the source still holding while the model finds the
    // motion, which reads as a stall on a five-second card.
    const sidecar = raw.replace(/\.(webm|mp4)$/, ".json");
    const meta = existsSync(sidecar) ? JSON.parse(readFileSync(sidecar, "utf8")) : {};
    const trim = meta.trim ?? (meta.route === "compose" ? 0 : 0.35);
    const made = await makeClip(raw, {
      outDir,
      slug: preset.id,
      profile,
      fps: meta.fps ?? PROFILES[profile].fps,
      start: trim,
      log: (l: string) => console.log(l),
    });
    built.push({
      id: preset.id,
      name: preset.name,
      poster: `/clips/presets/${made.poster}`,
      sources: made.sources.map((s) => ({ src: `/clips/presets/${s.src}`, type: s.type, bytes: s.bytes })),
      bytes: made.totalBytes,
      width,
      seconds,
    });
    console.log(
      `OK    ${preset.id} · ${meta.route ?? "wan"} · from ${src.width}×${src.height} ${src.seconds.toFixed(1)}s · ` +
        `${formatBytes(made.totalBytes)} committed\n`,
    );
  } catch (e) {
    failed++;
    console.log(`FAIL  ${preset.id}\n         → ${e instanceof Error ? e.message : String(e)}\n`);
  }
}

// Anything under public/clips/presets/ that no preset claims. A renamed or
// retired preset otherwise leaves its clip behind forever, weighing the repo
// down with a file nothing can reach.
if (!only) {
  const claimed = new Set(PRESETS.flatMap((p) => [`${p.id}.webm`, `${p.id}.mp4`, `${p.id}.jpg`]));
  for (const f of readdirSync(outDir)) {
    if (!claimed.has(f)) {
      unlinkSync(path.join(outDir, f));
      console.log(`SWEPT ${f} · no preset claims it`);
    }
  }
}

// The manifest is what pipeline/check-clips.mjs measures against, and it is
// written only on a full run — a --only rebuild would otherwise record one
// clip and delete the memory of the other five.
if (!only && !failed) {
  const total = built.reduce((n, b) => n + b.bytes, 0);
  writeFileSync(
    manifestPath,
    JSON.stringify(
      { profile, width, fps, seconds, budgetKB, totalBytes: total, clips: built },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  console.log(`manifest → ${path.relative(ROOT, manifestPath)}`);
}

const onDisk = readdirSync(outDir).reduce((n, f) => n + statSync(path.join(outDir, f)).size, 0);
console.log(
  `\n${built.length} built · ${failed} failed · ${formatBytes(onDisk)} on disk` +
    (failed ? "\n\nSome clips are missing; the showcase falls back to the still swatch." : ""),
);
process.exit(failed ? 1 : 0);
