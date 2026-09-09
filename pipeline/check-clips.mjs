#!/usr/bin/env node
//
// THE CLIP WEIGHT RATCHET — video may enter this repository, but not quietly.
//
// WHY THIS EXISTS. A committed clip is the one asset class whose cost is
// invisible at review time. A 4 MB .mp4 and a 200 KB .mp4 are one line in a
// diff, identical, and git keeps every version of both forever. The failure is
// not one fat file; it is the tenth surface adding its own, each defensible on
// its own, and a clone that takes a minute.
//
// So the total is a RATCHET, in the shape this repo already uses for narration
// and for the type scale: a budget that may only fall. Adding a clip means
// either fitting under the ceiling or raising the ceiling in a diff somebody
// reads, and the second is exactly the conversation that should happen.
//
// THREE CHECKS.
//
//   1. TOTAL BYTES under public/clips/ against TOTAL_BUDGET_KB.
//   2. PER-FILE BYTES against the per-file budget the manifest records, so one
//      clip cannot spend the whole allowance.
//   3. COMPLETENESS: every clip the manifest names is on disk, and every file on
//      disk is named by the manifest. An orphan is weight nothing can reach.
//   4. THE RECORD MATCHES THE FILES. Every clip's recorded dimensions, frame
//      count and duration, checked by decoding the actual file.
//
// Check 4 exists because the manifest lied for a week and nothing noticed. It
// copied the PROFILE's `width` and `seconds` into every entry, so all six clips
// were recorded as "640px, 5s" while five were 640x362 at 4.70s and one was
// 640x384 at 3.04s. The files were fine; the record was fiction, and a record
// nobody measures is one that drifts silently. Numbers that are asserted must
// be checked or they should not be written down.
//
// The manifest is written by pipeline/build-preset-clips.mts through
// pipeline/video/transcode.mjs, which enforces the same per-file budget at
// encode time. This gate is the wall behind that door: it catches a file edited,
// replaced or dropped in by hand, which the encoder never sees.
//
// Three outcomes, three exit codes — could-not-run is NOT folded into pass:
//   0  pass
//   1  fail
//   2  could-not-run (no manifest, so a green verdict would mean nothing)

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const CLIPS = path.join(ROOT, "public", "clips");
const MANIFEST = path.join(CLIPS, "manifest.json");

/** Every byte of video and poster this repository carries, ceiling.
 *  It may only fall. Raising it is a deliberate edit, in a reviewed diff.
 *
 *  800 against 557 measured on 2026-09-09 (six preset showcase clips, VP9 plus
 *  posters). The headroom is one more clip, not one more surface — a second
 *  surface should have to come here and say so. */
const TOTAL_BUDGET_KB = 800;

const fail = [];
const note = [];

if (!existsSync(CLIPS)) {
  console.log("clips: public/clips/ does not exist — nothing to weigh.");
  process.exit(0);
}
if (!existsSync(MANIFEST)) {
  console.error("clips: public/clips/ exists but has no manifest.json.");
  console.error("       Run: npx tsx pipeline/build-preset-clips.mts");
  process.exit(2);
}

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const perFileBudget = (manifest.budgetKB ?? 0) * 1024;
if (!perFileBudget) {
  console.error("clips: manifest records no budgetKB — it was not written by build-preset-clips.mts.");
  process.exit(2);
}

/** Every file under public/clips/, relative to public/, manifest excluded. */
function walk(dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, acc);
    else if (full !== MANIFEST) acc.push(full);
  }
  return acc;
}

const onDisk = new Map(walk(CLIPS).map((f) => [`/${path.relative(path.join(ROOT, "public"), f).replaceAll("\\", "/")}`, statSync(f).size]));

// 1 + 2 — the manifest's own claims, checked against the disk.
const claimed = new Set();
for (const clip of manifest.clips ?? []) {
  for (const s of [...clip.sources, { src: clip.poster, type: "image/jpeg" }]) {
    claimed.add(s.src);
    const bytes = onDisk.get(s.src);
    if (bytes === undefined) {
      fail.push(`${s.src} is in the manifest and not on disk`);
      continue;
    }
    // The poster is a still and rides well under the video budget; measuring it
    // against the same ceiling is the cheap correct thing rather than a second
    // number to keep.
    if (bytes > perFileBudget) {
      fail.push(`${s.src} is ${kb(bytes)} — over the ${manifest.budgetKB}KB per-file budget`);
    }
  }
}

// 3 — the other direction.
for (const [rel] of onDisk) {
  if (!claimed.has(rel)) fail.push(`${rel} is on disk and in no manifest entry`);
}

// 4 — decode each clip and hold the record to it. Dimensions and frame count
// must be exact; duration is derived from a container timestamp, so it gets a
// 50ms tolerance rather than an equality test it would fail on rounding alone.
for (const clip of manifest.clips ?? []) {
  const video = clip.sources?.[0];
  if (!video || clip.width === undefined) {
    fail.push(`${clip.id} records no measured shape — rebuild with build-preset-clips.mts`);
    continue;
  }
  const file = path.join(ROOT, "public", video.src.replace(/^\//, ""));
  if (!existsSync(file)) continue; // already reported by check 1
  let got;
  try {
    got = JSON.parse(
      execFileSync("ffprobe", [
        "-v", "error", "-select_streams", "v:0", "-count_frames",
        "-show_entries", "stream=width,height,nb_read_frames:format=duration",
        "-of", "json", file,
      ], { encoding: "utf8", maxBuffer: 1 << 22 }),
    );
  } catch (e) {
    console.error(`clips: could not probe ${video.src} — is ffprobe on PATH?`);
    process.exit(2);
  }
  const st = got.streams?.[0] ?? {};
  const seconds = Number(got.format?.duration) || 0;
  const frames = Number(st.nb_read_frames) || 0;
  if (st.width !== clip.width || st.height !== clip.height)
    fail.push(`${clip.id} is ${st.width}x${st.height} on disk, recorded as ${clip.width}x${clip.height}`);
  if (clip.frames !== undefined && frames !== clip.frames)
    fail.push(`${clip.id} has ${frames} frames on disk, recorded as ${clip.frames}`);
  if (Math.abs(seconds - clip.seconds) > 0.05)
    fail.push(`${clip.id} runs ${seconds.toFixed(2)}s on disk, recorded as ${clip.seconds}s`);
}

const total = [...onDisk.values()].reduce((n, b) => n + b, 0);
if (total > TOTAL_BUDGET_KB * 1024) {
  fail.push(
    `public/clips/ weighs ${kb(total)}, over the ${TOTAL_BUDGET_KB}KB ceiling. ` +
      `Shrink a clip, drop one, or raise TOTAL_BUDGET_KB in a diff somebody reads.`,
  );
}
note.push(`${manifest.clips?.length ?? 0} clip(s), ${onDisk.size} file(s), ${kb(total)} of ${TOTAL_BUDGET_KB}KB`);
const secs = (manifest.clips ?? []).map((c) => c.seconds).filter((s) => s !== undefined);
if (secs.length) note.push(`${Math.min(...secs).toFixed(2)}–${Math.max(...secs).toFixed(2)}s each`);

function kb(n) {
  return n >= 1024 * 1024 ? `${(n / 1048576).toFixed(2)}MB` : `${Math.round(n / 1024)}KB`;
}

console.log(`clips: ${note.join(" · ")}.`);
if (fail.length) {
  console.error("\nclips: FAILED");
  for (const f of fail) console.error(`  · ${f}`);
  process.exit(1);
}
process.exit(0);
