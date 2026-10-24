// LANE — THE ARTICLE LOOP AND TOPIC PICKER, offline (lib/articles/loop.ts, pipeline/article.mts).
//
// Every agent, writer and reviewer, is the stub (tests/golden-path/_articles.ts), so nothing spends.
// STUB_AGENT_COST makes the claude stub report a cost, which is what the budget and the
// ceilings count. What is pinned:
//
//   · which topics are uncovered: a subject with a run at the gate, or a publication, is not
//     offered; a failed run does not cover; the standard's own bundle is not offered; the order is
//     the same every time and spreads over bundles; every topic carries an angle that states the
//     evidence-scope rule
//   · the loop reaches its target through real runs and writes loop.json and events.log
//   · the loop refuses to start without a budget, and without exactly one of target and add
//   · a failed run is resumed at most maxResumes times, then counts as a failure and the loop stops
//   · a budget stops the launching (the next run would not fit) and, once crossed, the in-flight runs
//   · a run over its cost ceiling is stopped at a turn boundary, marked for a human and never resumed
//   · a run ceiling under a run's price is refused at the receipt, before any turn
//
// Each run is a kernel job (Phase 4, L30): the loop is driven through the CLI's own driver
// (lib/producers/article.ts `loopDriver`, live jobs on the sandbox's kernel store), so the
// ceilings below are the jobs' as well as the loop's.
//   · the writer's CLI is given --max-budget-usd
//   · the CLI refuses `loop` without --budget-usd
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { createRun, defaultDeps, driveRun } from "@/lib/articles/engine";
import { coverage, EXCLUDED_BUNDLES, listUncoveredTopics, loopsRoot, rankUncovered, runLoop, suggestAngle } from "@/lib/articles/loop";
import { readRun, writeNewRun } from "@/lib/articles/store";
import type { ArticleRun } from "@/lib/articles/types";
import { loopDriver } from "@/lib/producers/article";

import { keepEnv } from "./_helpers";
import { ARTICLE_ENV, ROOT, articleSandbox, type ArticleSandbox } from "./_articles";

keepEnv(ARTICLE_ENV);
test.describe.configure({ timeout: 240_000 });

let box: ArticleSandbox;
test.beforeEach(() => {
  box = articleSandbox();
});
test.afterEach(() => box.cleanup());

const deps = () => defaultDeps({ render: false });
const driver = () => loopDriver({ actor: { kind: "operator", id: "probe" }, mode: "live", env: {}, binding: { engine: deps } });

/** More subjects in the throwaway registry: two more in software-engineering and a second bundle. */
function addSubjects() {
  const addTo = (bundle: string, category: string, slugs: string[]) => {
    const idxPath = path.join(box.registry, "knowledge", bundle, "index.json");
    const idx = existsSync(idxPath) ? JSON.parse(readFileSync(idxPath, "utf8")) : { meta: { bundle }, subjects: {} };
    for (const slug of slugs) {
      const file = `knowledge/${bundle}/${category}/${slug}/${slug}.md`;
      mkdirSync(path.dirname(path.join(box.registry, file)), { recursive: true });
      writeFileSync(path.join(box.registry, file), `---\nlayer: golden-path\nsubject: ${slug}\n---\n\n# ${slug.replace(/-/g, " ")}\n\nA golden path for ${slug}.\n`);
      idx.subjects[slug] = { category, subcategory: null, status: "stable", file };
    }
    mkdirSync(path.dirname(idxPath), { recursive: true });
    writeFileSync(idxPath, JSON.stringify(idx, null, 2));
  };
  addTo("software-engineering", "llm-agent", ["alpha-topic", "beta-topic"]);
  addTo("agent-operations", "measurement", ["delta-topic", "epsilon-topic"]);
}

const subj = (bundle: string, slug: string, category = "c") => ({ bundle, slug, category, file: `knowledge/${bundle}/${slug}.md` });

test("rank: covered, claimed and the standard's bundle are left out; the order spreads over bundles and never changes", () => {
  const subjects = [subj("a", "a1"), subj("a", "a2"), subj("a", "a3"), subj("b", "b1"), subj("b", "b2"), subj("technical-writing", "tw1")];
  const cov = { covered: [{ key: "a/a1", source: "run" as const, ref: "r1", status: "awaiting-approval" }], claimed: ["b/b2"] };
  const ranked = rankUncovered(subjects, cov).map((t) => `${t.bundle}/${t.slug}`);
  // b has no covered topic, a has one: b first, then a; round-robin; b2 is claimed, a1 covered, tw excluded.
  expect(ranked).toEqual(["b/b1", "a/a2", "a/a3"]);
  expect(rankUncovered([...subjects].reverse(), cov).map((t) => `${t.bundle}/${t.slug}`)).toEqual(ranked);
  expect(EXCLUDED_BUNDLES).toContain("technical-writing");
  expect(rankUncovered(subjects, { covered: [], claimed: [] }, { excludeBundles: [] }).some((t) => t.bundle === "technical-writing")).toBe(true);
  expect(suggestAngle("Retry budgets")).toMatch(/first-party/);
  expect(suggestAngle("Retry budgets")).toMatch(/Derived, Inference or assumption/);
});

test("topics: a run at the gate and a publication cover their subject; a failed run does not", async () => {
  addSubjects();
  const before = await listUncoveredTopics({ limit: 20 });
  const keys = before.topics.map((t) => `${t.bundle}/${t.slug}`);
  expect(keys).toEqual(expect.arrayContaining(["software-engineering/token-budgeting", "software-engineering/alpha-topic", "agent-operations/delta-topic"]));
  expect(keys.some((k) => k.startsWith("technical-writing/"))).toBe(false);
  expect(before.topics[0].angle).toMatch(/first-party/);
  expect(before.topics[0].title.length).toBeGreaterThan(2);

  // a run at the gate covers its subject
  const run = await createRun({ topic: { kind: "subject", bundle: "software-engineering", subject: "alpha-topic", text: "" } }, deps());
  const done = await driveRun(run.id, deps());
  expect(done.status).toBe("awaiting-approval");
  // a failed run does not
  process.env.STUB_AGENT_MODE = "error";
  const bad = await createRun({ topic: { kind: "subject", bundle: "software-engineering", subject: "beta-topic", text: "" } }, deps());
  expect((await driveRun(bad.id, deps())).status).toBe("failed");
  delete process.env.STUB_AGENT_MODE;
  // a publication covers its subject
  mkdirSync(path.join(box.registry, "publications", "post-one"), { recursive: true });
  writeFileSync(path.join(box.registry, "publications", "post-one", "publication.json"), JSON.stringify({ topic: { kind: "subject", bundle: "agent-operations", subject: "delta-topic" }, status: "approved" }));

  const after = await listUncoveredTopics({ limit: 20 });
  const left = after.topics.map((t) => `${t.bundle}/${t.slug}`);
  expect(left).not.toContain("software-engineering/alpha-topic");
  expect(left).not.toContain("agent-operations/delta-topic");
  expect(left).toContain("software-engineering/beta-topic");
  expect(after.covered.map((c) => c.key)).toEqual(expect.arrayContaining(["software-engineering/alpha-topic", "agent-operations/delta-topic"]));
});

/** A run.json on disk at `status`, with no turns behind it: what `coverage` reads. */
async function runAt(id: string, bundle: string, subject: string, status: ArticleRun["status"]) {
  const at = "2026-10-01T00:00:00.000Z";
  await writeNewRun({ id, status, topic: { kind: "subject", bundle, subject, text: subject }, promptRef: { file: "p", sha: "s" }, standard: { recipe: "r", bundle: "technical-writing", subjects: [] }, model: "m", effort: "high", steps: [], createdAt: at, updatedAt: at } as unknown as ArticleRun);
}
function publication(slug: string, bundle: string, subject: string, runId: string) {
  mkdirSync(path.join(box.registry, "publications", slug), { recursive: true });
  writeFileSync(path.join(box.registry, "publications", slug, "publication.json"), JSON.stringify({ topic: { kind: "subject", bundle, subject }, status: "approved", run: { id: runId } }));
}

test("coverage: a topic counts once however many posts cover it, and a run id that prefixes another hides nothing", async () => {
  // one subject, two posts: a run at the gate and the publication of an earlier run of it
  await runAt("2026-10-01-alpha-topic-2", "software-engineering", "alpha-topic", "awaiting-approval");
  publication("alpha-one", "software-engineering", "alpha-topic", "2026-10-01-alpha-topic");
  // a run whose id is a prefix of another subject's publication's run id
  await runAt("2026-10-01-delta", "agent-operations", "delta", "awaiting-approval");
  publication("delta-topic-one", "agent-operations", "delta-topic", "2026-10-01-delta-topic");
  const cov = await coverage(box.registry);
  const keys = cov.covered.map((c) => c.key).sort();
  expect(keys).toEqual(["agent-operations/delta", "agent-operations/delta-topic", "software-engineering/alpha-topic"]);
});

test("create: two runs on one topic at once both get a run, each under its own id", async () => {
  const topic = { kind: "free" as const, text: "One topic asked for twice" };
  const made = await Promise.allSettled([createRun({ topic }, deps()), createRun({ topic }, deps()), createRun({ topic }, deps())]);
  const refused = made.filter((m) => m.status === "rejected").map((m) => String((m as PromiseRejectedResult).reason?.message));
  expect(refused, "no create is refused because a sibling minted the same id").toEqual([]);
  const ids = made.map((m) => (m as PromiseFulfilledResult<ArticleRun>).value.id);
  expect(new Set(ids).size).toBe(3);
  for (const id of ids) expect((await readRun(id)).topic.text).toBe(topic.text);
});

test("loop: two loops started in the same second keep their own report and log", async () => {
  publication("covered-one", "software-engineering", "token-budgeting", "2026-10-01-token-budgeting");
  // The target is already met, so neither loop launches a run: the driver is never asked.
  const idle = { start: () => Promise.reject(new Error("no launch")), resume: () => Promise.reject(new Error("no resume")), driven: async () => false };
  const [a, b] = await Promise.all([runLoop({ target: 1, budgetUsd: 10 }, deps(), undefined, idle), runLoop({ target: 1, budgetUsd: 10 }, deps(), undefined, idle)]);
  expect(a.id).not.toBe(b.id);
  for (const r of [a, b]) {
    expect(JSON.parse(readFileSync(path.join(loopsRoot(), r.id, "loop.json"), "utf8")).id).toBe(r.id);
    expect(readFileSync(path.join(loopsRoot(), r.id, "events.log"), "utf8").match(/^.* START /gm)).toHaveLength(1);
  }
});

test("coverage and the loop report name a run whose run.json does not parse", async () => {
  publication("covered-one", "software-engineering", "token-budgeting", "2026-10-01-token-budgeting");
  mkdirSync(path.join(box.store, "2026-10-01-broken"), { recursive: true });
  writeFileSync(path.join(box.store, "2026-10-01-broken", "run.json"), '{"id": "2026-10-01-broken", "topic": ');
  expect((await coverage(box.registry)).damaged).toEqual(["2026-10-01-broken"]);
  const idle = { start: () => Promise.reject(new Error("no launch")), resume: () => Promise.reject(new Error("no resume")), driven: async () => false };
  const report = await runLoop({ target: 1, budgetUsd: 10 }, deps(), undefined, idle);
  expect(report.damaged).toEqual(["2026-10-01-broken"]);
  expect(readFileSync(path.join(loopsRoot(), report.id, "events.log"), "utf8")).toMatch(/DAMAGED 2026-10-01-broken/);
});

test("loop: refuses to start without a budget or with an unclear target", async () => {
  await expect(runLoop({ target: 2 } as never, deps())).rejects.toMatchObject({ code: "no-budget" });
  await expect(runLoop({ budgetUsd: 0, target: 2 }, deps())).rejects.toMatchObject({ code: "no-budget" });
  await expect(runLoop({ budgetUsd: 10 }, deps())).rejects.toMatchObject({ code: "bad-target" });
  await expect(runLoop({ budgetUsd: 10, target: 2, add: 1 }, deps())).rejects.toMatchObject({ code: "bad-target" });
});

test("loop: reaches the target through real runs and writes its report", async () => {
  addSubjects();
  process.env.STUB_AGENT_COST = "1";
  const log: string[] = [];
  const report = await runLoop({ add: 2, budgetUsd: 1000, concurrency: 2 }, deps(), (l) => log.push(l), driver());
  expect(report.stop).toBe("target-reached");
  expect(report.newlyCovered).toBe(2);
  expect(report.coveredNow).toBe(report.coveredAtStart + 2);
  expect(report.runs).toHaveLength(2);
  for (const r of report.runs) {
    expect(r.end).toBe("at-the-gate");
    expect(r.costUsd).toBeGreaterThan(0);
    expect((await readRun(r.runId)).status).toBe("awaiting-approval");
  }
  expect(new Set(report.runs.map((r) => r.topic)).size).toBe(2);
  expect(report.spentUsd).toBeCloseTo(report.runs.reduce((a, r) => a + r.costUsd, 0), 5);
  const dir = path.join(loopsRoot(), report.id);
  expect(JSON.parse(readFileSync(path.join(dir, "loop.json"), "utf8")).stop).toBe("target-reached");
  expect(readFileSync(path.join(dir, "events.log"), "utf8")).toMatch(/START .*\n[\s\S]*DONE [\s\S]*END target-reached/);
  expect(report.note).toMatch(/Codex and agy/);
  expect(log.some((l) => l.startsWith("DONE"))).toBe(true);
  // the target is a total: asking for it again starts nothing
  const again = await runLoop({ target: report.coveredNow, budgetUsd: 1000 }, deps(), undefined, driver());
  expect(again.stop).toBe("target-reached");
  expect(again.runs).toHaveLength(0);
});

test("loop: a failed run is resumed at most maxResumes times, then the loop stops on its failures", async () => {
  addSubjects();
  process.env.STUB_AGENT_MODE = "error";
  const report = await runLoop({ add: 2, budgetUsd: 1000, concurrency: 1, maxFailures: 1, maxResumes: 2 }, deps(), undefined, driver());
  expect(report.stop).toBe("failure-stopped");
  expect(report.runs).toHaveLength(1);
  expect(report.runs[0]).toMatchObject({ end: "failed", resumes: 2, status: "failed" });
  expect(report.newlyCovered).toBe(0);
  expect(readFileSync(path.join(loopsRoot(), report.id, "events.log"), "utf8").match(/RESUME/g)).toHaveLength(2);
});

test("loop: the budget stops the launching, and once crossed it stops the runs in flight", async () => {
  addSubjects();
  process.env.STUB_AGENT_COST = "1";
  const probe = await runLoop({ add: 1, budgetUsd: 1000, concurrency: 1 }, deps(), undefined, driver());
  const c = probe.spentUsd;
  expect(c).toBeGreaterThan(0);

  // the next run would not fit: one run is made, the second is not started
  const gate = await runLoop({ add: 3, budgetUsd: c * 1.5, estRunUsd: c, concurrency: 1 }, deps(), undefined, driver());
  expect(gate.stop).toBe("budget-stopped");
  expect(gate.runs).toHaveLength(1);
  expect(gate.runs[0].end).toBe("at-the-gate");
  expect(gate.reason).toMatch(/would pass/);

  // a budget that is passed mid-run halts that run at its next turn boundary
  const hard = await runLoop({ add: 3, budgetUsd: c * 0.5, estRunUsd: 0.01, concurrency: 1, watchMs: 20 }, deps(), undefined, driver());
  expect(hard.stop).toBe("budget-stopped");
  expect(hard.runs[0].end).toBe("halted");
  expect(hard.newlyCovered).toBe(0);
  expect((await readRun(hard.runs[0].runId)).status).toBe("failed");
  expect(hard.spentUsd).toBeLessThan(c);
});

test("loop: a run over its cost ceiling stops at a turn boundary, is marked for a human and is never resumed", async () => {
  addSubjects();
  // A run ceiling must clear the run's price ($92) to pass its receipt; the turns then cross it.
  process.env.STUB_AGENT_COST = "30";
  process.env.STUB_AGENT_ARGV_LOG = path.join(box.dir, "argv.log");
  const report = await runLoop({ add: 1, budgetUsd: 10_000, concurrency: 1, maxFailures: 1, ceilings: { runUsd: 100, turnUsd: 100 } }, deps(), undefined, driver());
  expect(report.stop).toBe("failure-stopped");
  expect(report.runs[0]).toMatchObject({ end: "ceiling-stopped", resumes: 0 });
  // Stopped where it would cross: by a refused turn, or by the job before a step whose estimate
  // would carry it over (the critique, at $54) - either way never more than a turn past it.
  expect(report.runs[0].costUsd).toBeGreaterThan(0);
  expect(report.runs[0].costUsd).toBeLessThan(100 + 3 * 30 + 1);
  expect(await readRun(report.runs[0].runId)).toMatchObject({ status: "failed", error: expect.stringMatching(/run-ceiling/) });
  expect(readFileSync(path.join(loopsRoot(), report.id, "events.log"), "utf8")).toMatch(/CEILING .*marked for a human, not resumed/);
  // the writer's CLI was handed the per-turn cap
  expect(readFileSync(process.env.STUB_AGENT_ARGV_LOG, "utf8")).toMatch(/--max-budget-usd/);
});

test("loop: a run ceiling under a run's price launches - a stop point, not a refusal - and stops at it, marked for a human", async () => {
  addSubjects();
  process.env.STUB_AGENT_ARGV_LOG = path.join(box.dir, "argv.log");
  // $25 is under the article band's top ($92): the receipt marks it over, the run is launched anyway
  // (Director's ruling: a ceiling is where the job STOPS), and the job stops before the step that would cross it.
  const report = await runLoop({ add: 1, budgetUsd: 10_000, concurrency: 1, maxFailures: 1, ceilings: { runUsd: 25 } }, deps(), undefined, driver());
  expect(report.runs[0]).toMatchObject({ end: "ceiling-stopped", resumes: 0 });
  expect(report.runs[0].turns).toBeGreaterThan(0);
  expect(await readRun(report.runs[0].runId)).toMatchObject({ status: "failed", error: expect.stringMatching(/run-ceiling/) });
  expect(existsSync(process.env.STUB_AGENT_ARGV_LOG)).toBe(true);
});

test("loop: a turn ceiling counts reviewer turns as well", async () => {
  addSubjects();
  const report = await runLoop({ add: 1, budgetUsd: 10_000, concurrency: 1, maxFailures: 1, ceilings: { runTurns: 4 } }, deps(), undefined, driver());
  expect(report.runs[0].end).toBe("ceiling-stopped");
  expect(report.runs[0].turns).toBe(4);
});

test("cli: `loop` without --budget-usd exits 2 and starts nothing", () => {
  let code = 0;
  let out = "";
  try {
    // npx tsx, as the docs run it; a fixed command string, no caller input in it.
    out = execSync("npx tsx pipeline/article.mts loop --target 3 --json", { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: process.env });
  } catch (e) {
    code = (e as { status: number }).status;
    out = String((e as { stdout: string }).stdout);
  }
  expect(code).toBe(2);
  expect(out).toMatch(/--budget-usd/);
});
