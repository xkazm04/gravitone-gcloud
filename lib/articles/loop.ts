// THE ARTICLE LOOP — "write until N topics are covered", under a budget. Server-only.
//
//   topics   the registry subjects no article covers yet, ranked deterministically, each
//            with a suggested angle (listUncoveredTopics)
//   loop     drive runs to the human gate with bounded concurrency until the target
//            number of covered topics is reached or something stops it (runLoop)
//
// WHAT COUNTS AS COVERED. A topic is covered when a run on it reached awaiting-approval,
// approved, landing or landed, or when the registry's publications lane holds a post on it.
// A run that is failed or rejected does not count, and neither does one still running: a
// running run is CLAIMED (the loop will not start a second article on the subject) but not
// covered. The target is a total ("12 covered"), not a number of new articles; `add` is the
// other spelling ("write 4 more").
//
// WHAT STOPS IT, in the order the report names them:
//   target-reached   the covered count met the target
//   budget-stopped   reported spend crossed the budget, or the next run would not fit in it
//   failure-stopped  maxFailures topics ended failed (each already resumed maxResumes times)
//   topics-exhausted no uncovered topic left to try
//   ceiling-stopped  (per run, not per loop) one run hit its cost or turn ceiling; that run is
//                    marked for a human and is never resumed by the loop
//
// THE CEILINGS ARE BOUNDARY CHECKS. Every agent turn of a run, writer or reviewer, goes
// through a guard that runs before the turn starts. It refuses the turn when the run is over
// its cost or turn ceiling, or the loop is over its budget; the refusal reaches the engine as
// an ordinary failed turn, so the run lands in `failed` with the reason in its error. A writer
// turn also gets `--max-budget-usd` (the smaller of the per-turn cap and what is left of the
// run's ceiling), so one runaway revise turn is stopped inside the turn too. COST HERE IS
// WHAT THE ENGINE REPORTS: the Claude seat's turns. Codex and agy turns report nothing, so
// the real cost of a run is higher than the ledger. Set the budget with that margin.
//
// NO CHILD PROCESSES HERE. The loop calls the engine in this process; the engine's agent
// seam (lib/agent/cliSeam.ts) is what spawns the CLIs, with its own argv fence and
// environment strip. The loop adds no shell and no environment of its own.

import fs from "node:fs/promises";
import path from "node:path";

import type { RunAgentInput, AgentResult } from "@/lib/agent/cliSeam";

import { createRun, defaultDeps, driveRun, resumeRun, type EngineDeps } from "./engine";
import { listTopicSubjects, resolveRegistryDir, resolveTopicSubject } from "./registryRead";
import { ArticleError, driverAlive, listRuns, storeRoot, writeJsonAtomic } from "./store";
import type { ArticleRun, ArticleStatus, TopicSubject } from "./types";

/* ── covered topics ────────────────────────────────────────────────────────── */

export const COVERING_STATUSES: readonly ArticleStatus[] = ["awaiting-approval", "approved", "landing", "landed"];
const NOT_RUNNING: readonly ArticleStatus[] = ["failed", "rejected", ...COVERING_STATUSES];

/** The bundle the standard itself lives in. A post about how to write posts is circular
 *  evidence, so it is not offered unless the caller names it. */
export const EXCLUDED_BUNDLES: readonly string[] = ["technical-writing"];

export interface CoveredItem {
  /** `bundle/slug`, or `free:<slug of the text>` for a free-text topic. */
  key: string;
  source: "run" | "publication";
  /** The run id or the publication slug. */
  ref: string;
  status: string;
}

export interface Coverage {
  covered: CoveredItem[];
  /** Subjects with a run in flight or a failed run's driver still alive: do not start another. */
  claimed: string[];
  /** Runs that are neither finished nor driven by anyone (a killed process). */
  orphaned: string[];
}

const freeKey = (text: string) => `free:${text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60)}`;
const topicKey = (t: ArticleRun["topic"]) => (t.kind === "subject" && t.bundle && t.subject ? `${t.bundle}/${t.subject}` : freeKey(t.text));

/** Read the publications lane directly: publications/<slug>/publication.json carries the topic
 *  (publications/index.json leaves it out). A lane that is absent or unreadable is empty. */
async function publicationItems(registryDir: string): Promise<{ item: CoveredItem; runId?: string }[]> {
  const root = path.join(registryDir, "publications");
  let names: string[] = [];
  try {
    names = (await fs.readdir(root, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return [];
  }
  const out: { item: CoveredItem; runId?: string }[] = [];
  for (const slug of names.sort()) {
    try {
      const p = JSON.parse(await fs.readFile(path.join(root, slug, "publication.json"), "utf8")) as {
        topic?: { kind?: string; bundle?: string; subject?: string; text?: string };
        status?: string;
        run?: { id?: string };
      };
      const t = p.topic ?? {};
      const key = t.kind === "subject" && t.bundle && t.subject ? `${t.bundle}/${t.subject}` : freeKey(t.text ?? slug);
      out.push({ item: { key, source: "publication", ref: slug, status: p.status ?? "approved" }, runId: p.run?.id });
    } catch {
      /* a publication that cannot be read covers nothing */
    }
  }
  return out;
}

export async function coverage(registryDir: string = resolveRegistryDir().dir): Promise<Coverage> {
  const { runs } = await listRuns();
  const covered: CoveredItem[] = [];
  const claimed: string[] = [];
  const orphaned: string[] = [];
  for (const r of runs) {
    const key = topicKey(r.topic);
    if (COVERING_STATUSES.includes(r.status)) covered.push({ key, source: "run", ref: r.id, status: r.status });
    else if (!NOT_RUNNING.includes(r.status)) {
      claimed.push(key);
      if (!(await driverAlive(r.id))) orphaned.push(r.id);
    }
  }
  const have = new Set(covered.map((c) => c.ref));
  for (const { item, runId } of await publicationItems(registryDir)) {
    // A landed run is also a publication: count the post once.
    if (runId && [...have].some((ref) => runId.startsWith(ref))) continue;
    if (covered.some((c) => c.key === item.key && c.source === "run" && c.status === "landed")) continue;
    covered.push(item);
  }
  return { covered, claimed: [...new Set(claimed)].sort(), orphaned };
}

/* ── ranking ───────────────────────────────────────────────────────────────── */

export interface RankedTopic {
  bundle: string;
  slug: string;
  category: string;
  file: string;
}

/** The uncovered subjects, ranked. Pure: the same registry and the same coverage give the same
 *  list on every machine. The order spreads the articles over bundles: bundles with the fewest
 *  covered topics first (ties by name), and inside a bundle by category then slug, taken
 *  round-robin so one bundle does not fill the top of the list. */
export function rankUncovered(
  subjects: readonly TopicSubject[],
  cov: Pick<Coverage, "covered" | "claimed">,
  opts: { excludeBundles?: readonly string[] } = {},
): RankedTopic[] {
  const excluded = new Set(opts.excludeBundles ?? EXCLUDED_BUNDLES);
  const taken = new Set([...cov.covered.map((c) => c.key), ...cov.claimed]);
  const perBundle = new Map<string, RankedTopic[]>();
  for (const s of subjects) {
    if (excluded.has(s.bundle) || taken.has(`${s.bundle}/${s.slug}`)) continue;
    const list = perBundle.get(s.bundle) ?? [];
    list.push({ bundle: s.bundle, slug: s.slug, category: s.category, file: s.file });
    perBundle.set(s.bundle, list);
  }
  const coveredIn = (b: string) => cov.covered.filter((c) => c.key.startsWith(`${b}/`)).length;
  const bundles = [...perBundle.keys()].sort((a, b) => coveredIn(a) - coveredIn(b) || a.localeCompare(b));
  for (const b of bundles) perBundle.get(b)!.sort((x, y) => x.category.localeCompare(y.category) || x.slug.localeCompare(y.slug));
  const out: RankedTopic[] = [];
  for (let i = 0; ; i++) {
    let any = false;
    for (const b of bundles) {
      const t = perBundle.get(b)![i];
      if (t) {
        out.push(t);
        any = true;
      }
    }
    if (!any) break;
  }
  return out;
}

/** The angle a topic is offered with. It is a default, not a verdict: the dialogue lets the human
 *  replace it. It carries the two rules that every run so far needed said up front. */
export function suggestAngle(title: string): string {
  return `${title}: the situation that makes a reader care, then what is measured and what is only argued. ` +
    "Say in the preview whether the evidence is first-party (we measured it) or third-party (we read it). " +
    "Label our own conclusions as Derived, Inference or assumption.";
}

export interface TopicChoice extends RankedTopic {
  title: string;
  angle: string;
}

/** The top `limit` uncovered topics with their titles (the golden path's first heading). */
export async function listUncoveredTopics(opts: { limit?: number; includeBundles?: string[] } = {}): Promise<{ topics: TopicChoice[]; covered: CoveredItem[]; claimed: string[]; remaining: number }> {
  const registry = resolveRegistryDir();
  const [subjects, cov] = await Promise.all([listTopicSubjects(registry), coverage(registry.dir)]);
  const excluded = EXCLUDED_BUNDLES.filter((b) => !opts.includeBundles?.includes(b));
  const ranked = rankUncovered(subjects, cov, { excludeBundles: excluded });
  const limit = Math.max(1, Math.min(opts.limit ?? 10, 50));
  const topics: TopicChoice[] = [];
  for (const r of ranked.slice(0, limit)) {
    let title = r.slug.replace(/-/g, " ");
    try {
      title = (await resolveTopicSubject(`${r.bundle}/${r.slug}`, registry)).title;
    } catch {
      /* the slug will do */
    }
    topics.push({ ...r, title, angle: suggestAngle(title) });
  }
  return { topics, covered: cov.covered, claimed: cov.claimed, remaining: ranked.length };
}

/* ── the guard ─────────────────────────────────────────────────────────────── */

export interface Ceilings {
  /** Stop a run at the next turn boundary once its reported cost reaches this. */
  runUsd: number;
  /** Passed to the writer's CLI as --max-budget-usd: no single turn may pass it. */
  turnUsd: number;
  /** Agent turns (writer and reviewer) a run may start. */
  runTurns: number;
}

/** What the observed runs cost (2026-10): a run $47 to $92 of reported spend, 26 to 32 turns, the
 *  costliest turn $17.61. The defaults sit above the worst of those so a normal run is never cut. */
export const DEFAULT_CEILINGS: Ceilings = { runUsd: 120, turnUsd: 30, runTurns: 45 };
/** The median reported cost of a run, used only to decide whether one more run fits the budget. */
export const DEFAULT_EST_RUN_USD = 70;

interface Ledger {
  spent: number;
  /** Set once the loop must stop: in-flight runs fail at their next turn boundary. */
  halt?: string;
}

interface RunBox {
  topic: string;
  cost: number;
  turns: number;
  /** The reason a turn was refused, once one was. */
  tripped?: string;
}

const refusal = (reason: string): AgentResult => ({ outcome: "errored", final: "", turns: 0, durationMs: 0, exitCode: null, errors: [reason] });

/** The deps for one run: the base deps with every agent turn behind the guard. */
export function guardedDeps(base: EngineDeps, ledger: Ledger, box: RunBox, ceilings: Ceilings): EngineDeps {
  const why = (): string | undefined => {
    if (ledger.halt) return `loop-halt: ${ledger.halt}`;
    if (box.cost >= ceilings.runUsd) return `run-ceiling: reported cost $${box.cost.toFixed(2)} reached the $${ceilings.runUsd} ceiling`;
    if (box.turns >= ceilings.runTurns) return `run-ceiling: ${box.turns} agent turns reached the ${ceilings.runTurns} turn ceiling`;
    return undefined;
  };
  const charge = (r: AgentResult) => {
    box.cost += r.costUsd ?? 0;
    ledger.spent += r.costUsd ?? 0;
  };
  return {
    ...base,
    runAgent: async (input: RunAgentInput) => {
      const stop = why();
      if (stop) {
        box.tripped ??= stop;
        return refusal(stop);
      }
      box.turns++;
      const cap = Math.min(input.maxBudgetUsd ?? Infinity, ceilings.turnUsd, ceilings.runUsd - box.cost);
      const r = await base.runAgent({ ...input, maxBudgetUsd: cap });
      charge(r);
      return r;
    },
    runReviewer: async (call) => {
      const stop = why();
      if (stop) {
        box.tripped ??= stop;
        return { ...refusal(stop), outcome: "unavailable" };
      }
      box.turns++;
      const r = await base.runReviewer(call);
      charge(r);
      return r;
    },
  };
}

/* ── the loop ──────────────────────────────────────────────────────────────── */

export type LoopStop = "target-reached" | "budget-stopped" | "failure-stopped" | "topics-exhausted";
export type LoopRunEnd = "at-the-gate" | "failed" | "ceiling-stopped" | "halted";

export interface LoopTopic {
  subject: string;
  angle?: string;
}

export interface LoopOptions {
  /** Total covered topics wanted. */
  target?: number;
  /** Or: this many new covered topics. Exactly one of target and add. */
  add?: number;
  /** Required. Reported spend, in USD, across the whole loop. */
  budgetUsd: number;
  concurrency?: number;
  /** Failed topics (after their resumes) before the loop gives up. */
  maxFailures?: number;
  /** Resumes of one failed run. */
  maxResumes?: number;
  estRunUsd?: number;
  ceilings?: Partial<Ceilings>;
  /** A fixed list; absent means "auto": the ranked uncovered topics. */
  topics?: LoopTopic[];
  /** Poll interval of the budget watch, ms. */
  watchMs?: number;
}

export interface LoopRunReport {
  runId: string;
  topic: string;
  status: ArticleStatus | "unknown";
  end: LoopRunEnd;
  resumes: number;
  costUsd: number;
  turns: number;
  error?: string;
}

export interface LoopReport {
  schema: "article-loop/1";
  id: string;
  startedAt: string;
  endedAt?: string;
  stop?: LoopStop;
  /** One line a human can read: why it ended. */
  reason?: string;
  options: { target: number; budgetUsd: number; concurrency: number; maxFailures: number; maxResumes: number; estRunUsd: number; ceilings: Ceilings };
  coveredAtStart: number;
  coveredNow: number;
  newlyCovered: number;
  spentUsd: number;
  runs: LoopRunReport[];
  orphaned: string[];
  /** Cost is the engine's reported cost: codex and agy turns report none. */
  note: string;
}

export function loopsRoot(): string {
  return path.join(path.dirname(path.resolve(storeRoot())), "article-loops");
}

const NOTE = "spentUsd is what the engine reports (the Claude seat's turns). Codex and agy turns report no cost, so the real spend is higher.";

export async function runLoop(opts: LoopOptions, baseDeps: EngineDeps = defaultDeps(), log: (line: string) => void = () => {}): Promise<LoopReport> {
  if (!Number.isFinite(opts.budgetUsd) || opts.budgetUsd <= 0) throw new ArticleError("a loop needs an explicit positive budgetUsd: there is no default", 400, "no-budget");
  if (!!opts.target === !!opts.add) throw new ArticleError("a loop needs exactly one of target (total covered topics) and add (new ones)", 400, "bad-target");
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 3, 5));
  const maxFailures = Math.max(1, opts.maxFailures ?? 3);
  const maxResumes = Math.max(0, opts.maxResumes ?? 2);
  const estRunUsd = opts.estRunUsd ?? DEFAULT_EST_RUN_USD;
  const ceilings: Ceilings = { ...DEFAULT_CEILINGS, ...opts.ceilings };
  const registry = resolveRegistryDir();

  const start = await coverage(registry.dir);
  const target = opts.target ?? start.covered.length + (opts.add as number);
  const queue: LoopTopic[] = opts.topics
    ? opts.topics.filter((t) => !start.covered.some((c) => c.key === t.subject) && !start.claimed.includes(t.subject))
    : rankUncovered(await listTopicSubjects(registry), start).map((t) => ({ subject: `${t.bundle}/${t.slug}` }));

  const id = `loop-${new Date().toISOString().replace(/[-:]/g, "").replace(/\..*$/, "")}`;
  const dir = path.join(loopsRoot(), id);
  await fs.mkdir(dir, { recursive: true });
  const report: LoopReport = {
    schema: "article-loop/1",
    id,
    startedAt: new Date().toISOString(),
    options: { target, budgetUsd: opts.budgetUsd, concurrency, maxFailures, maxResumes, estRunUsd, ceilings },
    coveredAtStart: start.covered.length,
    coveredNow: start.covered.length,
    newlyCovered: 0,
    spentUsd: 0,
    runs: [],
    orphaned: start.orphaned,
    note: NOTE,
  };
  const event = async (line: string) => {
    log(line);
    await fs.appendFile(path.join(dir, "events.log"), `${new Date().toISOString()} ${line}\n`).catch(() => {});
  };
  const save = () => writeJsonAtomic(path.join(dir, "loop.json"), report);
  await event(`START ${id} target ${target} (covered ${start.covered.length}) budget $${opts.budgetUsd} concurrency ${concurrency}`);

  const ledger: Ledger = { spent: 0 };
  let inflight = 0;
  let failures = 0;
  let stop: LoopStop | undefined;
  let reason: string | undefined;
  const halt = (s: LoopStop, why: string) => {
    if (stop) return;
    stop = s;
    reason = why;
  };

  // A hard budget: once reported spend is over it, in-flight runs stop at their next turn.
  const watch = setInterval(() => {
    if (ledger.spent > opts.budgetUsd && !ledger.halt) {
      ledger.halt = `reported spend $${ledger.spent.toFixed(2)} passed the $${opts.budgetUsd} budget`;
      halt("budget-stopped", ledger.halt);
      void event(`HALT ${ledger.halt}`);
    }
  }, opts.watchMs ?? 1000);

  const one = async (t: LoopTopic): Promise<void> => {
    const [bundle, subject] = t.subject.split("/");
    const box: RunBox = { topic: t.subject, cost: 0, turns: 0 };
    const deps = guardedDeps(baseDeps, ledger, box, ceilings);
    const row: LoopRunReport = { runId: "", topic: t.subject, status: "unknown", end: "failed", resumes: 0, costUsd: 0, turns: 0 };
    report.runs.push(row);
    try {
      const created = await createRun({ topic: { kind: "subject", bundle, subject, text: "", ...(t.angle ? { angle: t.angle } : {}) } }, deps);
      row.runId = created.id;
      await event(`RUN ${t.subject} ${created.id}`);
      let run = created.status === "failed" ? created : await driveRun(created.id, deps);
      for (;;) {
        row.status = run.status;
        row.costUsd = box.cost;
        row.turns = box.turns;
        if (run.status === "awaiting-approval") {
          row.end = "at-the-gate";
          report.newlyCovered++;
          report.coveredNow = start.covered.length + report.newlyCovered;
          await event(`DONE ${t.subject} ${created.id} $${box.cost.toFixed(2)}`);
          return;
        }
        if (run.error) row.error = run.error;
        if (box.tripped?.startsWith("run-ceiling")) {
          row.end = "ceiling-stopped";
          failures++;
          await event(`CEILING ${t.subject} ${created.id}: ${box.tripped}; marked for a human, not resumed`);
          return;
        }
        if (ledger.halt || run.status !== "failed" || row.resumes >= maxResumes) {
          row.end = ledger.halt ? "halted" : "failed";
          failures++;
          await event(`${ledger.halt ? "HALTED" : "FAILED"} ${t.subject} ${created.id} status=${run.status}${row.resumes >= maxResumes ? ` after ${row.resumes} resumes` : ""}`);
          return;
        }
        row.resumes++;
        await event(`RESUME ${t.subject} ${created.id} attempt ${row.resumes}: ${run.error ?? run.status}`);
        await resumeRun(created.id, deps);
        run = await driveRun(created.id, deps);
      }
    } catch (e) {
      row.end = "failed";
      row.error = (e as Error).message;
      failures++;
      await event(`FAILED ${t.subject}: ${row.error}`);
    } finally {
      row.costUsd = box.cost;
      row.turns = box.turns;
      report.spentUsd = ledger.spent;
      await save();
    }
  };

  const worker = async () => {
    for (;;) {
      if (stop) return;
      const need = target - report.coveredNow - inflight;
      if (need <= 0) {
        if (inflight === 0) halt("target-reached", `${report.coveredNow} of ${target} topics covered`);
        return;
      }
      if (failures >= maxFailures) return halt("failure-stopped", `${failures} topics ended failed`);
      if (ledger.spent + estRunUsd > opts.budgetUsd) return halt("budget-stopped", `reported spend $${ledger.spent.toFixed(2)} plus the $${estRunUsd} a run costs would pass the $${opts.budgetUsd} budget`);
      const next = queue.shift();
      if (!next) return inflight === 0 ? halt("topics-exhausted", "no uncovered topic is left to try") : undefined;
      inflight++;
      try {
        await one(next);
      } finally {
        inflight--;
      }
    }
  };

  try {
    await Promise.all(Array.from({ length: concurrency }, worker));
  } finally {
    clearInterval(watch);
  }
  if (report.coveredNow >= target) {
    // Runs that were already in flight when a limit stopped the launching may still have
    // reached the gate: the target wins over a stop that only prevented more launches.
    stop = "target-reached";
    reason = `${report.coveredNow} of ${target} topics covered`;
  }
  if (!stop) {
    // Every worker returned without a verdict: decide it from the numbers.
    if (failures >= maxFailures) halt("failure-stopped", `${failures} topics ended failed`);
    else if (!queue.length) halt("topics-exhausted", "no uncovered topic is left to try");
    else halt("budget-stopped", "the next run would not fit in the budget");
  }
  report.stop = stop;
  report.reason = reason;
  report.endedAt = new Date().toISOString();
  report.spentUsd = ledger.spent;
  await save();
  await event(`END ${stop}: ${reason}`);
  return report;
}
