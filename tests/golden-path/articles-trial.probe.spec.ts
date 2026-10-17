// LANE — THE ARTICLE TRIAL, offline (lib/articles/trial/{verdict,store,candidates}.ts and the
// `trial` verbs of pipeline/article.mts).
//
// A trial is the measured claim a subject post is written around: prereg sealed before the first
// measured command, both arms run through `trial exec`, a verdict computed by code. Every probe
// here runs against the throwaway registry (tests/golden-path/_articles.ts) with the trial store
// and the leads file in the sandbox; the commands a trial executes are node one-liners. Nothing
// spends and nothing reaches the network. What is pinned:
//
//   · the verdict table: upheld, challenged, null and the three voids (a control that did not
//     hold, an arm short of n, a model-call budget overrun); a guard-failing alternative that
//     wins on the metric is still upheld; a relative band against an absolute one; direction
//     "lower" flips the sign; the bootstrap interval is the same on every call
//   · the validators name every problem in one error
//   · the seal: a prereg edited after it makes close and a measured exec refuse
//   · a measured exec before the seal refuses; a pilot runs and is recorded as one; a wall
//     budget already spent refuses
//   · the harness never sees a credential-looking variable; the wall cap kills the whole tree
//   · close: results that fail validation are refused with every problem named; a void close
//     files exactly one lead; drop of a stale trial files a subject lead
//   · open writes the brief from the registry; a second open is refused while the first holds
//     the subject; candidates are deterministic and leave claimed subjects out
//   · the CLI: status and candidates --json shapes, exec's exit code passthrough and clean
//     stdout, `--` keeps the command's own flags, run --trial's usage and refusal
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { ArticleError } from "@/lib/articles/store";
import { manifestKnowledgeDomains, rankTrialCandidates, trialScore } from "@/lib/articles/trial/candidates";
import { checkTrial, closeTrial, dropTrial, execTrial, openTrial, readExecs, readTrial, scanTrials, sealTrial, trialDir } from "@/lib/articles/trial/store";
import { BOOTSTRAP, computeVerdict, sampleSd, validatePrereg, validateResults } from "@/lib/articles/trial/verdict";
import type { TrialPrereg, TrialResults, TrialValidity } from "@/lib/articles/types";

import { keepEnv } from "./_helpers";
import { ARTICLE_ENV, ROOT, articleSandbox, type ArticleSandbox } from "./_articles";

keepEnv([...ARTICLE_ENV, "ARTICLES_TRIALS_DIR", "ARTICLES_LEADS_FILE", "FAKE_API_KEY", "SOME_TOKEN", "TRIAL_PROBE_PLAIN"]);
test.describe.configure({ timeout: 180_000 });

let box: ArticleSandbox;
let leads: string;
test.beforeEach(() => {
  box = articleSandbox();
  process.env.ARTICLES_TRIALS_DIR = path.join(box.dir, "trials");
  leads = path.join(box.dir, "leads.jsonl");
  process.env.ARTICLES_LEADS_FILE = leads;
});
test.afterEach(() => box.cleanup());

const NOW = new Date("2026-10-07T12:00:00.000Z");
const NODE = process.execPath;
const SUBJECT = { bundle: "software-engineering", slug: "token-budgeting" };

const prereg = (over: Partial<TrialPrereg> = {}): TrialPrereg => ({
  schema: "article-trial-prereg/1",
  subject: { ...SUBJECT },
  technique: "count-before-send",
  claim: "Count the request's tokens with the model's own tokenizer before sending it.",
  alternative: { name: "character estimate", description: "characters / 4 plus a 10% margin", source: { url: "https://example.com/estimating-tokens", title: "Estimating tokens", date: "2026-09" } },
  prior: "The tokenizer count avoids the overflows a character estimate causes.",
  question: "Does counting with the tokenizer beat a character estimate on send latency without overflows?",
  arms: [
    { id: "golden", label: "tokenizer count", description: "count with the model's tokenizer, then send" },
    { id: "alternative", label: "character estimate", description: "estimate from characters, then send" },
  ],
  metric: { id: "latency", label: "send latency", unit: "ms", direction: "lower" },
  minEffect: { kind: "absolute", value: 2 },
  thresholds: [{ metric: "overflows", op: "<=", value: 0, label: "no overflow" }],
  n: 5,
  controls: [{ id: "same-corpus", statement: "both arms send the same five requests" }],
  stack: "node",
  environment: "node@24",
  budget: { wallMin: 5, modelCalls: 20 },
  ...over,
});

const results = (golden: number[], alternative: number[], over: Partial<TrialResults> = {}): TrialResults => ({
  schema: "article-trial-results/1",
  arms: [
    { id: "golden", observations: golden, guards: { overflows: 0 } },
    { id: "alternative", observations: alternative, guards: { overflows: 0 } },
  ],
  controls: [{ id: "same-corpus", held: true, evidence: "one corpus file, its sha256 logged before each arm" }],
  modelCalls: 3,
  ...over,
});

const VALIDITY: TrialValidity = { state: "current", reasons: ["the tokenizer count is still the documented practice"], sources: [{ url: "https://example.com/tokenizer-docs", title: "Tokenizer docs", date: "2026-10-01" }] };
const five = (x: number) => [x, x, x, x, x];

async function refusal(p: Promise<unknown>): Promise<ArticleError> {
  const e = await p.then(
    () => undefined,
    (err: unknown) => err,
  );
  expect(e, "the call was expected to refuse").toBeInstanceOf(ArticleError);
  return e as ArticleError;
}

/** An open trial on token-budgeting with prereg.json and validity.json written, as the agent leaves it. */
async function framedTrial(p: TrialPrereg = prereg()) {
  const rec = await openTrial(SUBJECT, NOW);
  const dir = trialDir(rec.id);
  writeFileSync(path.join(dir, "prereg.json"), `${JSON.stringify(p, null, 2)}\n`);
  writeFileSync(path.join(dir, "validity.json"), `${JSON.stringify(VALIDITY, null, 2)}\n`);
  return { id: rec.id, dir };
}

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
};

/** A subject in the throwaway registry, with applications carrying the given ab_verdicts. */
function addSubject(slug: string, opts: { changedAt?: string; apps?: { stack: string; verdict: string }[] } = {}) {
  const idxPath = path.join(box.registry, "knowledge", "software-engineering", "index.json");
  const idx = JSON.parse(readFileSync(idxPath, "utf8"));
  const dirRel = `knowledge/software-engineering/llm-agent/${slug}`;
  const file = `${dirRel}/${slug}.md`;
  mkdirSync(path.join(box.registry, dirRel, "applications"), { recursive: true });
  writeFileSync(path.join(box.registry, file), `---\nlayer: golden-path\nsubject: ${slug}\n---\n\n# The ${slug.replace(/-/g, " ")}\n\nA golden path.\n`);
  for (const a of opts.apps ?? []) {
    writeFileSync(
      path.join(box.registry, dirRel, "applications", `${a.stack}--rule.md`),
      `---\nlayer: application\nsubject: ${slug}\ntechnique: rule\nstack: ${a.stack}\nverified_on: 2026-09-01\nab_verdict: ${a.verdict}\n---\n\n# An application\n`,
    );
  }
  idx.subjects[slug] = { category: "llm-agent", subcategory: null, status: "forged", file, revision: 1, ...(opts.changedAt ? { changedAt: opts.changedAt } : {}), techniques: [{ slug: "rule" }] };
  writeFileSync(idxPath, JSON.stringify(idx, null, 2));
}

/* ── the verdict ───────────────────────────────────────────────────────────── */

test("the verdict table: upheld, challenged, null, the three voids, guards, bands and direction", () => {
  const v = (p: TrialPrereg, r: TrialResults) => computeVerdict(p, r, NOW);

  // direction "lower": the alternative is 4 ms slower than golden, beyond the 2 ms band
  const upheld = v(prereg(), results(five(10), five(14)));
  expect(upheld).toMatchObject({ schema: "article-trial-verdict/1", verdict: "upheld", delta: -4, band: 2, at: NOW.toISOString() });
  expect(upheld.reason).toBe("golden 4 ms lower than the alternative (golden 10 vs alternative 14 ms mean), beyond the 2 ms band; both arms cleared every guard");
  expect(upheld.arms).toEqual([
    { id: "golden", n: 5, mean: 10, sd: 0, guardsCleared: true },
    { id: "alternative", n: 5, mean: 14, sd: 0, guardsCleared: true },
  ]);

  const challenged = v(prereg(), results(five(14), five(10)));
  expect(challenged.verdict).toBe("challenged");
  expect(challenged.delta).toBe(4);
  expect(challenged.reason).toBe("alternative 4 ms lower than golden (golden 14 vs alternative 10 ms mean), beyond the 2 ms band; both arms cleared every guard");

  const nothing = v(prereg(), results(five(10), five(11)));
  expect(nothing.verdict).toBe("null");
  expect(nothing.reason).toContain("within the 2 ms band");
  expect(nothing.deltaCi95).toBeDefined();

  // void: a control that did not hold, whatever the numbers say
  const broken = v(prereg(), results(five(14), five(10), { controls: [{ id: "same-corpus", held: false, evidence: "the corpus changed between arms" }] }));
  expect(broken.verdict).toBe("void");
  expect(broken.reason).toBe('control "same-corpus" did not hold, so nothing was measured');
  expect("deltaCi95" in broken, "a void verdict carries no interval").toBe(false);
  // void: an arm short of n
  const short = v(prereg(), results(five(14), [10, 10, 10, 10]));
  expect(short.verdict).toBe("void");
  expect(short.reason).toContain("the alternative arm has 4 of the 5 observations the prereg requires");
  // void: an empty arm still reports numbers, never NaN (JSON would write null)
  const empty = v(prereg(), results(five(14), []));
  expect(empty.arms[1]).toEqual({ id: "alternative", n: 0, mean: 0, sd: 0, guardsCleared: true });
  expect(JSON.stringify(empty)).not.toContain("null");
  // void: over the sealed model-call budget
  const over = v(prereg(), results(five(14), five(10), { modelCalls: 21 }));
  expect(over.verdict).toBe("void");
  expect(over.reason).toContain("the harness made 21 model calls against a sealed budget of 20");

  // the alternative wins on the metric by 9 ms but fails a guard: golden is upheld
  const dq = results(five(14), five(5));
  dq.arms[1].guards.overflows = 3;
  const disqualified = v(prereg(), dq);
  expect(disqualified.verdict).toBe("upheld");
  expect(disqualified.delta).toBe(9);
  expect(disqualified.arms[1].guardsCleared).toBe(false);
  expect(disqualified.reason).toBe('the alternative failed "no overflow" (overflows 3, needs <= 0) while golden cleared every guard (golden 14 vs alternative 5 ms mean)');
  // golden failing a guard cannot be upheld; the difference inside the band is null
  const gq = results(five(10), five(11));
  gq.arms[0].guards.overflows = 1;
  expect(v(prereg(), gq).verdict).toBe("null");
  // ... and neither can a golden arm that leads by more than the band while failing a guard
  const lead = results(five(10), five(14));
  lead.arms[0].guards.overflows = 1;
  const ineligible = v(prereg(), lead);
  expect(ineligible.verdict).toBe("null");
  expect(ineligible.reason).toBe('golden failed "no overflow" (overflows 1, needs <= 0), so its 4 ms lead (golden 10 vs alternative 14 ms mean) does not uphold it');

  // the same 5 ms: absolute band 2 -> challenged; relative 10% of the golden mean (100) = 10 -> null
  expect(v(prereg(), results(five(100), five(95))).verdict).toBe("challenged");
  const relative = v(prereg({ minEffect: { kind: "relative", value: 0.1 } }), results(five(100), five(95)));
  expect(relative.verdict).toBe("null");
  expect(relative.band).toBe(10);

  // direction "higher" flips the sign: the data golden won above now challenges it
  const higher = v(prereg({ metric: { id: "throughput", label: "throughput", unit: "req/s", direction: "higher" } }), results(five(10), five(14)));
  expect(higher.verdict).toBe("challenged");
  expect(higher.delta).toBe(4);

  // the bootstrap: seeded, so the same inputs give the same interval on every call
  const spread = results([10, 12, 9, 11, 13, 10], [14, 15, 13, 16, 14, 15]);
  const a = v(prereg(), spread);
  const b = v(prereg(), spread);
  expect(BOOTSTRAP).toEqual({ seed: BOOTSTRAP.seed, resamples: 2000 });
  expect(a.deltaCi95).toEqual(b.deltaCi95);
  const [lo, hi] = a.deltaCi95!;
  expect(lo).toBeLessThan(hi);
  expect(lo).toBeLessThanOrEqual(a.delta);
  expect(hi).toBeGreaterThanOrEqual(a.delta);
  expect(a.verdict).toBe("upheld");
  expect(a.arms[0].sd).toBeCloseTo(sampleSd([10, 12, 9, 11, 13, 10]), 12);
  expect(sampleSd([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(Math.sqrt(32 / 7), 12);
});

test("the validators name every problem in one error", () => {
  const p = prereg();
  const bad = {
    ...p,
    schema: "prereg/0",
    technique: "",
    environment: "node",
    alternative: { name: "x", description: "y", source: { url: "ftp://example.com", title: "", date: "2026-13" } },
    arms: [p.arms[1], p.arms[0]],
    minEffect: { kind: "relative", value: 1.5 },
    thresholds: [p.thresholds[0], p.thresholds[0]],
    n: 2,
    controls: [],
    budget: { wallMin: 300, modelCalls: 1.5 },
  };
  let e: unknown;
  try {
    validatePrereg(bad);
  } catch (err) {
    e = err;
  }
  expect(e).toBeInstanceOf(ArticleError);
  expect((e as ArticleError).status).toBe(400);
  expect((e as ArticleError).code).toBe("bad-prereg");
  const msg = (e as ArticleError).message;
  for (const part of [
    'schema must be "article-trial-prereg/1"',
    "technique must be the slug",
    "environment must be <stack>@<version>",
    "alternative.source.url must be an http(s) URL",
    "alternative.source.title must be a non-empty string",
    "alternative.source.date must be an ISO date",
    'arms[0].id must be "golden"',
    'arms[1].id must be "alternative"',
    "minEffect.value is a share of the golden mean when relative, so at most 1",
    'thresholds[1].metric "overflows" is guarded twice',
    "n must be an integer of at least 3",
    "controls must list at least one condition",
    "budget.wallMin must be a number of minutes from 1 to 240",
    "budget.modelCalls must be an integer from 0 to 500",
  ])
    expect(msg, part).toContain(part);
  expect(msg).toMatch(/^prereg\.json has 14 problems: /);
  expect(validatePrereg(prereg())).toEqual(prereg());
  expect(validateResults(results(five(1), five(2)), prereg())).toEqual(results(five(1), five(2)));
});

/* ── the seal and the exec ─────────────────────────────────────────────────── */

test("a prereg edited after the seal: close and a measured exec refuse with prereg-changed", async () => {
  const { id, dir } = await framedTrial();
  const checked = await checkTrial(id);
  expect(checked.record.status).toBe("framed");
  expect(checked.validity.state).toBe("current");
  const sealed = await sealTrial(id);
  expect(sealed.status).toBe("sealed");
  const original = readFileSync(path.join(dir, "prereg.json"));
  expect(JSON.parse(readFileSync(path.join(dir, "seal.json"), "utf8"))).toEqual(sealed.seal);
  expect((await sealTrial(id)).seal, "sealing the same bytes again is a no-op").toEqual(sealed.seal);

  const measured = await execTrial(id, [NODE, "-e", "process.stdout.write('measured')"]);
  expect(measured).toMatchObject({ pilot: false, exitCode: 0, timedOut: false });
  writeFileSync(path.join(dir, "results.json"), JSON.stringify(results(five(10), five(14))));

  writeFileSync(path.join(dir, "prereg.json"), JSON.stringify(prereg({ n: 3 }), null, 2));
  expect((await refusal(closeTrial(id))).code).toBe("prereg-changed");
  const execRefused = await refusal(execTrial(id, [NODE, "-e", "1"]));
  expect([execRefused.code, execRefused.status]).toEqual(["prereg-changed", 409]);
  expect((await refusal(sealTrial(id))).code, "a seal is not moved").toBe("already-sealed");
  expect((await readExecs(dir)).length, "a refused exec runs nothing and records nothing").toBe(1);
  expect(existsSync(path.join(dir, "verdict.json"))).toBe(false);

  // the sealed bytes back: the close goes through
  writeFileSync(path.join(dir, "prereg.json"), original);
  const verdict = await closeTrial(id);
  expect(verdict.verdict).toBe("upheld");
  const rec = await readTrial(id);
  expect(rec).toMatchObject({ status: "closed", verdict: "upheld" });
  expect(rec.closedAt).toBeDefined();
  expect(JSON.parse(readFileSync(path.join(dir, "verdict.json"), "utf8"))).toEqual(verdict);
  expect(existsSync(leads), "only a void close files a lead").toBe(false);
  expect((await refusal(closeTrial(id))).code).toBe("trial-closed");
});

test("a measured exec before the seal refuses; a pilot runs and is recorded; a spent wall budget refuses", async () => {
  const { id, dir } = await framedTrial();
  const early = await refusal(execTrial(id, [NODE, "-e", "1"]));
  expect([early.code, early.status]).toEqual(["not-sealed", 409]);

  const out: Buffer[] = [];
  const pilot = await execTrial(id, [NODE, "-e", "process.stdout.write('pilot ran in ' + require('path').basename(process.cwd()))"], { pilot: true, onStdout: (c) => out.push(c) });
  expect(pilot).toMatchObject({ pilot: true, exitCode: 0, timedOut: false });
  expect(Buffer.concat(out).toString()).toBe("pilot ran in harness");
  expect(readFileSync(path.join(dir, "exec-logs", "1.log"), "utf8")).toBe("pilot ran in harness");
  expect(await readExecs(dir)).toEqual([pilot]);
  expect((await readTrial(id)).status, "a pilot moves nothing").toBe("open");

  // a pilot does not count as the measurement a close needs
  expect((await refusal(closeTrial(id))).code).toBe("not-sealed");
  await sealTrial(id);
  await execTrial(id, [NODE, "-e", "1"], { pilot: true });
  writeFileSync(path.join(dir, "results.json"), JSON.stringify(results(five(10), five(14))));
  expect((await refusal(closeTrial(id))).code).toBe("no-measurement");

  // the wall budget is the sealed total minus the measured time already used
  const spent = { at: new Date().toISOString(), cmd: ["node", "bench.js"], pilot: false, exitCode: 0, durationMs: 5 * 60_000, timedOut: false };
  writeFileSync(path.join(dir, "exec.jsonl"), `${readFileSync(path.join(dir, "exec.jsonl"), "utf8")}${JSON.stringify(spent)}\n`);
  expect((await refusal(execTrial(id, [NODE, "-e", "1"]))).code).toBe("budget-spent");
  const stillPilot = await execTrial(id, [NODE, "-e", "1"], { pilot: true });
  expect(stillPilot.exitCode, "pilots are not charged to the budget").toBe(0);
});

test("the harness sees no credential-looking variable, and the wall cap kills the whole tree", async () => {
  const { id, dir } = await framedTrial();
  process.env.FAKE_API_KEY = "sk-planted";
  process.env.SOME_TOKEN = "planted";
  process.env.ANTHROPIC_API_KEY = "sk-ant-planted";
  process.env.TRIAL_PROBE_PLAIN = "kept";
  const out: Buffer[] = [];
  await execTrial(id, [NODE, "-e", "process.stdout.write(Object.keys(process.env).join('\\n'))"], { pilot: true, onStdout: (c) => out.push(c) });
  const keys = Buffer.concat(out).toString().split("\n");
  expect(keys, "an ordinary variable reaches the harness").toContain("TRIAL_PROBE_PLAIN");
  for (const k of ["FAKE_API_KEY", "SOME_TOKEN", "ANTHROPIC_API_KEY"]) expect(keys, k).not.toContain(k);
  expect(readFileSync(path.join(dir, "exec-logs", "1.log"), "utf8")).not.toContain("planted");

  // a child that starts a grandchild and sleeps; both must be gone once the cap fires. On Windows
  // the grandchild is detached: node puts its own children in a kill-on-close job, so a plain
  // kill of a NODE child takes them along and could not tell a tree kill from a shell-only one -
  // a harness in python or bash has no such job. (Off Windows it stays in the child's group.)
  writeFileSync(
    path.join(dir, "harness", "sleeper.cjs"),
    [
      'const { spawn } = require("node:child_process");',
      'const g = spawn(process.execPath, ["-e", "setTimeout(() => {}, 120000)"], { stdio: "ignore", detached: process.platform === "win32" });',
      'require("node:fs").writeFileSync("pids.json", JSON.stringify({ child: process.pid, grandchild: g.pid }));',
      "setTimeout(() => {}, 120000);",
    ].join("\n"),
  );
  const started = Date.now();
  const r = await execTrial(id, [NODE, "sleeper.cjs"], { pilot: true, capMs: 2_000 });
  expect(r).toMatchObject({ timedOut: true, exitCode: null, pilot: true });
  expect(r.durationMs).toBeGreaterThanOrEqual(1_900);
  expect(Date.now() - started, "the record does not wait out the sleep").toBeLessThan(30_000);
  const pids = JSON.parse(readFileSync(path.join(dir, "harness", "pids.json"), "utf8")) as { child: number; grandchild: number };
  await expect.poll(() => alive(pids.child) || alive(pids.grandchild), { timeout: 15_000 }).toBe(false);
  expect((await readExecs(dir)).at(-1)).toEqual(r);
  expect(readFileSync(path.join(dir, "exec-logs", "2.log"), "utf8")).toContain("wall cap of 2 s reached");
});

/* ── close and drop ────────────────────────────────────────────────────────── */

test("close refuses results that fail validation, naming every problem; a void close files exactly one lead", async () => {
  const { id, dir } = await framedTrial();
  await sealTrial(id);
  await execTrial(id, [NODE, "-e", "1"]);
  writeFileSync(
    path.join(dir, "results.json"),
    JSON.stringify({
      schema: "results/0",
      arms: [
        { id: "alternative", observations: [1, "x"], guards: {} },
        { id: "golden", observations: [], guards: { overflows: 0, extra: 1 } },
      ],
      controls: [{ id: "nope", held: "yes", evidence: "" }],
      modelCalls: -1,
    }),
  );
  const e = await refusal(closeTrial(id));
  expect([e.code, e.status]).toEqual(["bad-results", 400]);
  for (const part of [
    'schema must be "article-trial-results/1"',
    'arms[0].id must be "golden"',
    "arms[0].observations[1] is not a finite number",
    "arms[0].guards lacks overflows",
    'arms[1].id must be "alternative"',
    "arms[1].guards has extra, which the prereg does not guard",
    'controls[0].id "nope" is not a control the prereg declared',
    "controls[0].held must be true or false",
    "controls[0].evidence must be a non-empty string",
    "controls lacks same-corpus",
    "modelCalls must be an integer of at least 0",
  ])
    expect(e.message, part).toContain(part);
  expect((await readTrial(id)).status, "a refused close changes nothing").toBe("sealed");
  expect(existsSync(path.join(dir, "verdict.json"))).toBe(false);

  writeFileSync(path.join(dir, "results.json"), JSON.stringify(results(five(14), five(10), { controls: [{ id: "same-corpus", held: false, evidence: "the corpus changed between arms" }] })));
  const verdict = await closeTrial(id);
  expect(verdict.verdict).toBe("void");
  const lines = readFileSync(leads, "utf8").split("\n").filter(Boolean);
  expect(lines).toHaveLength(1);
  const lead = JSON.parse(lines[0]);
  expect(Object.keys(lead).sort()).toEqual(["because", "bundle", "claim", "confidence", "from", "kind", "nearest", "ts"]);
  expect(lead).toMatchObject({ bundle: "software-engineering", nearest: "token-budgeting", kind: "technique", confidence: "low" });
  expect(lead.from).toMatch(/^article-trial@\d{4}-\d{2}-\d{2}$/);
  expect(lead.claim).toMatch(/^When count-before-send .+, hold same-corpus .+ because trial .+ was void: control "same-corpus" did not hold/);
  expect(lead.because).toContain(id);
  expect(await readTrial(id)).toMatchObject({ status: "closed", verdict: "void" });
  await refusal(closeTrial(id));
  expect(readFileSync(leads, "utf8").split("\n").filter(Boolean), "a refused second close files nothing").toHaveLength(1);
});

test("drop closes a trial without a verdict; a stale one files a subject lead with its first source", async () => {
  const { id, dir } = await framedTrial();
  await checkTrial(id);
  writeFileSync(
    path.join(dir, "validity.json"),
    JSON.stringify({ state: "stale", reasons: ["the vendor now counts server-side and bills the count"], sources: [{ url: "https://example.com/server-count", title: "Server-side counting", date: "2026-10-02" }] }),
  );
  expect((await refusal(dropTrial(id, "  "))).code).toBe("bad-reason");
  const dropped = await dropTrial(id, "validity stale: the practice moved");
  expect(dropped.record.status).toBe("closed");
  expect(dropped.record.verdict).toBeUndefined();
  expect(JSON.parse(readFileSync(path.join(dir, "drop.json"), "utf8")).reason).toBe("validity stale: the practice moved");
  const lines = readFileSync(leads, "utf8").split("\n").filter(Boolean);
  expect(lines).toHaveLength(1);
  const lead = JSON.parse(lines[0]);
  expect(lead).toMatchObject({ kind: "subject", nearest: "token-budgeting", confidence: "low" });
  expect(lead.claim).toContain("the vendor now counts server-side and bills the count");
  expect(lead.claim).toContain("Server-side counting");
  expect(lead.because).toContain("https://example.com/server-count");
  expect((await refusal(execTrial(id, [NODE, "-e", "1"], { pilot: true }))).code).toBe("trial-closed");
  // a dropped trial no longer holds the subject: the next open gets the next id of the day
  expect((await openTrial(SUBJECT, NOW)).id).toBe("2026-10-07-token-budgeting-2");
});

/* ── open and candidates ───────────────────────────────────────────────────── */

test("open writes the brief from the registry and holds the subject until the trial closes", async () => {
  const rec = await openTrial(SUBJECT, NOW);
  expect(rec).toEqual({
    schema: "article-trial/1",
    id: "2026-10-07-token-budgeting",
    status: "open",
    subject: {
      ...SUBJECT,
      file: "knowledge/software-engineering/llm-agent/token-budgeting/token-budgeting.md",
      digest: "sha256-b2:0123456789abcdef",
      revision: 3,
      changedAt: "2026-09-01",
    },
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  });
  const brief = path.join(trialDir(rec.id), "brief");
  expect(readFileSync(path.join(brief, "golden-path.md"), "utf8")).toContain("# Token budgeting");
  expect(readdirSync(path.join(brief, "techniques"))).toEqual(["count-before-send.md"]);
  expect(readFileSync(path.join(brief, "techniques", "count-before-send.md"), "utf8")).toContain("# Count before send");
  expect(JSON.parse(readFileSync(path.join(brief, "applications.json"), "utf8"))).toEqual([
    {
      file: "knowledge/software-engineering/llm-agent/token-budgeting/applications/node--count-before-send.md",
      stack: "node",
      technique: "count-before-send",
      ab_verdict: "better",
      verified_on: "2026-08-20",
    },
  ]);
  expect(Array.isArray(JSON.parse(readFileSync(path.join(brief, "governs.json"), "utf8")))).toBe(true);
  expect(existsSync(path.join(brief, "currency.json")), "the fixture registry has no currency check: the file is left out").toBe(false);

  const claimed = await refusal(openTrial(SUBJECT, NOW));
  expect([claimed.code, claimed.status]).toEqual(["trial-claimed", 409]);
  expect(claimed.message).toContain(rec.id);
  expect((await refusal(openTrial({ bundle: "software-engineering", slug: "no-such-subject" }, NOW))).code).toBe("no-subject");
  expect((await scanTrials()).trials.map((t) => t.id), "a refused open leaves no directory").toEqual([rec.id]);

  // a registry that does carry the currency check: its JSON is kept verbatim
  const report = { atRisk: [], expired: [], volatile: { top: [] } };
  writeFileSync(path.join(box.registry, "scripts", "check-currency.mjs"), `process.stdout.write(${JSON.stringify(JSON.stringify(report))});\n`);
  await dropTrial(rec.id, "reopened to read the currency report");
  const second = await openTrial(SUBJECT, NOW);
  expect(JSON.parse(readFileSync(path.join(trialDir(second.id), "brief", "currency.json"), "utf8"))).toEqual(report);
});

test("candidates: contest, relevance and currency rank them, the same on every call, claimed subjects left out", async () => {
  addSubject("alpha-topic", { changedAt: "2026-10-01", apps: [{ stack: "node", verdict: "not-better" }, { stack: "python", verdict: "not-better" }, { stack: "rust", verdict: "better" }] });
  addSubject("beta-topic", { changedAt: "2026-10-01" });
  addSubject("gamma-topic", { changedAt: "2026-10-01" });
  addSubject("delta-topic");
  writeFileSync(
    path.join(box.registry, "scripts", "check-currency.mjs"),
    `process.stdout.write(${JSON.stringify(
      JSON.stringify({
        atRisk: [{ id: "software-engineering/gamma-topic/node--rule" }],
        expired: [],
        volatile: { top: [{ domain: "software-engineering", subject: "gamma-topic", score: 30 }, { domain: "software-engineering", subject: "gamma-topic", score: 10 }] },
      }),
    )});\n`,
  );
  // this repo, as the ranking sees it: a map in which beta governs two contexts, and a manifest
  // that names the standard's own bundle (which stays out)
  const root = path.join(box.dir, "repo");
  mkdirSync(path.join(root, ".ai"), { recursive: true });
  writeFileSync(path.join(root, ".ai", "registry-map.json"), JSON.stringify({ subjectIndex: { "beta-topic": ["c1", "c2"] }, contexts: [{ context: "c1", name: "one" }, { context: "c2", name: "two" }] }));
  writeFileSync(path.join(root, ".ai", "manifest.yaml"), "knowledge:\n  domains: [software-engineering, technical-writing]\n");
  expect(manifestKnowledgeDomains("knowledge:\n  domains:\n    - a # first\n    - 'b'\nother: 1\n")).toEqual(["a", "b"]);

  const first = await rankTrialCandidates({ root, now: NOW });
  const again = await rankTrialCandidates({ root, now: NOW });
  expect(again, "the same registry, map and day give the same list").toEqual(first);
  expect(first.candidates.map((c) => c.slug)).toEqual(["alpha-topic", "beta-topic", "gamma-topic", "token-budgeting", "delta-topic"]);
  expect(first.candidates.every((c) => c.bundle === "software-engineering"), "technical-writing is never a candidate").toBe(true);
  const by = Object.fromEntries(first.candidates.map((c) => [c.slug, c]));
  expect(by["alpha-topic"]).toMatchObject({ contested: 2, governsHere: 0, atRisk: 0, volatile: 0, title: "The alpha topic", revision: 1, changedAt: "2026-10-01" });
  expect(by["beta-topic"]).toMatchObject({ contested: 0, governsHere: 2 });
  expect(by["gamma-topic"]).toMatchObject({ atRisk: 1, volatile: 40 });
  expect(by["delta-topic"].changedAt, "an absent changedAt is omitted, never null").toBeUndefined();
  expect(by["delta-topic"].score).toBe(0);
  expect(by["alpha-topic"].score).toBe(trialScore({ contested: 2, governsHere: 0, atRisk: 0, volatile: 0, ageDays: 6 }));
  expect(by["gamma-topic"].score).toBe(trialScore({ contested: 0, governsHere: 0, atRisk: 1, volatile: 40, ageDays: 6 }));
  expect(first.claimed).toEqual([]);
  expect((await rankTrialCandidates({ root, now: NOW, limit: 2 })).candidates.map((c) => c.slug)).toEqual(["alpha-topic", "beta-topic"]);

  // an open trial on alpha and a trial run drafting beta both claim their subjects
  const held = await openTrial({ bundle: "software-engineering", slug: "alpha-topic" }, NOW);
  mkdirSync(path.join(box.store, "2026-10-07-beta-topic"), { recursive: true });
  writeFileSync(
    path.join(box.store, "2026-10-07-beta-topic", "run.json"),
    JSON.stringify({
      id: "2026-10-07-beta-topic",
      status: "drafting",
      topic: { kind: "subject", bundle: "software-engineering", subject: "beta-topic", text: "beta" },
      trial: { id: "2026-10-06-beta-topic", verdict: "upheld", technique: "rule", alternative: "x", metric: "m", n: 5, sourceN: 1, applicationPath: "knowledge/x.md" },
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
      steps: [],
    }),
  );
  const after = await rankTrialCandidates({ root, now: NOW });
  expect(after.candidates.map((c) => c.slug)).toEqual(["gamma-topic", "token-budgeting", "delta-topic"]);
  expect(after.claimed).toEqual(["software-engineering/alpha-topic", "software-engineering/beta-topic"]);
  await dropTrial(held.id, "probe");
  expect((await rankTrialCandidates({ root, now: NOW })).claimed, "a closed trial holds nothing").toEqual(["software-engineering/beta-topic"]);
});

/* ── the CLI ───────────────────────────────────────────────────────────────── */

test("CLI: status and candidates --json shapes, exec's exit code and clean stdout, run --trial refusals", async () => {
  addSubject("alpha-topic", { changedAt: "2026-10-01" });
  const rec = await openTrial(SUBJECT, NOW);
  mkdirSync(path.join(trialDir(rec.id), "harness"), { recursive: true });
  writeFileSync(path.join(trialDir(rec.id), "harness", "argv.cjs"), "process.stdout.write(JSON.stringify(process.argv.slice(2)) + '\\n');\nprocess.exit(7);\n");
  // npx tsx, as the docs run it; fixed command strings with no caller input in them.
  const cli = (line: string) => spawnSync(`npx tsx pipeline/article.mts ${line}`, { cwd: ROOT, encoding: "utf8", shell: true, env: process.env, timeout: 120_000 });

  // exec: the command's own exit code; its stdout untouched; the record on stderr; `--` keeps `--json` for the command
  const plain = cli(`trial exec ${rec.id} --pilot -- node argv.cjs --json`);
  expect(plain.status, plain.stderr).toBe(7);
  expect(plain.stdout).toBe('["--json"]\n');
  const line = plain.stderr.split(/\r?\n/).find((l) => l.startsWith("[trial] "));
  expect(JSON.parse(line!.slice("[trial] ".length))).toMatchObject({ cmd: ["node", "argv.cjs", "--json"], pilot: true, exitCode: 7, timedOut: false });
  const json = cli(`trial exec ${rec.id} --pilot --json -- node argv.cjs`);
  expect(json.status).toBe(7);
  expect(JSON.parse(json.stdout)).toMatchObject({ trial: rec.id, exec: { cmd: ["node", "argv.cjs"], pilot: true, exitCode: 7 } });
  expect(json.stderr, "under --json the command's stdout goes to stderr").toContain("[]");

  const list = cli("trial status --json");
  expect(list.status, list.stderr).toBe(0);
  const listed = JSON.parse(list.stdout);
  expect(Object.keys(listed).sort()).toEqual(["damaged", "trials"]);
  expect(listed.trials.map((t: { id: string; status: string }) => [t.id, t.status])).toEqual([[rec.id, "open"]]);
  expect(listed.damaged).toEqual([]);

  const one = cli(`trial status ${rec.id} --json`);
  expect(one.status, one.stderr).toBe(0);
  const view = JSON.parse(one.stdout);
  expect(Object.keys(view).sort()).toEqual(["dir", "execs", "files", "measuredMs", "trial"]);
  expect(view.trial.id).toBe(rec.id);
  expect(view.files).toEqual(["trial.json", "brief", "harness", "exec.jsonl", "exec-logs"]);
  expect(view.execs).toHaveLength(2);
  expect(view.measuredMs).toBe(0);

  const cand = cli("trial candidates --limit 5 --json");
  expect(cand.status, cand.stderr).toBe(0);
  const ranked = JSON.parse(cand.stdout);
  expect(Object.keys(ranked).sort()).toEqual(["candidates", "claimed"]);
  expect(ranked.claimed).toEqual(["software-engineering/token-budgeting"]);
  expect(ranked.candidates.map((c: { slug: string }) => c.slug)).toEqual(["alpha-topic"]);
  expect(Object.keys(ranked.candidates[0]).sort()).toEqual(["atRisk", "bundle", "changedAt", "contested", "file", "governsHere", "revision", "score", "slug", "title", "volatile"]);

  const both = cli(`run --trial ${rec.id} --subject software-engineering/token-budgeting`);
  expect(both.status).toBe(2);
  expect(both.stderr).toContain("run --trial takes its subject from the trial");
  const missing = cli("run --trial 2026-01-01-no-such-trial --json");
  expect(missing.status).toBe(1);
  expect(JSON.parse(missing.stdout)).toMatchObject({ code: "no-trial" });
  expect(existsSync(box.store) ? readdirSync(box.store) : [], "a refused run creates nothing").toEqual([]);
  expect(cli("trial frobnicate").status).toBe(2);
});
