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

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
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
const filesFloor = Number(baseline.filesFloor);

// The floor is the instrument assertion below. It used to default to 0 when
// the key was missing or misspelled, and `results.length < 0` is never true —
// so a baseline without a floor silently disarmed the one check that tells a
// moved directory from a clean codebase. A baseline that cannot say how many
// files it was measured over is not a baseline this gate can run against.
if (!Number.isInteger(filesFloor) || filesFloor <= 0) {
  die(2, "COULD NOT RUN: lint-baseline.json has no usable `filesFloor`.", [
    `found: ${JSON.stringify(baseline.filesFloor)} — expected a positive integer`,
    "Without it the short-walk assertion can never fire, and a broken glob",
    "would read as a clean tree. Set it to the file count of the last honest run.",
  ]);
}
if (!baseline.warnings || typeof baseline.warnings !== "object") {
  die(2, "COULD NOT RUN: lint-baseline.json has no `warnings` block.", [
    "Every bucket would read as baseline 0 and every warning as a RISE —",
    "a verdict about the file's shape, not about the code.",
  ]);
}

// --- run the instrument ------------------------------------------------------
// Lint what git would ship. A file git ignores (.gitignore, or a machine's own .git/info/exclude)
// never reaches CI, so it must not decide this gate locally either: measured 2026-10-25, one
// locally-excluded scratch file failed the error stage on every machine run and hid the bucket
// stage behind it, so three warning buckets rose unseen. `--directory` collapses ignored trees
// (node_modules/, .next/) to one entry each.
let gitIgnored = [];
try {
  gitIgnored = execFileSync("git", ["ls-files", "-z", "--others", "--ignored", "--exclude-standard", "--directory"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\0")
    .filter(Boolean)
    .map((p) => (p.endsWith("/") ? `${p}**` : p));
} catch {
  // No git (an exported tree): lint everything, as before.
}

// --- the cache, and why only HALF the tree gets a per-file one ----------------
// ESLint's per-file cache is sound for a rule that reads one file. eslint.config.mjs turns on
// `parserOptions.projectService` for `**/*.{ts,tsx}` (no-floating-promises): that verdict
// depends on the TYPES of every module a file imports, so a per-file cache would keep a stale
// "this call returns a Promise" after the callee's file changed. So the walk is split in two:
//   - everything that is not .ts/.tsx (no type information): ESLint's own content cache.
//   - .ts/.tsx: a cache whose FILE NAME is a fingerprint of everything the TypeScript program
//     reads (sources, json, lockfile, tsconfigs, generated .next types). Any change to any of
//     them is a different file name, i.e. a cold run for that half. Sound by construction.
// CI (`CI` set) and `--cold` / LINT_RATCHET_COLD=1 skip both and run the old uncached walk.
// Cached results still carry `messages`, so the filesFloor assertion and the tally below read
// them unchanged.
const COLD = Boolean(process.env.CI) || process.argv.includes("--cold") || process.env.LINT_RATCHET_COLD === "1";
const CACHE_DIR = resolve(ROOT, ".lint-ratchet-cache");

const TYPED_INPUT = /\.(?:[cm]?[jt]sx?|json)$/;
function typedFingerprint() {
  const h = createHash("sha256");
  const listed = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\0").filter((p) => p && TYPED_INPUT.test(p)).sort();
  const extra = ["next-env.d.ts", "package-lock.json", "node_modules/.package-lock.json"];
  for (const d of readdirSync(ROOT)) {
    if (!d.startsWith(".next")) continue;
    for (const sub of ["types", "dev/types"]) walk(resolve(ROOT, d, sub), (f) => extra.push(relative(ROOT, f).split(sep).join("/")));
  }
  function walk(dir, fn) {
    let ents;
    try { ents = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (e.isDirectory()) walk(resolve(dir, e.name), fn);
      else fn(resolve(dir, e.name));
    }
  }
  for (const f of [...new Set([...listed, ...extra])].sort()) {
    let buf;
    try { buf = readFileSync(resolve(ROOT, f)); } catch { continue; }
    h.update(f).update("\0").update(buf).update("\0");
  }
  h.update(process.version);
  return h.digest("hex").slice(0, 16);
}

let results;
try {
  const { ESLint } = await import("eslint");
  if (COLD) {
    const eslint = new ESLint({ cwd: ROOT, ignorePatterns: gitIgnored });
    results = await eslint.lintFiles([ROOT]);
  } else {
    mkdirSync(CACHE_DIR, { recursive: true });
    const fp = typedFingerprint();
    const typedCache = resolve(CACHE_DIR, `typed-${fp}`);
    for (const f of readdirSync(CACHE_DIR)) {
      if (f.startsWith("typed-") && f !== `typed-${fp}`) rmSync(resolve(CACHE_DIR, f), { force: true });
    }
    const cached = (cacheLocation, ignorePatterns) =>
      new ESLint({ cwd: ROOT, ignorePatterns, cache: true, cacheStrategy: "content", cacheLocation });
    const untyped = await cached(resolve(CACHE_DIR, "untyped"), [...gitIgnored, "**/*.ts", "**/*.tsx"]).lintFiles([ROOT]);
    const typed = await cached(typedCache, gitIgnored).lintFiles(["**/*.ts", "**/*.tsx"]);
    results = [...untyped, ...typed];
  }
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
