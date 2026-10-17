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
import { createContext, runInContext } from "node:vm";
import { gzipSync } from "node:zlib";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = resolve(ROOT, process.env.NEXT_DIST_DIR || ".next");
const STATIC = join(DIST, "static");

const die = (code, headline, lines = []) => {
  console.error(`\n${headline}`);
  for (const l of lines) console.error(`  ${l}`);
  console.error("");
  process.exit(code);
};

/**
 * Environment variables that must NEVER appear in browser output. Their names,
 * because a name is what survives a build with an empty environment.
 *
 * DERIVED FROM `.env.example`, NOT RESTATED FROM IT. This used to be a literal
 * array with the comment "Kept in step with .env.example's server-side block" —
 * and it was not, because nothing made it. Measured 2026-08-27: the file declared
 * ELEVENLABS_API_KEY, GOOGLE_IMAGE_MODEL, GOOGLE_IMAGE_SIZE, GOOGLE_VISION_MODEL,
 * IMAGING_ENV and QWEN_BASE_URL, and the array listed none of them. A whole
 * vendor - the music pipeline and its live credential - had been added since the
 * array was written, and the gate that exists to catch a leaked key was not
 * looking for that key at all.
 *
 * The rule in `.env.example` is stated in terms this can read: NEXT_PUBLIC_ is
 * the public prefix and everything else is server-side. So the ground truth
 * enumerates itself, and a vendor added tomorrow is covered by writing it into
 * the file every contributor already edits.
 *
 * EXTRAS carries anything server-only that is NOT written into `.env.example` -
 * there is nothing today, and the slot exists so that a future one is a
 * deliberate line here rather than a silent gap.
 */
const EXTRAS = [];

function serverOnlyVars() {
  const at = join(ROOT, ".env.example");
  if (!existsSync(at))
    die(2, "COULD NOT RUN: .env.example is missing.", [
      "The server-only variable list is derived from it; without it this gate",
      "would search for nothing and report a clean bundle.",
    ]);
  const declared = [
    ...new Set(
      readFileSync(at, "utf8")
        .split(/\r?\n/)
        .map((l) => /^\s*([A-Z][A-Z0-9_]*)\s*=/.exec(l)?.[1])
        .filter(Boolean),
    ),
  ];
  const vars = [...new Set([...declared.filter((v) => !v.startsWith("NEXT_PUBLIC_")), ...EXTRAS])];
  // FAIL LOUD ON A SMALL SET. If a reformat of .env.example ever stops matching
  // the pattern above, this derivation returns a short list or an empty one and
  // every clean verdict below becomes manufactured - the same failure the
  // positive control exists to prevent, one layer up.
  if (vars.length < 8)
    die(2, `COULD NOT RUN: only ${vars.length} server-only variable(s) derived from .env.example.`, [
      "Expected at least 8. Either the file was reformatted out of the",
      "NAME=value shape this reads, or it lost its server-side block.",
      `derived: ${vars.join(", ") || "(none)"}`,
    ]);
  return vars;
}

const SERVER_ONLY_VARS = serverOnlyVars();

/** Strings that exist inside lib/imaging/ and nowhere a browser should reach.
 *  Chosen to be distinctive enough that a coincidental match is not plausible. */
const SERVER_MODULE_FINGERPRINTS = [
  { text: "[imaging] budget ", from: "lib/imaging/budget.ts" }, // note()
  { text: "Imaging spend ceiling reached", from: "lib/imaging/budget.ts" },
  // The source splits this sentence across two template-literal lines ("was " +
  // "called"); the bundler folds them but a source read does not, so the
  // fingerprint stops at the literal's edge. Still nine words nobody else says.
  { text: "Refused before any vendor was", from: "lib/imaging/budget.ts" },
  { text: "[api] rate ", from: "lib/apiAuth.ts" }, // rateNote()
  // ── the reasoning seam (lib/text/, 2026-08-27) ────────────────────────────
  // lib/text/ spawns processes and holds a metered key, so it is server-only for
  // the same reasons lib/imaging/ is — and it is reached from route handlers
  // that sit beside client components, which is exactly the shape that leaks.
  // These four are distinctive enough that a coincidental match is not
  // plausible, and each comes from a different file so that importing any one
  // corner of the seam trips the gate.
  // formatTurn() builds the line from the bare literal "[text]" and joins with
  // spaces at runtime, so "[text] " (with the space) was never in the source
  // OR in any chunk — the source assertion below caught it on its first run,
  // 2026-09-04: this leg of the gate had hunted nothing since 2026-08-27.
  { text: "[text]", from: "lib/text/log.ts" }, // formatTurn() — every turn's log line
  { text: "authenticates without an API key; keyFor()", from: "lib/text/env.ts" },
  { text: "No reasoning engine could serve this", from: "lib/text/router.ts" }, // bottom of the ladder
  { text: "is a managed serverless platform, which has no local binary", from: "lib/deployment.ts" },
];

/**
 * A FINGERPRINT IS A DETECTOR KEY, AND A KEY NOBODY VERIFIES IS RENAMEABLE.
 *
 * Every string above is a claim that a particular source file still contains
 * it. Reword the log line in lib/imaging/budget.ts and the bundle gate keeps
 * passing — it is now hunting a sentence that exists nowhere, and the module it
 * was guarding can reach the browser unnoticed. Nothing made the list honest;
 * measured 2026-09-04, none of the ten had ever been checked against source.
 *
 * So each fingerprint is asserted PRESENT in the file it names before it is
 * asserted ABSENT from the chunks — the same shape as the positive control,
 * one layer up. Comments are stripped first: a file that only *talks* about
 * the string in a comment would otherwise satisfy this (registry
 * quality-gates/renameable-detector-keys; gate-liveness).
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .filter((l) => !l.trimStart().startsWith("//"))
    .join("\n");
}

function assertFingerprintsAtSource(list, what) {
  const gone = [];
  for (const { text, from } of list) {
    const at = join(ROOT, from);
    if (!existsSync(at)) {
      gone.push(`${JSON.stringify(text)} — ${from} does not exist`);
      continue;
    }
    if (!stripComments(readFileSync(at, "utf8")).includes(text))
      gone.push(`${JSON.stringify(text)} — not in the code of ${from} (comments excluded)`);
  }
  if (gone.length)
    die(2, `COULD NOT RUN: ${gone.length} ${what} fingerprint(s) no longer exist at source.`, [
      ...gone,
      "",
      "A fingerprint that is not in its source file cannot be in a bundle either,",
      "so its clean verdict is manufactured. Either the string was reworded — point",
      "the fingerprint at the new wording — or the module moved. Do not delete the",
      "entry: pick another string from the same file that a browser must never see.",
    ]);
}

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
/* Each entry carries the fingerprint, the file it must still exist in, and what
 * its presence in a bundle would mean. `from` is what assertFingerprintsAtSource
 * reads, so a reworded string is a red gate rather than a manufactured pass;
 * `what` exists because there are now two different seams in this list with two
 * different causes, and a finding that names the wrong one sends the reader to
 * the wrong file. */
const TEST_ONLY_FINGERPRINTS = [
  // its key on `window`
  { text: "__gravitoneHarness", from: "components/ui/HarnessBridge.tsx", what: "the LIVE-HARNESS CONTROL SURFACE" },
  // the bridge's console banner
  { text: "gravitone control surface installed", from: "components/ui/HarnessBridge.tsx", what: "the LIVE-HARNESS CONTROL SURFACE" },
  // The DevInspector overlay (app/_dev-inspector/), a developer tool that must
  // never reach a user's browser. Its NODE_ENV gate in app/layout.tsx stops it
  // running and NOT shipping: a "use client" module imported by a Server
  // Component is emitted as a client entry point whether or not a branch reaches
  // it — measured 2026-08-30, the minified overlay was in a browser chunk. What
  // keeps it out is the production `resolveAlias` in next.config.ts, which swaps
  // the module for a null-rendering server component. An alias is a config line,
  // and a config line is exactly the kind of thing that silently stops matching;
  // this string is the attribute the overlay marks its own DOM with, so it is
  // present in the module and nowhere else in the app.
  { text: "data-devinspector", from: "app/_dev-inspector/DevInspector.tsx", what: "the DEVINSPECTOR OVERLAY" },
];

assertFingerprintsAtSource(SERVER_MODULE_FINGERPRINTS, "server-module");
assertFingerprintsAtSource(TEST_ONLY_FINGERPRINTS, "test-only");

/** Something we KNOW is in browser output. If this is not found, the gate is not
 *  reading the browser bundle and every clean verdict below is manufactured.
 *
 *  It was "--gt-" (the v1 design tokens) until Phase 6 wave C, and that string was
 *  only ever in a CHUNK because v1 client components spelled `var(--gt-*)` in their
 *  class names - <GravitoneTokens> itself is a server component and ships in the
 *  HTML, not in a chunk. With StudioFrame and the kit gone nothing guarantees it. The
 *  control is now a sentence the (studio) shell's client root must carry to every
 *  signed-in page; it is held at source like the fingerprints above, so a rewording
 *  is a loud exit 2 rather than a control that silently stopped controlling. */
const POSITIVE_CONTROL = "useShell outside the (studio) shell";
assertFingerprintsAtSource([{ text: POSITIVE_CONTROL, from: "app/(studio)/_shell/Providers.tsx" }], "positive-control");

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

  for (const { text: f, from } of SERVER_MODULE_FINGERPRINTS)
    if (text.includes(f))
      findings.push(`${rel}\n      contains ${JSON.stringify(f)} — ${from} was bundled for the browser`);

  for (const { text: f, what } of TEST_ONLY_FINGERPRINTS)
    if (text.includes(f))
      findings.push(`${rel}\n      contains ${JSON.stringify(f)} — ${what} reached a shipped build`);
}

// THE POSITIVE CONTROL, checked before the verdict. "Found nothing" only means
// something once we have proved this can find anything at all.
if (!controlSeen)
  die(2, "COULD NOT RUN: the positive control was not found in any browser chunk.", [
    `looked for ${JSON.stringify(POSITIVE_CONTROL)} across ${files.length} file(s), ${bytes} bytes`,
    "That string is app/(studio)/_shell/Providers.tsx's, and the (studio) shell ships",
    "it to every signed-in page. Its absence means this gate is reading the wrong files, so a",
    "clean result would be manufactured rather than earned. Do not treat this as a",
    "pass. If the tokens genuinely moved, update POSITIVE_CONTROL — deliberately.",
  ]);

// ── FIRST-LOAD JS PER (studio) ROUTE (plan §9.5: a count, never a timing) ──────────
// The route list is the build's own app-path-routes-manifest, never a hand list; a route's
// first load is what its HTML names: the framework's rootMainFiles plus every segment
// entry in its client-reference manifest (measured against a prerendered page's <script>
// tags, 2026-10-15). Polyfills are `nomodule` and skipped. COUNTED: gzip level 9 bytes
// (transfer), deterministic per Node zlib. Absent, stale or reshaped numbers exit 2, never
// pass (page-load-pipeline/field-measured-load-budget: a byte gate must see the build it
// judges; a new route enters with a ceiling). The ROOT segments (app/layout.tsx: fonts,
// Firebase's auth provider the landing and the shell's handoff both read, the announcer, the
// dev harness) are REPORTED, not gated. Until Phase 6 wave C they were v1's root and the
// debt this line promised would retire; the cutover slimmed them to what both worlds share
// (no JobsProvider stream, no Almanac tokens, no unhandled-rejection bridge), so the number
// is now the shared root's cost, still reported so a regression in it is visible.
const STUDIO = "(studio)";
const readJson = (at, what) => existsSync(at) ? JSON.parse(readFileSync(at, "utf8")) : die(2, `COULD NOT RUN: ${what} is missing (${at}).`, ["The per-route budget reads it; without it there is no number to judge, and that is not a pass."]);
const gzBytes = new Map();
const gz = (f) => {
  if (!gzBytes.has(f)) {
    const at = join(DIST, f);
    if (!existsSync(at)) die(2, `COULD NOT RUN: ${f} is named by a manifest and absent from ${DIST}.`, ["The manifests and the chunks come from different builds; a sum over them describes neither."]);
    gzBytes.set(f, gzipSync(readFileSync(at), { level: 9 }).length);
  }
  return gzBytes.get(f);
};
const sum = (set) => [...set].reduce((n, f) => n + gz(f), 0);
const rootMain = readJson(join(DIST, "build-manifest.json"), "build-manifest.json").rootMainFiles ?? [];
const routes = [];
for (const [entry, route] of Object.entries(readJson(join(DIST, "app-path-routes-manifest.json"), "app-path-routes-manifest.json"))) {
  if (!entry.startsWith(`/${STUDIO}/`) || !entry.endsWith("/page")) continue;
  const ctx = createContext({});
  runInContext(readFileSync(join(DIST, "server", "app", `${entry.slice(1)}_client-reference-manifest.js`), "utf8"), ctx);
  const segs = ctx.__RSC_MANIFEST?.[entry]?.entryJSFiles ?? {};
  if (!segs[`[project]/app/${STUDIO}/layout`])
    die(2, `COULD NOT RUN: ${route}'s client manifest names no ${STUDIO} layout entry.`, ["The manifest shape moved under this reader; a sum over it would be manufactured."]);
  const first = new Set(rootMain);
  const root = new Set();
  for (const [seg, list] of Object.entries(segs))
    for (const f of list) {
      first.add(f);
      if (!seg.startsWith(`[project]/app/${STUDIO}/`) && !rootMain.includes(f)) root.add(f);
    }
  routes.push({ route, bytes: sum(first), root: sum(root) });
}
if (!routes.length) die(2, `COULD NOT RUN: the build lists no ${STUDIO} page.`, ["/kit at least must exist; an empty walk is a moved manifest, not a smaller app."]);
const budget = readJson(join(ROOT, "pipeline", "bundle-budget.json"), "pipeline/bundle-budget.json");
if (typeof budget.routes !== "object" || typeof budget.slackPct !== "number") die(2, "COULD NOT RUN: pipeline/bundle-budget.json lacks `routes` or `slackPct`.");
const over = [];
for (const { route, bytes, root } of routes.sort((a, b) => a.route.localeCompare(b.route))) {
  const cap = budget.routes[route];
  const note = cap === undefined ? "NO BUDGET" : `budget ${cap} (${bytes - cap >= 0 ? "+" : ""}${bytes - cap})`;
  console.log(`first-load ${route}: ${bytes} B gzip, ${note}; of which root-layout segments ${root} B (reported)`);
  if (cap === undefined) over.push(`${route} has no entry in pipeline/bundle-budget.json (measured ${bytes} B); a new route enters with a ceiling`);
  else if (bytes > cap * (1 + budget.slackPct / 100)) over.push(`${route}: ${bytes} B is over its ${cap} B budget by more than ${budget.slackPct}%`);
  else if (bytes < cap * (1 - budget.slackPct / 100)) console.log(`  ${route} sits ${cap - bytes} B under its budget: lower the entry to lock the win in.`);
}
for (const route of Object.keys(budget.routes)) if (!routes.some((r) => r.route === route)) over.push(`pipeline/bundle-budget.json names ${route}, which the build no longer has; delete the entry`);
if (over.length && !findings.length)
  die(1, `BUNDLE BUDGET: ${over.length} first-load budget finding(s) over ${routes.length} ${STUDIO} route(s).`, [...over, "", "Cut the import that grew it, or raise the ceiling with the reason in the change's description."]);
findings.push(...over.map((o) => `FIRST-LOAD BUDGET: ${o}`));

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
    "",
    "If the finding is the DEVINSPECTOR OVERLAY, the cause is a third one: a",
    "`use client` module imported by a Server Component ships whether or not the",
    "branch that renders it is reachable, so app/layout.tsx's NODE_ENV guard was",
    "never what kept it out. What keeps it out is the production `resolveAlias` in",
    "next.config.ts, which swaps the module for app/_dev-inspector/DevInspectorAbsent.tsx.",
    "Check that alias still matches the specifier layout.tsx imports.",
  ]);

console.log(
  `bundle OK — ${files.length} browser chunk(s), ${(bytes / 1024).toFixed(0)}KB scanned; ` +
    `positive control found; ${SERVER_ONLY_VARS.length} server-only var name(s), ` +
    `${liveSecrets.length} live value(s), ${SERVER_MODULE_FINGERPRINTS.length} module ` +
    `fingerprint(s) and ${TEST_ONLY_FINGERPRINTS.length} test-only seam(s) all absent; ` +
    `${routes.length} ${STUDIO} route(s) within first-load budget.`,
);
