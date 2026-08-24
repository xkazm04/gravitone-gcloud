#!/usr/bin/env node
//
// THE BROWSER/CREDENTIAL BOUNDARY GATE — the one check that reads what actually
// shipped.
//
// WHY THIS EXISTS. `.env.example` states the rule beautifully: the three
// NEXT_PUBLIC_FIREBASE_* variables are public by design, and everything else —
// the per-vendor imaging keys, the access secret — is server-side and "none may
// ever be" prefixed. lib/imaging/ honours it, the routes honour it, and NOTHING
// READ THE BUILT BUNDLE. The rule was prose.
//
// And prose is not enough here, because the failure has no source line. A module
// imported by BOTH a route handler and a client component is inlined into browser
// output by the bundler, silently, with nothing in any file saying so. One stray
// `import { keyFor } from "@/lib/imaging/env"` in a component is all it takes, and
// the reviewer sees an import that looks exactly like every other import.
//
// WHAT IT CHECKS. Every JavaScript chunk the build emitted for the browser, for:
//
//   1. SERVER-ONLY ENVIRONMENT VARIABLE NAMES. Next inlines `process.env.X` at
//      build time for client code. If `GOOGLE_AI_API_KEY` appears as a literal in
//      a browser chunk, the module that reads it was bundled for the browser —
//      whether or not a value was present when the build ran. The NAME is the
//      signal, and it is the one that works in CI with an empty environment.
//   2. LIVE SECRET VALUES, when the environment has any. On a developer machine
//      with a populated .env.local this is the direct check: the actual key, in
//      the actual output. In CI it finds nothing, and that is not a pass — see
//      the instrument assertion below.
//   3. FINGERPRINTS OF THE SERVER-ONLY MODULES themselves — distinctive string
//      literals that exist in lib/imaging/ and nowhere else. This catches the
//      import even when the variable read is not inlined.
//
// THREE OUTCOMES, THREE EXIT CODES:
//   0  pass          chunks were read, the positive control was found, no leak
//   1  fail          something server-only is in browser output
//   2  could-not-run no build to read, no chunks, or the POSITIVE CONTROL was
//                    missing — which means this gate is searching the wrong files
//                    and its clean verdict would be manufactured
//
// The positive control is the whole reason this is a gate rather than a decoration.
// A checker that greps an empty or wrong directory reports "no leaks found" in a
// voice indistinguishable from success. So it first proves it can find something
// it KNOWS is in the browser bundle, and treats not finding it as fatal.
//
// Portable by construction: the repository root resolves from THIS FILE's own
// location, never from the current working directory.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = resolve(ROOT, process.env.NEXT_DIST_DIR || ".next");
const STATIC = join(DIST, "static");

const die = (code, headline, lines = []) => {
  console.error(`\n${headline}`);
  for (const l of lines) console.error(`  ${l}`);
  console.error("");
  process.exit(code);
};

/** Environment variables that must NEVER appear in browser output. Their names,
 *  because a name is what survives a build with an empty environment. Kept in
 *  step with .env.example's server-side block and lib/imaging/env.ts. */
const SERVER_ONLY_VARS = [
  "GOOGLE_AI_API_KEY",
  "LEONARDO_API_KEY",
  "QWEN_API_KEY",
  "IMAGING_ACCESS_SECRET",
  "IMAGING_BUDGET_USD_PER_WINDOW",
  "IMAGING_BUDGET_WINDOW_MS",
  "IMAGING_RATE_CAPACITY",
  "IMAGING_RATE_WINDOW_SEC",
  "IMAGING_RATE_KEY_CAP",
];

/** Strings that exist inside lib/imaging/ and nowhere a browser should reach.
 *  Chosen to be distinctive enough that a coincidental match is not plausible. */
const SERVER_MODULE_FINGERPRINTS = [
  "[imaging] budget ", // lib/imaging/budget.ts note()
  "Imaging spend ceiling reached", // lib/imaging/budget.ts
  "Refused before any vendor was called", // lib/imaging/budget.ts
  "[api] rate ", // lib/apiAuth.ts rateNote()
];

/**
 * TEST-ONLY SEAMS THAT MUST NOT REACH A SHIPPED BUILD.
 *
 * The live-app harness drives the gated studio through a control surface
 * installed on `window` (components/ui/HarnessBridge.tsx). Its gate is a
 * BUILD-TIME switch — `process.env.NODE_ENV === "production"` as the first line
 * of the effect, so webpack inlines the literal, the body becomes unreachable
 * and the minifier drops it along with every string in it. That claim is exactly
 * the kind of thing that is true when written and quietly false three refactors
 * later: move the implementation into an imported module, or gate on the
 * imported DEV_AUTH constant instead of the inline expression, and the surface
 * ships as reachable code with nothing in any diff saying so.
 *
 * So it is checked HERE, in the emitted output, which is the only place absence
 * is a fact. MEASURED 2026-08-24 on the real build: 0 chunks contain either
 * string, while `dev-automation-user` (lib/devAuth.ts's exported fixture) is
 * still present in 1 — the distinction NOTES.md drew between "behaviour is
 * gated" and "nothing ships" is real, and this list is on the second side of it.
 *
 * `tests/golden-path/harness-gate.probe.spec.ts` holds the source-level half:
 * that the guards are still inline, still first, and that the vocabulary module
 * stays types-only so these strings have nowhere else to come from.
 */
const TEST_ONLY_FINGERPRINTS = [
  "__gravitoneHarness", // the control surface's key on `window`
  "gravitone control surface installed", // the bridge's console banner
];

/** Something we KNOW is in browser output. If this is not found, the gate is not
 *  reading the browser bundle and every clean verdict below is manufactured. */
const POSITIVE_CONTROL = "--gt-"; // the design tokens, published by GravitoneTokens

if (!existsSync(STATIC))
  die(2, "COULD NOT RUN: there is no build to inspect.", [
    `expected: ${STATIC}`,
    "Run `npm run build` first. This gate reads what SHIPPED; it cannot be",
    "answered from source, which is the entire reason it exists.",
  ]);

/** Every .js the browser can fetch. */
function chunks(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...chunks(p));
    else if (name.endsWith(".js")) out.push(p);
  }
  return out;
}

const files = chunks(STATIC);
if (files.length < 5)
  die(2, "COULD NOT RUN: the browser chunk walk came back short — the instrument is broken.", [
    `found ${files.length} .js file(s) under ${STATIC}`,
    "A near-empty walk is the signature of a moved output directory, never of a",
    "small application.",
  ]);

/** Live values worth hunting for, when the environment has any. Short or common
 *  values are skipped: a 4-character secret would match half the alphabet. */
const liveSecrets = SERVER_ONLY_VARS.map((v) => [v, process.env[v]]).filter(
  ([, val]) => typeof val === "string" && val.trim().length >= 12,
);

/**
 * Match a server-only variable NAME, but not the same name wearing a
 * `NEXT_PUBLIC_` prefix.
 *
 * MEASURED FALSE POSITIVE, 2026-08-24, on this gate's very first run: a plain
 * substring search reported `IMAGING_ACCESS_SECRET` in two browser chunks. It was
 * `NEXT_PUBLIC_IMAGING_ACCESS_SECRET` — the browser's copy, which is public BY
 * DESIGN (see .env.example: a browser can only present a secret that shipped in
 * its bundle, so that one is deliberately not a secret) and which happens to end
 * with the server-only name.
 *
 * The distinction is exactly the rule this gate enforces, so getting it wrong
 * here would have been the worst possible place: a gate that cries wolf about the
 * one variable the design says is fine teaches everyone to ignore it, and the day
 * it reports a real leak nobody looks.
 *
 * The lookbehind refuses any preceding identifier character, so a prefixed
 * variant never matches and a bare one always does.
 */
const serverVarPattern = (v) => new RegExp(`(?<![A-Za-z0-9_])${v}(?![A-Za-z0-9_])`);

const findings = [];
let controlSeen = false;
let bytes = 0;

for (const file of files) {
  const text = readFileSync(file, "utf8");
  bytes += text.length;
  const rel = file.slice(ROOT.length + 1);
  if (!controlSeen && text.includes(POSITIVE_CONTROL)) controlSeen = true;

  for (const v of SERVER_ONLY_VARS)
    if (serverVarPattern(v).test(text))
      findings.push(`${rel}\n      contains the server-only variable NAME ${v}`);

  for (const [name, val] of liveSecrets)
    if (text.includes(val.trim()))
      findings.push(`${rel}\n      contains the LIVE VALUE of ${name} — rotate that key now`);

  for (const f of SERVER_MODULE_FINGERPRINTS)
    if (text.includes(f))
      findings.push(`${rel}\n      contains ${JSON.stringify(f)} — a server-only module was bundled`);

  for (const f of TEST_ONLY_FINGERPRINTS)
    if (text.includes(f))
      findings.push(
        `${rel}\n      contains ${JSON.stringify(f)} — the LIVE-HARNESS CONTROL SURFACE ` +
          "reached a shipped build",
      );
}

// THE POSITIVE CONTROL, checked before the verdict. "Found nothing" only means
// something once we have proved this can find anything at all.
if (!controlSeen)
  die(2, "COULD NOT RUN: the positive control was not found in any browser chunk.", [
    `looked for ${JSON.stringify(POSITIVE_CONTROL)} across ${files.length} file(s), ${bytes} bytes`,
    "That string is published by components/ui/GravitoneTokens and must be in the",
    "client bundle. Its absence means this gate is reading the wrong files, so a",
    "clean result would be manufactured rather than earned. Do not treat this as a",
    "pass. If the tokens genuinely moved, update POSITIVE_CONTROL — deliberately.",
  ]);

if (findings.length)
  die(1, `BUNDLE: ${findings.length} artefact(s) that must not ship reached browser output.`, [
    ...findings,
    "",
    "A module imported by BOTH a route and a client component is inlined into the",
    "browser bundle with no line of source saying so. Find the import that crosses",
    "the boundary — it will look exactly like every other import — and move the",
    "work behind app/api/imaging/*, which is the one trust boundary this app has.",
    "",
    "If the finding is the LIVE-HARNESS CONTROL SURFACE, the cause is different and",
    "so is the fix: its gate is a build-time switch that only works while the guard",
    "is the INLINE `process.env.NODE_ENV` expression and the whole implementation",
    "sits inside that one function. Gating on the imported DEV_AUTH constant, or",
    "moving the body into a module the bridge calls, defeats it. See",
    "components/ui/HarnessBridge.tsx and tests/golden-path/harness-gate.probe.spec.ts.",
  ]);

console.log(
  `bundle OK — ${files.length} browser chunk(s), ${(bytes / 1024).toFixed(0)}KB scanned; ` +
    `positive control found; ${SERVER_ONLY_VARS.length} server-only var name(s), ` +
    `${liveSecrets.length} live value(s), ${SERVER_MODULE_FINGERPRINTS.length} module ` +
    `fingerprint(s) and ${TEST_ONLY_FINGERPRINTS.length} test-only seam(s) all absent.`,
);
