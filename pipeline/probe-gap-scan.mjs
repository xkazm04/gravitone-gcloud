// Risk-weighted probe-gap scan. Lists source modules that delete, spend, spawn
// or reach the network and that no spec under tests/ imports, ranked by
// consequence. Derived and re-runnable: nothing here is a maintained list.
//
//   node pipeline/probe-gap-scan.mjs          # table, top 25
//   node pipeline/probe-gap-scan.mjs --all    # every uncovered tagged module
//   node pipeline/probe-gap-scan.mjs --json   # machine-readable
//
// It is a BACKLOG generator, not a gate: it always exits 0. Take the head of the
// list; do not chase the tail (twenty thin probes are worse than four good ones).
// "Imported" means a spec has an import/require/dynamic-import resolving to the
// module. A spec that only greps the module's source text does not count, and is
// reported separately as "text-only" because it proves the shape, not behaviour.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIRS = ["app", "lib", "components"];
const SKIP_DIR = new Set(["node_modules", ".next", ".git"]);
const EXTS = [".ts", ".tsx", ".mts", ".mjs", ".js"];

const walk = (dir, out = []) => {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mts)$/.test(name) && !/\.d\.ts$/.test(name)) out.push(p);
  }
  return out;
};
const rel = (p) => relative(ROOT, p).split(sep).join("/");

// Consequence tags. Weights rank the output; a module carries every tag it matches.
const TAGS = [
  ["deletes", 4, /\b(?:unlink|rmSync|rm|rmdir|unlinkSync)\s*\(|method:\s*["']DELETE["']|\.delete(?:Asset|Frame|Alternative|Clip|Track)\w*\s*\(|\bfunction\s+(?:delete|remove|discard|purge|wipe)\w*|\bconst\s+(?:delete|remove|discard|purge|wipe)\w*\s*=/],
  ["spends", 4, /imagingClient|foundryClient|\/api\/imaging|\/api\/foundry|\bbudget\b|\bspend\w*|\bcostUsd\b|\bgenerate(?:Image|Video|Audio|Music)\w*\s*\(/i],
  ["spawns", 3, /child_process|\bspawn(?:Sync)?\s*\(|\bexecFile(?:Sync)?\s*\(|\bexec(?:Sync)?\s*\(/],
  ["network", 2, /\bfetch\s*\(|\bXMLHttpRequest\b|\bEventSource\b|\bWebSocket\b/],
];

const tagOf = (text) => TAGS.filter(([, , re]) => re.test(text)).map(([n]) => n);
const weight = (tags) => tags.reduce((s, t) => s + TAGS.find(([n]) => n === t)[1], 0);

const sources = SRC_DIRS.flatMap((d) => walk(join(ROOT, d)));
const specs = walk(join(ROOT, "tests")).filter((p) => /\.(spec|probe)\./.test(p) || p.includes(`${sep}_`));

const resolveSpec = (from, spec) => {
  let base;
  if (spec.startsWith("@/")) base = join(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
  else return null;
  for (const c of [base, ...EXTS.map((e) => base + e), ...EXTS.map((e) => join(base, "index" + e))]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
};

const IMPORT_RE = /(?:from\s*|import\s*\(\s*|require\s*\(\s*|import\s+)["']([^"']+)["']/g;
const imported = new Set();
const specText = [];
for (const s of specs) {
  const text = readFileSync(s, "utf8");
  specText.push(text);
  for (const m of text.matchAll(IMPORT_RE)) {
    const r = resolveSpec(s, m[1]);
    if (r) imported.add(rel(r));
  }
}
// Helper modules a spec imports count only when the spec reaches them: tests/_* are
// walked above so a harness that re-exports a module still counts as importing it.
const corpus = specText.join("\n");

const rows = [];
for (const f of sources) {
  const text = readFileSync(f, "utf8");
  const tags = tagOf(text);
  if (!tags.length) continue;
  const r = rel(f);
  if (imported.has(r)) continue;
  const stem = r.replace(/\.(ts|tsx|mts)$/, "");
  rows.push({
    file: r,
    lines: text.split("\n").length,
    tags,
    score: weight(tags),
    textOnly: corpus.includes(stem) || corpus.includes(r),
  });
}
rows.sort((a, b) => b.score - a.score || b.lines - a.lines || a.file.localeCompare(b.file));

const argv = new Set(process.argv.slice(2));
const shown = argv.has("--all") ? rows : rows.slice(0, 25);
if (argv.has("--json")) {
  console.log(JSON.stringify({ sourceModules: sources.length, specs: specs.length, uncovered: rows.length, rows: shown }, null, 2));
} else {
  console.log(`${rows.length} high-consequence modules of ${sources.length} no spec imports (${specs.length} spec/helper files scanned)`);
  for (const r of shown) {
    console.log(`${String(r.score).padStart(2)}  ${String(r.lines).padStart(5)}L  ${r.tags.join("+").padEnd(24)} ${r.file}${r.textOnly ? "  [text-only]" : ""}`);
  }
  if (shown.length < rows.length) console.log(`... ${rows.length - shown.length} more (--all)`);
}
