// Re-render the trial grid's plates LOCALLY, from the index that outlived them.
//
// Run:  npx tsx pipeline/rebuild-trial-plates.mts
//       npx tsx pipeline/rebuild-trial-plates.mts --only blueprint
//       npx tsx pipeline/rebuild-trial-plates.mts --limit 6
//
// WHY. `public/trials/index.json` describes 60 plates — six styles by ten
// trials — and every one of the image files it points at is gone. The shelf
// seeds itself from that index (lib/useAssets.ts), so a first-time account gets
// sixty rows with empty thumbnails: the metadata survived the pixels.
//
// The index carries everything needed to make them again except the prompt, and
// the prompt is derivable: it is `compilePrompt(preset.block, trial.subject)`,
// the same call build-style-trials.mts made, with `styleId` and `trialId`
// naming which of each. So this rebuilds rather than deletes.
//
// LOCAL FLUX 2, not the cloud router the originals used. Sixty vendor renders
// is real money for a demo shelf, and this box has a stack that costs
// electricity. The consequence is stated rather than hidden: THESE ARE NOT THE
// SAME PICTURES. Each row's stored `grade` — its description, its dominant
// colours, whether text leaked in — describes the Google render that is gone.
// The rebuild therefore CLEARS the stale grade and records what actually made
// the new file, so nothing on the shelf claims a reading of an image nobody has
// looked at.
//
// Resumable: a file on disk is a finished plate.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const { PRESETS } = await import("@gt/catalog/presets");
const { TRIALS } = await import("../lib/library/trials");
const { compilePrompt, PROMPT_CHAR_LIMIT } = await import("../lib/stylePrompt");

const argv = process.argv.slice(2);
const only = argv.includes("--only") ? argv[argv.indexOf("--only") + 1] : null;
const limit = argv.includes("--limit") ? Number(argv[argv.indexOf("--limit") + 1]) : Infinity;

const ROOT = process.cwd();
const indexPath = path.join(ROOT, "public", "trials", "index.json");

interface Entry {
  styleId: string;
  styleName: string;
  trialId: string;
  trialLabel: string;
  problem: string;
  beat: string;
  file: string;
  provider?: string;
  model?: string;
  grade?: unknown;
  prompt?: string;
  rebuiltAt?: number;
}

// The file is a document with `styles`, `trials` and `entries`, not a bare
// array; the rows live under `entries` and the rest is written back untouched.
const doc = JSON.parse(readFileSync(indexPath, "utf8")) as { entries: Entry[] };
const index: Entry[] = doc.entries;
const presetById = new Map(PRESETS.map((p) => [p.id, p]));
const trialById = new Map(TRIALS.map((t) => [t.id, t]));

const wanted = index.filter((e) => !only || e.styleId === only).slice(0, limit);
console.log(`\ntrial plates → public/trials/  (${wanted.length} of ${index.length})\n`);

let made = 0;
let skipped = 0;
let failed = 0;

for (const e of wanted) {
  const out = path.join(ROOT, "public", e.file.replace(/^\//, ""));
  if (existsSync(out)) {
    skipped++;
    continue;
  }
  const preset = presetById.get(e.styleId);
  const trial = trialById.get(e.trialId);
  if (!preset || !trial) {
    console.log(`SKIP  ${e.styleId}/${e.trialId} · the catalogue no longer has it`);
    failed++;
    continue;
  }
  const prompt = compilePrompt(preset.block, trial.subject);
  if (prompt.length > PROMPT_CHAR_LIMIT) {
    console.log(`FAIL  ${e.styleId}/${e.trialId} · ${prompt.length} chars over the ceiling`);
    failed++;
    continue;
  }

  mkdirSync(path.dirname(out), { recursive: true });
  const t0 = Date.now();
  const r = spawnSync("python", [path.join("pipeline", "video", "flux_still.py"), out, prompt],
    { encoding: "utf8" });
  if (r.status !== 0 || !existsSync(out)) {
    console.log(`FAIL  ${e.styleId}/${e.trialId}\n         → ${(r.stderr || r.stdout || "").trim().slice(-300)}`);
    failed++;
    continue;
  }

  // THE RECORD FOLLOWS THE PIXELS. The old grade read an image that no longer
  // exists; leaving it would let the shelf show a TEXT badge, or a colour list,
  // for a picture nobody has graded.
  delete e.grade;
  e.provider = "local";
  e.model = "flux2-dev-fp8mixed";
  e.prompt = prompt;
  e.rebuiltAt = Date.now();
  // The WHOLE document, not just its entries. Writing `index` here replaced a
  // {styles, trials, entries} document with a bare array on the first run and
  // cost a `git checkout` to recover.
  writeFileSync(indexPath, JSON.stringify(doc, null, 1) + "\n", "utf8");

  made++;
  console.log(`OK    ${e.styleId}/${e.trialId} · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

console.log(`\n${made} built · ${skipped} already there · ${failed} failed`);
process.exit(failed && !made ? 1 : 0);
