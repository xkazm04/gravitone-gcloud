// THE LESSONS-PROMPT REGRESSION - the lessons prompt's rules cannot silently fall out.
//
//   npx tsx pipeline/lessons-regression.mts
//   npx tsx pipeline/lessons-regression.mts --dir <folder holding a copy of LESSONS-PROMPT.md>
//
// OFFLINE: no model is called. Two halves, exit 1 if either fails:
//
//   1. PINS. Every rule pipeline/LESSONS-PROMPT.md carries is pinned by its `standard:` tag AND by the sentence that states it.
//   2. CASES. lib/producers/productionLessons.ts `proposalsOf`, the door every seat answer passes before it becomes a
//      proposal, driven with fixed answers: the half of the rule a model cannot talk its way past.
//
// `--dir` exists so the pins can be proven to bite: copy the prompt, delete one rule from the copy, run against it.

import "./lib-hooks.mts";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dirArg = process.argv.indexOf("--dir");
const DIR = dirArg > 0 && process.argv[dirArg + 1] ? path.resolve(process.argv[dirArg + 1] ?? "") : path.join(ROOT, "pipeline");

const { proposalsOf } = await import("../lib/producers/productionLessons.ts");

const failures: string[] = [];

/* ── 1. pins ─────────────────────────────────────────────────────────────── */

const doc = fs.readFileSync(path.join(DIR, "LESSONS-PROMPT.md"), "utf8").replace(/\s+/g, " ");
let pins = 0;
const pin = (tag: string, ...rules: RegExp[]): void => {
  pins++;
  if (!doc.includes(`standard: ${tag}`)) failures.push(`LESSONS-PROMPT.md: the tag "standard: ${tag}" is gone`);
  for (const r of rules) if (!r.test(doc)) failures.push(`LESSONS-PROMPT.md: ${tag}: the rule ${r} is gone`);
};

pin("three-dimensions", /`beats`/, /`art-style`/, /`technique`/);
pin("only-the-evidence", /Do not infer a craft claim the evidence does not state or show/);
pin("names-its-evidence", /`drawnFrom` lists the `ref` of every evidence item/, /only refs that appear in `evidence`/);
pin("nothing-is-a-valid-answer", /answer that dimension with `nothing`/);

/* ── 2. cases ────────────────────────────────────────────────────────────── */

const E = [{ ref: "take:take-1", words: "take-1 proven" }];
const text = "A plain lesson someone can plan with.";

type Case = readonly [string, Parameters<typeof proposalsOf>[0], boolean];
const CASES: readonly Case[] = [
  ["a lesson that cites the record", { lessons: [{ dimension: "beats", text, drawnFrom: ["take:take-1"] }] }, true],
  ["nothing is a valid answer", { lessons: [{ dimension: "art-style", nothing: "no record of the look" }] }, true],
  ["a citation outside the record is refused", { lessons: [{ dimension: "beats", text, drawnFrom: ["take:other"] }] }, false],
  ["a lesson citing nothing is refused", { lessons: [{ dimension: "beats", text, drawnFrom: [] }] }, false],
  ["neither words nor a reason is refused", { lessons: [{ dimension: "technique" }] }, false],
  ["a dimension twice is refused", { lessons: [{ dimension: "beats", text, drawnFrom: ["take:take-1"] }, { dimension: "beats", nothing: "x" }] }, false],
];

for (const [name, answer, expected] of CASES) {
  const r = proposalsOf(answer, E);
  if (r.ok !== expected) failures.push(`case "${name}": expected ${expected ? "ok" : "refusal"}, got ${r.ok ? "ok" : r.error.message}`);
}

if (failures.length > 0) {
  console.error(`LESSONS REGRESSION: ${failures.length} failure(s)\n${failures.join("\n")}`);
  process.exit(1);
}
console.log(`lessons regression ok: ${pins} pins, ${CASES.length} cases`);
