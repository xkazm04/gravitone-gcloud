// THE ARTICLE PRODUCER, BOUND TO v1's ENGINE (Phase 4, L30) - lib/producers/article.ts
// over the REAL article engine (lib/articles), a REAL kernel store and the stub agent v1's
// own probes use (tests/golden-path/_articles.ts: a throwaway registry clone, `gh` a stub).
// Nothing spends and nothing leaves this machine.
//
// What is pinned, each against the record that would show it broken:
//   - a DRY job runs end to end through `runJob`, every agent turn a would-call answered by
//     the stand-in, and the live seam is never entered - whatever ARTICLES_AGENT_BIN says
//     (it points at a tripwire here);
//   - a LIVE job with a fake vendor (the stub reporting a seat cost) books every turn on
//     the meter, reconciles, and the codex/agy turns are unpriced rows with their reason;
//   - one driver per job: a second drive of the same job is refused at the claim;
//   - the CLI, the Floor and Runs act on the same job id: the CLI enqueues and Runs pauses and
//     resumes that job before the CLI's `resume` drives it; the Floor's article composer
//     enqueues and the CLI reads the job it made (Phase 6 L67: the UI door was POST
//     /api/articles, the v1 /articles page's route, which wave C deletes);
//   - the v1 reader (lib/ledger/v1/sources/articles.ts) still reads the run, and reads a
//     run whose job is queued as held, not stalled.
// The crash-at-every-boundary proof is producer-article-crash.test.ts.

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Holder } from "@gt/domain/job";
import { runJob } from "@gt/kernel/job-run";
import { get } from "@gt/kernel/job";
import { assertReconciled } from "@gt/kernel/spend/projection";

import { defaultDeps } from "../../lib/articles/engine.ts";
import { readRun } from "../../lib/articles/store.ts";
import { heldByJobs, readArticles } from "../../lib/ledger/v1/sources/articles.ts";
import { approveArticle, articleKernel, articleProducer, continueArticle, driveArticle, launchArticle, reworkArticle, type ArticleBinding } from "../../lib/producers/article.ts";
import { stripsKernel } from "../../lib/producers/strips.ts";
import { makeRealProduce } from "../../app/(studio)/projects/_port/real.ts";
import { ARTICLE_ENV, articleSandbox, ROOT, STUB_AGENT, STUB_ENGINE_BINS, type ArticleSandbox } from "../golden-path/_articles.ts";

const saved = new Map([...ARTICLE_ENV, "NEXT_PUBLIC_DEV_AUTH"].map((k) => [k, process.env[k]]));
let box: ArticleSandbox;
let tripwire: string;
beforeAll(() => {
  box = articleSandbox();
  // The live seam's binaries, pointed at a script that leaves a mark: a dry job must never reach it.
  tripwire = path.join(box.dir, "tripwire.mjs");
  writeFileSync(tripwire, `import fs from "node:fs"; fs.appendFileSync(${JSON.stringify(path.join(box.dir, "tripped.log"))}, "live seam entered\\n"); process.exit(3);\n`);
});
afterAll(() => {
  box.cleanup();
  for (const [k, v] of saved) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const OP = { kind: "operator", id: "op-test" } as const;
const ME: Holder = { bootId: "boot-test", pid: process.pid, host: "test-host" };
const RUN = { holder: ME, alive: () => true, sleep: async () => undefined };
const binding = (): ArticleBinding => {
  const k = articleKernel();
  if (!k.ok) throw k.error;
  return { kernel: k.value, engine: () => defaultDeps({ render: false }) };
};
const must = <T>(r: { ok: true; value: T } | { ok: false; error: { code: string; message: string } }): T => {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.value;
};
const count = (sql: string, ...p: string[]): number => {
  const v = must(binding().kernel!.store.read((r) => r.get(sql, ...p)?.["n"]));
  return typeof v === "number" ? v : -1;
};
const withTripwire = (): void => {
  process.env["ARTICLES_AGENT_BIN"] = `node|${tripwire}`;
  process.env["ARTICLES_CODEX_BIN"] = `node|${tripwire}|--as=codex`;
  process.env["ARTICLES_AGY_BIN"] = `node|${tripwire}|--as=agy`;
};
const withStubVendor = (): void => {
  process.env["ARTICLES_AGENT_BIN"] = `node|${STUB_AGENT}`;
  Object.assign(process.env, STUB_ENGINE_BINS);
};

describe("a dry article job", () => {
  it("runs to the gate through runJob: every turn a would-call, the live seam never entered, nothing booked", { timeout: 180_000 }, async () => {
    withTripwire();
    const b = binding();
    const l = must(await launchArticle({ topic: { kind: "free", text: "the dry tax" } }, { actor: OP, mode: "dry", binding: b, env: {} }));
    expect(l.jobId).toBe(`job:run:${l.run.id}`);
    expect(l.receipt.mode).toBe("dry");
    const rep = must(await runJob(b.kernel!.fx, articleProducer(b), l.jobId!, RUN));
    expect(rep.outcome, rep.job?.error?.message).toBe("done");
    expect(existsSync(path.join(box.dir, "tripped.log"))).toBe(false);
    // research, outline, draft, four reviewers, the writer's answer: at least eight turns, each declared.
    expect(rep.wouldCalls?.length).toBeGreaterThanOrEqual(8);
    expect(new Set(rep.wouldCalls?.map((c) => c.provider))).toEqual(new Set(["claude-seat", "codex-seat", "agy-seat"]));
    expect((await readRun(l.run.id)).status).toBe("awaiting-approval");
    expect(rep.job).toMatchObject({ state: "done", mode: { kind: "dry" }, spend: { usd: 0, unpriced: 0 } });
    expect(count("SELECT count(*) AS n FROM spend_rows WHERE job_id = ?", l.jobId!)).toBe(0);
    expect(count("SELECT count(*) AS n FROM spend_unpriced WHERE job_id = ?", l.jobId!)).toBe(0);
    expect(count("SELECT count(*) AS n FROM job_outputs WHERE job_id = ?", l.jobId!)).toBe(6);
  });
});

describe("a live article job with a fake vendor", () => {
  it("books every turn on the meter against its step; codex and agy are unpriced with the reason; the record reconciles", { timeout: 180_000 }, async () => {
    withStubVendor();
    process.env["STUB_AGENT_COST"] = "0.25";
    try {
      const b = binding();
      const l = must(await launchArticle({ topic: { kind: "free", text: "the metered tax" } }, { actor: OP, mode: "live", ceilingUsd: 500, binding: b, env: {} }));
      const rep = must(await runJob(b.kernel!.fx, articleProducer(b), l.jobId!, RUN));
      expect(rep.outcome, rep.job?.error?.message).toBe("done");
      const jobId = l.jobId!;
      must(b.kernel!.store.read((r) => assertReconciled(r, jobId)));
      const priced = count("SELECT count(*) AS n FROM spend_rows WHERE job_id = ?", jobId);
      const unpriced = count("SELECT count(*) AS n FROM spend_unpriced WHERE job_id = ? AND reason = 'seat reported no cost'", jobId);
      expect(priced).toBeGreaterThanOrEqual(4);
      expect(unpriced).toBeGreaterThanOrEqual(2);
      const job = must(get(b.kernel!.store, l.jobId as never)).job;
      expect(job.spend.usd).toBeCloseTo(priced * 0.25, 6);
      // Every row names its step: the critique's turns are the critique's, not the job's in general.
      expect(count("SELECT count(*) AS n FROM spend_rows WHERE job_id = ? AND (step IS NULL OR step = '')", jobId)).toBe(0);
      expect(count("SELECT count(*) AS n FROM spend_rows WHERE job_id = ? AND step = 'critique'", jobId)).toBeGreaterThanOrEqual(1);
      // v1's reader keeps its own per-step sum; it says the same as the meter.
      const v1Sum = (await readRun(l.run.id)).steps.reduce((a, s) => a + (s.costUsd ?? 0), 0);
      expect(v1Sum).toBeCloseTo(job.spend.usd, 6);
    } finally {
      delete process.env["STUB_AGENT_COST"];
    }
  });
});

describe("one driver per job", () => {
  it("a second drive of the same job is refused at the claim; each step runs once", { timeout: 180_000 }, async () => {
    withStubVendor();
    const b = binding();
    const l = must(await launchArticle({ topic: { kind: "free", text: "the twice tax" } }, { actor: OP, mode: "dry", binding: b, env: {} }));
    const other: Holder = { bootId: "boot-other", pid: process.pid, host: "other-host" };
    const [a, c] = await Promise.all([runJob(b.kernel!.fx, articleProducer(b), l.jobId!, RUN), runJob(b.kernel!.fx, articleProducer(b), l.jobId!, { ...RUN, holder: other })]);
    expect([must(a).outcome, must(c).outcome].sort()).toEqual(["done", "not-queued"]);
    expect(count("SELECT count(*) AS n FROM events WHERE subject_id = ? AND type = 'job.step-started'", l.jobId!)).toBe(6);
    expect(count("SELECT count(*) AS n FROM events WHERE subject_id = ? AND type = 'job.claimed'", l.jobId!)).toBe(1);
  });
});

describe("the CLI, the Floor and Runs act on the same job", () => {
  // The Floor's and Runs' server side (app/(studio)/projects/_port/real.ts) over the store the CLI opens.
  const floor = () => makeRealProduce({ store: () => ok(binding().kernel!.store), strips: () => stripsKernel(), env: () => process.env, now: () => Date.now() });
  const ok = <T,>(value: T) => ({ ok: true as const, value });
  const cliEnv = () => {
    const env = { ...process.env, TMP: path.join(box.dir, "tmp"), TEMP: path.join(box.dir, "tmp") };
    mkdirSync(env.TMP, { recursive: true });
    return env;
  };
  // The CLI exactly as the operator and the /article-run skill run it (`npx tsx`), in its own process.
  // `status` prints one pretty document; every other verb ends with its one-line document.
  const cli = (argv: string, whole = false): Record<string, unknown> => {
    const out = execSync(`npx --no-install tsx pipeline/article.mts ${argv} --json`, { cwd: ROOT, env: cliEnv(), encoding: "utf8" });
    return JSON.parse(whole ? out : out.trim().split("\n").at(-1) ?? "{}") as Record<string, unknown>;
  };

  it("`article.mts run --detach` enqueues job:run:<id>; Runs draws and pauses and resumes THAT job; `resume <id>` drives it to the gate", { timeout: 240_000 }, async () => {
    withStubVendor();
    const made = cli(`run --topic "the shared tax" --dry --detach`);
    const runId = String(made["runId"]);
    const jobId = String(made["jobId"]);
    expect(jobId).toBe(`job:run:${runId}`);
    // The CLI enqueued and returned: nothing drove it.
    expect(must(get(binding().kernel!.store, jobId as never)).job.state).toBe("queued");
    const held = await readArticles(box.store, heldByJobs);
    expect(must(held).runs.find((r) => r.run.id === runId)?.driving).toBe(true);

    // Runs draws the CLI's job, and its acts land on it.
    const runs = floor();
    expect(must(runs.listJobs()).filter((j) => j.id === jobId).map((j) => j.state)).toEqual(["queued"]);
    must(runs.pauseJob({ jobId }, { who: "op-test" }));
    expect(must(get(binding().kernel!.store, jobId as never)).job.state).toBe("paused");
    must(runs.resumeJob({ jobId }, { who: "op-test" }));

    const doc = cli(`resume ${runId}`);
    expect(doc).toMatchObject({ runId, status: "awaiting-approval", jobId, job: "done", mode: "dry" });
    expect(must(get(binding().kernel!.store, jobId as never)).job).toMatchObject({ state: "done", attempt: 1 });

    // The v1 reader reads the result at the gate as a gate pile.
    const read = must(await readArticles(box.store));
    expect(read.runs.find((r) => r.run.id === runId)?.run.status).toBe("awaiting-approval");
  });

  it("the Floor's article composer enqueues a job the CLI's drive takes to the gate, and `status <id>` names that job", { timeout: 240_000 }, async () => {
    withStubVendor();
    const runs = floor();
    const input = { lane: "article", text: "A ceiling is a stop point, not a refusal.", topic: "the stop-point tax" } as const;
    const receipt = must(await runs.composerReceipt({ input, mode: "dry" }, { who: "op-test" }));
    const go = must(await runs.launchRun({ input, token: receipt.token, mode: "dry" }, { who: "op-test" }));
    if (go.kind !== "launched") throw new Error(`expected a launch, got ${go.kind}`);
    expect(go.jobId).toBe(`job:run:${go.runId}`);
    expect(must(get(binding().kernel!.store, go.jobId as never)).job).toMatchObject({ state: "queued", mode: { kind: "dry" } });
    // The CLI's own drive (what `run` and `resume` call) writes run.json from the Run and runs to the gate.
    const rep = must(await driveArticle(go.jobId, { binding: binding(), env: process.env }));
    expect(rep.outcome, rep.job?.error?.message).toBe("done");
    const doc = cli(`status ${go.runId}`, true);
    expect(doc).toMatchObject({ id: go.runId, status: "awaiting-approval" });
    expect(doc["jobs"]).toEqual([expect.objectContaining({ id: go.jobId, state: "done", mode: "dry" })]);
  });
});

describe("the human gate stays outside the job", () => {
  const gate = async (text: string, mode: "dry" | "live") => {
    withStubVendor();
    const b = binding();
    const l = must(await launchArticle({ topic: { kind: "free", text } }, { actor: OP, mode, binding: b, env: {} }));
    expect(must(await runJob(b.kernel!.fx, articleProducer(b), l.jobId!, RUN)).outcome).toBe("done");
    return { b, runId: l.run.id };
  };
  const branches = (): string => execSync("git branch --list article/*", { cwd: box.origin, encoding: "utf8" });

  it("approve starts a SECOND job, live: it lands on the throwaway origin once; approving again finds the same job", { timeout: 180_000 }, async () => {
    process.env["STUB_GH_LOG"] = path.join(box.dir, "gh-live.log");
    const { b, runId } = await gate("the landed tax", "live");
    const a = must(await approveArticle(runId, [], { actor: OP, mode: "live", binding: b, env: {} }));
    expect(a.jobId).toBe(`job:run:${runId}:landing`);
    const land = must(await runJob(b.kernel!.fx, articleProducer(b), a.jobId, RUN));
    expect(land.outcome, land.job?.error?.message).toBe("done");
    const run = await readRun(runId);
    expect(run.status, run.error).toBe("landed");
    expect(branches()).toContain(run.landing?.branch ?? "(none)");
    expect(readFileSync(path.join(box.dir, "gh-live.log"), "utf8")).toMatch(/"pr","create"/);
    // The Board's redelivery path: the act's job is found, not doubled.
    expect(must(continueArticle(run, { actor: OP, mode: "live", binding: b, env: {} })).jobId).toBe(a.jobId);
    expect(count("SELECT count(*) AS n FROM jobs WHERE id = ?", a.jobId)).toBe(1);
  });

  it("a DRY run's approval lands nothing: its landing job is dry whatever the approver asked, the run stays approved", { timeout: 180_000 }, async () => {
    process.env["STUB_GH_LOG"] = path.join(box.dir, "gh-dry.log");
    const before = branches();
    const { b, runId } = await gate("the dry landing tax", "dry");
    const a = must(await approveArticle(runId, [], { actor: OP, mode: "live", binding: b, env: {} }));
    const land = must(await runJob(b.kernel!.fx, articleProducer(b), a.jobId, RUN));
    expect(land).toMatchObject({ outcome: "done", job: { mode: { kind: "dry" } } });
    expect(land.wouldCalls?.map((c) => c.provider)).toEqual(["ai-registry"]);
    expect((await readRun(runId)).status).toBe("approved");
    expect(branches()).toBe(before);
    expect(existsSync(path.join(box.dir, "gh-dry.log"))).toBe(false);
  });

  it("rework is its own job; a second rework while it waits is refused busy", { timeout: 180_000 }, async () => {
    const { b, runId } = await gate("the reworked tax", "dry");
    const r = must(await reworkArticle(runId, "lead with the bill", { actor: OP, mode: "live", binding: b, env: {} }));
    expect(r.jobId).toBe(`job:run:${runId}:rework-1`);
    const again = await reworkArticle(runId, "again", { actor: OP, mode: "live", binding: b, env: {} });
    expect(again.ok ? "ok" : again.error.detail).toBe("busy");
    expect(must(await runJob(b.kernel!.fx, articleProducer(b), r.jobId, RUN))).toMatchObject({ outcome: "done", job: { mode: { kind: "dry" } } });
    const run = await readRun(runId);
    expect(run).toMatchObject({ status: "awaiting-approval", rework: { count: 1 } });
  });

  it("GRAVITONE_DRY_ONLY refuses a live launch before anything is written", async () => {
    const r = await launchArticle({ topic: { kind: "free", text: "the refused tax" } }, { actor: OP, mode: "live", binding: binding(), env: { GRAVITONE_DRY_ONLY: "1" } });
    expect(r.ok ? "ok" : `${r.error.code}:${r.error.detail ?? ""}`).toBe("refused:dry-only");
    expect(existsSync(path.join(box.store, `${new Date().toISOString().slice(0, 10)}-the-refused-tax`))).toBe(false);
  });
});
