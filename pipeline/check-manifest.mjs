#!/usr/bin/env node
//
// The manifest gate. Checks `.ai/manifest.yaml` against `.ai/SPEC.md`, the
// contract that ships in this repository.
//
// A RUNNER, NOT THE DEFINITION. `.ai/SPEC.md` is the definition, and it says so:
// any implementation performing the checks it lists is conformant. Every check
// below carries its spec id (R1, C1, P1, …) so the two can be read side by side,
// and if a check here has no id in the spec, the spec is what needs the edit.
//
// Three outcomes, three exit codes — could-not-run is NOT folded into pass:
//   0  pass
//   1  fail          a check in the spec did not hold
//   2  could-not-run the manifest is missing, or the parse found so little that
//                    a green verdict would mean nothing
//
// Portable by construction: the repository root resolves from THIS FILE's own
// location, never from the current working directory.
//
// The parser below is deliberately a SUBSET parser, and the spec defines that
// subset rather than the parser defining itself. Writing it here rather than
// adding a YAML dependency is a real trade: it means the manifest must stay
// inside the documented subset, and it means this gate has no supply chain of
// its own.

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = resolve(ROOT, ".ai/manifest.yaml");
const SPEC = resolve(ROOT, ".ai/SPEC.md");

const die = (code, headline, lines = []) => {
  console.error(`\n${headline}`);
  for (const l of lines) console.error(`  ${l}`);
  console.error("");
  process.exit(code);
};

if (!existsSync(MANIFEST)) die(2, "COULD NOT RUN: .ai/manifest.yaml is not there.", [MANIFEST]);
if (!existsSync(SPEC))
  die(2, "COULD NOT RUN: .ai/SPEC.md is not there — the contract must ship with the artifact.", [
    SPEC,
    "Without it the manifest is an artifact whose definition lives somewhere else,",
    "which is the exact defect the spec was written to close.",
  ]);

const raw = readFileSync(MANIFEST, "utf8");

/* ── the subset parser ─────────────────────────────────────────────────────
 * Two-space indent; scalars, block mappings, inline mappings and inline
 * sequences. No anchors, aliases, block sequences of mappings or multi-doc
 * streams — see .ai/SPEC.md § Format. */

function stripComment(line) {
  let out = "";
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      out += c;
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      out += c;
      continue;
    }
    if (c === "#") break;
    out += c;
  }
  return out.trimEnd();
}

function scalar(text) {
  const t = text.trim();
  if (!t) return "";
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))
    return t.slice(1, -1);
  if (t === "true") return true;
  if (t === "false") return false;
  if (t === "null" || t === "~") return null;
  if (t.startsWith("[") && t.endsWith("]"))
    return t
      .slice(1, -1)
      .split(",")
      .map((s) => scalar(s))
      .filter((s) => s !== "");
  if (t.startsWith("{") && t.endsWith("}")) {
    const obj = {};
    // Split on commas that are not inside quotes.
    let depth = 0;
    let quote = null;
    let cur = "";
    const parts = [];
    for (const c of t.slice(1, -1)) {
      if (quote) {
        cur += c;
        if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'") quote = c;
      if (c === "{" || c === "[") depth++;
      if (c === "}" || c === "]") depth--;
      if (c === "," && depth === 0) {
        parts.push(cur);
        cur = "";
        continue;
      }
      cur += c;
    }
    if (cur.trim()) parts.push(cur);
    for (const p of parts) {
      const i = p.indexOf(":");
      if (i === -1) continue;
      obj[p.slice(0, i).trim()] = scalar(p.slice(i + 1));
    }
    return obj;
  }
  return t;
}

function parse(text) {
  const root = {};
  /** stack of [indent, container] */
  const stack = [[-1, root]];
  let lines = 0;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = stripComment(rawLine);
    if (!line.trim()) continue;
    lines++;
    const indent = line.length - line.trimStart().length;
    const body = line.trim();
    if (body.startsWith("- ")) {
      // Block sequence of scalars, the one sequence form the subset allows.
      const [, container] = stack[stack.length - 1];
      const lastKey = container.__lastKey;
      if (lastKey) {
        if (!Array.isArray(container[lastKey])) container[lastKey] = [];
        container[lastKey].push(scalar(body.slice(2)));
      }
      continue;
    }
    const i = body.indexOf(":");
    if (i === -1) continue;
    const key = body.slice(0, i).trim();
    const rest = body.slice(i + 1).trim();
    while (stack.length > 1 && indent <= stack[stack.length - 1][0]) stack.pop();
    const [, container] = stack[stack.length - 1];
    if (rest === "") {
      const child = {};
      container[key] = child;
      container.__lastKey = key;
      stack.push([indent, child]);
    } else {
      container[key] = scalar(rest);
      container.__lastKey = key;
    }
  }
  return { doc: root, lines };
}

const { doc, lines } = parse(raw);
const clean = (o) => {
  if (o && typeof o === "object" && !Array.isArray(o)) {
    delete o.__lastKey;
    for (const v of Object.values(o)) clean(v);
  }
  return o;
};
clean(doc);

/* ── I1: assert the instrument before the result ─────────────────────────── */
const REQUIRED_TOP = ["schema", "schemaVersion", "repo", "capabilities", "paths", "boundaries"];
const seenTop = REQUIRED_TOP.filter((k) => k in doc);
if (lines < 10 || seenTop.length === 0)
  die(2, "COULD NOT RUN: the manifest parsed to almost nothing — the instrument is broken.", [
    `read ${lines} non-empty line(s); found ${seenTop.length} of ${REQUIRED_TOP.length} required top-level keys`,
    "Either the file is outside the YAML subset .ai/SPEC.md § Format defines,",
    "or this parser is. Fix one of the two; a clean exit here would mean nothing.",
  ]);

/* ── the checks ──────────────────────────────────────────────────────────── */
const failures = [];
const fail = (id, msg) => failures.push(`${id}  ${msg}`);

// R1
for (const k of REQUIRED_TOP) if (!(k in doc)) fail("R1", `required field \`${k}\` is missing`);
for (const k of ["name", "purpose"])
  if (!doc.repo || !doc.repo[k]) fail("R1", `required field \`repo.${k}\` is missing`);

// R2 / R3
if (doc.schema !== "ai-manifest")
  fail("R2", `\`schema\` must be exactly "ai-manifest", found ${JSON.stringify(doc.schema)}`);
if (!/^\d+\.\d+\.\d+$/.test(String(doc.schemaVersion)))
  fail("R3", `\`schemaVersion\` must be semver, found ${JSON.stringify(doc.schemaVersion)}`);

// C1 / C2
const caps = doc.capabilities ?? {};
const capNames = Object.keys(caps);
if (capNames.length === 0) fail("C2", "no capabilities are declared");
const scripts = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")).scripts ?? {};
for (const [name, entry] of Object.entries(caps)) {
  const command = typeof entry === "object" && entry ? entry.command : undefined;
  if (!command) {
    fail("C1", `capability \`${name}\` has no \`command\``);
    continue;
  }
  const m = /^npm\s+(?:run\s+)?([\w:@./-]+)/.exec(String(command));
  if (!m) continue; // not an npm-shaped command; C1 does not apply
  const script = m[1];
  if (["ci", "install", "test", "start"].includes(script) && script in scripts) continue;
  if (!(script in scripts))
    fail(
      "C1",
      `capability \`${name}\` runs "${command}" but package.json has no \`${script}\` script`,
    );
}

// P1
const paths = doc.paths ?? {};
const pathCount = Object.keys(paths).length;
for (const [name, p] of Object.entries(paths)) {
  if (typeof p !== "string" || !p) {
    fail("P1", `\`paths.${name}\` is not a path`);
    continue;
  }
  if (!existsSync(resolve(ROOT, p)))
    fail("P1", `\`paths.${name}\` points at "${p}", which does not exist in this repository`);
}

// B1
const never = doc.boundaries?.neverTouch;
if (!Array.isArray(never) || never.length === 0)
  fail("B1", "`boundaries.neverTouch` is absent or empty");

// B2 — a manifest is committed; a key in it is a leaked key.
const CREDENTIAL = /[A-Za-z0-9+/_-]{32,}={0,2}/;
const walk = (node, trail) => {
  if (typeof node === "string") {
    if (node.includes("BEGIN PRIVATE KEY")) fail("B2", `${trail} contains a private key block`);
    // Skip anything with whitespace: prose cannot be a credential, and every
    // long value in this manifest is prose.
    else if (!/\s/.test(node) && CREDENTIAL.test(node) && !node.includes("/") && !node.includes("."))
      fail("B2", `${trail} looks like a credential: ${node.slice(0, 12)}…`);
    return;
  }
  if (Array.isArray(node)) return node.forEach((v, i) => walk(v, `${trail}[${i}]`));
  if (node && typeof node === "object")
    for (const [k, v] of Object.entries(node)) walk(v, trail ? `${trail}.${k}` : k);
};
walk(doc, "");

/* ── verdict ─────────────────────────────────────────────────────────────── */
if (failures.length)
  die(1, `MANIFEST: ${failures.length} check(s) failed against .ai/SPEC.md.`, failures);

console.log(
  `manifest OK — ${lines} lines, ${capNames.length} capabilit(ies), ${pathCount} path(s), ` +
    `${Array.isArray(never) ? never.length : 0} neverTouch entr(ies); checked against .ai/SPEC.md.`,
);
