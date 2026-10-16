// LAUNCH A FOUNDRY GPU JOB - the forge or a Dojo cycle - as a kernel job.
//
//   node pipeline/foundry/launch.mts forge --run-id <id> [--plan plans/x.json] [--resume] [--dry] [--budget-usd N] [--detach] [--json]
//   node pipeline/foundry/launch.mts dojo <cycle-id | foundry-out/training/<id>> [--resume] [--dry] [--budget-usd N] [--detach] [--json]
//   npx tsx pipeline/foundry/launch.mts dojo <google cycle> ...      (the google stack's live calls need tsx)
//
// The Node half of two Python producers (Phase 4, L34). It computes the RECEIPT
// (the plan x the catalog's pace x the queue - never by performing a step), prints
// it, confirms it itself (decision 3: a CLI confirms its own receipt) and enqueues
// THE job - the one the app's launch would make (lib/producers/{forge,dojo}.ts) -
// then drives it unless --detach:
//   forge, dojo local   gpu.local: driven by `python pipeline/foundry/worker.py --job <id>`
//                       (the card's perform is Python's); --detach leaves it to the
//                       worker loop. forge.py and dojo_run.py call this with --detach
//                       and drive in their own process.
//   dojo google         cloud.google: driven here (kernel runJob), every call metered.
//                       --detach is refused until the Node worker carries `dojo` per
//                       lane (lib/producers/dojo.ts says why).
// An unfinished job of the same run/cycle is reused, never doubled; --resume retries
// a failed or interrupted one (every booked output kept) and runs a done one again.
// Invoked, it runs LIVE (v1's spend behaviour); --dry runs on stand-ins.
//
// EXIT 0 done (or enqueued with --detach) · 1 failed or refused · 2 usage.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { parseJsonAt } from "@gt/domain/door";
import { z } from "zod";

const USAGE = [
  "usage:",
  "  node pipeline/foundry/launch.mts forge --run-id <id> [--plan <plan.json>] [--resume] [--dry] [--budget-usd N] [--detach] [--json]",
  "  node pipeline/foundry/launch.mts dojo <cycle-id|dir> [--resume] [--dry] [--budget-usd N] [--detach] [--json]",
].join("\n");

type Io = { readonly env: Readonly<Record<string, string | undefined>>; readonly out: (s: string) => void; readonly err: (s: string) => void };
type Doc = Record<string, unknown>;
class Usage extends Error {}

const FLAGS = new Set(["--dry", "--resume", "--detach", "--json"]);
const VALUED = new Set(["--run-id", "--plan", "--budget-usd"]);

function parse(argv: readonly string[]): { producer: string; positional: string[]; flags: Set<string>; values: Map<string, string> } {
  const [producer, ...rest] = argv;
  if (producer !== "forge" && producer !== "dojo") throw new Usage(`unknown producer ${JSON.stringify(producer ?? "")}`);
  const positional: string[] = [];
  const flags = new Set<string>();
  const values = new Map<string, string>();
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i] ?? "";
    if (FLAGS.has(a)) flags.add(a);
    else if (VALUED.has(a)) {
      const v = rest[++i];
      if (v === undefined || v.startsWith("--")) throw new Usage(`${a} needs a value`);
      values.set(a, v);
    } else if (a.startsWith("--")) throw new Usage(`unknown flag ${a}`);
    else positional.push(a);
  }
  return { producer, positional, flags, values };
}

function pythonDrive(jobId: string, io: Io, json: boolean): { code: number; doc?: Doc } {
  const python = io.env["PYTHON"] ?? (process.platform === "win32" ? "python" : "python3");
  const worker = path.resolve("pipeline", "foundry", "worker.py");
  // One explicit argv, no shell; the worker's progress goes to our stderr, its document to us.
  const r = spawnSync(python, [worker, "--job", jobId, "--json"], { stdio: ["ignore", "pipe", "inherit"], encoding: "utf8", env: { ...process.env } });
  const last = (r.stdout ?? "").trim().split("\n").at(-1) ?? "";
  // The worker's own document, relayed; a worker that died before writing one leaves only its exit code.
  const parsed = last === "" ? undefined : parseJsonAt("worker.py --json", z.record(z.string(), z.unknown()), last);
  const doc: Doc | undefined = parsed?.ok === true ? parsed.value : undefined;
  if (!json && doc !== undefined) io.err(`worker: ${String(doc["jobId"])} ${String(doc["outcome"])} -> ${String(doc["state"])}${doc["error"] ? `: ${String(doc["error"])}` : ""}`);
  return { code: r.status ?? 1, ...(doc === undefined ? {} : { doc }) };
}

export async function main(argv: readonly string[], io: Io): Promise<number> {
  let a: ReturnType<typeof parse>;
  try {
    a = parse(argv);
  } catch (e) {
    if (e instanceof Usage) {
      io.err(`${e.message}\n${USAGE}`);
      return 2;
    }
    throw e;
  }
  const json = a.flags.has("--json");
  const say = (s: string): void => (json ? io.err(s) : io.out(s));
  const emit = (doc: Doc, code: number): number => {
    if (json) io.out(JSON.stringify(doc));
    return code;
  };
  const budgetRaw = a.values.get("--budget-usd");
  const budget = budgetRaw === undefined ? undefined : Number(budgetRaw);
  if (budget !== undefined && !(Number.isFinite(budget) && budget >= 0)) {
    io.err(`--budget-usd takes a number of dollars; got ${JSON.stringify(budgetRaw)}\n${USAGE}`);
    return 2;
  }

  const { OUT_DIRNAME } = await import("../../lib/fixtures/mode.ts");
  const { closeProcessKernel, processKernel, storeLocation } = await import("@gt/kernel/process");
  const { dryOnlyFrom } = await import("@gt/kernel/dryrun");
  const location = storeLocation(OUT_DIRNAME, io.env["GRAVITONE_STORE_PATH"]);
  const opened = processKernel(location);
  if (!opened.ok) return emit({ ok: false, error: opened.error.message }, 1);
  const store = opened.value.store;
  const actor = { kind: "operator" as const, id: "cli" };
  const base = { mode: a.flags.has("--dry") ? ("dry" as const) : ("live" as const), actor, dryOnly: dryOnlyFrom(io.env), resume: a.flags.has("--resume"), ...(budget === undefined ? {} : { ceilingUsd: budget }) };

  try {
    if (a.producer === "forge") {
      const runId = a.values.get("--run-id");
      if (runId === undefined) {
        io.err(`forge needs --run-id\n${USAGE}`);
        return 2;
      }
      const f = await import("../../lib/producers/forge.ts");
      const plan = a.values.get("--plan");
      if (plan !== undefined && !f.readForgeRun(runId).ok) {
        const prepared = f.prepareForgeRun(plan, runId, { ...(io.env["PYTHON"] === undefined ? {} : { python: io.env["PYTHON"] }) });
        if (!prepared.ok) return emit({ ok: false, runId, error: prepared.error.message }, 1);
      }
      const first = f.launchForge(store, runId, base);
      if (!first.ok) return emit({ ok: false, runId, error: first.error.message }, 1);
      let l = first.value;
      if (l.kind === "receipt") {
        const t = l.receipt.totals;
        say(`receipt: forge ${runId} · ${l.receipt.lines.map((x) => `${x.units} plate(s) on ${x.lane}`).join(", ")} · ~${Math.round(t.seconds / 60)} min · $${t.usd ?? 0} · ${base.mode}`);
        const confirmed = f.launchForge(store, runId, { ...base, token: l.receipt.token });
        if (!confirmed.ok) return emit({ ok: false, runId, error: confirmed.error.message }, 1);
        l = confirmed.value;
      }
      if (l.kind === "stale" || l.kind === "receipt") return emit({ ok: false, runId, error: "the receipt moved while it was being confirmed; launch again" }, 1);
      say(`forge: ${l.kind} job ${l.jobId}`);
      const head = { runId, jobId: l.jobId, kind: l.kind, lane: "gpu.local", mode: base.mode, ...(l.kind === "existing" ? { state: l.state } : { receipt: l.receipt }) };
      if (a.flags.has("--detach")) return emit({ ok: true, ...head, detached: true }, 0);
      closeProcessKernel();
      const d = pythonDrive(l.jobId, io, json);
      return emit({ ok: d.code === 0, ...head, ...(d.doc === undefined ? {} : { outcome: d.doc["outcome"], state: d.doc["state"], ...(d.doc["error"] === undefined ? {} : { error: d.doc["error"] }) }) }, d.code === 0 ? 0 : 1);
    }

    // dojo
    const given = a.positional[0];
    if (given === undefined || a.positional.length > 1) {
      io.err(`dojo needs exactly one cycle\n${USAGE}`);
      return 2;
    }
    const d = await import("../../lib/producers/dojo.ts");
    const root = d.trainingRoot(io.env);
    const asDir = path.resolve(given);
    if ((given.includes("/") || given.includes("\\")) && path.dirname(asDir) !== root) {
      return emit({ ok: false, error: `a Dojo cycle lives under ${root}; ${asDir} does not` }, 1);
    }
    const cycle = path.basename(asDir);
    const first = d.launchDojo(store, cycle, { ...base, root });
    if (!first.ok) return emit({ ok: false, cycle, error: first.error.message }, 1);
    let l = first.value;
    if (l.kind === "receipt") {
      const t = l.receipt.totals;
      say(`receipt: dojo ${cycle} · ${l.runner.stack}/${l.runner.media} on ${l.runner.lane} via ${l.runner.runner} · ~${Math.round(t.seconds / 60)} min · ${t.usd === null ? "unpriced" : `$${t.usd}`} · ${base.mode}`);
      const confirmed = d.launchDojo(store, cycle, { ...base, root, token: l.receipt.token });
      if (!confirmed.ok) return emit({ ok: false, cycle, error: confirmed.error.message }, 1);
      l = confirmed.value;
    }
    if (l.kind === "stale" || l.kind === "receipt") return emit({ ok: false, cycle, error: "the receipt moved while it was being confirmed; launch again" }, 1);
    say(`dojo: ${l.kind} job ${l.jobId}`);
    const head = { cycle, jobId: l.jobId, kind: l.kind, lane: l.runner.lane, stack: l.runner.stack, mode: base.mode, ...(l.kind === "existing" ? { state: l.state } : { receipt: l.receipt }) };
    if (l.runner.stack === "local") {
      if (a.flags.has("--detach")) return emit({ ok: true, ...head, detached: true }, 0);
      closeProcessKernel();
      const r = pythonDrive(l.jobId, io, json);
      return emit({ ok: r.code === 0, ...head, ...(r.doc === undefined ? {} : { outcome: r.doc["outcome"], state: r.doc["state"], ...(r.doc["error"] === undefined ? {} : { error: r.doc["error"] }) }) }, r.code === 0 ? 0 : 1);
    }
    if (a.flags.has("--detach")) {
      return emit({ ok: false, ...head, error: "a google cycle is not left to the worker yet: the Node worker does not carry `dojo` (lib/producers/dojo.ts says why). Run without --detach; the job is enqueued and waits." }, 1);
    }
    const r = await d.driveDojo(store, location, l.jobId, { dryOnly: base.dryOnly, root });
    if (!r.ok) return emit({ ok: false, ...head, error: r.error.message }, 1);
    const rep = r.value;
    say(`dojo: job ${l.jobId} ${rep.outcome}${rep.job === undefined ? "" : ` -> ${rep.job.state}`}`);
    const state = rep.job?.state;
    return emit({ ok: state === "done", ...head, outcome: rep.outcome, ...(state === undefined ? {} : { state }), ...(rep.wouldCalls === undefined ? {} : { wouldCalls: rep.wouldCalls.length }), ...(rep.job?.error === undefined ? {} : { error: rep.job.error.message }) }, state === "done" ? 0 : 1);
  } finally {
    closeProcessKernel();
  }
}

/** .env then .env.local, filling only what the environment does not set (pipeline/foundry/extract.mts `loadEnv`). */
function loadEnv(root: string): void {
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
  process.exitCode = await main(process.argv.slice(2), {
    env: process.env,
    out: (s) => void process.stdout.write(`${s}\n`),
    err: (s) => void process.stderr.write(`${s}\n`),
  });
}
