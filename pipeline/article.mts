// ARTICLE — the headless surface of the article pipeline (lib/articles/).
//
//   npx tsx pipeline/article.mts run (--subject <bundle/slug> | --topic "<text>") [--angle "<text>"] [--model <id>] [--effort <level>] [--reviewers <file>]
//   npx tsx pipeline/article.mts status [<runId>]          # one run, or the list
//   npx tsx pipeline/article.mts approve <runId> [--patches p1,p2]
//   npx tsx pipeline/article.mts reject <runId> --note "<text>"
//   npx tsx pipeline/article.mts rework <runId> --note "<text>"
//   npx tsx pipeline/article.mts resume <runId> [--reviewers <file>]
//   npx tsx pipeline/article.mts topics [--limit N] [--include-bundle <bundle>]
//   npx tsx pipeline/article.mts loop (--target N | --add N) --budget-usd X [--concurrency 3] [--max-failures 3]
//        [--max-resumes 2] [--run-usd 120] [--turn-usd 30] [--run-turns 45] [--est-run-usd 70] [--topics auto|<file>]
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
// `rework` is the third act at the gate: it sends the draft back with the note,
// keeps the research and outline, and drives draft, critique and check again to
// the gate. A real agent session on the operator's seat, like `resume`; it is
// the operator's act, not an agent's.
//
// `run` drives to the human gate and stops: it prints {runId, dir, status} with
// status `awaiting-approval` on success. It never approves. `approve` is the
// human's act — it records the approval and then lands the post in the
// registry (a branch, the registry gates, a PR); it is not for an agent.
//
// IT OWNS NO LOGIC. Every verb is one call into lib/articles/engine.ts — the
// same calls the /api/articles routes make.
//
// SPENDING. `run` and `resume` start real agent sessions on the operator's
// logged-in Claude seat (research uses web tools), and the critique runs the
// reviewer panel through the local claude, codex, grok and agy CLIs on the
// operator's own logins. ARTICLES_AGENT_BIN (the writer and claude reviewers)
// and ARTICLES_CODEX_BIN / ARTICLES_GROK_BIN / ARTICLES_AGY_BIN replace them
// with the stub for a dry run (docs/articles.md, "Headless").

import fs from "node:fs";
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

const { approveRun, createRun, driveRun, getRun, listArticleRuns, rejectRun, resumeRun, reworkRun } = await import("../lib/articles/engine");
const { listUncoveredTopics, runLoop } = await import("../lib/articles/loop");
const { ArticleError, runDir } = await import("../lib/articles/store");
const { EFFORT_LEVELS } = await import("../lib/articles/types");
type ArticleRun = import("../lib/articles/types").ArticleRun;
type EffortLevel = import("../lib/articles/types").EffortLevel;

const argv = process.argv.slice(2);
const JSON_OUT = argv.includes("--json");
const args = argv.filter((a) => a !== "--json");
const cmd = args[0];

// --json promises ONE document on stdout. The engine's per-turn log lines
// ([agent] …) are written with console.log; under --json they go to stderr.
const emit = (s: string) => process.stdout.write(`${s}\n`);
if (JSON_OUT) console.log = (...a: unknown[]) => console.error(...a);

function usage(msg?: string): never {
  if (JSON_OUT) emit(JSON.stringify({ error: msg ?? "usage" }));
  else {
    if (msg) console.error(`article: ${msg}\n`);
    console.error(
      "usage: npx tsx pipeline/article.mts <run|status|approve|reject|rework|resume|topics|loop> [--json]\n" +
        '  run (--subject <bundle/slug> | --topic "<text>") [--angle "<text>"] [--model <id>] [--effort low|medium|high|xhigh|max] [--reviewers <file>]\n' +
        "  status [<runId>]   approve <runId> [--patches p1,p2]   reject <runId> --note \"<text>\"   rework <runId> --note \"<text>\"   resume <runId> [--reviewers <file>]\n" +
        "  topics [--limit N] [--include-bundle <bundle>]\n" +
        "  loop (--target N | --add N) --budget-usd X [--concurrency 3] [--max-failures 3] [--max-resumes 2] [--run-usd 120] [--turn-usd 30] [--run-turns 45] [--est-run-usd 70] [--topics auto|<file>]",
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
  process.exit(e instanceof ArticleError && e.status === 400 ? 2 : 1);
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
function finish(r: ArticleRun, wanted: ArticleRun["status"][]) {
  if (JSON_OUT) emit(JSON.stringify(brief(r)));
  else printRun(r);
  process.exit(wanted.includes(r.status) ? 0 : 1);
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
      if (!!subject === !!topic) usage("run needs exactly one of --subject <bundle/slug> or --topic \"<text>\"");
      const effort = flag("effort");
      if (effort && !EFFORT_LEVELS.includes(effort as EffortLevel)) usage(`--effort must be one of ${EFFORT_LEVELS.join(", ")}`);
      const angle = flag("angle");
      const model = flag("model");
      let created: ArticleRun;
      if (subject) {
        const m = /^([a-z0-9-]+)\/([a-z0-9-]+)$/.exec(subject);
        if (!m) usage("--subject is <bundle>/<slug>");
        created = await createRun({ topic: { kind: "subject", bundle: m[1], subject: m[2], text: "", ...(angle ? { angle } : {}) }, ...(model ? { model } : {}), ...(effort ? { effort: effort as EffortLevel } : {}) });
      } else {
        created = await createRun({ topic: { kind: "free", text: topic!, ...(angle ? { angle } : {}) }, ...(model ? { model } : {}), ...(effort ? { effort: effort as EffortLevel } : {}) });
      }
      if (!JSON_OUT) console.error(`article: run ${created.id} created (${created.status}); driving to the human gate…`);
      const done = created.status === "failed" ? created : await driveRun(created.id);
      return finish(done, ["awaiting-approval"]);
    }
    case "status": {
      const id = args[1] && !args[1].startsWith("--") ? args[1] : undefined;
      if (id) {
        const r = await getRun(id);
        if (JSON_OUT) return emit(JSON.stringify(r, null, 2));
        return printRun(r);
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
      await approveRun(id, patches);
      if (!JSON_OUT) console.error(`article: ${id} approved; landing in the registry…`);
      return finish(await driveRun(id), ["landed"]);
    }
    case "reject": {
      const id = positional();
      const note = flag("note") ?? usage("reject needs --note \"<text>\"");
      return finish(await rejectRun(id, note), ["rejected"]);
    }
    case "rework": {
      const id = positional();
      const note = flag("note") ?? usage("rework needs --note \"<text>\"");
      const r = await reworkRun(id, note);
      if (!JSON_OUT) console.error(`article: ${id} sent back (rework ${r.rework?.count}); re-drafting from the kept research…`);
      return finish(await driveRun(id), ["awaiting-approval"]);
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
      }, undefined, (line) => console.error(`article: ${line}`));
      if (JSON_OUT) emit(JSON.stringify(report));
      else {
        console.log(`${report.id}  ${report.stop}  ${report.reason ?? ""}`);
        console.log(`  covered ${report.coveredAtStart} -> ${report.coveredNow} of ${report.options.target} · reported spend $${report.spentUsd.toFixed(2)} of $${report.options.budgetUsd}`);
        for (const r of report.runs) console.log(`  ${r.topic.padEnd(56)} ${r.end.padEnd(16)} ${r.runId}  $${r.costUsd.toFixed(2)}  ${r.turns} turns${r.resumes ? `  ${r.resumes} resumes` : ""}${r.error ? `  ${r.error.slice(0, 80)}` : ""}`);
        if (report.orphaned.length) console.log(`  orphaned (no driver, not finished): ${report.orphaned.join(", ")}`);
        console.log(`  ${report.note}`);
      }
      process.exit(report.stop === "target-reached" ? 0 : 1);
    }
    case "resume": {
      const id = positional();
      const r = await resumeRun(id);
      if (!JSON_OUT) console.error(`article: ${id} resumed at ${r.status}…`);
      return finish(await driveRun(id), ["awaiting-approval", "landed"]);
    }
    default:
      usage(cmd ? `unknown command ${cmd}` : undefined);
  }
}

main().catch(fail);
