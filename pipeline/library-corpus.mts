// LIBRARY-CORPUS - the Library's 50k proof, on demand (Phase 5, L49).
//
//   node pipeline/library-corpus.mts [--n 50000] [--runs 200] [--store <file>] [--keep] [--json]
//
// Generates the deterministic corpus (lib/library/corpus.ts: the prototype's
// illustrative fill scaled, seed 0x5eed2026, fixed share per kind), loads it into
// a store, and runs the fixed query mix (lib/library/probe.ts QUERY_MIX) `runs`
// times each, printing p50/p95/p99 per query with n, the machine and the date.
//
// THE STORE IS A TEMP FILE unless --store names one, and is deleted afterwards
// unless --keep: this script never opens the app's store (it would put 50,000
// fixture items into somebody's Library). A file store, not :memory: - WAL with
// synchronous=FULL is what the app runs on, and the number has to be about that.
//
// Exit 0: every search query's p95 is under the budget (SEARCH_P95_BUDGET_MS)
// 1: the budget is missed (the numbers still print) · 2: could not run.

import "./lib-hooks.mts";

import { mkdtempSync, rmSync } from "node:fs";
import { cpus, hostname, tmpdir, totalmem } from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const value = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const json = args.includes("--json");
const known = new Set(["--n", "--runs", "--store", "--keep", "--json"]);
const unknown = args.filter((a, i) => !known.has(a) && !["--n", "--runs", "--store"].includes(args[i - 1] ?? ""));
const n = Number(value("--n") ?? "50000");
const runs = Number(value("--runs") ?? "200");
if (unknown.length > 0 || !Number.isInteger(n) || n < 100 || !Number.isInteger(runs) || runs < 1) {
  console.error(`usage: node pipeline/library-corpus.mts [--n 50000] [--runs 200] [--store <file>] [--keep] [--json]  (unknown: ${unknown.join(" ")})`);
  process.exit(2);
}

const { openKernel } = await import("../packages/kernel/src/kernel.ts");
const { generateCorpus } = await import("../lib/library/corpus.ts");
const { loadCorpus, measure, SEARCH_P95_BUDGET_MS } = await import("../lib/library/probe.ts");

const dir = value("--store") === undefined ? mkdtempSync(path.join(tmpdir(), "gt-library-50k-")) : undefined;
const file = value("--store") !== undefined ? path.resolve(value("--store") ?? "") : path.join(dir ?? "", "library.sqlite");
const cleanup = (): void => {
  if (dir !== undefined && !args.includes("--keep")) rmSync(dir, { recursive: true, force: true });
};

const k = openKernel(file);
if (!k.ok) {
  console.error(`library-corpus: cannot open ${file}: ${k.error.message}`);
  cleanup();
  process.exit(2);
}
const t0 = Date.now();
const corpus = generateCorpus(n);
const genMs = Date.now() - t0;
const loaded = loadCorpus(k.value.store, corpus);
if (!loaded.ok) {
  console.error(`library-corpus: load failed: ${loaded.error.message}`);
  k.value.close();
  cleanup();
  process.exit(2);
}
const m = measure(k.value.store, runs);
k.value.close();
cleanup();
if (!m.ok) {
  console.error(`library-corpus: ${m.error.message}`);
  process.exit(2);
}

const machine = { host: hostname(), cpu: cpus()[0]?.model ?? "unknown", cores: cpus().length, memGb: Math.round(totalmem() / 2 ** 30), node: process.version, platform: process.platform };
const missed = m.value.stats.filter((s) => s.search && s.p95 >= SEARCH_P95_BUDGET_MS);
const doc = { at: new Date().toISOString(), n, runs, machine, generateMs: genMs, loadMs: loaded.value.ms, budgetMs: SEARCH_P95_BUDGET_MS, stats: m.value.stats, checksum: m.value.checksum, pass: missed.length === 0 };
if (json) process.stdout.write(`${JSON.stringify(doc, null, 2)}\n`);
else {
  console.log(`library-corpus: ${n} items, ${runs} timed runs per query (5 warm-up runs discarded), ${doc.at}`);
  console.log(`  machine: ${machine.cpu} x${machine.cores}, ${machine.memGb} GB, node ${machine.node}, ${machine.platform}`);
  console.log(`  generate ${genMs} ms, load ${loaded.value.ms} ms (file store, WAL, synchronous=FULL)`);
  console.log(`  ${"query".padEnd(28)} ${"total".padStart(7)} ${"p50".padStart(7)} ${"p95".padStart(7)} ${"p99".padStart(7)} ${"max".padStart(7)}  (ms)`);
  for (const s of m.value.stats) console.log(`  ${(s.name + (s.search ? " *" : "")).padEnd(28)} ${String(s.total).padStart(7)} ${s.p50.toFixed(2).padStart(7)} ${s.p95.toFixed(2).padStart(7)} ${s.p99.toFixed(2).padStart(7)} ${s.max.toFixed(2).padStart(7)}`);
  console.log(`  * search queries; budget p95 < ${SEARCH_P95_BUDGET_MS} ms: ${missed.length === 0 ? "met" : `MISSED by ${missed.map((s) => s.name).join(", ")}`}`);
}
process.exit(missed.length === 0 ? 0 : 1);
