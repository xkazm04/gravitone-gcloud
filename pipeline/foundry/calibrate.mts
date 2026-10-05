// CALIBRATE THE GRADER AGAINST THE HUMAN LEDGER.
//
//   npx tsx pipeline/foundry/calibrate.mts            write grader-calibration.json
//   npx tsx pipeline/foundry/calibrate.mts --check    exit 1 when the file is stale
//   npx tsx pipeline/foundry/calibrate.mts --print    the table, write nothing
//
// Reads pipeline/foundry/ledger.json (one row per hand-decided candidate,
// automatic grades beside the human verdict) and writes the measurement of
// lib/foundry/calibration.ts beside it: per grader series, per grade field,
// pooled and per mechanism, the AUC with its bootstrap CI and a status.
//
// The file is TRACKED and deterministic (fixed bootstrap seed, no timestamp),
// so a diff of it is a diff of what the grader is worth. The /foundry commit
// is meant to rewrite it after every ledger write; until that lands (the
// commit is moving behind the foundry-engine-A write lock) this script is how
// it is refreshed after a cull.
//
// FOUNDRY_DIR aims it at another directory holding a ledger.json, the same
// variable lib/foundry/store.ts reads, so a probe never rewrites the tracked file.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { GRADE_FIELDS, calibrationFile, type CalibrationRow, type FieldCalibration } from "../../lib/foundry/calibration";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = process.env.FOUNDRY_DIR ? path.resolve(process.env.FOUNDRY_DIR) : HERE;
const LEDGER = path.join(DIR, "ledger.json");
const OUT = path.join(DIR, "grader-calibration.json");

const PURPOSE =
  "Does the automatic grader predict the human? Per grader series (model @ grade.py schema/prompt digest; rows from before the stamp are `unstamped`), per grade field, pooled and per mechanism: the AUC of a kept candidate outscoring a rejected one, a stratified bootstrap CI with a fixed seed, and a status (calibrated | inverted | chance | insufficient). Generated from ledger.json by pipeline/foundry/calibrate.mts (lib/foundry/calibration.ts); do not edit by hand.";

const rows = (JSON.parse(readFileSync(LEDGER, "utf8")) as { rows: CalibrationRow[] }).rows;
const file = calibrationFile(rows);
const text = JSON.stringify({ _purpose: PURPOSE, ...file }, null, 2) + "\n";

const args = new Set(process.argv.slice(2));

const cell = (c: FieldCalibration) =>
  c.auc === null ? `insufficient (${c.short}, ${c.n_keep}/${c.n_reject})` : `${c.auc.toFixed(3)} [${c.ci![0].toFixed(3)}, ${c.ci![1].toFixed(3)}] ${c.status} (${c.n_keep}/${c.n_reject})`;

for (const [key, cal] of Object.entries(file.series)) {
  console.log(`series ${key}: ${cal.n} rows${Object.keys(cal.other_graders).length ? `, other graders ${JSON.stringify(cal.other_graders)}` : ""}`);
  for (const f of GRADE_FIELDS) {
    console.log(`  ${f.padEnd(12)} all        ${cell(cal.fields[f].all)}`);
    for (const [m, c] of Object.entries(cal.fields[f].by_mechanism)) console.log(`  ${"".padEnd(12)} ${m.padEnd(10)} ${cell(c)}`);
  }
}

if (args.has("--print")) process.exit(0);

if (args.has("--check")) {
  let current = "";
  try {
    current = readFileSync(OUT, "utf8");
  } catch {
    /* absent reads as stale */
  }
  if (current.replace(/\r\n/g, "\n") !== text) {
    console.error(`calibrate: ${path.relative(process.cwd(), OUT)} is stale against ${rows.length} ledger rows; run npx tsx pipeline/foundry/calibrate.mts`);
    process.exit(1);
  }
  console.log("calibrate: current");
  process.exit(0);
}

writeFileSync(OUT, text);
console.log(`calibrate: wrote ${path.relative(process.cwd(), OUT)} (${rows.length} rows)`);
