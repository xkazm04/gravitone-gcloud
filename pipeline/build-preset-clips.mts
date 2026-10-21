// Builds the preset showcase clips under public/clips/presets/.
//
// Run:  npx tsx pipeline/build-preset-clips.mts
//       npx tsx pipeline/build-preset-clips.mts --only blueprint
//       npx tsx pipeline/build-preset-clips.mts --render        (render first)
//
// TWO STAGES, ON PURPOSE.
//
//   1. RENDER, on the local Wan stack, by pipeline/video/render_preset_clips.py.
//      Minutes per clip, needs the card, and lands 1-3 MB takes under
//      pipeline/runs/preset-clips/<id>/takes/ (NOT committed), each graded once
//      and recorded in <id>/ledger.json. Adopt one with
//      `python pipeline/video/ledger.py adopt <id> <take> [--waiver "reason"]`.
//      THIS script squeezes only the ADOPTED take, and refuses one whose check
//      failed (or never ran) unless the adoption carries a waiver. Run with --render, or
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
import { errorMessage } from "@gt/domain/errors";

import { makeClip, probe, formatBytes, PROFILES } from "./video/transcode.mjs";

const { PRESETS } = await import("@gt/catalog/presets");

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

/** A stored clip_check verdict (pipeline/video/clip_check.py), copied to the manifest. */
interface Check {
  ok: boolean;
  reasons?: string[];
  checker?: number;
  [metric: string]: unknown;
}

/** One row of <id>/ledger.json takes[]. */
interface Take {
  file: string;
  engine?: string;
  seed?: number;
  prompt?: string;
  route?: string;
  trim?: number;
  retime?: number;
  check?: Check;
}

/** Why a take may not ship, or null. Mirrors verdict_problem in pipeline/video/ledger.py. */
function verdictProblem(take: Take, waiver?: string): string | null {
  if (take.check?.ok === true) return null;
  if (typeof waiver === "string" && waiver.trim()) return null;
  if (!take.check) return `${take.file} was never judged (no check) and carries no waiver`;
  const why = (take.check.reasons ?? []).join("; ") || "check.ok is false";
  return `${take.file} failed its check (${why}) and carries no waiver`;
}

interface Entry {
  id: string;
  name: string;
  route: string;
  engine?: string;
  seed?: number;
  prompt?: string;
  /** Exactly one of these is present on a ledger-built entry. */
  check?: Check;
  waiver?: string;
  poster: string;
  sources: { src: string; type: string; bytes: number }[];
  bytes: number;
  /** MEASURED off the committed file, never copied from the profile. */
  width: number;
  height: number;
  fps: number;
  frames: number;
  seconds: number;
}

const built: Entry[] = [];
let failed = 0;

for (const preset of wanted) {
  // THE LEDGER FIRST. When <id>/ledger.json exists, only the ADOPTED take is
  // squeezed, and an adoption the verdict does not permit is refused by name.
  // A preset with no ledger falls back to the legacy single raw (below), which
  // carries no verdict; it is what shipped before takes existed.
  const ledgerFile = path.join(rawDir, preset.id, "ledger.json");
  let ledgerTake: Take | null = null;
  let waiver: string | undefined;
  let raw: string | undefined;
  if (existsSync(ledgerFile)) {
    const led = JSON.parse(readFileSync(ledgerFile, "utf8")) as {
      takes?: Take[];
      adopted?: { take: string; waiver?: string } | null;
    };
    const adopted = led.adopted;
    if (!adopted) {
      console.log(`REFUSE ${preset.id} · ledger exists but no take is adopted`);
      failed++;
      continue;
    }
    ledgerTake = (led.takes ?? []).find((t) => t.file === adopted.take) ?? null;
    if (!ledgerTake) {
      console.log(`REFUSE ${preset.id} · adopted take ${adopted.take} is not in the ledger`);
      failed++;
      continue;
    }
    waiver = adopted.waiver;
    const problem = verdictProblem(ledgerTake, waiver);
    if (problem) {
      console.log(`REFUSE ${preset.id} · ${problem}`);
      failed++;
      continue;
    }
    raw = path.join(rawDir, preset.id, "takes", ledgerTake.file);
    if (!existsSync(raw)) {
      console.log(`MISS  ${preset.id} · adopted take ${ledgerTake.file} is not on disk`);
      failed++;
      continue;
    }
  } else {
    // Whichever renderer produced it. The local Wan graph saves .webm; a clip
    // bought through pipeline/video/leonardo_reference.py arrives as .mp4.
    raw = [".webm", ".mp4"]
      .map((ext) => path.join(rawDir, `${preset.id}${ext}`))
      .find((p) => existsSync(p));
  }
  if (!raw) {
    console.log(`MISS  ${preset.id} · no raw render — run with --render`);
    failed++;
    continue;
  }
  try {
    const src = await probe(raw);
    // (probe the ORIGINAL for the "from" line; `source` may be retimed below)
    // The renderer's own sidecar. A clip from pipeline/video/compose_clip.py is
    // already the exact loop, forward and back, so trimming its head would cut
    // the loop open and it would snap on repeat. A Wan render is trimmed because
    // its first frames are the source still holding while the model finds the
    // motion, which reads as a stall on a five-second card.
    const sidecar = raw.replace(/\.(webm|mp4)$/, ".json");
    const meta: Partial<Take> =
      ledgerTake ?? (existsSync(sidecar) ? JSON.parse(readFileSync(sidecar, "utf8")) : {});
    const trim = meta.trim ?? (meta.route === "compose" ? 0 : 0.35);

    // RETIME FIRST, when the sidecar asks. MiniMax H3 front-loads: the picture
    // arrives about 40% of the way through and every later frame repaints it,
    // which reads as a clip that stopped. pipeline/video/retime.py finds that
    // arrival point by measuring displacement from the first frame, keeps what
    // came before it and slows it to fill the run. It cannot add motion that was
    // never generated; it stops the generated motion being crammed into the
    // first second.
    let source = raw;
    if (meta.retime) {
      const staged = path.join(rawDir, `${preset.id}.retimed.webm`);
      const rt = spawnSync("python", [
        path.join("pipeline", "video", "retime.py"), raw, staged,
        "--seconds", String(meta.retime), "--fps", String(fps), "--width", String(width),
      ], { encoding: "utf8" });
      if (rt.status !== 0) throw new Error(`retime failed: ${(rt.stderr || rt.stdout || "").trim()}`);
      process.stdout.write(rt.stdout);
      source = staged;
    }
    const made = await makeClip(source, {
      outDir,
      slug: preset.id,
      profile,
      // OUTPUT fps belongs to the PROFILE, not to the renderer. The sidecar's
      // `fps` is a fact about the raw; reading it as an instruction here
      // silently pushed the five Wan clips from the profile's 20fps to their
      // source's 24, adding a fifth more frames and bytes for nothing a viewer
      // would see. A sidecar says what a clip IS; only `trim` says what to do.
      start: trim,
      log: (l: string) => console.log(l),
    });
    built.push({
      id: preset.id,
      name: preset.name,
      poster: `/clips/presets/${made.poster}`,
      sources: made.sources.map((s) => ({ src: `/clips/presets/${s.src}`, type: s.type, bytes: s.bytes })),
      bytes: made.totalBytes,
      route: meta.route ?? "wan",
      // PROVENANCE AND VERDICT travel with the clip. check-clips reads them.
      ...(ledgerTake
        ? {
            engine: ledgerTake.engine,
            seed: ledgerTake.seed,
            prompt: ledgerTake.prompt,
            ...(ledgerTake.check?.ok === true ? { check: ledgerTake.check } : {}),
            ...(waiver && waiver.trim()
              ? { waiver: waiver.trim(), ...(ledgerTake.check ? { check: ledgerTake.check } : {}) }
              : {}),
          }
        : {}),
      ...made.measured,
    });
    console.log(
      `OK    ${preset.id} · ${meta.route ?? "wan"} · from ${src.width}×${src.height} ${src.seconds.toFixed(1)}s · ` +
        `${formatBytes(made.totalBytes)} committed\n`,
    );
  } catch (e) {
    failed++;
    console.log(`FAIL  ${preset.id}\n         → ${errorMessage(e)}\n`);
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
