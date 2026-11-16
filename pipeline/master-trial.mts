// MASTER TRIAL - the universal master recipes (spark audio-distribution) over a folder of finished tracks,
// for the owner's ear: each recipe is one click, no parameters; the trial puts them side by side.
//
//   npx tsx pipeline/master-trial.mts --dir <folder> --out <dir> [--recipes uni-1,uni-2] [--limit N] [--reuse] [--adopt]
//   npx tsx pipeline/master-trial.mts --files a.wav b.wav --out <dir> [...]
//
// For each .wav (one at a time - a five-minute 24-bit master is ~80 MB in the sidecar's memory) and each
// recipe (default: every recipe in @gt/domain/release MASTER_RECIPES): master it through the sidecar's
// `master` verb into <out>/<stem>.<recipe>.wav, RE-MEASURE the written file with the sidecar's own `measure`
// verb (acceptance is that reading, not the verb's self-report: -14 +/- 0.5 LUFS integrated, true peak
// <= -1 dBTP, no clipped sample), and write <out>/compare.json and <out>/listen.html - the original and
// every recipe's master in one row per song (lib/audio/masterCompare.ts). The sources are only read.
//
// --reuse keeps a master already in <out> (it is re-measured, not re-rendered): adding a recipe to a trial
// renders only the new one.
//
// --adopt files each passing master as a child take (stage "remaster") of the take it was made from
// (lib/audio/masterTrial.ts matchTake) in the sound store - SOUND_STORE_DIR, else foundry-out/sound of the
// checkout this runs in. A take is capped at 60 MB (lib/sound/takes.ts MAX_UPLOAD_BYTES): a 24-bit 48 kHz
// stereo master passes that at about 3 min 38 s, and a longer one is refused there, in the store's sentence.
//
// Exit 0 every master passed · 1 a master failed or missed the window · 2 usage. No vendor, no spend.

import { readdirSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { MASTER_RECIPES, MASTER_TARGET, type MasterRecipe } from "@gt/domain/release";

const ROOT = path.resolve(import.meta.dirname, "..");

function usage(msg: string): never {
  console.error(
    `master-trial: ${msg}\nusage: npx tsx pipeline/master-trial.mts (--dir <folder> | --files a.wav b.wav ...) --out <dir> [--recipes ${MASTER_RECIPES.join(",")}] [--limit N] [--reuse] [--adopt]`,
  );
  process.exit(2);
}

const isRecipe = (r: string): r is MasterRecipe => (MASTER_RECIPES as readonly string[]).includes(r);

const argv = process.argv.slice(2);
let dir: string | null = null;
let out: string | null = null;
let limit = Infinity;
let adopt = false;
let reuse = false;
let recipes: MasterRecipe[] = [...MASTER_RECIPES];
const files: string[] = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--dir") dir = argv[++i] ?? usage("--dir needs a folder");
  else if (a === "--out") out = argv[++i] ?? usage("--out needs a folder");
  else if (a === "--recipes") {
    const list = (argv[++i] ?? usage("--recipes needs a list")).split(",").map((r) => r.trim()).filter(Boolean);
    const bad = list.filter((r) => !isRecipe(r));
    if (list.length === 0 || bad.length > 0) usage(`unknown recipe ${bad.join(", ")} (one of ${MASTER_RECIPES.join(", ")})`);
    recipes = list.filter(isRecipe);
  } else if (a === "--limit") {
    limit = Number(argv[++i]);
    if (!Number.isInteger(limit) || limit < 1) usage("--limit needs a positive integer");
  } else if (a === "--adopt") adopt = true;
  else if (a === "--reuse") reuse = true;
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
const { adoptMaster, judge, masterName, LUFS_TOL } = await import("../lib/audio/masterTrial.ts");
const { comparePage } = await import("../lib/audio/masterCompare.ts");
type Row = import("../lib/audio/masterTrial.ts").TrialRow;
type Track = import("../lib/audio/masterCompare.ts").CompareTrack;
type MasterResult = import("@gt/domain/audio.master").MasterResult;

/** A master already on disk, re-read: before from the source, after from the file (no limiter figures). */
async function reused(input: string, output: string, recipe: MasterRecipe): Promise<MasterResult | null> {
  const [b, a] = await Promise.all([measureFile(input), measureFile(output)]);
  if (!b.ok || !a.ok || b.value.integratedLufs === null || a.value.integratedLufs === null || b.value.truePeakDb === null || a.value.truePeakDb === null) return null;
  const m3 = (v: typeof b.value) => ({ lufs: v.integratedLufs!, truePeakDb: v.truePeakDb!, lra: v.lra ?? 0 });
  return { recipe, input, output, before: m3(b.value), after: m3(a.value), ms: 0, limitDb: 0, passes: 0 };
}

await mkdir(outDir, { recursive: true });
const t0 = Date.now();
const tracks: Track[] = [];
let failed = 0;
for (const [i, input] of inputs.entries()) {
  const title = path.basename(input, path.extname(input));
  const versions: { recipe: MasterRecipe; row: Row }[] = [];
  for (const recipe of recipes) {
    const output = path.join(outDir, masterName(input, recipe));
    process.stderr.write(`[${i + 1}/${inputs.length}] ${title} ${recipe} ... `);
    const kept = reuse && statSync(output, { throwIfNoEntry: false })?.isFile() ? await reused(input, output, recipe) : null;
    const m = kept !== null ? { ok: true as const, value: kept } : await masterFile(input, output, recipe);
    if (!m.ok) {
      process.stderr.write(`FAILED ${m.error.message}\n`);
      versions.push({ recipe, row: { title, input, output: null, master: null, remeasure: null, gainDb: null, pass: false, error: m.error.message, adopt: null } });
      failed++;
      continue;
    }
    const re = await measureFile(output);
    const remeasure = re.ok ? { integratedLufs: re.value.integratedLufs, truePeakDb: re.value.truePeakDb, lra: re.value.lra, clippedSamples: re.value.clippedSamples } : null;
    const error = re.ok ? judge(remeasure!, MASTER_TARGET) : `re-measure failed: ${re.error.message}`;
    if (error !== null) failed++;
    const gainDb = Math.round((m.value.after.lufs - m.value.before.lufs) * 100) / 100;
    const adopted = adopt && error === null ? await adoptMaster(input, m.value) : null;
    versions.push({ recipe, row: { title, input, output, master: m.value, remeasure, gainDb, pass: error === null, error, adopt: adopted } });
    const r = remeasure;
    process.stderr.write(
      `${m.value.before.lufs} -> ${String(r?.integratedLufs)} LUFS, ${String(r?.truePeakDb)} dBTP, LRA ${m.value.before.lra} -> ${String(r?.lra)}, ` +
        `${kept !== null ? "reused" : `limit ${m.value.limitDb} dB, ${m.value.ms} ms`}${error === null ? "" : ` MISS ${error}`}${adopted ? ` adopt ${adopted.takeId ?? adopted.error ?? ""}` : ""}\n`,
    );
  }
  const before = versions.find((v) => v.row.master !== null)?.row.master?.before ?? null;
  tracks.push({ title, input, before, versions });
}

const compare = { at: new Date().toISOString(), target: { lufs: MASTER_TARGET.lufs, truePeakDb: MASTER_TARGET.truePeakDb, tolLu: LUFS_TOL }, recipes, tracks, totalMs: Date.now() - t0 };
await writeFile(path.join(outDir, "compare.json"), `${JSON.stringify(compare, null, 2)}\n`, "utf8");
await writeFile(path.join(outDir, "listen.html"), comparePage(compare, outDir), "utf8");
const total = tracks.length * recipes.length;
console.log(`master-trial ${recipes.join(",")}: ${total - failed}/${total} passed in ${Math.round(compare.totalMs / 1000)} s -> ${path.join(outDir, "listen.html")}`);
process.exit(failed === 0 ? 0 : 1);
