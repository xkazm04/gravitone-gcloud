// THE ARTICLE JOB, KILLED AT EVERY STEP BOUNDARY (Phase 4, L30) - a live job (the stub
// agent as the fake vendor, reporting a seat cost) over the real v1 engine and a real
// kernel store, its process "dying" at each of the gate job's six steps, twice:
//   before  the step was dispatched (in flight on the record) and nothing ran;
//   after   the step ran to its end and died before the job booked it - the case the
//           record honestly cannot tell from "ran halfway".
// After each death the next process sweeps (`recover`), the operator resumes (v1's
// `resume`, now `resumeArticle`: acknowledge the held lane, retry the job), and the job is
// driven again.
//
// INVARIANT - v1's never-re-spend rule, stated for the article: a step whose run.json
// record says `done` is never performed again, whoever asks; so a run killed anywhere ends
// at the gate having started EXACTLY as many agent turns as a run never killed, every turn
// booked once, and the job's spend equal to its meter. The record names the step that was
// in flight, and the lane holds until an operator looked.

import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Holder } from "@gt/domain/job";
import type { Effects } from "@gt/kernel/effects";
import { laneHold } from "@gt/kernel/job-queue";
import { recover, runJob } from "@gt/kernel/job-run";
import { get } from "@gt/kernel/job";
import { assertReconciled } from "@gt/kernel/spend/projection";

import { defaultDeps } from "../../lib/articles/engine.ts";
import { readRun } from "../../lib/articles/store.ts";
import { articleKernel, articleProducer, launchArticle, resumeArticle, type ArticleBinding } from "../../lib/producers/article.ts";
import { ARTICLE_ENV, articleSandbox, type ArticleSandbox } from "../golden-path/_articles.ts";

const saved = new Map(ARTICLE_ENV.map((k) => [k, process.env[k]]));
let box: ArticleSandbox;
let turnLog: string;
// The sandbox is a throwaway registry a subprocess builds with fourteen git calls
// (tests/fixtures/articles/registry-fixture.mjs): 1.2-2.6 s on a quiet box, 51 s measured on a
// loaded one. The 10 s hook default was a budget for no process at all.
beforeAll(() => {
  box = articleSandbox();
  turnLog = path.join(box.dir, "turns.log");
  process.env["STUB_AGENT_ARGV_LOG"] = turnLog;
  process.env["STUB_AGENT_COST"] = "0.5";
}, 120_000);
afterAll(() => {
  box.cleanup();
  for (const [k, v] of saved) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const OP = { kind: "operator", id: "op-test" } as const;
const FIRST: Holder = { bootId: "boot-first", pid: process.pid, host: "test-host" };
const RESTARTED: Holder = { bootId: "boot-restarted", pid: process.pid, host: "test-host" };
const RUN = { alive: () => true, sleep: async () => undefined };
/** The crash harness's sentinel: not an Error, so no code can catch it as an outcome (kernel crash.ts). */
const DEATH = Symbol("process death");

function must<T>(r: { ok: true; value: T } | { ok: false; error: { code: string; message: string } }): T {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.value;
}
const kernel = (): NonNullable<ArticleBinding["kernel"]> => must(articleKernel());
const binding = (): ArticleBinding => ({ kernel: kernel(), engine: () => defaultDeps({ render: false }) });
const turns = (): number => {
  try {
    return readFileSync(turnLog, "utf8").split("\n").filter((l) => l.trim() !== "").length;
  } catch {
    return 0;
  }
};

/** The process dies at the named perform: before it runs, or after it returns and before its booking. */
function dying(fx: Effects, step: string, when: "before" | "after"): Effects {
  return {
    ...fx,
    async call(name, fn) {
      if (name === `perform:${step}` && when === "before") throw DEATH;
      const v = await fx.call(name, fn);
      if (name === `perform:${step}`) throw DEATH;
      return v;
    },
  };
}

async function launched(text: string): Promise<{ runId: string; jobId: string }> {
  const l = must(await launchArticle({ topic: { kind: "free", text } }, { actor: OP, mode: "live", ceilingUsd: 500, binding: binding(), env: {} }));
  if (l.jobId === undefined) throw new Error(`run ${l.run.id} got no job: ${l.run.error ?? ""}`);
  return { runId: l.run.id, jobId: l.jobId };
}

let clean = 0;

describe("an article job killed at every step boundary", () => {
  it("a run never killed: the turn count every killed run must match", { timeout: 120_000 }, async () => {
    writeFileSync(turnLog, "");
    const { runId, jobId } = await launched("the clean tax");
    const b = binding();
    expect(must(await runJob(b.kernel!.fx, articleProducer(b), jobId, { ...RUN, holder: FIRST })).outcome).toBe("done");
    expect((await readRun(runId)).status).toBe("awaiting-approval");
    clean = turns();
    expect(clean).toBeGreaterThanOrEqual(8);
  });

  for (const step of ["create", "research", "outline", "draft", "critique", "check"]) {
    for (const when of ["before", "after"] as const) {
      it(`dies ${when} ${step}: interrupted naming ${step}, the lane held; resumed, it reaches the gate with no turn re-spent`, { timeout: 120_000 }, async () => {
        writeFileSync(turnLog, "");
        const { runId, jobId } = await launched(`the ${step} ${when} tax`);
        const b = binding();
        await expect(runJob(dying(b.kernel!.fx, step, when), articleProducer(b), jobId, { ...RUN, holder: FIRST })).rejects.toBe(DEATH);
        appendFileSync(turnLog, "");

        // The next process's first act: the sweep names the holder and the step in flight.
        const swept = must(recover(b.kernel!.fx, { holder: RESTARTED, alive: () => true }));
        expect(swept.map((j) => j.id)).toEqual([jobId]);
        const job = must(get(b.kernel!.store, jobId as never)).job;
        expect(job).toMatchObject({ state: "interrupted", interruption: { stage: step } });
        expect(must(b.kernel!.store.read((r) => laneHold(r, "seat.text")))).toMatchObject({ jobId, stage: step });
        must(b.kernel!.store.read((r) => assertReconciled(r, jobId)));

        // Nothing drives on a held lane until the operator looked.
        expect(must(await runJob(b.kernel!.fx, articleProducer(b), jobId, { ...RUN, holder: RESTARTED })).outcome).toBe("not-queued");
        const resumed = must(await resumeArticle(runId, { actor: OP, mode: "live", binding: b, env: {} }));
        expect(resumed.jobId).toBe(jobId);
        expect(must(b.kernel!.store.read((r) => laneHold(r, "seat.text")))).toBeUndefined();

        const done = must(await runJob(b.kernel!.fx, articleProducer(b), jobId, { ...RUN, holder: RESTARTED }));
        expect(done.outcome, done.job?.error?.message).toBe("done");
        expect(done.job?.attempt).toBe(2);
        expect((await readRun(runId)).status).toBe("awaiting-approval");
        // v1's never-re-spend rule: exactly the turns of a run never killed.
        expect(turns()).toBe(clean);
        must(b.kernel!.store.read((r) => assertReconciled(r, jobId)));
        const rows = must(b.kernel!.store.read((r) => r.get("SELECT count(*) AS n FROM spend_rows WHERE job_id = ?", jobId)?.["n"]));
        expect(Number(done.job?.spend.usd)).toBeCloseTo(Number(rows) * 0.5, 6);
      });
    }
  }
});
