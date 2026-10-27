import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { ok, type Result } from "@gt/domain/errors";
import type { Holder, Job } from "@gt/domain/job";
import { blobStore } from "@gt/kernel/blob";
import { liveEffects, type Effects } from "@gt/kernel/effects";
import type { Outputs } from "@gt/kernel/job-core";
import { enqueue, get } from "@gt/kernel/job";
import { runJob } from "@gt/kernel/job-run";
import { openKernel } from "@gt/kernel/kernel";
import { assertReconciled } from "@gt/kernel/spend/projection";
import type { Store } from "@gt/kernel/store";
import { defineArticle, type ArticlePorts, type StepReport } from "../src/article/define.ts";
import { articleJobId, parseArticleJob, planArticle, STEP_ESTIMATE } from "../src/article/plan.ts";

// The article producer's definition over FAKE ports and a REAL kernel store: the plan and
// the job-id grammar, and what the job does with what a step's turns report. The binding to
// v1's engine is tests/next-server/producer-article*.test.ts.

const tmp = mkdtempSync(path.join(tmpdir(), "gt-producers-article-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
let n = 0;
const ME: Holder = { bootId: "boot-a", pid: 501, host: "box-a" };
const RUN = { holder: ME, alive: () => true, sleep: async () => undefined };
const OP = { kind: "operator", id: "kazda" } as const;
const LIVE = { kind: "live", arm: { by: OP, at: "2026-10-16T12:00:00.000Z", reason: "test: spend semantics" } } as const;

function must<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(`expected ok, got ${r.error.code}: ${r.error.message}`);
  return r.value;
}

function world(): { store: Store; fx: Effects } {
  const k = must(openKernel(path.join(tmp, `a-${++n}.sqlite`)));
  return { store: k.store, fx: liveEffects(k.store, blobStore(path.join(tmp, `blobs-${n}`))) };
}

type Turn = { readonly engine: "claude" | "codex"; readonly cap?: number };
type Res = { readonly outcome: string; readonly costUsd?: number };

/** Ports whose every work step makes `turnsPerStep` turns: claude at `cost`, codex unpriced. */
function fake(o: { turnsPerStep?: number; cost?: number; standCost?: number; fail?: string } = {}) {
  const calls = { live: 0, stand: 0, steps: [] as string[], land: 0, caps: [] as number[], refused: [] as string[] };
  const ports: ArticlePorts<Turn, Res> = {
    describe: (t) => ({ engine: t.engine, model: `${t.engine}-model`, effort: "high", turn: "article-draft", promptChars: 10 }),
    live: async (t) => (calls.live++, t.engine === "claude" ? { outcome: "completed", costUsd: o.cost ?? 0.5 } : { outcome: "completed" }),
    // The stub agent reports a cost when a probe sets STUB_AGENT_COST (tests/fixtures/articles/stub-agent.mjs).
    stand: async (t) => (calls.stand++, o.standCost !== undefined && t.engine === "claude" ? { outcome: "completed", costUsd: o.standCost } : { outcome: "completed" }),
    refused: (_t, reason) => (calls.refused.push(reason), { outcome: "errored" }),
    capped: (t, usd) => (calls.caps.push(usd), { ...t, cap: usd }),
    ensureRun: async (job: Job) => ok({ runId: parseArticleJob(job.id).runId, created: false }),
    async step(_runId, name, turn): Promise<StepReport> {
      calls.steps.push(name);
      if (o.fail === name) return { ok: false, message: `${name}: the agent errored` };
      // The check is code: it runs no agent turn (lib/articles/checkStep.ts).
      for (let i = 0; i < (name === "check" ? 0 : (o.turnsPerStep ?? 2)); i++) {
        const r = await turn({ engine: i % 2 === 0 ? "claude" : "codex" });
        if (r.outcome !== "completed") return { ok: false, message: `${name}: the agent ${r.outcome}` };
      }
      return { ok: true, status: "drafting", skipped: false };
    },
    land: async () => (calls.land++, { ok: true, status: "landed", skipped: false }),
    registry: () => "/tmp/ai-registry",
  };
  return { ports, calls };
}

function put(s: Store, id: string, extra: Record<string, unknown> = {}): void {
  must(enqueue(s, { id, of: { kind: "run", id: "2026-10-16-tax" }, producer: "article", lane: "seat.text", ...extra }, OP));
}

const count = (s: Store, sql: string, ...p: string[]): number => Number(must(s.read((r) => r.get(sql, ...p)?.["n"])));
const outputs = (steps: readonly string[]): Outputs => new Map(steps.map((step) => [step, { step, value: {}, at: "2026-10-16T12:00:00.000Z" }]));

describe("the plan", () => {
  it("names each act's job and reads it back; an id it never minted is refused", () => {
    expect(articleJobId("2026-10-16-tax", { kind: "gate" })).toBe("job:run:2026-10-16-tax");
    expect(parseArticleJob("job:run:2026-10-16-tax:rework-3")).toEqual({ runId: "2026-10-16-tax", act: { kind: "rework", n: 3 } });
    expect(parseArticleJob("job:run:2026-10-16-tax:landing").act).toEqual({ kind: "landing" });
    for (const bad of ["job:part:x", "job:run:Bad_Id", "job:run:a:rework-0", "job:run:a:landing:x"]) expect(() => parseArticleJob(bad)).toThrow(/not an article job/);
    // Minting is the inverse of reading: every id it mints reads back to its act, and an act the
    // grammar cannot spell is refused at the mint, not at the job's first plan.
    for (const n of [1, 9999]) expect(parseArticleJob(articleJobId("t", { kind: "rework", n })).act).toEqual({ kind: "rework", n });
    for (const n of [0, 10_000, 1.5]) expect(() => articleJobId("t", { kind: "rework", n })).toThrow(/a rework is numbered/);
  });

  it("is the missing outputs, in v1's step order, per act", () => {
    expect(planArticle("job:run:t", outputs([])).map((s) => s.name)).toEqual(["create", "research", "outline", "draft", "critique", "check"]);
    expect(planArticle("job:run:t", outputs(["create", "research"])).map((s) => s.name)).toEqual(["outline", "draft", "critique", "check"]);
    expect(planArticle("job:run:t:rework-1", outputs([])).map((s) => s.name)).toEqual(["draft", "critique", "check"]);
    expect(planArticle("job:run:t:landing", outputs([])).map((s) => s.name)).toEqual(["land"]);
    // The estimates sum to the median measured run, so a ceiling under it stops before the critique.
    expect(Object.values(STEP_ESTIMATE).reduce((a, e) => a + (e.usd ?? 0), 0)).toBe(70);
  });
});

describe("a dry article job", () => {
  it("never enters the live port: every turn is a would-call answered by the stand-in, nothing is booked", async () => {
    const w = world();
    put(w.store, "job:run:2026-10-16-tax");
    const f = fake();
    const r = must(await runJob(w.fx, defineArticle(f.ports), "job:run:2026-10-16-tax", RUN));
    expect(r.outcome).toBe("done");
    expect(f.calls.live).toBe(0);
    expect(f.calls.stand).toBe(8);
    expect(r.wouldCalls?.map((c) => c.provider).slice(0, 2)).toEqual(["claude-seat", "codex-seat"]);
    expect(count(w.store, "SELECT count(*) AS n FROM spend_rows")).toBe(0);
    expect(count(w.store, "SELECT count(*) AS n FROM spend_unpriced")).toBe(0);
    w.store.close();
  });

  it("a dry job's ceiling counts no stand-in figure: the meter books none, so a stand-in that reports a cost refuses no turn", async () => {
    const w = world();
    put(w.store, "job:run:2026-10-16-tax", { ceilingUsd: 100 });
    const f = fake({ turnsPerStep: 6, standCost: 40 });
    const r = must(await runJob(w.fx, defineArticle(f.ports), "job:run:2026-10-16-tax", RUN));
    expect(r.outcome).toBe("done");
    expect(r.job?.spend.usd).toBe(0);
    expect(f.calls.refused).toEqual([]);
    expect(f.calls.stand).toBe(24);
    w.store.close();
  });

  it("a dry landing pushes nothing: the outward call is a would-call and the run is left approved", async () => {
    const w = world();
    put(w.store, "job:run:2026-10-16-tax:landing");
    const f = fake();
    const r = must(await runJob(w.fx, defineArticle(f.ports), "job:run:2026-10-16-tax:landing", RUN));
    expect(r.outcome).toBe("done");
    expect(f.calls.land).toBe(0);
    expect(r.wouldCalls?.map((c) => c.provider)).toEqual(["ai-registry"]);
    w.store.close();
  });
});

describe("a live article job", () => {
  it("books each turn against its step: a seat's cost as a row, an engine that reports none unpriced with the reason; it reconciles", async () => {
    const w = world();
    put(w.store, "job:run:2026-10-16-tax", { mode: LIVE });
    const f = fake({ cost: 0.5 });
    const r = must(await runJob(w.fx, defineArticle(f.ports), "job:run:2026-10-16-tax", RUN));
    expect(r.outcome).toBe("done");
    expect(f.calls.live).toBe(8);
    expect(r.job?.spend).toEqual({ usd: 2, unpriced: 4, basis: "estimate" });
    expect(count(w.store, "SELECT count(*) AS n FROM spend_unpriced WHERE reason = 'seat reported no cost' AND step = 'critique'")).toBe(1);
    // create and check run no turn: they pay nothing and are not booked at an estimate.
    expect(count(w.store, "SELECT count(*) AS n FROM spend_rows WHERE step IN ('create', 'check')")).toBe(0);
    must(w.store.read((x) => assertReconciled(x, "job:run:2026-10-16-tax")));
    w.store.close();
  });

  it("a live landing runs the write-back once", async () => {
    const w = world();
    put(w.store, "job:run:2026-10-16-tax:landing", { mode: LIVE });
    const f = fake();
    expect(must(await runJob(w.fx, defineArticle(f.ports), "job:run:2026-10-16-tax:landing", RUN)).outcome).toBe("done");
    expect(f.calls.land).toBe(1);
    w.store.close();
  });

  it("holds the ceiling INSIDE a step: a turn past it is refused before it starts, the writer is capped at what is left, the job fails `budget`", async () => {
    const w = world();
    put(w.store, "job:run:2026-10-16-tax", { mode: LIVE, ceilingUsd: 10 });
    const f = fake({ turnsPerStep: 6, cost: 4 });
    const r = must(await runJob(w.fx, defineArticle(f.ports), "job:run:2026-10-16-tax", RUN));
    expect(r.job).toMatchObject({ state: "failed", error: { code: "budget" }, spend: { usd: 12 } });
    expect(r.job?.error?.message).toMatch(/run-ceiling: reported cost \$12\.00 reached the job's \$10\.00 ceiling/);
    expect(r.job?.stop).toMatchObject({ by: "run-ceiling", ceilingUsd: 10 });
    // research's six turns: claude 4, codex, claude 4, codex, claude (spent 8 < 10, capped at $2 - a
    // real seat stops itself there; this fake overspends to show the next one is refused), codex refused.
    expect(f.calls.live).toBe(5);
    expect(f.calls.caps).toEqual([10, 6, 6, 2, 2]);
    expect(f.calls.refused).toHaveLength(1);
    must(w.store.read((x) => assertReconciled(x, "job:run:2026-10-16-tax")));
    w.store.close();
  });

  it("a failed step fails the job and is never performed again on its own (v1: the run waits for a resume)", async () => {
    const w = world();
    put(w.store, "job:run:2026-10-16-tax", { mode: LIVE });
    const f = fake({ fail: "outline" });
    const r = must(await runJob(w.fx, defineArticle(f.ports), "job:run:2026-10-16-tax", RUN));
    expect(r.job).toMatchObject({ state: "failed", error: { code: "unavailable", message: "outline: the agent errored" } });
    expect(f.calls.steps).toEqual(["research", "outline"]);
    expect(must(get(w.store, "job:run:2026-10-16-tax" as never)).job.progress.stage).toBeUndefined();
    w.store.close();
  });
});
