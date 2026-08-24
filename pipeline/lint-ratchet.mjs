#!/usr/bin/env node
//
// The lint gate's counter and ratchet.
//
// ESLint's own `--max-warnings` fails on a rise and passes silently on a drop,
// which buries a broken glob inside a celebration. This wrapper is symmetric:
// per-rule buckets, compared against the committed `lint-baseline.json`, and ANY
// mismatch in either direction is red. See the registry's
// `quality-gates/ratchet-design` and `quality-gates/gate-liveness`.
//
// Three outcomes, three exit codes — could-not-run is NOT folded into pass:
//   0  pass          errors == 0 and every bucket matches its baseline
//   1  fail          an error, or a bucket that moved
//   2  could-not-run the instrument itself is broken (empty/short file walk,
//                    unreadable baseline, ESLint threw)
//
// Portable by construction: the project root is resolved from THIS FILE's own
// location, never from the current working directory, so the gate walks the same
// tree from a hook, from the pipeline, and from a shell in any subdirectory.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = resolve(ROOT, "lint-baseline.json");

const die = (code, headline, lines = []) => {
  console.error(`\n${headline}`);
  for (const l of lines) console.error(`  ${l}`);
  console.error("");
  process.exit(code);
};

// --- load the baseline -------------------------------------------------------
let baseline;
try {
  baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
} catch (err) {
  die(2, "COULD NOT RUN: lint-baseline.json is missing or unparseable.", [
    String(err && err.message ? err.message : err),
    `expected at: ${BASELINE}`,
  ]);
}
const expected = baseline.warnings ?? {};
const filesFloor = Number(baseline.filesFloor ?? 0);

// --- run the instrument ------------------------------------------------------
let results;
try {
  const { ESLint } = await import("eslint");
  const eslint = new ESLint({ cwd: ROOT });
  results = await eslint.lintFiles([ROOT]);
} catch (err) {
  die(2, "COULD NOT RUN: ESLint failed to load or threw while linting.", [
    String(err && err.stack ? err.stack : err),
  ]);
}

// --- assert the instrument before the result --------------------------------
// "Checked 0 files" is the signature of a moved directory or a broken glob,
// never of a clean codebase.
if (!Array.isArray(results) || results.length < filesFloor) {
  die(2, "COULD NOT RUN: the file walk came back short — the instrument is broken.", [
    `walked ${Array.isArray(results) ? results.length : "?"} files, floor is ${filesFloor}`,
    "Check eslint.config.mjs `ignores`, or whether a source directory moved.",
    "If the shrink is REAL (files were deleted), lower `filesFloor` in lint-baseline.json",
    "in the same commit, and say why.",
  ]);
}

// --- tally -------------------------------------------------------------------
const errors = [];
const actual = {};
for (const file of results) {
  for (const m of file.messages) {
    const rule = m.ruleId ?? "(inline directive)";
    if (m.severity === 2) {
      errors.push(`${file.filePath}:${m.line}:${m.column}  ${rule}  ${m.message}`);
    } else if (m.severity === 1) {
      actual[rule] = (actual[rule] ?? 0) + 1;
    }
  }
}

// --- verdict -----------------------------------------------------------------
if (errors.length) {
  die(1, `LINT FAILED: ${errors.length} error-severity finding(s). Errors are held at zero.`, errors);
}

const rules = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
const moved = rules
  .map((rule) => ({ rule, was: expected[rule] ?? 0, now: actual[rule] ?? 0 }))
  .filter((b) => b.was !== b.now);

if (moved.length) {
  const rose = moved.filter((b) => b.now > b.was);
  const fell = moved.filter((b) => b.now < b.was);
  const lines = moved.map(
    (b) => `${b.now > b.was ? "ROSE" : "FELL"}  ${b.rule}: baseline ${b.was} -> measured ${b.now}`,
  );
  if (rose.length) {
    lines.push("");
    lines.push("A RISE means new debt. Fix the finding, or — if the new warning is");
    lines.push("genuinely warranted — raise the bucket in lint-baseline.json as its own");
    lines.push("reviewed diff with a stated reason. Upward re-baselines are exceptional.");
  }
  if (fell.length) {
    lines.push("");
    lines.push("A FALL is not automatically good news: the finding may have been fixed,");
    lines.push("the code carrying it may have been DELETED, or the matcher may have");
    lines.push("BROKEN. Lower the bucket in lint-baseline.json in this same commit and");
    lines.push("name which of the three it was.");
  }
  die(1, `LINT RATCHET: ${moved.length} bucket(s) moved against lint-baseline.json.`, lines);
}

const total = Object.values(actual).reduce((a, b) => a + b, 0);
console.log(
  `lint ratchet OK — ${results.length} files, 0 errors, ${total} warnings, ` +
    `all ${rules.length} bucket(s) at baseline (measured ${baseline.measuredAt}).`,
);
