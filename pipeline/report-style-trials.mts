// Reads public/trials/index.json and prints what the grid actually says.
//
// Run:  npx tsx pipeline/report-style-trials.mts
//
// Separate from the builder because reading the finding must not cost a
// generation. The builder is expensive and occasionally half-fails; this is
// free, so it can be re-run after every partial pass.
//
// The comparison it exists for: the same five briefs, the same six style
// blocks, two different image models. When a cell fails on BOTH, the prompt is
// the suspect. When it fails on one and not the other, the model is.

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

interface Grade {
  hasText?: boolean;
  drewWhatWasAsked?: boolean;
  clutter?: number;
  dominantColors?: string[];
  description?: string;
}
interface Entry {
  styleId: string;
  styleName: string;
  trialId: string;
  problem: string;
  provider?: string;
  grade?: Grade;
  costUsd?: number;
}

const file = path.join(process.cwd(), "public", "trials", "index.json");
if (!existsSync(file)) {
  console.error("No trial index yet — run pipeline/build-style-trials.mts first.");
  process.exit(1);
}
const doc = JSON.parse(readFileSync(file, "utf8")) as {
  styles: { id: string; name: string }[];
  trials: { id: string; problem: string }[];
  entries: Entry[];
};

const providers = [...new Set(doc.entries.map((e) => e.provider ?? "leonardo"))].sort();
const graded = doc.entries.filter((e) => e.grade);

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");

function stats(rows: Entry[]) {
  const n = rows.length;
  const onBrief = rows.filter((r) => r.grade?.drewWhatWasAsked).length;
  const text = rows.filter((r) => r.grade?.hasText).length;
  const clutter = n ? rows.reduce((s, r) => s + (r.grade?.clutter ?? 0), 0) / n : 0;
  return { n, onBrief, text, clutter };
}

console.log(`\nTRIAL GRID · ${graded.length} graded cells across ${providers.length} provider(s)\n`);

for (const p of providers) {
  const rows = graded.filter((e) => (e.provider ?? "leonardo") === p);
  const s = stats(rows);
  const spend = rows.reduce((t, r) => t + (r.costUsd ?? 0), 0);
  console.log(
    `${p.padEnd(10)} ${s.n} cells · on-brief ${pct(s.onBrief, s.n)} · text leak ${pct(s.text, s.n)} · clutter ${s.clutter.toFixed(1)}` +
      (spend ? ` · $${spend.toFixed(2)}` : ""),
  );
}

// Per visual problem, per provider. This is the table the whole exercise is
// for: a problem that fails everywhere is a brief we wrote badly; one that
// fails on a single model is that model's ceiling.
console.log(`\nON-BRIEF BY VISUAL PROBLEM`);
const w = Math.max(...doc.trials.map((t) => t.problem.length)) + 2;
console.log(`  ${"problem".padEnd(w)}${providers.map((p) => p.padEnd(12)).join("")}`);
for (const t of doc.trials) {
  const cells = providers.map((p) => {
    const rows = graded.filter((e) => e.trialId === t.id && (e.provider ?? "leonardo") === p);
    const s = stats(rows);
    return `${s.onBrief}/${s.n}`.padEnd(12);
  });
  console.log(`  ${t.problem.padEnd(w)}${cells.join("")}`);
}

console.log(`\nTEXT LEAKAGE BY VISUAL PROBLEM  (unconditional fail — captions are our vector layer)`);
console.log(`  ${"problem".padEnd(w)}${providers.map((p) => p.padEnd(12)).join("")}`);
for (const t of doc.trials) {
  const cells = providers.map((p) => {
    const rows = graded.filter((e) => e.trialId === t.id && (e.provider ?? "leonardo") === p);
    const s = stats(rows);
    return `${s.text}/${s.n}`.padEnd(12);
  });
  console.log(`  ${t.problem.padEnd(w)}${cells.join("")}`);
}

if (providers.length > 1) {
  const [a, b] = providers;
  const flips: string[] = [];
  for (const style of doc.styles)
    for (const t of doc.trials) {
      const ea = graded.find((e) => e.styleId === style.id && e.trialId === t.id && (e.provider ?? "leonardo") === a);
      const eb = graded.find((e) => e.styleId === style.id && e.trialId === t.id && (e.provider ?? "leonardo") === b);
      if (!ea?.grade || !eb?.grade) continue;
      const oa = Boolean(ea.grade.drewWhatWasAsked);
      const ob = Boolean(eb.grade.drewWhatWasAsked);
      if (oa !== ob) flips.push(`  ${style.name.padEnd(18)} ${t.problem.padEnd(11)} ${a}=${oa ? "ok " : "MISS"}  ${b}=${ob ? "ok" : "MISS"}`);
    }
  console.log(`\nCELLS THAT FLIPPED between ${a} and ${b}  (${flips.length})`);
  console.log(flips.length ? flips.join("\n") : "  none — the two models agree on every cell");
}

console.log(`\nBY STYLE`);
for (const st of doc.styles) {
  const line = providers
    .map((p) => {
      const s = stats(graded.filter((e) => e.styleId === st.id && (e.provider ?? "leonardo") === p));
      return `${p} ${s.onBrief}/${s.n} on-brief, ${s.text}/${s.n} text`;
    })
    .join("  ·  ");
  console.log(`  ${st.name.padEnd(18)} ${line}`);
}
console.log();
