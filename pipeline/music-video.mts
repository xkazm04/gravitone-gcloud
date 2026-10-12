// MUSIC-VIDEO — the headless surface of the music-video queue (lib/sound/mv/),
// for a whole album on a render box. The /music-video skill wraps it.
//
//   npx tsx pipeline/music-video.mts plan <dir> [--versions all|main|instrumental] [--again] [--limit N] [--prompt "<text>" | --prompt-file <f>]
//   npx tsx pipeline/music-video.mts run <dir> --yes [same flags as plan]
//   npx tsx pipeline/music-video.mts collect <dir>
//   npx tsx pipeline/music-video.mts status
//
//   plan     reads only: what a run would queue, retry or skip, and what it costs
//   run      imports the folder, queues the plan, drains the queue (blocks until
//            every track it owns is done or failed), switches the queue off,
//            and copies each finished video beside its source:
//            <track>.mp4 and <track> - youtube.txt
//   collect  the copy step alone, for videos made from the canvas
//   status   the queue and every job
//
//   --json on any command: one JSON document on stdout, progress on stderr.
//   Exit 0 ok · 1 a job failed or the drain stopped short · 2 usage.
//
// IT OWNS NO LOGIC: lib/sound/mv/batch.ts plans, runs and collects; the queue
// renders. A run SPENDS: one Leonardo studio still per new track (GPT Image 2.5
// Sunburst, ~71 studio credits) and two text turns (treatment, metadata; one
// when --prompt replaces the treatment), so `run` refuses without --yes.
//
// THE REAL STORE. .env.local may select the fixture universe
// (NEXT_PUBLIC_GRAVITONE_DATA=fixtures, measured on the studio machine
// 2026-10-12); a batch is for real tracks, so this CLI pins the real store
// unless --fixtures is given. The studio's Chrome is LEONARDO_STUDIO_CDP,
// default port 9333 (lib/imaging/studio/browser.ts).
//
// ONE PROCESS DRAINS THE STORE AT A TIME (lib/sound/mv/queue.ts lease): a dev
// server on the same store with its queue running pauses this run, naming its
// pid, and the reverse.

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

const argv = process.argv.slice(2);
const JSON_OUT = argv.includes("--json");
const FIXTURES = argv.includes("--fixtures");
const YES = argv.includes("--yes");
const AGAIN = argv.includes("--again");
const args = argv.filter((a) => !["--json", "--fixtures", "--yes", "--again"].includes(a));
const cmd = args[0];

/** .env then .env.local, never clobbering an exported value. */
function loadEnv(root: string) {
  for (const f of [".env", ".env.local"]) {
    const at = path.join(root, f);
    if (!fs.existsSync(at)) continue;
    for (const line of fs.readFileSync(at, "utf8").split(/\r?\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim();
      if (v && process.env[k] === undefined) process.env[k] = v;
    }
  }
}
// Pinned BEFORE the loader and before any lib import: lib/fixtures/mode.ts
// reads it once, at import.
if (!FIXTURES) process.env.NEXT_PUBLIC_GRAVITONE_DATA = "real";
loadEnv(ROOT);
process.env.LEONARDO_STUDIO_CDP ??= "9333";
const CALLER_CWD = process.cwd();
process.chdir(ROOT);

const emit = (s: string) => process.stdout.write(`${s}\n`);
if (JSON_OUT) console.log = (...a: unknown[]) => console.error(...a);

function usage(msg?: string): never {
  if (JSON_OUT) emit(JSON.stringify({ error: msg ?? "usage" }));
  else {
    if (msg) console.error(`music-video: ${msg}\n`);
    console.error(
      "usage: npx tsx pipeline/music-video.mts <plan|run|collect|status> [--json]\n" +
        '  plan <dir> [--versions all|main|instrumental] [--again] [--limit N] [--prompt "<text>" | --prompt-file <f>]\n' +
        "  run <dir> --yes [same flags]   collect <dir>   status   [--fixtures]",
    );
  }
  process.exit(2);
}

function flag(name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const v = args[i + 1];
  if (v === undefined || v.startsWith("--")) usage(`--${name} needs a value`);
  return v;
}

const { BATCH_VERSIONS, collectBatch, planBatch, runBatch } = await import("../lib/sound/mv/batch");
const { mvSnapshot } = await import("../lib/sound/mv/queue");
const { leonardoStudioHealth } = await import("../lib/imaging/providers/leonardoStudio");
type BatchVersions = import("../lib/sound/mv/batch").BatchVersions;
type BatchPlan = import("../lib/sound/mv/batch").BatchPlan;

function options() {
  const v = flag("versions") ?? "all";
  if (!BATCH_VERSIONS.includes(v as BatchVersions)) usage(`--versions must be one of ${BATCH_VERSIONS.join(", ")}`);
  const limitRaw = flag("limit");
  const limit = limitRaw === undefined ? undefined : Number(limitRaw);
  if (limit !== undefined && !(Number.isInteger(limit) && limit > 0)) usage("--limit must be a positive whole number");
  const promptFile = flag("prompt-file");
  let prompt = flag("prompt");
  if (promptFile) {
    if (prompt) usage("give --prompt or --prompt-file, not both");
    prompt = fs.readFileSync(path.resolve(CALLER_CWD, promptFile), "utf8");
  }
  return { versions: v as BatchVersions, again: AGAIN, ...(limit ? { limit } : {}), ...(prompt?.trim() ? { prompt: prompt.trim() } : {}) };
}

function dirArg(): string {
  const d = args[1];
  if (!d || d.startsWith("--")) usage("name the folder of tracks");
  // A relative folder is relative to where the caller typed it; ~ is home.
  return d.startsWith("~") ? d : path.resolve(CALLER_CWD, d);
}

function printPlan(p: BatchPlan) {
  console.error(`folder ${p.dir}`);
  for (const r of p.rows) console.error(`  ${r.action.padEnd(12)} ${r.version.padEnd(12)} ${r.title}${r.job ? `  [${r.job.id} ${r.job.state}]` : ""}`);
  console.error(`new videos ${p.newJobs} · retries ${p.retries} · ~${p.estimatedCredits} studio credits · ${p.textTurns} text turns`);
}

const clock = (ms: number) => `${Math.floor(ms / 60000)}m${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}s`;

try {
  if (cmd === "plan") {
    const p = await planBatch(dirArg(), options());
    if (JSON_OUT) emit(JSON.stringify(p));
    else printPlan(p);
  } else if (cmd === "run") {
    const dir = dirArg();
    const opts = options();
    const p = await planBatch(dir, opts);
    if (!JSON_OUT) printPlan(p);
    if (!YES) usage(`run spends (~${p.estimatedCredits} studio credits, ${p.textTurns} text turns); add --yes`);
    if (p.newJobs + p.retries > 0) {
      const health = await leonardoStudioHealth();
      if (!health.ok) throw new Error(`the still vendor is not ready: ${health.reason}`);
    }
    const t0 = Date.now();
    let last = "";
    const res = await runBatch(dir, opts, (jobs) => {
      const line = jobs.map((j) => `${j.source.title}:${j.state}${j.phase ? `/${j.phase}` : ""}`).join("  ");
      if (line !== last) console.error(`[${clock(Date.now() - t0)}] ${line}`);
      last = line;
    });
    const failed = res.jobs.filter((j) => j.state !== "done");
    if (JSON_OUT) emit(JSON.stringify(res));
    else {
      for (const j of res.jobs) console.error(`  ${j.state.padEnd(8)} ${path.basename(j.file)}${j.video ? ` -> ${path.basename(j.video)}` : ""}${j.error ? `  (${j.error})` : ""}`);
      if (res.paused) console.error(`stopped short: ${res.paused}`);
      console.error(`${res.jobs.length - failed.length}/${res.jobs.length} done in ${clock(Date.now() - t0)}`);
    }
    process.exitCode = failed.length || res.paused ? 1 : 0;
  } else if (cmd === "collect") {
    const out = await collectBatch(dirArg());
    if (JSON_OUT) emit(JSON.stringify({ collected: out }));
    else for (const c of out) console.error(`  ${path.basename(c.file)} -> ${path.basename(c.video)}`);
  } else if (cmd === "status") {
    // A snapshot read kicks the worker; with the queue off that is a no-op,
    // and with it on in another process the lease pauses this one.
    const s = await mvSnapshot();
    if (JSON_OUT) emit(JSON.stringify(s));
    else {
      console.error(`queue ${s.queue.running ? "running" : "stopped"}${s.queue.interrupted ? ` (${s.queue.interrupted})` : ""} · studio ${s.driver.ok ? "ready" : s.driver.reason}`);
      for (const j of s.jobs) console.error(`  ${j.id} ${j.state.padEnd(9)} ${j.phase ?? ""} ${j.source.title}${j.error ? `  (${j.error})` : ""}`);
    }
  } else usage(cmd ? `unknown command ${cmd}` : undefined);
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  if (JSON_OUT) emit(JSON.stringify({ error: msg }));
  else console.error(`music-video: ${msg}`);
  process.exitCode = 1;
}
// The studio browser's CDP socket and any timer would keep node alive.
process.exit(process.exitCode ?? 0);
