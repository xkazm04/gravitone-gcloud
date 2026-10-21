// EXTRACT STYLES FROM A FOLDER — the local driver of an extract JOB.
//
//   npx tsx pipeline/foundry/extract.mts "C:/path/to/gallery" --slug my-gallery [--budget-usd 5] [--dry] [--detach] [--json]
//   npx tsx pipeline/foundry/extract.mts --resume <run-id> [--budget-usd N]
//   npx tsx pipeline/foundry/extract.mts --retry <run-id> [--budget-usd N]
//   npx tsx pipeline/foundry/extract.mts --status <run-id> [--json]
//   npx tsx pipeline/foundry/extract.mts --commit <run-id> --keep a,b [--reject c] [--json]
//
// Options on a new run: --rounds 2 --replicas 2 --transfers 1 --target 0.85
// --max 40 (cap on the number of images taken from the folder, in name order),
// --singletons (no grouping).
//
// SINCE PHASE 4 (L29) A RUN IS A KERNEL JOB (lib/producers/extract.ts), the same
// job the app's /step route kicks and the worker drives: this CLI enqueues it
// (the receipt is printed, then confirmed by the CLI itself) and drives it to
// the end, or leaves it to the worker with --detach. Its spend behaviour is v1's:
// invoked, it runs LIVE at once; --dry runs the whole job on stand-ins (nothing
// is spent, the run is marked dry and can never be committed). --budget-usd is
// the job's ceiling: the job stops before the unit that would cross it, and
// --resume/--retry with a higher one continues.
//
// WHAT IT SPENDS. Every source costs one recognition; every style costs up to
// replicas × rounds + transfers generations, each read back once. The receipt
// prints that worst case. The imaging budget window (IMAGING_BUDGET_USD_PER_WINDOW,
// default $5/hour) applies as in the app: its refusal stops the job for money.
//
// EXIT 0 done (or enqueued, read, committed) · 1 failed, stopped or refused · 2 usage.
// NOT A TEST and not in `npm run verify` — invoked live it talks to live vendors.

import fs from "node:fs";
import path from "node:path";
import { errorMessage } from "@gt/domain/errors";
import { pathToFileURL } from "node:url";

type ExtractManifest = import("../../lib/foundry/extract/types.ts").ExtractManifest;
type ExtractUpload = import("../../lib/foundry/extract/types.ts").ExtractUpload;
type Io = { readonly env: Readonly<Record<string, string | undefined>>; readonly out: (s: string) => void; readonly err: (s: string) => void };

const USAGE = [
  "usage:",
  '  npx tsx pipeline/foundry/extract.mts "<folder>" --slug <slug> [--rounds 2] [--replicas 2] [--transfers 1] [--target 0.85] [--max 40] [--singletons] [--budget-usd N] [--dry] [--detach] [--json]',
  "      --singletons: no grouping — every image is its own style, its recipe written by the eye with the image in view",
  "  npx tsx pipeline/foundry/extract.mts --resume <run-id> [--budget-usd N]   # continue; a failed run is pruned and retried",
  "  npx tsx pipeline/foundry/extract.mts --retry <run-id> [--budget-usd N]    # a done run with failed units: take them again",
  "  npx tsx pipeline/foundry/extract.mts --status <run-id> [--json]",
  "  npx tsx pipeline/foundry/extract.mts --commit <run-id> --keep a,b [--reject c] [--json]",
].join("\n");

class Usage extends Error {}

const MIME: Record<string, ExtractUpload["mime"]> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

const pct = (x: number | null | undefined) => (typeof x === "number" ? `${Math.round(100 * x)}%`.padStart(4) : "   —");

function summary(m: ExtractManifest): string {
  const rows: string[] = [`run ${m.id} · ${m.status}${m.dry ? " (dry)" : ""} · ${m.sources.length} source(s), ${m.styles.length} style(s)${m.job ? ` · job ${m.job}` : ""}`];
  const failed = m.sources.filter((s) => s.error);
  if (failed.length) rows.push(`  unread sources: ${failed.map((s) => `${s.id} (${s.error})`).join("; ")}`);
  if (m.engines.vision || m.engines.generator || m.engines.reasoner) rows.push(`  engines: eyes ${m.engines.vision ?? "—"} · pixels ${m.engines.generator ?? "—"} · words ${m.engines.reasoner ?? "—"}`);
  rows.push("", "  style                          n  by         replica  transfer  text  recipe tries");
  for (const st of m.styles) {
    let best: number | null = null;
    let text = false;
    for (const r of st.replicas)
      for (const x of r.rounds) {
        if (typeof x.score === "number" && (best === null || x.score > best)) best = x.score;
        if (x.critique?.has_text) text = true;
      }
    const tr = st.transfers.map((t) => t.score).filter((x): x is number => typeof x === "number");
    const trm = tr.length ? tr.reduce((a, b) => a + b, 0) / tr.length : null;
    if (st.transfers.some((t) => t.readback?.has_text)) text = true;
    rows.push(`  ${st.id.padEnd(30)} ${String(st.members.length).padStart(2)}  ${st.grouped_by.padEnd(10)} ${pct(best)}     ${pct(trm)}     ${text ? "TEXT" : "    "}  ${st.recipe_history.length}`);
  }
  rows.push("", `  files: foundry-out/extract/${m.id}/`);
  if (m.status === "failed") rows.push(`  failed: ${m.error ?? ""}\n  retry with: npx tsx pipeline/foundry/extract.mts --resume ${m.id}`);
  if (m.status === "done" && !m.dry) rows.push(`  cull: open /foundry → Extract → ${m.id}, or --commit ${m.id} --keep <ids>`);
  return rows.join("\n");
}

/** The CLI, as a function: what the entry below runs, and what a test drives with its own env and sinks. */
export async function runCli(argv: readonly string[], io: Io): Promise<number> {
  const flag = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const has = (name: string) => argv.includes(`--${name}`);
  const num = (name: string, d: number) => {
    const v = flag(name);
    if (v === undefined) return d;
    const n = Number(v);
    if (!Number.isFinite(n)) throw new Usage(`--${name} needs a number, got "${v}"`);
    return n;
  };
  const BOOL = ["dry", "help", "json", "detach", "singletons", "force"];
  const positional = argv.filter((a, i) => !a.startsWith("--") && (i === 0 || !argv[i - 1]!.startsWith("--") || BOOL.includes(argv[i - 1]!.slice(2))));
  const json = has("json");
  const say = (s: string) => (json ? io.err(s) : io.out(s));
  const doc = (d: Record<string, unknown>) => io.out(JSON.stringify(d, null, 2));

  try {
    if (has("help") || !argv.length) {
      io.out(USAGE);
      return argv.length ? 0 : 2;
    }
    const budgetRaw = flag("budget-usd");
    const budget = budgetRaw === undefined ? undefined : num("budget-usd", 0);
    if (budget !== undefined && !(budget > 0)) throw new Usage("--budget-usd needs a positive number of dollars");
    if (has("force")) io.err("--force is no longer needed: a run is driven by its job, whose lease the kernel takes over from a dead holder by itself.");

    const { getExtractRun, commitExtractRun, MAX_SOURCE_BYTES, MAX_SOURCES, saveManifest } = await import("../../lib/foundry/extract/store.ts");
    const { hasFailures, pruneFailures } = await import("../../lib/foundry/extract/engine.ts");
    const { TRANSFER_SCENES } = await import("../../lib/foundry/extract/prompts.ts");
    const x = await import("../../lib/producers/extract.ts");
    const { OUT_DIRNAME } = await import("../../lib/fixtures/mode.ts");
    const { closeProcessKernel, processKernel, storeLocation } = await import("@gt/kernel/process");
    const { get, resume, retry } = await import("@gt/kernel/job");
    const { dryOnlyFrom } = await import("@gt/kernel/dryrun");
    const { parseAt } = await import("@gt/domain/door");
    const { jobIdSchema } = await import("@gt/domain/ids");

    if (has("commit")) {
      const id = flag("commit");
      const keep = (flag("keep") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      const reject = (flag("reject") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      if (!id || !keep.length) throw new Usage("--commit <run-id> needs --keep <style-id,...>");
      const at = new Date().toISOString();
      const verdicts = Object.fromEntries([...keep.map((k) => [k, { verdict: "keep" as const, at }]), ...reject.map((k) => [k, { verdict: "reject" as const, at }])]);
      const r = await commitExtractRun(id, verdicts);
      if (json) doc({ ok: true, runId: id, ...r });
      else io.out(`committed ${id}: written ${r.written.join(", ")}; rejected ${r.rejected.join(", ") || "none"} → pipeline/foundry/styles.json`);
      return 0;
    }

    const location = storeLocation(OUT_DIRNAME, io.env["GRAVITONE_STORE_PATH"]);
    const opened = processKernel(location);
    if (!opened.ok) throw opened.error;
    const store = opened.value.store;
    const actor = { kind: "operator" as const, id: "cli" };
    const dryOnly = dryOnlyFrom(io.env);
    const jobOf = (id: string) => {
      const p = parseAt("job id", jobIdSchema, id);
      if (!p.ok) throw p.error;
      const r = get(store, p.value);
      return r.ok ? r.value.job : undefined;
    };

    try {
      const report = async (runId: string, jobId: string | undefined, extra: Record<string, unknown> = {}, outcome?: string): Promise<number> => {
        const { run } = await getExtractRun(runId);
        const job = jobId === undefined ? undefined : jobOf(jobId);
        const failed = job?.state === "failed" || job?.state === "interrupted" || outcome === "held" || outcome === "busy" || outcome === "unhealthy";
        if (json) doc({ ok: !failed, runId, ...(jobId === undefined ? {} : { jobId }), ...(outcome === undefined ? {} : { outcome }), job: job === undefined ? null : { state: job.state, attempt: job.attempt, mode: job.mode.kind, spend: job.spend, progress: job.progress, ...(job.ceilingUsd === undefined ? {} : { ceilingUsd: job.ceilingUsd }), ...(job.error === undefined ? {} : { error: job.error }) }, run: { status: run.status, dry: run.dry === true, sources: run.sources.length, styles: run.styles.map((s) => s.id), spend: run.spend ?? null }, ...extra });
        else {
          if (job !== undefined) io.out(`job ${job.id} · ${job.state} · attempt ${job.attempt} · ${job.mode.kind} · $${job.spend.usd}${job.spend.unpriced ? ` (${job.spend.unpriced} unpriced)` : ""}${job.error ? ` · ${job.error.message}` : ""}`);
          io.out(summary(run));
        }
        return failed ? 1 : 0;
      };

      /** Drive the job to its end, one line per booked unit (stderr under --json). */
      const drive = async (runId: string, jobId: string): Promise<number> => {
        if (has("detach")) {
          say(`enqueued ${jobId}; the worker drives it`);
          return report(runId, jobId, { detached: true });
        }
        const t0 = Date.now();
        const r = await x.driveExtract(store, location, jobId, { dryOnly, onStep: (step: string) => say(`  ${Math.round((Date.now() - t0) / 1000)}s  ${step}`) });
        if (!r.ok) {
          say(`stopped: ${r.error.message}`);
          return report(runId, jobId, { error: r.error.message }, "error").then(() => 1);
        }
        const wc = r.value.wouldCalls?.length ?? 0;
        if (r.value.reason !== undefined) say(r.value.reason);
        return report(runId, jobId, { wouldCalls: wc }, r.value.outcome);
      };

      if (has("status")) {
        const id = flag("status");
        if (!id) throw new Usage("--status needs a run id");
        const { run } = await getExtractRun(id);
        await report(id, run.job);
        return 0;
      }

      const continueRun = async (id: string, again: boolean): Promise<number> => {
        const { run } = await getExtractRun(id);
        const job = run.job === undefined ? undefined : jobOf(run.job);
        if (job?.state === "running") throw new Error(`${id} is being driven by job ${job.id} right now (${job.lease?.holder.host}/${job.lease?.holder.pid}); wait for it.`);
        if (job?.state === "failed" || job?.state === "interrupted") {
          const r = retry(store, job.id, actor, budget === undefined ? {} : { ceilingUsd: budget });
          if (!r.ok) throw r.error;
          say(`retried ${job.id} (attempt ${r.value.attempt})`);
          return drive(id, job.id);
        }
        if (job?.state === "paused") {
          const r = resume(store, job.id, actor);
          if (!r.ok) throw r.error;
          return drive(id, job.id);
        }
        if (job?.state === "queued") return drive(id, job.id);
        if (job !== undefined && !(again && hasFailures(run))) {
          await report(id, job.id);
          if (job.state === "done" && hasFailures(run)) say("  (this run has failed units; --retry <run-id> takes them again)");
          return 0;
        }
        if (again && run.status === "done") {
          // "done" was a verdict; --retry is the operator taking it back. The old job
          // is finished, so nothing drives this manifest while it is pruned.
          const n = pruneFailures(run);
          await saveManifest(run);
          say(`pruned ${n} failed unit(s); ${run.status}`);
        }
        return launch({ kind: "run", runId: id, rerun: again });
      };

      const launch = async (target: Parameters<typeof x.launchExtract>[1]): Promise<number> => {
        const opts = { mode: has("dry") ? ("dry" as const) : ("live" as const), actor, dryOnly, ...(budget === undefined ? {} : { ceilingUsd: budget }) };
        const r0 = await x.launchExtract(store, target, opts);
        if (!r0.ok) throw r0.error;
        if (r0.value.kind === "existing") return drive(r0.value.runId, r0.value.jobId);
        if (r0.value.kind !== "receipt") throw new Error(`extract launch: unexpected ${r0.value.kind}`);
        const rc = r0.value.receipt;
        const line = rc.lines[0];
        say(`receipt (${rc.mode}): ${line?.units ?? 0} source(s) on ${line?.lane ?? "?"} · worst case $${rc.totals.usd} · ~${Math.round(rc.totals.seconds / 60)} min · queue #${rc.queuePos}${rc.ceilingUsd === undefined ? "" : ` · ceiling $${rc.ceilingUsd}`}`);
        // A ceiling under the worst case is a stop point, not a refusal: the job stops before the unit that would cross it.
        if (rc.overCeiling) say(`  may stop at ceiling: the worst case $${rc.totals.usd} is over the $${rc.ceilingUsd ?? 0} ceiling`);
        // The CLI confirms its own receipt (COMMON decision 3): invoking it is the consent.
        const r1 = await x.launchExtract(store, target, { ...opts, token: rc.token });
        if (!r1.ok) throw r1.error;
        if (r1.value.kind !== "launched") throw new Error(`extract launch: the receipt moved while it was confirmed (${r1.value.kind}); run it again`);
        say(`launched ${r1.value.runId} as ${r1.value.jobId}`);
        return drive(r1.value.runId, r1.value.jobId);
      };

      if (has("resume") || has("retry")) {
        const id = flag(has("resume") ? "resume" : "retry");
        if (!id) throw new Usage("--resume/--retry need a run id");
        return await continueRun(id, has("retry"));
      }

      const folder = positional[0];
      const slug = flag("slug");
      if (!folder || !slug) throw new Usage("a folder and --slug are required");
      const abs = path.resolve(folder);
      if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) throw new Usage(`Not a folder: ${abs}`);
      const max = num("max", 40);
      const uploads: ExtractUpload[] = [];
      const skipped: string[] = [];
      for (const n of fs.readdirSync(abs).filter((n) => MIME[path.extname(n).toLowerCase()]).sort((a, b) => a.localeCompare(b))) {
        if (uploads.length >= Math.min(max, MAX_SOURCES)) {
          skipped.push(`${n} (over --max ${max})`);
          continue;
        }
        const bytes = fs.readFileSync(path.join(abs, n));
        if (bytes.length > MAX_SOURCE_BYTES) {
          skipped.push(`${n} (${(bytes.length / 1024 / 1024).toFixed(1)} MB, over the ${MAX_SOURCE_BYTES / 1024 / 1024} MB cap)`);
          continue;
        }
        uploads.push({ name: n, mime: MIME[path.extname(n).toLowerCase()]!, base64: bytes.toString("base64") });
      }
      if (!uploads.length) throw new Usage("no PNG/JPEG/WebP files in that folder");
      say(`${uploads.length} image(s) from ${abs}${skipped.length ? `; skipped ${skipped.length}: ${skipped.join(", ")}` : ""}`);
      const options = {
        rounds: num("rounds", 2),
        replicas: num("replicas", 2),
        transfers: Math.min(num("transfers", 1), TRANSFER_SCENES.length),
        target: num("target", 0.85),
        ...(has("singletons") ? { grouping: "none" as const } : {}),
      };
      if (has("dry")) say(`dry: every vendor call is answered by a stand-in; the run is marked dry and is never committed. Keys: GOOGLE_AI_API_KEY ${io.env["GOOGLE_AI_API_KEY"] ? "set" : "MISSING (pixels + hosted eyes)"} · QWEN_API_KEY ${io.env["QWEN_API_KEY"] ? "set (dev eyes)" : "unset"}`);
      return await launch({ kind: "gallery", slug, uploads, options, folder: abs });
    } finally {
      closeProcessKernel();
    }
  } catch (e) {
    const message = errorMessage(e);
    if (e instanceof Usage) {
      io.err(`${message}\n${USAGE}`);
      if (json) doc({ ok: false, usage: message });
      return 2;
    }
    io.err(message);
    if (json) doc({ ok: false, error: message });
    return 1;
  }
}

/** Load .env then .env.local, without clobbering anything already exported (Next does this for the app). */
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

const entry = process.argv[1];
if (entry !== undefined && pathToFileURL(path.resolve(entry)).href.toLowerCase() === import.meta.url.toLowerCase()) {
  const ROOT = path.resolve(import.meta.dirname, "..", "..");
  loadEnv(ROOT);
  // The stores resolve everything from process.cwd(); make that the repo root wherever the command was typed.
  process.chdir(ROOT);
  process.exitCode = await runCli(process.argv.slice(2), { env: process.env, out: (s) => console.log(s), err: (s) => console.error(s) });
}
