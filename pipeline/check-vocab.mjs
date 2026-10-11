#!/usr/bin/env node
//
// THE VOCABULARY DRIFT GATE (stage 1: measure the drift, before it is fixed).
//
// vocabulary.ts says its enums are "style.py's, verbatim". They are not: the
// two files describe overlapping but different field sets, and a hand copy
// has no way to notice. This first stage reads both literals and reports the
// split. It is red on purpose; the next commits put one versioned file at the
// centre and this script learns to enforce that instead.
import { readFileSync } from "node:fs";

const py = readFileSync("pipeline/vlm-probe/style.py", "utf8");
const ts = readFileSync("lib/foundry/extract/vocabulary.ts", "utf8");

const pyFields = new Map();
const pyConst = {};
for (const m of py.matchAll(/^([A-Z_]+) = \[([^\]]*)\]/gms)) pyConst[m[1]] = [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
for (const m of py.matchAll(/^\s+"(\w+)": _enum\(([A-Z_]+),/gm)) pyFields.set(m[1], pyConst[m[2]] ?? []);

const tsBlock = ts.match(/export const ENUMS[^=]*= \{([\s\S]*?)\n\};/)[1];
const tsFields = new Map();
for (const m of tsBlock.matchAll(/^\s+(\w+): \[([^\]]*)\]/gm)) tsFields.set(m[1], [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]));

const problems = [];
for (const f of tsFields.keys()) if (!pyFields.has(f)) problems.push(`vocabulary.ts declares "${f}" - absent from style.py's pass`);
for (const f of pyFields.keys()) if (!tsFields.has(f)) problems.push(`style.py declares "${f}" - absent from vocabulary.ts`);
for (const [f, vals] of tsFields) {
  const other = pyFields.get(f);
  if (other && JSON.stringify(other) !== JSON.stringify(vals)) problems.push(`"${f}" enums differ: ts=${vals} py=${other}`);
}
if (problems.length) {
  console.error(`check-vocab: ${problems.length} drift finding(s)`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log("check-vocab: ok");
