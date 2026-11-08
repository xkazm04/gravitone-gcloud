// YUE2 BACKFILL - file the kiro/yue2-lab outputs into the sound store (spark yue2-song-lab WP2).
//
//   npx tsx pipeline/yue2/import.mts --from <yue2-lab outputs dir> [--apply (--store <file> | --real)] [--lyrics <file>] [--style <file>] [--json]
//
// DRY BY DEFAULT: prints what it would file and writes nothing. With --apply it files each take
// (baseline, grid/, gen2/, lora/, and post/<input-stem>/v*_* as variants of their raw take) through
// the sound store's create path with its YuE2 facts, then writes the scores score.py already measured
// (scores_all.jsonl, gen2/scores_gen2.jsonl, post/scores_post.jsonl) into the kernel's
// audio_song_scores by sha, without rescoring. ab/ and the smoke clip are skipped by rule.
// Idempotent: a re-run files 0 new takes, and says how it found each existing one (sha or
// fileName+facts). The plan is lib/yue2/importScan.ts, the filing lib/yue2/importApply.ts.
//
//   --lyrics   the lyric sheet every take was sung from (default: the file score.py's rows name,
//              looked up under <from>/../inputs)
//   --style    the style for a take no runs.jsonl row names
//   --store    the kernel store the scores land in (or GRAVITONE_STORE_PATH); --real for the app's own.
//              --apply refuses without one (RULES: a migration once landed in the real store from a
//              run that never meant to open it). The sound store is SOUND_STORE_DIR (default
//              foundry-out/sound); the verdict ledger is not touched (new takes are unjudged).
//   Exit 0 ok · 1 a take or a score failed · 2 usage or could not run.
//
// RUNS UNDER tsx OR PLAIN `node` (as pipeline/library-sync.mts): lib-hooks gives this process what Next gives the
// server (server-only, extensionless imports, type transform).

import "../lib-hooks.mts";

import path from "node:path";

const args = process.argv.slice(2);
const VALUED = ["--from", "--lyrics", "--style", "--store"];
const value = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const flag = (name: string): boolean => args.includes(name);
const known = new Set([...VALUED, "--apply", "--real", "--json"]);
const unknown = args.filter((a, i) => !known.has(a) && !VALUED.includes(args[i - 1] ?? ""));
const USAGE = "usage: node pipeline/yue2/import.mts --from <yue2-lab outputs dir> [--apply (--store <file> | --real)] [--lyrics <file>] [--style <file>] [--json]";
if (unknown.length > 0 || value("--from") === undefined || VALUED.some((v) => flag(v) && (value(v) === undefined || value(v)!.startsWith("--")))) {
  console.error(`${USAGE}${unknown.length > 0 ? `  (unknown: ${unknown.join(" ")})` : ""}`);
  process.exit(2);
}
const apply = flag("--apply");
const json = flag("--json");
const named = value("--store");
if (named !== undefined) process.env["GRAVITONE_STORE_PATH"] = path.resolve(named);
if (apply && (process.env["GRAVITONE_STORE_PATH"] ?? "").trim() === "" && !flag("--real")) {
  console.error("yue2 import: --apply names the kernel store: --store <file> (or GRAVITONE_STORE_PATH), or --real for the app's own. Refusing to open the default store.");
  process.exit(2);
}

const { scanOutputs } = await import("../../lib/yue2/importScan.ts");
const { applyPlan } = await import("../../lib/yue2/importApply.ts");
const { storeRoot } = await import("../../lib/sound/store.ts");

const lyricsFile = value("--lyrics");
const styleFile = value("--style");
let plan;
try {
  plan = await scanOutputs({ from: value("--from")!, ...(lyricsFile === undefined ? {} : { lyricsFile: path.resolve(lyricsFile) }), ...(styleFile === undefined ? {} : { styleFile: path.resolve(styleFile) }) });
} catch (e) {
  console.error(`yue2 import: could not read ${value("--from")}: ${(e as Error).message}`);
  process.exit(2);
}

let kernel: { store: import("../../packages/kernel/src/store.ts").Store; close(): void } | undefined;
if (apply) {
  const { openKernel } = await import("../../packages/kernel/src/kernel.ts");
  const { storeLocation } = await import("../../lib/kernelProcess.ts");
  const location = storeLocation();
  const k = openKernel(location);
  if (!k.ok) {
    console.error(`yue2 import: cannot open ${location}: ${k.error.message}`);
    process.exit(2);
  }
  kernel = k.value;
}

const report = await applyPlan(plan, { apply, ...(kernel === undefined ? {} : { store: kernel.store }) });
kernel?.close();
if (!report.ok) {
  console.error(`yue2 import: ${report.error.message}`);
  process.exit(2);
}
const r = report.value;
const failed = r.takes.filter((t) => t.action === "failed").length + r.scores.failed;

if (json) process.stdout.write(`${JSON.stringify({ from: plan.from, lyricsFrom: plan.lyricsFrom, soundStore: storeRoot(), scoreRows: plan.scoreRows, ...r }, null, 2)}\n`);
else {
  console.log(`yue2 import (${apply ? "APPLY" : "dry run: nothing written; --apply files it"}): ${plan.from}`);
  console.log(`  sound store ${storeRoot()}${apply ? `, kernel ${process.env["GRAVITONE_STORE_PATH"] ?? "(the app's own)"}` : ""}`);
  console.log(`  lyrics ${plan.lyricsFrom ?? "(none found)"}`);
  console.log(`  ${"dir".padEnd(9)} ${"found".padStart(5)} ${(apply ? "filed" : "file").padStart(5)} ${"held".padStart(5)} ${"dup".padStart(4)} ${"fail".padStart(4)}`);
  for (const [dir, c] of Object.entries(r.perDir)) console.log(`  ${dir.padEnd(9)} ${String(c.found).padStart(5)} ${String(c.file).padStart(5)} ${String(c.existing).padStart(5)} ${String(c.duplicate).padStart(4)} ${String(c.failed).padStart(4)}`);
  console.log(`  scores: ${plan.scoreRows.read} rows read, ${plan.scoreRows.matched} matched (${plan.scoreRows.superseded} superseded by a newer row); ${r.scores.written} written, ${r.scores.unchanged} unchanged, ${r.scores.wouldWrite} ${apply ? "not written" : "would write"}, ${r.scores.failed} failed`);
  for (const t of r.takes) {
    const what =
      t.action === "file" ? `${apply ? "filed" : "file"}${t.takeId === undefined ? "" : ` ${t.takeId}`}${t.parentRel === undefined ? "" : ` (variant of ${t.parentRel})`}`
      : t.action === "existing" ? `held ${t.takeId} (by ${t.matchedBy})`
      : t.action === "duplicate" ? `same bytes as ${t.of}`
      : `FAILED ${t.reason}`;
    console.log(`    ${t.rel.padEnd(58)} ${what}  [${t.title}]`);
  }
  if (r.skipped.length > 0) {
    console.log(`  skipped ${r.skipped.length}:`);
    for (const s of r.skipped) console.log(`    ${s.at}: ${s.reason}`);
  }
}
process.exit(failed === 0 ? 0 : 1);
