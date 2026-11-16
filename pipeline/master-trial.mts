// MASTER TRIAL - the universal master (spark audio-distribution, S1) over a folder of finished tracks,
// for the owner's ear: one recipe, no parameters, every track.
//
//   npx tsx pipeline/master-trial.mts --dir <folder> --out <dir> [--limit N] [--adopt]
//   npx tsx pipeline/master-trial.mts --files a.wav b.wav --out <dir> [--limit N] [--adopt]
//
// For each .wav (one at a time - a five-minute 24-bit master is ~80 MB in the sidecar's memory):
// master it through the sidecar's `master` verb into <out>/<stem>.uni-1.wav, RE-MEASURE the written
// file with the sidecar's own `measure` verb (acceptance is that reading, not the verb's self-report:
// -14 +/- 0.5 LUFS integrated, true peak <= -1 dBTP, no clipped sample), and collect every row into
// <out>/trial.json and <out>/listen.html (a page that opens from disk and plays original and master at
// matched loudness). The sources are only read; nothing is written beside them.
//
// --adopt files each passing master as a child take (stage "remaster") of the take it was made from
// (lib/audio/masterTrial.ts matchTake: the store file, upload name or title equal to the file's stem)
// in the sound store - SOUND_STORE_DIR, else foundry-out/sound of the checkout this runs in. A take
// is capped at 60 MB (lib/sound/takes.ts MAX_UPLOAD_BYTES), and a 24-bit 48 kHz stereo master passes
// that at about 3 min 38 s (62914560 B / 288000 B per s): a longer master is refused there, in the store's own sentence.
//
// Exit 0 every row passed · 1 a row failed or missed the window · 2 usage. No vendor, no spend.

import { readdirSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { MASTER_RECIPES, MASTER_TARGET, type MasterRecipe } from "@gt/domain/release";

const ROOT = path.resolve(import.meta.dirname, "..");
const RECIPE: MasterRecipe = MASTER_RECIPES[MASTER_RECIPES.length - 1] ?? "uni-1";

function usage(msg: string): never {
  console.error(`master-trial: ${msg}\nusage: npx tsx pipeline/master-trial.mts (--dir <folder> | --files a.wav b.wav ...) --out <dir> [--limit N] [--adopt]`);
  process.exit(2);
}

const argv = process.argv.slice(2);
let dir: string | null = null;
let out: string | null = null;
let limit = Infinity;
let adopt = false;
const files: string[] = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--dir") dir = argv[++i] ?? usage("--dir needs a folder");
  else if (a === "--out") out = argv[++i] ?? usage("--out needs a folder");
  else if (a === "--limit") {
    limit = Number(argv[++i]);
    if (!Number.isInteger(limit) || limit < 1) usage("--limit needs a positive integer");
  } else if (a === "--adopt") adopt = true;
  else if (a === "--files") while (argv[i + 1] !== undefined && !argv[i + 1]!.startsWith("--")) files.push(argv[++i]!);
  else usage(`unknown argument ${a ?? ""}`);
}
if (out === null) usage("--out is required");
if ((dir === null) === (files.length === 0)) usage("name exactly one of --dir or --files");

// Every path is resolved against the caller's cwd BEFORE the chdir: the sidecar script and the
// store are repo-relative, as in the server.
const outDir = path.resolve(out);
const inputs = (dir !== null
  ? readdirSync(path.resolve(dir))
      .filter((f) => f.toLowerCase().endsWith(".wav"))
      .sort((x, y) => x.localeCompare(y))
      .map((f) => path.join(path.resolve(dir!), f))
  : files.map((f) => path.resolve(f))
).slice(0, limit);
if (inputs.length === 0) usage("no .wav files to master");
for (const f of inputs) if (!statSync(f, { throwIfNoEntry: false })?.isFile()) usage(`no such file: ${f}`);
if (inputs.some((f) => path.resolve(path.dirname(f)) === outDir)) usage("--out must not be the sources' folder (the sources are read-only)");
process.chdir(ROOT);

const { measureFile } = await import("../lib/audio/sidecar.ts");
const { masterFile } = await import("../lib/audio/sidecarMaster.ts");
const { adoptMaster, judge, listenPage, masterName, LUFS_TOL } = await import("../lib/audio/masterTrial.ts");
type Row = import("../lib/audio/masterTrial.ts").TrialRow;

await mkdir(outDir, { recursive: true });
const t0 = Date.now();
const rows: Row[] = [];
for (const [i, input] of inputs.entries()) {
  const title = path.basename(input, path.extname(input));
  const output = path.join(outDir, masterName(input, RECIPE));
  process.stderr.write(`[${i + 1}/${inputs.length}] ${title} ... `);
  const m = await masterFile(input, output, RECIPE);
  if (!m.ok) {
    process.stderr.write(`FAILED ${m.error.message}\n`);
    rows.push({ title, input, output: null, master: null, remeasure: null, gainDb: null, pass: false, error: m.error.message, adopt: null });
    continue;
  }
  const re = await measureFile(output);
  const remeasure = re.ok ? { integratedLufs: re.value.integratedLufs, truePeakDb: re.value.truePeakDb, lra: re.value.lra, clippedSamples: re.value.clippedSamples } : null;
  const error = re.ok ? judge(remeasure!, MASTER_TARGET) : `re-measure failed: ${re.error.message}`;
  const gainDb = Math.round((m.value.after.lufs - m.value.before.lufs) * 100) / 100;
  const adopted = adopt && error === null ? await adoptMaster(input, m.value) : null;
  rows.push({ title, input, output, master: m.value, remeasure, gainDb, pass: error === null, error, adopt: adopted });
  const r = remeasure;
  process.stderr.write(
    `${m.value.before.lufs} -> ${String(r?.integratedLufs)} LUFS, ${String(r?.truePeakDb)} dBTP, gain ${gainDb >= 0 ? "+" : ""}${gainDb} dB, ` +
      `limit ${m.value.limitDb} dB, ${m.value.ms} ms${error === null ? "" : ` MISS ${error}`}${adopted ? ` adopt ${adopted.takeId ?? adopted.error ?? ""}` : ""}\n`,
  );
}

const trial = { recipe: RECIPE, at: new Date().toISOString(), target: { lufs: MASTER_TARGET.lufs, truePeakDb: MASTER_TARGET.truePeakDb, tolLu: LUFS_TOL }, rows, totalMs: Date.now() - t0 };
await writeFile(path.join(outDir, "trial.json"), `${JSON.stringify(trial, null, 2)}\n`, "utf8");
await writeFile(path.join(outDir, "listen.html"), listenPage(trial, outDir), "utf8");
const passed = rows.filter((r) => r.pass).length;
console.log(`master-trial ${RECIPE}: ${passed}/${rows.length} passed in ${Math.round(trial.totalMs / 1000)} s -> ${path.join(outDir, "listen.html")}`);
process.exit(passed === rows.length ? 0 : 1);
