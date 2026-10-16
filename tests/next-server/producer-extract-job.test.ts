import { ROOT, disposeRoot, storeFile, uploads } from "./producer-extract-harness.ts";

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { parseAt } from "@gt/domain/door";
import type { Actor } from "@gt/domain/event";
import { jobIdSchema } from "@gt/domain/ids";
import type { Holder, Job } from "@gt/domain/job";
import { enumerateCrashes } from "@gt/kernel/crash";
import type { Effects } from "@gt/kernel/effects";
import { ackLane } from "@gt/kernel/job-queue";
import { recover, runJob } from "@gt/kernel/job-run";
import { get, retry } from "@gt/kernel/job";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { assertReconciled, reconcileJobSpend } from "@gt/kernel/spend/projection";

import { DEFAULT_CALL_ESTIMATE_USD, type EngineIO } from "../../lib/foundry/extract/engine.ts";
import { __setExtractIO, commitExtractRun } from "../../lib/foundry/extract/store.ts";
import type { ExtractManifest, ExtractOptions } from "../../lib/foundry/extract/types.ts";
import { ENUMS } from "../../lib/foundry/extract/vocabulary.ts";
import { overBudget } from "../../lib/imaging/errors.ts";
import { driveExtract, effectsFor, extractProducer, launchExtract, settleExtractManifest } from "../../lib/producers/extract.ts";
import { extractSource, projectExtract } from "../../lib/ledger/v1/sources/extract.ts";

// The extract producer on the kernel, over the REAL v1 engine and a temp v1 root
// (harness): a dry job end to end, a live job through the meter with a fake
// vendor, the ceiling stop and its resume, the breaker and the money stop, a
// crash at every effect boundary, the fence, and v1's readers after.

const operator: Actor = { kind: "operator", id: "kazda" };
const hostA: Holder = { bootId: "boot-a", pid: 501, host: "box" };
const hostB: Holder = { bootId: "boot-b", pid: 502, host: "box" };
const T0 = Date.parse("2026-10-16T09:00:00.000Z");
const RUN = { holder: hostA, alive: () => true, sleep: async () => {} } as const;

afterAll(() => disposeRoot());
afterEach(() => __setExtractIO(null));

type World = { kernel: Kernel; file: string; clock: { ms: number } };
/** Every kernel a test opened: closed after each test, so a failed assertion cannot leave a file open for the temp root's removal. */
const live = new Set<Kernel>();
afterEach(() => {
  for (const k of [...live]) k.close();
});
const open = (file = storeFile(), clock = { ms: T0 }): World => {
  const k = openKernel(file, { clock: () => new Date(clock.ms), snapshotDir: path.dirname(file) });
  if (!k.ok) throw k.error;
  const raw = k.value;
  const kernel: Kernel = { ...raw, close: () => void (live.delete(kernel) && raw.close()) };
  live.add(kernel);
  return { kernel, file, clock };
};
const jid = (id: string) => {
  const p = parseAt("job id", jobIdSchema, id);
  if (!p.ok) throw p.error;
  return p.value;
};
const jobOf = (w: World, id: string): Job => {
  const r = get(w.kernel.store, jid(id));
  if (!r.ok) throw r.error;
  return r.value.job;
};
const disk = (runId: string): ExtractManifest => JSON.parse(readFileSync(path.join(ROOT, "extract", runId, "run.json"), "utf8")) as ExtractManifest;

/* ── a fake vendor, counted ───────────────────────────────────────────────── */

type Script = { generateUsd?: number; failGenerate?: boolean; overBudgetAt?: number; unpricedRecognize?: boolean; gate?: () => Promise<void> };
type Vendor = { calls: string[]; seeds: Map<number, number>; install(): void };

function vendor(script: Script = {}): Vendor {
  const obs = Object.fromEntries(Object.entries(ENUMS).map(([f, w]) => [f, w[0] ?? ""]));
  const calls: string[] = [];
  const seeds = new Map<number, number>();
  let gens = 0;
  const v: Pick<EngineIO, "recognize" | "generate" | "reason" | "estimateUsd"> = {
    async recognize() {
      calls.push("recognize");
      const value = { ...obs, has_text: false, dominant_colours: [], look: "fake", depiction: "a fake scene", critique: "close", recipe_fix: "" };
      return script.unpricedRecognize ? { value, model: "fake/eye" } : { value, model: "fake/eye", costUsd: 0.002 };
    },
    async generate(_p, _n, _a, seed) {
      calls.push("generate");
      gens++;
      if (script.overBudgetAt !== undefined && gens >= script.overBudgetAt) throw overBudget("The imaging spend ceiling for this window is reached.");
      if (script.failGenerate) throw new Error("400 bad parameter");
      await script.gate?.();
      seeds.set(seed, (seeds.get(seed) ?? 0) + 1);
      return { value: { base64: uploads(1)[0]!.base64, mime: "image/png" }, model: "fake/pixels", costUsd: script.generateUsd ?? 0.04 };
    },
    async reason() {
      calls.push("reason");
      return { value: { styles: [] }, model: "fake/words", costUsd: 0.01 };
    },
    estimateUsd: (k) => DEFAULT_CALL_ESTIMATE_USD[k],
  };
  return { calls, seeds, install: () => __setExtractIO((_id, live) => ({ ...live, ...v })) };
}

let n = 0;
const SMALL: Partial<ExtractOptions> = { rounds: 2, replicas: 2, transfers: 1 };

async function launch(w: World, mode: "dry" | "live", o: { sources?: number; options?: Partial<ExtractOptions>; ceilingUsd?: number } = {}): Promise<{ runId: string; jobId: string }> {
  const target = { kind: "gallery" as const, slug: `job-${++n}`, uploads: uploads(o.sources ?? 2), options: o.options ?? SMALL };
  const base = { mode, actor: operator, dryOnly: false, now: w.clock.ms, ...(o.ceilingUsd === undefined ? {} : { ceilingUsd: o.ceilingUsd }) };
  const r0 = await launchExtract(w.kernel.store, target, base);
  if (!r0.ok || r0.value.kind !== "receipt") throw new Error(`no receipt: ${JSON.stringify(r0)}`);
  const r1 = await launchExtract(w.kernel.store, target, { ...base, token: r0.value.receipt.token });
  if (!r1.ok || r1.value.kind !== "launched") throw new Error(`not launched: ${JSON.stringify(r1)}`);
  return { runId: r1.value.runId, jobId: r1.value.jobId };
}

const drive = (w: World, jobId: string) => driveExtract(w.kernel.store, w.file, jobId, RUN);

describe("a dry job runs end to end on stand-ins", () => {
  it("finishes, lists its would-calls, spends nothing, never calls the vendor, and is never committed", async () => {
    const w = open();
    const v = vendor();
    v.install();
    const { runId, jobId } = await launch(w, "dry");
    expect(jobId).toBe(`job:run:${runId}`);
    const r = await drive(w, jobId);
    if (!r.ok) throw r.error;
    expect(r.value.outcome).toBe("done");
    expect(r.value.wouldCalls?.map((c) => c.model)).toEqual(expect.arrayContaining(["recognize", "reason", "generate"]));
    expect(v.calls).toEqual([]);
    const job = jobOf(w, jobId);
    expect(job.spend).toEqual({ usd: 0, unpriced: 0, basis: "reported" });
    expect(w.kernel.store.read((t) => t.get("SELECT count(*) AS n FROM spend_rows")?.["n"])).toEqual({ ok: true, value: 0 });
    const m = disk(runId);
    expect(m.status).toBe("done");
    expect(m.dry).toBe(true);
    expect(m.job).toBe(jobId);
    expect(m.spend?.usd ?? 0).toBe(0);
    await expect(commitExtractRun(runId, { [m.styles[0]!.id]: { verdict: "keep", at: "2026-10-16T09:00:00.000Z" } })).rejects.toThrow(/dry/);
    w.kernel.close();
  });
});

describe("a live job spends through the meter", () => {
  it("books every vendor call against its job and step, reconciles, and v1's m.spend reads the same figure", async () => {
    const w = open();
    const v = vendor();
    v.install();
    const { runId, jobId } = await launch(w, "live");
    const r = await drive(w, jobId);
    if (!r.ok) throw r.error;
    expect(r.value.outcome).toBe("done");
    const job = jobOf(w, jobId);
    w.kernel.store.read((t) => assertReconciled(t, jobId));
    const m = disk(runId);
    expect(job.spend.usd).toBeCloseTo(m.spend!.usd, 9);
    // 2 reads + 1 synthesis + 2 replica rounds (target met at once) + 1 transfer, each image read back.
    expect(v.calls.filter((c) => c === "generate")).toHaveLength(3);
    expect(job.spend.usd).toBeCloseTo(2 * 0.002 + 0.01 + 3 * (0.04 + 0.002), 9);
    const rows = w.kernel.store.read((t) => t.all("SELECT DISTINCT step FROM spend_rows WHERE job_id = ? ORDER BY step", jobId));
    expect(rows.ok && rows.value.map((x) => x["step"])).toEqual(expect.arrayContaining(["group", "read:s01", "read:s02"]));
    w.kernel.close();
  });

  it("an unpriced call is booked at its estimate AND counted, on the job as on run.json", async () => {
    const w = open();
    vendor({ unpricedRecognize: true }).install();
    const { runId, jobId } = await launch(w, "live");
    await drive(w, jobId);
    const job = jobOf(w, jobId);
    expect(job.spend.unpriced).toBe(disk(runId).spend!.unpriced);
    expect(job.spend.basis).toBe("estimate");
    w.kernel.store.read((t) => assertReconciled(t, jobId));
    w.kernel.close();
  });
});

describe("the ceiling, the breaker and the money stop", () => {
  it("a unit booked on the job but missing from run.json is refused, never performed again", async () => {
    const w = open();
    const v = vendor({ generateUsd: 0.15 });
    v.install();
    const { runId, jobId } = await launch(w, "live", { ceilingUsd: 0.3 });
    await drive(w, jobId);
    expect(jobOf(w, jobId).stop?.by).toBe("run-ceiling");
    // run.json loses a round the job booked (a restored backup, a hand edit).
    const m = disk(runId);
    const style = m.styles[0]!;
    const booked = `replica:${style.id}:${style.replicas[0]!.source}:r1`;
    style.replicas = style.replicas.slice(1);
    m.status = "replicating";
    delete m.stopped;
    delete m.error;
    writeFileSync(path.join(ROOT, "extract", runId, "run.json"), JSON.stringify(m), "utf8");
    const gens = v.calls.filter((c) => c === "generate").length;
    if (!retry(w.kernel.store, jid(jobId), operator, { ceilingUsd: 1 }).ok) throw new Error("retry refused");
    await drive(w, jobId);
    const job = jobOf(w, jobId);
    expect(job.state).toBe("failed");
    expect(job.error?.message).toContain(`${booked} is booked on job`);
    expect(v.calls.filter((c) => c === "generate").length).toBe(gens);
    w.kernel.close();
  });

  it("stops before the unit that would cross the job's ceiling, tells run.json, and resumes under a raised one without re-spending", async () => {
    const w = open();
    // The vendor bills over the estimate the receipt was promised on, so the ceiling bites mid-run.
    const v = vendor({ generateUsd: 0.15 });
    v.install();
    const { runId, jobId } = await launch(w, "live", { ceilingUsd: 0.3 });
    expect(disk(runId).options.ceilingUsd).toBeUndefined();
    const r = await drive(w, jobId);
    if (!r.ok) throw r.error;
    expect(r.value.outcome).toBe("failed");
    const stopped = jobOf(w, jobId);
    expect(stopped.stop?.by).toBe("run-ceiling");
    const m = disk(runId);
    expect(m.status).toBe("failed");
    expect(m.stopped?.by).toBe("run-ceiling");
    const before = v.calls.length;
    const gensBefore = [...v.seeds.values()].reduce((a, b) => a + b, 0);
    const back = retry(w.kernel.store, jid(jobId), operator, { ceilingUsd: 1 });
    if (!back.ok) throw back.error;
    const r2 = await drive(w, jobId);
    if (!r2.ok) throw r2.error;
    expect(r2.value.outcome).toBe("done");
    expect(disk(runId).status).toBe("done");
    expect([...v.seeds.values()].every((k) => k === 1), "a unit was drawn twice").toBe(true);
    expect(v.calls.length).toBeGreaterThan(before);
    expect(gensBefore).toBeLessThan(3);
    w.kernel.store.read((t) => assertReconciled(t, jobId));
    w.kernel.close();
  });

  it("three consecutive vendor failures fail the job and v1's manifest together; a retry prunes and takes them again", async () => {
    const w = open();
    vendor({ failGenerate: true }).install();
    const { runId, jobId } = await launch(w, "live");
    const r = await drive(w, jobId);
    if (!r.ok) throw r.error;
    const job = jobOf(w, jobId);
    expect(job.state).toBe("failed");
    expect(job.error?.message).toMatch(/^3 consecutive vendor failures/);
    expect(disk(runId).status).toBe("failed");
    vendor().install();
    if (!retry(w.kernel.store, jid(jobId), operator).ok) throw new Error("retry refused");
    const r2 = await drive(w, jobId);
    if (!r2.ok) throw r2.error;
    expect(r2.value.outcome).toBe("done");
    expect(disk(runId).styles.flatMap((s) => s.replicas.flatMap((x) => x.rounds)).every((x) => x.file !== null)).toBe(true);
    w.kernel.close();
  });

  it("the spend window's refusal is a MONEY stop: no breaker count, no errored round left behind", async () => {
    const w = open();
    vendor({ overBudgetAt: 1 }).install();
    const { runId, jobId } = await launch(w, "live");
    await drive(w, jobId);
    const job = jobOf(w, jobId);
    expect(job.state).toBe("failed");
    expect(job.error?.code).toBe("budget");
    expect(job.failStreak).toBe(0);
    const m = disk(runId);
    expect(m.stopped?.by).toBe("period-ceiling");
    expect(m.styles.flatMap((s) => s.replicas.flatMap((x) => x.rounds))).toHaveLength(0);
    w.kernel.close();
  });
});

describe("a crash at every effect boundary", () => {
  it("is interrupted, holds its lane, and an operator's retry finishes it without re-performing a booked unit", async () => {
    type CW = World & { runId: string; jobId: string; v: Vendor; interrupted: string[] };
    const OPTS: Partial<ExtractOptions> = { rounds: 1, replicas: 1, transfers: 0 };
    const report = await enumerateCrashes<CW>({
      async open() {
        const w = open();
        const v = vendor();
        v.install();
        const { runId, jobId } = await launch(w, "live", { options: OPTS });
        return { ...w, runId, jobId, v, interrupted: [] };
      },
      reopen(w) {
        w.kernel.close();
        return { ...w, ...open(w.file, w.clock) };
      },
      close: (w) => w.kernel.close(),
      effects: (w) => effectsFor(w.kernel.store, w.file),
      async scenario(fx: Effects, w) {
        w.v.install();
        await runJob(fx, extractProducer(), w.jobId, RUN);
      },
      async recover(fx, w) {
        w.v.install();
        const rec = recover(fx, { holder: hostB, alive: (pid) => pid === hostB.pid });
        if (!rec.ok) throw rec.error;
        let job = jobOf(w, w.jobId);
        if (job.state === "interrupted") {
          w.interrupted.push(job.interruption?.stage ?? "(between steps)");
          if (!ackLane(w.kernel.store, "cloud.google", operator).ok) throw new Error("ack refused");
          if (!retry(w.kernel.store, jid(w.jobId), operator).ok) throw new Error("retry refused");
        }
        job = jobOf(w, w.jobId);
        if (job.state === "queued") {
          const r = await runJob(fx, extractProducer(), w.jobId, { ...RUN, holder: hostB, alive: (pid) => pid === hostB.pid });
          if (!r.ok) throw r.error;
        }
        await settleExtractManifest(w.kernel.store, w.jobId);
      },
      invariant(w, phase) {
        const job = jobOf(w, w.jobId);
        const m = disk(w.runId);
        if (job.state === "done" && m.status !== "done") return `job done over a manifest that is ${m.status}`;
        if (phase === "crashed") return undefined;
        if (job.state !== "done") return `recovered to ${job.state}${job.error ? `: ${job.error.message}` : ""}`;
        const twice = [...w.v.seeds.values()].filter((k) => k > 1).length;
        const inFlight = w.interrupted.some((s) => s.startsWith("replica:") || s.startsWith("transfer:"));
        if (twice > (inFlight ? 1 : 0)) return `${twice} unit(s) drawn twice; interrupted at ${w.interrupted.join(", ") || "nothing"}`;
        const rec = w.kernel.store.read((t) => reconcileJobSpend(t, w.jobId));
        if (!rec.ok || rec.value.drift !== undefined) return `spend drifted from the meter: ${JSON.stringify(rec.ok ? rec.value.drift : rec.error.message)}`;
        return undefined;
      },
    });
    expect(report.prefixes).toBeGreaterThan(10);
    expect(report.violations).toEqual([]);
  }, 120_000);
});

describe("the fence: one driver per job", () => {
  it("a second drive of the same job is refused before it touches anything, and the slot is free after", async () => {
    const w = open();
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const v = vendor({ gate: () => gate });
    v.install();
    const { jobId } = await launch(w, "live");
    const first = driveExtract(w.kernel.store, w.file, jobId, RUN);
    await new Promise((r) => setTimeout(r, 50));
    const second = await driveExtract(w.kernel.store, w.file, jobId, { ...RUN, holder: hostB });
    if (!second.ok) throw second.error;
    expect(second.value.outcome).toBe("not-queued");
    release();
    const one = await first;
    if (!one.ok) throw one.error;
    expect(one.value.outcome).toBe("done");
    expect([...v.seeds.values()].every((k) => k === 1)).toBe(true);
    // No residue: the next job on the lane claims the first slot.
    const next = await launch(w, "dry");
    const r = await drive(w, next.jobId);
    if (!r.ok) throw r.error;
    const claimed = w.kernel.store.read((t) => t.get("SELECT data FROM events WHERE subject_id = ? AND type = 'job.claimed'", next.jobId)?.["data"]);
    expect(claimed.ok && String(claimed.value)).toMatch(/cloud\.google#1/);
    w.kernel.close();
  });

  it("a drive whose lease lapsed mid-unit writes nothing to run.json and is interrupted", async () => {
    const w = open();
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const v = vendor({ gate: () => gate });
    const { runId, jobId } = await launch(w, "live", { sources: 1, options: { rounds: 1, replicas: 1, transfers: 0 } });
    v.install();
    const drive1 = driveExtract(w.kernel.store, w.file, jobId, { ...RUN, ttlS: 30, heartbeatMs: 3_600_000 });
    while (v.calls.filter((c) => c === "generate").length === 0) await new Promise((r) => setTimeout(r, 5));
    const before = disk(runId);
    w.clock.ms += 120_000; // the lease's 30 s TTL is long gone
    release();
    const r = await drive1;
    expect(r.ok).toBe(false);
    expect(jobOf(w, jobId).state).toBe("interrupted");
    expect(disk(runId)).toEqual(before);
    w.kernel.close();
  });
});

describe("v1's readers after the move", () => {
  it("the ledger draws a job's run as the job (not twice), puts a finished live run on the Weir, and keeps a dry run off it", async () => {
    const w = open();
    vendor().install();
    const live = await launch(w, "live");
    await drive(w, live.jobId);
    const dry = await launch(w, "dry");
    const ctx = { now: new Date(T0), universe: "fixture" as const };
    const all = await extractSource.read();
    if (!all.ok) throw all.error;
    const snapshot = { runs: all.value.runs.filter((r) => r.run.id === live.runId || r.run.id === dry.runId), skipped: [] };
    expect(snapshot.runs).toHaveLength(2);
    const p = projectExtract(snapshot, ctx);
    expect(p.live).toEqual([]);
    expect(p.weir.map((x) => x.id)).toEqual([live.runId]);
    w.kernel.close();
  });
});
