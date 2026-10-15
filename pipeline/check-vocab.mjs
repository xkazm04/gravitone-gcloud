#!/usr/bin/env node
//
// THE VOCABULARY GATE — one cinematography vocabulary, derived everywhere.
//
// WHY THIS EXISTS. The closed vocabularies that make every machine judgement
// in the studio comparable (shot sizes, lens registers, render modes, face
// states) were hand-copied across Python and TypeScript, and the copies
// drifted while one of them claimed to be "verbatim": vocabulary.ts carried
// four style fields style.py did not (medium, particle_fx, finish, focus) and
// style.py carried one it did not (motion_treatment); dojo_study.py kept a shot
// ladder spelled "close"/"extreme-close", which the annotator never emits.
// A hand copy has no way to notice. This gate is the thing that notices.
//
// pipeline/vocab/cinematography.json is the source of truth. Readers:
// pipeline/vocab/vocab.py and lib/vocab/cinematography.ts.
//
// FIVE CHECKS.
//
//   1. THE FILE IS WELL FORMED. Every field has a declared group, a kind, an
//      enum (for enum fields) with no duplicates, a weight and a description;
//      every subset names declared fields only.
//   2. EVERY ENUM VALUE HAS A MEASURED REASON. Each value must be listed in the
//      `values` of at least one `evidence` entry (date, version <= the file's
//      version, finding); an evidence entry may not name a value the enum lacks.
//      Adding an enum value without evidence is a red gate.
//   3. NO RE-DECLARED LITERALS. In the files that must derive from the vocab, a
//      string-array literal whose entries are all values of one declared enum,
//      or all declared field names, is a hand copy and fails. (A literal that
//      is not about the vocabulary — HTML tag names, say — is untouched.)
//   4. NO UNDECLARED NAMES. Every field / subset named in a reader call
//      (vocab.enum("x"), vocabFields("y") ...) anywhere under pipeline/, lib/ or
//      app/ must be declared in the file; and types.ts's OBSERVABLE_FIELDS tuple
//      (a literal only because it must be a TypeScript union) must equal the
//      style_image subset, in order.
//   5. THE PYTHON SCHEMAS DID NOT MOVE. pipeline/vocab/check_snapshot.py compares
//      schema.py / style.py output against the recorded snapshot; changing an
//      enum without bumping `version` is red.
//
// Three outcomes, three exit codes — could-not-run is NOT folded into pass:
//   0  pass
//   1  fail (a finding is printed per line)
//   2  could not run (the vocab file is unreadable, or no python on PATH for
//      check 5)

import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");
const read = (r) => readFileSync(path.join(ROOT, r), "utf8");

/** Files that must build their enums / field selections from the vocab file. */
export const DERIVED_FILES = [
  "pipeline/vlm-probe/schema.py",
  "pipeline/vlm-probe/style.py",
  "lib/foundry/extract/vocabulary.ts",
  "pipeline/foundry/dojo_study.py",
  "pipeline/foundry/dojo_measure.py",
];

// `import.meta.url` ends in .mjs; the gate runs only when invoked directly.
const direct = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

/** Pure: findings for a parsed vocab document. */
export function checkVocabDoc(doc) {
  const out = [];
  if (!Number.isInteger(doc.version) || doc.version < 1) out.push("version must be a positive integer");
  const groups = Object.keys(doc.groups ?? {});
  for (const [name, f] of Object.entries(doc.fields ?? {})) {
    const at = `field "${name}"`;
    if (!groups.includes(f.group)) out.push(`${at}: group "${f.group}" is not declared`);
    if (!["enum", "text", "list"].includes(f.kind)) out.push(`${at}: kind must be enum | text | list`);
    if (typeof f.weight !== "number" || f.weight <= 0) out.push(`${at}: weight must be a positive number`);
    if (typeof f.description !== "string" || !f.description.trim()) out.push(`${at}: description is empty`);
    if (f.kind !== "enum") continue;
    if (!Array.isArray(f.enum) || f.enum.length < 2) {
      out.push(`${at}: an enum needs at least two values`);
      continue;
    }
    if (new Set(f.enum).size !== f.enum.length) out.push(`${at}: enum has duplicate values`);
    if (typeof f.ordinal !== "boolean") out.push(`${at}: ordinal must be true or false`);
    const ev = Array.isArray(f.evidence) ? f.evidence : [];
    ev.forEach((e, i) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date ?? "")) out.push(`${at}: evidence[${i}] needs a YYYY-MM-DD date`);
      if (!Number.isInteger(e.version) || e.version < 1 || e.version > doc.version) out.push(`${at}: evidence[${i}] version must be 1..${doc.version}`);
      if (typeof e.finding !== "string" || !e.finding.trim()) out.push(`${at}: evidence[${i}] has no finding`);
      for (const v of e.values ?? []) if (!f.enum.includes(v)) out.push(`${at}: evidence[${i}] names "${v}", which the enum does not have`);
    });
    const covered = new Set(ev.flatMap((e) => e.values ?? []));
    for (const v of f.enum) if (!covered.has(v)) out.push(`${at}: enum value "${v}" has no evidence entry (the measured reason it exists)`);
  }
  for (const [s, names] of Object.entries(doc.subsets ?? {})) {
    for (const n of names) if (!doc.fields[n]) out.push(`subset "${s}" names "${n}", which no field declares`);
    if (new Set(names).size !== names.length) out.push(`subset "${s}" lists a field twice`);
  }
  return out;
}

/** Pure: hand-copied vocabulary literals in one file's text. */
export function findLiterals(file, text, doc) {
  const out = [];
  const enums = Object.entries(doc.fields).filter(([, f]) => f.kind === "enum").map(([n, f]) => [n, new Set(f.enum)]);
  const names = new Set(Object.keys(doc.fields));
  const re = /\[\s*((?:(["'])[^"'\n]+\2\s*,\s*)+(["'])[^"'\n]+\3\s*,?\s*)\]/g;
  for (const m of text.matchAll(re)) {
    const items = [...m[1].matchAll(/(["'])([^"'\n]+)\1/g)].map((x) => x[2]);
    const line = text.slice(0, m.index).split("\n").length;
    const hit = enums.find(([, vals]) => items.every((i) => vals.has(i)));
    if (hit) out.push(`${file}:${line}: enum literal [${items.join(", ")}] is a hand copy of "${hit[0]}" - read it from the vocab`);
    else if (items.length >= 2 && items.every((i) => names.has(i))) out.push(`${file}:${line}: field-name list [${items.join(", ")}] re-declares a selection - name it as a subset in the vocab file`);
  }
  return out;
}

function walk(dir, exts, acc = []) {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next" || e.startsWith(".")) continue;
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) walk(p, exts, acc);
    else if (exts.includes(path.extname(p))) acc.push(p);
  }
  return acc;
}

/** Pure: field / subset names referenced through the reader APIs that the doc lacks. */
export function findUndeclaredRefs(file, text, doc) {
  const out = [];
  const calls = [
    [/\bvocab\.(?:enum|spec)\(\s*["']([^"']+)["']/g, "field"],
    [/\bvocab\.(?:fields|ordinal|weights|schema_props)\(\s*["']([^"']+)["']/g, "subset"],
    [/\b(?:vocabEnum|vocabField)\(\s*["']([^"']+)["']/g, "field"],
    [/\b(?:vocabFields|subsetEnums|subsetDescriptions|subsetWeights|subsetOrdinals)(?:<[^>]*>)?\(\s*["']([^"']+)["']/g, "subset"],
  ];
  for (const [re, kind] of calls) {
    for (const m of text.matchAll(re)) {
      const ok = kind === "field" ? doc.fields[m[1]] : doc.subsets[m[1]];
      if (!ok) out.push(`${file}:${text.slice(0, m.index).split("\n").length}: ${kind} "${m[1]}" is not declared in the vocab file`);
    }
  }
  return out;
}

function main() {
  let doc;
  try {
    doc = JSON.parse(read("pipeline/vocab/cinematography.json"));
  } catch (e) {
    console.error(`check-vocab: cannot read pipeline/vocab/cinematography.json: ${e.message}`);
    process.exit(2);
  }
  const findings = checkVocabDoc(doc);

  for (const f of DERIVED_FILES) findings.push(...findLiterals(f, read(f), doc));

  for (const dir of ["pipeline", "lib", "app"]) {
    for (const p of walk(path.join(ROOT, dir), [".py", ".ts", ".tsx", ".mts", ".mjs"])) {
      const r = rel(p);
      if (r === "pipeline/check-vocab.mjs") continue;
      findings.push(...findUndeclaredRefs(r, readFileSync(p, "utf8"), doc));
    }
  }

  const tuple = read("lib/foundry/extract/types.ts").match(/export const OBSERVABLE_FIELDS = \[([^\]]*)\] as const/);
  const tupleNames = tuple ? [...tuple[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]) : null;
  if (!tupleNames) findings.push("lib/foundry/extract/types.ts: OBSERVABLE_FIELDS tuple not found");
  else if (tupleNames.join() !== (doc.subsets.style_image ?? []).join()) findings.push(`lib/foundry/extract/types.ts: OBSERVABLE_FIELDS (${tupleNames.join(", ")}) is not the vocab's style_image subset (${(doc.subsets.style_image ?? []).join(", ")})`);

  let ran = false;
  for (const py of ["python3", "python"]) {
    const r = spawnSync(py, [path.join(ROOT, "pipeline/vocab/check_snapshot.py")], { cwd: ROOT, encoding: "utf8" });
    if (r.error) continue;
    // Windows ships App Execution Alias stubs named python3/python that print "Python was not found"
    // and exit 9009 instead of running anything. That is a missing interpreter, not a failed check.
    if (r.status === 9009 || /Python was not found/i.test(r.stdout + r.stderr)) continue;
    ran = true;
    if (r.status !== 0) findings.push(`schema snapshot: ${(r.stdout + r.stderr).trim().split("\n").slice(-3).join(" | ")}`);
    break;
  }
  if (!ran) {
    console.error("check-vocab: no python3/python on PATH - the schema snapshot check could not run");
    process.exit(2);
  }

  if (findings.length) {
    console.error(`check-vocab: ${findings.length} finding(s)`);
    for (const f of findings) console.error("  - " + f);
    process.exit(1);
  }
  const nEnum = Object.values(doc.fields).filter((f) => f.kind === "enum").length;
  console.log(`check-vocab: ok (vocab v${doc.version}, ${Object.keys(doc.fields).length} fields, ${nEnum} enums, ${DERIVED_FILES.length} derived files)`);
}

if (direct) main();
