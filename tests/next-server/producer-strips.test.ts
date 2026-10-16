import { closeAll, disposeRoot, DRY, fakeCapture, fakeImage, fakeSeat, hostB, LIVE, open, operator, RUN, seed, type World } from "./producer-strips-harness.ts";

import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { parseAt } from "@gt/domain/door";
import { jobIdSchema } from "@gt/domain/ids";
import type { Job } from "@gt/domain/job";
import { get, retry } from "@gt/kernel/job";
import { assertReconciled } from "@gt/kernel/spend/projection";

import { commitStripRun } from "../../lib/foundry/strips/store.ts";
import type { StripRun } from "../../lib/foundry/strips/types.ts";
import { projectStrips, readStrips, stripsRoot } from "../../lib/ledger/v1/sources/strips.ts";
import { driveStrips, settleStripsRun, type StripsBinding } from "../../lib/producers/strips.ts";

// The strips producer on the kernel, over the REAL step code (lib/foundry/strips/steps.ts),
// the repo's approach cards and briefs, a temp strips store, and counted fakes for the
// seat, the capture and the image router (harness): a dry job end to end, a live job
// through the meter, the ceiling and its resume without re-spend, how a seat's outcome is
// classified, the fence, and v1's readers after. The crash enumeration is
// producer-strips-crash.test.ts; the receipt, the CLI and the route are producer-strips-entry.test.ts.

afterAll(() => disposeRoot());
afterEach(() => closeAll());

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
const disk = (runId: string): StripRun => JSON.parse(readFileSync(path.join(stripsRoot(), runId, "run.json"), "utf8")) as StripRun;
const drive = (w: World, jobId: string, b: StripsBinding, opts = RUN) => driveStrips(jobId, { ...opts, binding: { ...b, kernel: w.strips } });
/** Turns bought per card step, by the seat's own count: never re-spend means every value is 1. */
const bought = (calls: readonly string[]) => calls.reduce((m, c) => m.set(c, (m.get(c) ?? 0) + 1), new Map<string, number>());

const PAIR = { only: ["E01", "E07"], controls: true } as const;

describe("a dry job runs end to end on stand-ins", () => {
  it("finishes, lists its would-calls, never enters the seat or the image router, spends nothing, and is never committed", async () => {
    const w = open();
    const seat = fakeSeat();
    const img = fakeImage();
    const cap = fakeCapture();
    const { runId, jobId } = await seed(w, DRY, PAIR);
    const r = await drive(w, jobId, { seat: seat.seat, image: img.make, capture: cap.capture });
    if (!r.ok) throw r.error;
    expect(r.value.outcome).toBe("done");
    const providers = new Set(r.value.wouldCalls?.map((c) => c.provider));
    expect([...providers].sort()).toEqual(["claude-seat", "imaging-router"]);
    // Four cards: an author turn each, and a review turn on the two that are not controls.
    expect(r.value.wouldCalls?.filter((c) => c.provider === "claude-seat")).toHaveLength(6);
    expect(seat.calls).toEqual([]);
    expect(img.calls).toEqual([]);
    expect(cap.renders).toEqual([]);
    expect(jobOf(w, jobId).spend).toEqual({ usd: 0, unpriced: 0, basis: "reported" });
    expect(w.kernel.store.read((t) => t.get("SELECT count(*) AS n FROM spend_rows")?.["n"])).toEqual({ ok: true, value: 0 });
    const m = disk(runId);
    expect(m.status).toBe("awaiting-triage");
    expect(m.dry).toBe(true);
    expect(m.cards.map((c) => c.status)).toEqual(["rendered", "rendered", "rendered", "rendered"]);
    await expect(commitStripRun(runId)).rejects.toThrow(/dry job/);
  });
});

describe("a live job spends through the meter", () => {
  it("books every seat turn and the image against its job, reconciles, and the cards keep v1's sums", async () => {
    const w = open();
    const seat = fakeSeat({ costUsd: 1.25, lintBad: new Set(["edu-rate-hike--E01"]) });
    const img = fakeImage(0.03);
    const cap = fakeCapture(new Map([["edu-chokepoint--E07", 1]]));
    const { runId, jobId } = await seed(w, LIVE, PAIR);
    const r = await drive(w, jobId, { seat: seat.seat, image: img.make, capture: cap.capture });
    if (!r.ok) throw r.error;
    expect(r.value.outcome).toBe("done");
    w.kernel.store.read((t) => assertReconciled(t, jobId));
    const job = jobOf(w, jobId);
    expect(job.spend.usd).toBeCloseTo(seat.costs.reduce((a, b) => a + b, 0) + 0.03, 9);
    expect(img.calls).toEqual(["E07"]);
    expect([...bought(seat.calls).values()].every((x) => x === 1)).toBe(true);
    const m = disk(runId);
    const e01 = m.cards.find((c) => c.id === "edu-rate-hike--E01");
    const e07 = m.cards.find((c) => c.id === "edu-chokepoint--E07");
    // E01: its first page failed the lint, a fix (round 1) passed. E07: its first render failed a gate, a fix passed.
    expect([e01?.status, e01?.rounds, e01?.costUsd]).toEqual(["rendered", 1, 2.5]);
    expect([e07?.status, e07?.rounds, e07?.asset?.provider]).toEqual(["rendered", 1, "fake/pixels"]);
    expect(m.status).toBe("awaiting-triage");
    const steps = w.kernel.store.read((t) => t.all("SELECT DISTINCT step FROM spend_rows WHERE job_id = ? ORDER BY step", jobId).map((x) => String(x["step"])));
    expect(steps.ok && steps.value).toEqual(expect.arrayContaining(["asset:E07", "author:edu-rate-hike--E01", "fix:edu-rate-hike--E01:r1", "fix:edu-chokepoint--E07:r1"]));
    // A control takes no review turn; an approach card whose first render passed takes one.
    expect(seat.calls.filter((c) => c.endsWith("--ctrl"))).toEqual(["author:edu-rate-hike--ctrl", "author:edu-chokepoint--ctrl"]);
  });

  it("caps every writer turn at what the job has left of its ceiling", async () => {
    const w = open();
    const seat = fakeSeat({ costUsd: 1 });
    const { jobId } = await seed(w, LIVE, { only: ["E01"] }, { ceilingUsd: 9 });
    await drive(w, jobId, { seat: seat.seat, capture: fakeCapture().capture });
    expect(seat.caps).toEqual([9, 8]);
  });
});

describe("the ceiling, and the resume that never re-spends", () => {
  it("stops before the turn that would cross it, hands the run to triage, and a retry under a raised ceiling buys no turn twice", async () => {
    const w = open();
    const seat = fakeSeat({ costUsd: 1.25 });
    const cap = fakeCapture();
    const { runId, jobId } = await seed(w, LIVE, { only: ["E01", "E02"] }, { ceilingUsd: 4 });
    const r = await drive(w, jobId, { seat: seat.seat, capture: cap.capture });
    if (!r.ok) throw r.error;
    expect(r.value.outcome).toBe("failed");
    const stopped = jobOf(w, jobId);
    expect(stopped.stop?.by).toBe("run-ceiling");
    expect(seat.calls).toEqual(["author:edu-rate-hike--E01"]);
    const m = disk(runId);
    expect(m.status).toBe("awaiting-triage");
    expect(m.error).toMatch(/ceiling/);
    if (!retry(w.kernel.store, jid(jobId), operator, { ceilingUsd: 50 }).ok) throw new Error("retry refused");
    const r2 = await drive(w, jobId, { seat: seat.seat, capture: cap.capture });
    if (!r2.ok) throw r2.error;
    expect(r2.value.outcome).toBe("done");
    expect([...bought(seat.calls).values()].every((x) => x === 1), seat.calls.join(", ")).toBe(true);
    expect(disk(runId).status).toBe("awaiting-triage");
    w.kernel.store.read((t) => assertReconciled(t, jobId));
  });
});

describe("a seat's outcome, classified where it is known", () => {
  it("a turn that died billed is the card's: author-failed, and the run goes on", async () => {
    const w = open();
    const seat = fakeSeat({ fail: new Set(["edu-rate-hike--E01"]) });
    const { runId, jobId } = await seed(w, LIVE, { only: ["E01", "E02"] });
    const r = await drive(w, jobId, { seat: seat.seat, capture: fakeCapture().capture });
    if (!r.ok) throw r.error;
    expect(r.value.outcome).toBe("done");
    const m = disk(runId);
    expect(m.cards.map((c) => c.status)).toEqual(["author-failed", "rendered"]);
    expect(m.cards[0]?.costUsd).toBe(1.25);
    expect(seat.calls.filter((c) => c === "author:edu-rate-hike--E01")).toHaveLength(1);
  });

  it("a seat that never served is a vendor failure: the breaker stops the job, and no card is marked failed", async () => {
    const w = open();
    const { runId, jobId } = await seed(w, LIVE, { only: ["E01", "E02"] });
    await drive(w, jobId, { seat: fakeSeat({ unavailable: true }).seat, capture: fakeCapture().capture });
    const job = jobOf(w, jobId);
    expect(job.state).toBe("failed");
    expect(job.error?.message).toMatch(/^3 consecutive vendor failures/);
    expect(disk(runId).cards.map((c) => c.status)).toEqual(["pending", "pending"]);
  });

  it("a spent seat window is a money stop, never a breaker count", async () => {
    const w = open();
    const { jobId } = await seed(w, LIVE, { only: ["E01"] });
    await drive(w, jobId, { seat: fakeSeat({ seatLimit: true }).seat, capture: fakeCapture().capture });
    const job = jobOf(w, jobId);
    expect([job.state, job.error?.code, job.failStreak, job.stop?.by]).toEqual(["failed", "budget", 0, "period-ceiling"]);
  });
});

describe("the fence: one driver per job", () => {
  it("a second drive of the same job is refused before it touches anything", async () => {
    const w = open();
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const seat = fakeSeat({ gate: () => gate });
    const { jobId } = await seed(w, LIVE, { only: ["E01"] });
    const first = drive(w, jobId, { seat: seat.seat, capture: fakeCapture().capture });
    while (seat.calls.length === 0) await new Promise((r) => setTimeout(r, 5));
    const second = await drive(w, jobId, { seat: seat.seat, capture: fakeCapture().capture }, { ...RUN, holder: hostB });
    if (!second.ok) throw second.error;
    expect(second.value.outcome).toBe("not-queued");
    release();
    const one = await first;
    if (!one.ok) throw one.error;
    expect(one.value.outcome).toBe("done");
    expect([...bought(seat.calls).values()].every((x) => x === 1)).toBe(true);
  });

  it("a drive whose lease lapsed mid-turn writes nothing to run.json and is interrupted", async () => {
    const w = open();
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const seat = fakeSeat({ gate: () => gate });
    const { runId, jobId } = await seed(w, LIVE, { only: ["E01"] });
    const d = drive(w, jobId, { seat: seat.seat, capture: fakeCapture().capture }, { ...RUN, ttlS: 30, heartbeatMs: 3_600_000 } as typeof RUN);
    while (seat.calls.length === 0) await new Promise((r) => setTimeout(r, 5));
    const before = disk(runId);
    w.clock.ms += 120_000;
    release();
    const r = await d;
    expect(r.ok).toBe(false);
    expect(jobOf(w, jobId).state).toBe("interrupted");
    expect(disk(runId)).toEqual(before);
  });
});

describe("v1's readers after the move", () => {
  it("the ledger leaves a job's running run to Runs, puts a live run on the Weir, keeps a dry one off it", async () => {
    const w = open();
    const liveRun = await seed(w, LIVE, { only: ["E01"] });
    await drive(w, liveRun.jobId, { seat: fakeSeat().seat, capture: fakeCapture().capture });
    const dryRun = await seed(w, DRY, { only: ["E02"] });
    await drive(w, dryRun.jobId, {});
    const queued = await seed(w, LIVE, { only: ["E03"] });
    const all = await readStrips(stripsRoot());
    if (!all.ok) throw all.error;
    const p = projectStrips({ runs: all.value.runs.filter((r) => [liveRun.runId, dryRun.runId, queued.runId].includes(r.run.id)), skipped: [] }, { now: new Date(), universe: "real" });
    expect(p.live).toEqual([]);
    expect(p.weir.map((x) => x.id)).toEqual([liveRun.runId]);
  });

  it("settle hands a stopped run to triage once, and leaves a job that has not ended alone", async () => {
    const w = open();
    const { runId, jobId } = await seed(w, LIVE, { only: ["E01"] });
    await settleStripsRun(jobOf(w, jobId));
    expect(disk(runId).status).toBe("running");
    const failed: Job = { ...jobOf(w, jobId), state: "failed", error: { code: "budget", message: "ceiling" } };
    await settleStripsRun(failed);
    await settleStripsRun(failed);
    expect([disk(runId).status, disk(runId).error]).toEqual(["awaiting-triage", "ceiling"]);
  });
});
