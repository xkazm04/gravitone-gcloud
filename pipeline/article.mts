// ARTICLE — the headless surface of the article pipeline (lib/articles/).
//
//   npx tsx pipeline/article.mts run (--subject <bundle/slug> | --topic "<text>" | --trial <id>) [--angle "<text>"] [--model <id>] [--effort <level>] [--reviewers <file>] [--budget-usd X]
//   npx tsx pipeline/article.mts status [<runId>]          # one run, or the list
//   npx tsx pipeline/article.mts approve <runId> [--patches p1,p2]
//   npx tsx pipeline/article.mts reject <runId> --note "<text>"
//   npx tsx pipeline/article.mts rework <runId> --note "<text>"
//   npx tsx pipeline/article.mts resume <runId> [--reviewers <file>] [--budget-usd X]
//   npx tsx pipeline/article.mts topics [--limit N] [--include-bundle <bundle>]
//   npx tsx pipeline/article.mts loop (--target N | --add N) --budget-usd X [--concurrency 3] [--max-failures 3]
//        [--max-resumes 2] [--run-usd 120] [--turn-usd 30] [--run-turns 45] [--est-run-usd 70] [--topics auto|<file>]
//   npx tsx pipeline/article.mts trial candidates [--limit N]
//   npx tsx pipeline/article.mts trial open <bundle/slug>
//   npx tsx pipeline/article.mts trial check <id>
//   npx tsx pipeline/article.mts trial seal <id>
//   npx tsx pipeline/article.mts trial exec <id> [--pilot] -- <cmd...>
//   npx tsx pipeline/article.mts trial close <id>
//   npx tsx pipeline/article.mts trial drop <id> --reason "<text>"
//   npx tsx pipeline/article.mts trial status [<id>]
//
//   trial is the measured claim a subject run is written around (lib/articles/trial/store.ts):
//   an agent with a shell opens one on a registry subject, frames and checks it, seals its
//   prereg, measures both arms through `trial exec`, and closes it with a verdict computed by
//   code. `run --trial <id>` then writes the post around a closed trial. `trial exec` exits
//   with the command's own code (124 when the wall cap killed it) and prints its record to
//   stderr as one `[trial] {json}` line, so the command's stdout reaches the caller untouched.
//   Everything after `--` is the command's argv, a `--json` in it included.
//
//   topics lists the registry subjects no article covers yet, ranked, each with a suggested
//   angle. loop runs articles to the human gate until N topics are covered (--target is the
//   total, --add the number of new ones) and refuses to start without --budget-usd. See
//   lib/articles/loop.ts for what stops it and what the ceilings do. Neither verb approves.
//
//   --reviewers <file> replaces pipeline/article-reviewers.json for a run whose
//   critique has not started yet (it sets ARTICLES_REVIEWERS_FILE); a run that
//   has begun its critique keeps the panel it snapshotted.
//
//   --json on any command: one JSON document on stdout, nothing else.
//   Exit 0 ok · 1 the operation failed (a failed run, a refused approval) · 2 usage.
//
//   EVERY VERB THAT SPENDS OR LANDS IS A KERNEL JOB (Phase 4, L30; lib/producers/article.ts).
//   `run` launches the run's gate job (a receipt, then this CLI's own confirm), `approve`
//   enqueues the landing job, `rework` the rework's job, `resume` retries the run's job (or
//   gives a v1 run its first one) - the SAME records the /articles routes and the Board make,
//   so a run launched in the browser is resumed here by its run id, and the reverse. This
//   process then drives the job under the kernel's seat.text slot lease, unless:
//     --detach      enqueue only and print the job id; the worker (npm run worker) drives it
//     --dry         a dry job: every agent turn is answered by the stand-in
//                   (lib/articles/dryStandIn.mjs, or ARTICLES_DRY_AGENT_BIN), nothing is spent,
//                   and the would-calls are counted. A dry run's approval lands nothing.
//     --budget-usd  on `run`: the job's ceiling. A run is priced at up to $92, so a ceiling
//                   under that is refused at the receipt, before anything is created; one
//                   above it is held between steps and between the turns inside a step.
//   GRAVITONE_DRY_ONLY=1 refuses every live job (decision 4).
//
// `rework` is the third act at the gate: it sends the draft back with the note,
// keeps the research and outline, and drives draft, critique and check again to
// the gate. A real agent session on the operator's seat, like `resume`; it is
// the operator's act, not an agent's.
//
// `run` drives to the human gate and stops: it prints {runId, dir, status, jobId, mode} with
// status `awaiting-approval` on success. It never approves. `approve` is the
// human's act — it records the approval and then lands the post in the
// registry (a branch, the registry gates, a PR); it is not for an agent.
//
// IT OWNS NO LOGIC. Every verb is one call into lib/producers/article.ts or
// lib/articles/engine.ts — the same calls the /api/articles routes make.
//
// SPENDING. `run` and `resume` start real agent sessions on the operator's
// logged-in Claude seat (research uses web tools), and the critique runs the
// reviewer panel through the local claude, codex and agy CLIs on the
// operator's own logins. `--dry` replaces every one of them with the stub for
// that job, whatever the environment says. (ARTICLES_AGENT_BIN, ARTICLES_CODEX_BIN
// and ARTICLES_AGY_BIN still point the LIVE seam at another binary - the probes'
// fake vendor - and are no longer how a dry run is made.)

import fs from "node:fs";
import { userInfo } from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

/** .env then .env.local, never clobbering an exported value — the loader
 *  pipeline/publish.mts uses. */
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
loadEnv(ROOT);
// A path the caller typed (--reviewers) is relative to where they typed it.
const CALLER_CWD = process.cwd();
// The store root and the prompt file are cwd-relative, as in the server.
process.chdir(ROOT);

const { getRun, listArticleRuns, rejectRun } = await import("../lib/articles/engine");
const { listUncoveredTopics, runLoop } = await import("../lib/articles/loop");
const { ArticleError, readRun, runDir } = await import("../lib/articles/store");
const { approveArticle, articleJobsOf, articleKernel, driveArticle, launchArticle, loopDriver, resumeArticle, reworkArticle } = await import("../lib/producers/article");
const { closeProcessKernel } = await import("@gt/kernel/process");
type AppError = import("@gt/domain/errors").AppError;
const { EFFORT_LEVELS } = await import("../lib/articles/types");
const { checkTrial, closeTrial, describeTrial, dropTrial, execTrial, openTrial, readTrial, scanTrials, sealTrial } = await import("../lib/articles/trial/store");
const { rankTrialCandidates } = await import("../lib/articles/trial/candidates");
const { leadsFile } = await import("../lib/articles/trial/leads");
type ArticleRun = import("../lib/articles/types").ArticleRun;
type TrialStatusView = import("../lib/articles/trial/store").TrialStatusView;
type EffortLevel = import("../lib/articles/types").EffortLevel;

const argv = process.argv.slice(2);
// `trial exec <id> -- <cmd...>`: everything after the first `--` is the command's argv and is
// never read as this CLI's flags (a `--json` there belongs to the command).
const DASHES = argv.indexOf("--");
const own = DASHES < 0 ? argv : argv.slice(0, DASHES);
const childArgv = DASHES < 0 ? [] : argv.slice(DASHES + 1);
const JSON_OUT = own.includes("--json");
const DRY = own.includes("--dry");
const DETACH = own.includes("--detach");
const args = own.filter((a) => a !== "--json" && a !== "--dry" && a !== "--detach");
const cmd = args[0];
/** The operator at this terminal: their confirm arms a live job, their retry may re-spend. */
const ACTOR = { kind: "operator", id: userInfo().username || "operator" } as const;
const acts = (ceilingUsd?: number) => ({ actor: ACTOR, mode: DRY ? ("dry" as const) : ("live" as const), ...(ceilingUsd === undefined ? {} : { ceilingUsd }) });

// --json promises ONE document on stdout. The engine's per-turn log lines
// ([agent] …) are written with console.log; under --json they go to stderr.
const emit = (s: string) => process.stdout.write(`${s}\n`);
if (JSON_OUT) console.log = (...a: unknown[]) => console.error(...a);

function usage(msg?: string): never {
  if (JSON_OUT) emit(JSON.stringify({ error: msg ?? "usage" }));
  else {
    if (msg) console.error(`article: ${msg}\n`);
    console.error(
      "usage: npx tsx pipeline/article.mts <run|status|approve|reject|rework|resume|topics|loop|trial> [--json]\n" +
        '  run (--subject <bundle/slug> | --topic "<text>" | --trial <id>) [--angle "<text>"] [--model <id>] [--effort low|medium|high|xhigh|max] [--reviewers <file>] [--budget-usd X]\n' +
        "  status [<runId>]   approve <runId> [--patches p1,p2]   reject <runId> --note \"<text>\"   rework <runId> --note \"<text>\"   resume <runId> [--reviewers <file>] [--budget-usd X]\n" +
        "  run, approve, rework, resume, loop also take --dry (a dry job: the stub answers, nothing spends) and --detach (enqueue; the worker drives)\n" +
        "  topics [--limit N] [--include-bundle <bundle>]\n" +
        "  loop (--target N | --add N) --budget-usd X [--concurrency 3] [--max-failures 3] [--max-resumes 2] [--run-usd 120] [--turn-usd 30] [--run-turns 45] [--est-run-usd 70] [--topics auto|<file>]\n" +
        "  trial candidates [--limit N]   trial open <bundle/slug>   trial check <id>   trial seal <id>   trial close <id>\n" +
        '  trial exec <id> [--pilot] -- <cmd...>   trial drop <id> --reason "<text>"   trial status [<id>]',
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

/** A positive number flag, or undefined when absent. */
function numFlag(name: string): number | undefined {
  const v = flag(name);
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) usage(`--${name} must be a positive number`);
  return n;
}

function positional(): string {
  const id = args[1];
  if (!id || id.startsWith("--")) usage(`${cmd} needs a run id`);
  return id;
}

function fail(e: unknown): never {
  const msg = e instanceof Error ? e.message : String(e);
  if (JSON_OUT) emit(JSON.stringify({ error: msg, ...(e instanceof ArticleError ? { code: e.code } : {}) }));
  else console.error(`article: ${msg}`);
  closeProcessKernel();
  process.exit(e instanceof ArticleError && e.status === 400 ? 2 : 1);
}

/** A refused act (lib/producers/article.ts): v1's own code when the engine refused it. Bad input is usage. */
function refused(e: AppError): never {
  if (JSON_OUT) emit(JSON.stringify({ error: e.message, code: e.detail ?? e.code }));
  else console.error(`article: ${e.message}`);
  closeProcessKernel();
  process.exit(e.code === "invalid" ? 2 : 1);
}

/** The run directory: repo-relative when it is inside the repo, else absolute. */
const dirOf = (id: string) => {
  const rel = path.relative(ROOT, runDir(id));
  return (rel.startsWith("..") || path.isAbsolute(rel) ? runDir(id) : rel).split(path.sep).join("/");
};
const brief = (r: ArticleRun) => ({ runId: r.id, dir: dirOf(r.id), status: r.status, ...(r.error ? { error: r.error } : {}), ...(r.critique ? { critique: r.critique } : {}) });

const usd = (n: number | undefined) => (n === undefined ? "unpriced" : `$${n.toFixed(4)}`);

/** The critique summary: who reviewed with what outcome, the findings by the
 *  writer's disposition, and the decision. */
function printCritique(c: NonNullable<ArticleRun["critique"]>) {
  const done = c.reviewers.filter((x) => x.outcome === "completed").length;
  console.log(`  critique ${c.rounds} round${c.rounds === 1 ? "" : "s"} · ${done} of ${c.reviewers.length} reviewers completed · decision ${c.decision ?? "(not yet)"}`);
  for (const x of c.reviewers) {
    console.log(`  reviewer ${x.id.padEnd(8)} ${x.engine.padEnd(6)} ${`${x.model}@${x.effort}`.padEnd(24)} ${x.outcome.padEnd(11)} ${usd(x.costUsd)}${x.error ? `  ${x.error}` : ""}`);
  }
  const f = c.findings;
  console.log(`  findings ${f.total} · accepted ${f.accepted} · rejected ${f.rejected} · deferred ${f.deferred}`);
}

function printRun(r: ArticleRun) {
  console.log(`${r.id}  ${r.status}`);
  console.log(`  topic    ${r.topic.kind === "subject" ? `${r.topic.bundle}/${r.topic.subject} — ` : ""}${r.topic.text}${r.topic.angle ? `  (angle: ${r.topic.angle})` : ""}`);
  console.log(`  standard ${r.standard.recipe} ${r.standard.version ?? "(unresolved)"} · ${r.standard.bundle} ${r.standard.bundleHash?.slice(0, 19) ?? ""}`);
  console.log(`  model    ${r.model} · effort ${r.effort}`);
  for (const s of r.steps) console.log(`  step     ${s.name.padEnd(8)} ${s.status.padEnd(7)} ${usd(s.costUsd)}`);
  if (r.critique) printCritique(r.critique);
  if (r.approval) console.log(`  approved ${r.approval.at} patches: ${r.approval.patches.join(", ") || "none"}`);
  if (r.rejection) console.log(`  rejected ${r.rejection.at}: ${r.rejection.note}`);
  if (r.landing) console.log(`  landing  ${r.landing.branch}${r.landing.prUrl ? ` · ${r.landing.prUrl}` : ""}${r.landing.worktree ? ` · worktree ${r.landing.worktree}` : ""}`);
  if (r.error) console.log(`  error    ${r.error}`);
  console.log(`  dir      ${dirOf(r.id)}`);
}

/** A run that stopped anywhere but where the verb meant to take it is exit 1. */
function finish(r: ArticleRun, wanted: ArticleRun["status"][], job?: Record<string, unknown>): never {
  if (JSON_OUT) emit(JSON.stringify({ ...brief(r), ...job }));
  else {
    printRun(r);
    if (job) console.log(`  job      ${String(job["jobId"])} ${String(job["job"] ?? "")} ${String(job["mode"] ?? "")}${job["wouldCalls"] === undefined ? "" : ` · ${String(job["wouldCalls"])} would-calls`}`);
  }
  closeProcessKernel();
  process.exit(wanted.includes(r.status) ? 0 : 1);
}

/**
 * The verb's job, then where the run stands. `--detach` stops at the enqueue (exit 0: the
 * worker drives it); otherwise this process drives the job and the run's status decides the
 * exit. A job the kernel would not start (its lane held after a crash, every slot busy) is
 * exit 1 with the kernel's own sentence.
 */
async function drive(runId: string, jobId: string, wanted: ArticleRun["status"][]): Promise<never> {
  if (DETACH) return finish(await readRun(runId), [(await readRun(runId)).status], { jobId, detached: true, mode: DRY ? "dry" : "live" });
  if (!JSON_OUT) console.error(`article: driving job ${jobId}…`);
  const r = await driveArticle(jobId);
  if (!r.ok) return refused(r.error);
  const rep = r.value;
  const job = { jobId, job: rep.job?.state ?? rep.outcome, mode: rep.job?.mode.kind ?? (DRY ? "dry" : "live"), ...(rep.reason === undefined ? {} : { reason: rep.reason }), ...(rep.wouldCalls === undefined ? {} : { wouldCalls: rep.wouldCalls.length }), ...(rep.job?.error === undefined ? {} : { jobError: rep.job.error.message }), spendUsd: rep.job?.spend.usd ?? 0 };
  const run = await readRun(runId);
  // A dry landing lands nothing: the run stays approved, and that is where the verb meant to take it.
  return finish(run, rep.job?.mode.kind === "dry" && wanted.includes("landed") ? [...wanted, "approved"] : wanted, job);
}

async function main() {
  // The panel override is an environment variable so the engine (and a route
  // in the same process, were there one) reads it the same way.
  const reviewers = cmd === "run" || cmd === "resume" ? flag("reviewers") : undefined;
  if (reviewers) {
    const at = path.resolve(CALLER_CWD, reviewers);
    if (!fs.existsSync(at)) usage(`--reviewers: no such file ${reviewers}`);
    process.env.ARTICLES_REVIEWERS_FILE = at;
  }
  switch (cmd) {
    case "run": {
      const subject = flag("subject");
      const topic = flag("topic");
      const trial = flag("trial");
      if (trial) {
        if (subject || topic) usage("run --trial takes its subject from the trial: leave out --subject and --topic");
      } else if (!!subject === !!topic) usage("run needs exactly one of --subject <bundle/slug> or --topic \"<text>\"");
      const effort = flag("effort");
      if (effort && !EFFORT_LEVELS.includes(effort as EffortLevel)) usage(`--effort must be one of ${EFFORT_LEVELS.join(", ")}`);
      const angle = flag("angle");
      const model = flag("model");
      const budget = numFlag("budget-usd");
      const opts = { ...(model ? { model } : {}), ...(effort ? { effort: effort as EffortLevel } : {}) };
      let input: import("../lib/articles/types").CreateRunInput;
      if (trial) {
        // The topic is the trial's subject; what a run does with a trial is createRun's (the angle
        // defaults to the prereg's question there).
        const t = await readTrial(trial);
        input = { topic: { kind: "subject", bundle: t.subject.bundle, subject: t.subject.slug, text: "", ...(angle ? { angle } : {}) }, trial, ...opts };
      } else if (subject) {
        const m = /^([a-z0-9-]+)\/([a-z0-9-]+)$/.exec(subject);
        if (!m) usage("--subject is <bundle>/<slug>");
        input = { topic: { kind: "subject", bundle: m[1], subject: m[2], text: "", ...(angle ? { angle } : {}) }, ...opts };
      } else {
        input = { topic: { kind: "free", text: topic!, ...(angle ? { angle } : {}) }, ...opts };
      }
      const launched = await launchArticle(input, acts(budget));
      if (!launched.ok) return refused(launched.error);
      const { run: created, jobId, receipt } = launched.value;
      if (!JSON_OUT) console.error(`article: run ${created.id} created (${created.status}) · receipt ${receipt.token.slice(0, 12)} · ${DRY ? "dry" : "live"}${budget === undefined ? "" : ` · ceiling $${budget}`}; ${jobId === undefined ? "no job" : DETACH ? "enqueued" : "driving to the human gate…"}`);
      if (jobId === undefined) return finish(created, ["awaiting-approval"]);
      return drive(created.id, jobId, ["awaiting-approval"]);
    }
    case "status": {
      const id = args[1] && !args[1].startsWith("--") ? args[1] : undefined;
      if (id) {
        const r = await getRun(id);
        const k = articleKernel();
        const jobs = k.ok ? articleJobsOf(id, k.value.store) : k;
        const rows = jobs.ok ? jobs.value.map((j) => ({ id: j.id, state: j.state, mode: j.mode.kind, spendUsd: j.spend.usd, ...(j.interruption?.stage === undefined ? {} : { stage: j.interruption.stage }) })) : [];
        if (JSON_OUT) return emit(JSON.stringify({ ...r, jobs: rows }, null, 2));
        printRun(r);
        for (const j of rows) console.log(`  job      ${j.id} ${j.state} ${j.mode} $${j.spendUsd.toFixed(4)}${j.stage === undefined ? "" : ` (interrupted at ${j.stage})`}`);
        return;
      }
      const { runs, damaged } = await listArticleRuns();
      if (JSON_OUT) return emit(JSON.stringify({ runs: runs.map(brief), damaged }, null, 2));
      if (!runs.length) console.log("  (no runs)");
      for (const r of runs) console.log(`  ${r.id.padEnd(56)} ${r.status.padEnd(18)} ${r.topic.text.slice(0, 50)}`);
      if (damaged.length) console.log(`  damaged: ${damaged.join(", ")}`);
      return;
    }
    case "approve": {
      const id = positional();
      const list = flag("patches");
      const patches = list ? list.split(",").map((s) => s.trim()).filter(Boolean) : [];
      const r = await approveArticle(id, patches, acts());
      if (!r.ok) return refused(r.error);
      if (!JSON_OUT) console.error(`article: ${id} approved; landing job ${r.value.jobId}…`);
      return drive(id, r.value.jobId, ["landed"]);
    }
    case "reject": {
      const id = positional();
      const note = flag("note") ?? usage("reject needs --note \"<text>\"");
      return finish(await rejectRun(id, note), ["rejected"]);
    }
    case "rework": {
      const id = positional();
      const note = flag("note") ?? usage("rework needs --note \"<text>\"");
      const r = await reworkArticle(id, note, acts());
      if (!r.ok) return refused(r.error);
      if (!JSON_OUT) console.error(`article: ${id} sent back (rework ${r.value.run.rework?.count}); job ${r.value.jobId} re-drafts from the kept research…`);
      return drive(id, r.value.jobId, ["awaiting-approval"]);
    }
    case "topics": {
      const limit = numFlag("limit");
      const inc = flag("include-bundle");
      const out = await listUncoveredTopics({ ...(limit ? { limit } : {}), ...(inc ? { includeBundles: [inc] } : {}) });
      if (JSON_OUT) return emit(JSON.stringify(out, null, 2));
      console.log(`  covered ${out.covered.length} · in flight ${out.claimed.length} · uncovered ${out.remaining}`);
      for (const t of out.topics) console.log(`  ${`${t.bundle}/${t.slug}`.padEnd(64)} ${t.title}`);
      return;
    }
    case "loop": {
      const target = numFlag("target");
      const add = numFlag("add");
      if (!!target === !!add) usage("loop needs exactly one of --target N (total covered topics) and --add N (new ones)");
      const budgetUsd = numFlag("budget-usd");
      if (!budgetUsd) usage("loop needs --budget-usd X: there is no default, a loop spends until it is told where to stop");
      const topicsArg = flag("topics");
      let topics: { subject: string; angle?: string }[] | undefined;
      if (topicsArg && topicsArg !== "auto") {
        const at = path.resolve(CALLER_CWD, topicsArg);
        if (!fs.existsSync(at)) usage(`--topics: no such file ${topicsArg}`);
        const raw = JSON.parse(fs.readFileSync(at, "utf8")) as unknown;
        if (!Array.isArray(raw)) usage("--topics file is a JSON array of \"bundle/slug\" or {subject, angle}");
        topics = (raw as (string | { subject: string; angle?: string })[]).map((x) => (typeof x === "string" ? { subject: x } : x));
        for (const t of topics) if (!/^[a-z0-9-]+\/[a-z0-9-]+$/.test(t.subject ?? "")) usage(`--topics: ${JSON.stringify(t.subject)} is not <bundle>/<slug>`);
      }
      const mr = flag("max-resumes");
      const maxResumes = mr === undefined ? undefined : Number(mr);
      if (maxResumes !== undefined && (!Number.isInteger(maxResumes) || maxResumes < 0)) usage("--max-resumes must be 0 or a positive integer");
      const ceilings = { ...(numFlag("run-usd") ? { runUsd: numFlag("run-usd") } : {}), ...(numFlag("turn-usd") ? { turnUsd: numFlag("turn-usd") } : {}), ...(numFlag("run-turns") ? { runTurns: numFlag("run-turns") } : {}) };
      const report = await runLoop({
        ...(target ? { target } : { add }),
        budgetUsd: budgetUsd!,
        ...(numFlag("concurrency") ? { concurrency: numFlag("concurrency") } : {}),
        ...(numFlag("max-failures") ? { maxFailures: numFlag("max-failures") } : {}),
        ...(maxResumes !== undefined ? { maxResumes } : {}),
        ...(numFlag("est-run-usd") ? { estRunUsd: numFlag("est-run-usd") } : {}),
        ceilings: ceilings as Partial<import("../lib/articles/loop").Ceilings>,
        ...(topics ? { topics } : {}),
      }, undefined, (line) => console.error(`article: ${line}`), loopDriver(acts()));
      if (JSON_OUT) emit(JSON.stringify(report));
      else {
        console.log(`${report.id}  ${report.stop}  ${report.reason ?? ""}`);
        console.log(`  covered ${report.coveredAtStart} -> ${report.coveredNow} of ${report.options.target} · reported spend $${report.spentUsd.toFixed(2)} of $${report.options.budgetUsd}`);
        for (const r of report.runs) console.log(`  ${r.topic.padEnd(56)} ${r.end.padEnd(16)} ${r.runId}  $${r.costUsd.toFixed(2)}  ${r.turns} turns${r.resumes ? `  ${r.resumes} resumes` : ""}${r.error ? `  ${r.error.slice(0, 80)}` : ""}`);
        if (report.orphaned.length) console.log(`  orphaned (no driver, not finished): ${report.orphaned.join(", ")}`);
        console.log(`  ${report.note}`);
      }
      closeProcessKernel();
      process.exit(report.stop === "target-reached" ? 0 : 1);
    }
    case "trial":
      return trialVerb();
    case "resume": {
      const id = positional();
      // --budget-usd on resume raises the job's ceiling with the retry (a job stopped for budget).
      const r = await resumeArticle(id, acts(numFlag("budget-usd")));
      if (!r.ok) return refused(r.error);
      if (!JSON_OUT) console.error(`article: ${id} resumed at ${r.value.run.status} (job ${r.value.jobId})…`);
      return drive(id, r.value.jobId, ["awaiting-approval", "landed"]);
    }
    default:
      usage(cmd ? `unknown command ${cmd}` : undefined);
  }
}

/* ── trial ─────────────────────────────────────────────────────────────────── */

/** A path as the operator reads it: repo-relative inside the repo, else absolute. */
const shown = (abs: string) => {
  const rel = path.relative(ROOT, abs);
  return (rel.startsWith("..") || path.isAbsolute(rel) ? abs : rel).split(path.sep).join("/");
};
const trialDoc = (v: TrialStatusView) => ({ ...v, dir: shown(v.dir) });

function printTrial(v: TrialStatusView) {
  const t = v.trial;
  console.log(`${t.id}  ${t.status}${t.verdict ? `  ${t.verdict}` : ""}`);
  console.log(`  subject  ${t.subject.bundle}/${t.subject.slug} (${t.subject.file})`);
  if (t.seal) console.log(`  sealed   ${t.seal.at} sha256 ${t.seal.sha256.slice(0, 12)}`);
  const measured = v.execs.filter((e) => !e.pilot).length;
  console.log(`  execs    ${measured} measured · ${v.execs.length - measured} pilot · ${Math.round(v.measuredMs / 1000)} s measured${v.budget ? ` of ${v.budget.wallMin} min` : ""}`);
  if (v.verdict) console.log(`  verdict  ${v.verdict.verdict}: ${v.verdict.reason}`);
  if (v.drop) console.log(`  dropped  ${v.drop.at}: ${v.drop.reason}`);
  if (t.runId) console.log(`  run      ${t.runId}`);
  console.log(`  files    ${v.files.join(", ")}`);
  console.log(`  dir      ${shown(v.dir)}`);
}

async function trialVerb() {
  const sub = args[1];
  const id = (): string => {
    const v = args[2];
    if (!v || v.startsWith("--")) usage(`trial ${sub} needs a trial id`);
    return v;
  };
  const out = (doc: unknown, text: () => void) => (JSON_OUT ? emit(JSON.stringify(doc, null, 2)) : text());
  switch (sub) {
    case "candidates": {
      const limit = numFlag("limit");
      const r = await rankTrialCandidates({ ...(limit ? { limit } : {}) });
      return out(r, () => {
        if (!r.candidates.length) console.log("  (no candidates)");
        for (const c of r.candidates) {
          console.log(`  ${String(c.score).padStart(6)}  ${`${c.bundle}/${c.slug}`.padEnd(56)} governs ${c.governsHere} · contested ${c.contested} · at risk ${c.atRisk} · volatile ${c.volatile}  ${c.title}`);
        }
        if (r.claimed.length) console.log(`  claimed: ${r.claimed.join(", ")}`);
      });
    }
    case "open": {
      const m = /^([a-z0-9-]+)\/([a-z0-9-]+)$/.exec(args[2] ?? "");
      if (!m) usage("trial open needs <bundle>/<slug>");
      const rec = await openTrial({ bundle: m[1], slug: m[2] });
      const v = await describeTrial(rec.id);
      return out(trialDoc(v), () => printTrial(v));
    }
    case "check": {
      const r = await checkTrial(id());
      const v = await describeTrial(r.record.id);
      return out({ ...trialDoc(v), prereg: r.prereg, validity: r.validity }, () => {
        printTrial(v);
        console.log(`  validity ${r.validity.state}${r.validity.reasons.length ? `: ${r.validity.reasons.join("; ")}` : ""}`);
      });
    }
    case "seal": {
      const rec = await sealTrial(id());
      const v = await describeTrial(rec.id);
      return out(trialDoc(v), () => printTrial(v));
    }
    case "exec": {
      const tid = id();
      if (!childArgv.length) usage("trial exec needs a command after --: trial exec <id> [--pilot] -- <cmd...>");
      // Under --json stdout carries the one document, so the command's stdout goes to stderr.
      const r = await execTrial(tid, childArgv, {
        pilot: args.includes("--pilot"),
        onStdout: (c) => void (JSON_OUT ? process.stderr : process.stdout).write(c),
        onStderr: (c) => void process.stderr.write(c),
      });
      if (JSON_OUT) emit(JSON.stringify({ trial: tid, exec: r }));
      else process.stderr.write(`[trial] ${JSON.stringify(r)}\n`);
      process.exit(r.timedOut ? 124 : (r.exitCode ?? 1));
    }
    case "close": {
      const tid = id();
      const verdict = await closeTrial(tid);
      const v = await describeTrial(tid);
      const lead = verdict.verdict === "void" ? { leadsFile: leadsFile() } : undefined;
      return out({ ...trialDoc(v), ...(lead ?? {}) }, () => {
        printTrial(v);
        if (lead) console.log(`  lead     appended to ${lead.leadsFile}`);
      });
    }
    case "drop": {
      const tid = id();
      const reason = flag("reason") ?? usage('trial drop needs --reason "<text>"');
      const r = await dropTrial(tid, reason);
      const v = await describeTrial(tid);
      return out({ ...trialDoc(v), ...(r.lead ? { lead: r.lead, leadsFile: r.leadsFile } : {}) }, () => {
        printTrial(v);
        if (r.lead) console.log(`  lead     ${r.lead.kind} lead appended to ${r.leadsFile}`);
      });
    }
    case "status": {
      const tid = args[2] && !args[2].startsWith("--") ? args[2] : undefined;
      if (tid) {
        const v = await describeTrial(tid);
        return out(trialDoc(v), () => printTrial(v));
      }
      const { trials, damaged } = await scanTrials();
      return out({ trials, damaged }, () => {
        if (!trials.length) console.log("  (no trials)");
        for (const t of trials) console.log(`  ${t.id.padEnd(56)} ${t.status.padEnd(7)} ${(t.verdict ?? "").padEnd(10)} ${t.subject.bundle}/${t.subject.slug}`);
        if (damaged.length) console.log(`  damaged: ${damaged.join(", ")}`);
      });
    }
    default:
      usage(sub ? `unknown trial verb ${sub}` : "trial needs a verb: candidates, open, check, seal, exec, close, drop or status");
  }
}

main().catch(fail);
