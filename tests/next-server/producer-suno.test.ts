// THE SUNO PRODUCER (Phase 4, L31) - one proposal's render on both models as
// one kernel job on box.chrome, bound to suno.json and the browser driver. The
// fake driver (lib/sound/suno/fakeDriver.ts) and temp stores: no browser, no
// suno.com, no credits. What is pinned, and which v1 probe assertion it carries
// (tests/golden-path/suno-queue.probe.spec.ts):
//   · one step per model, in order, then the record lands ("FIFO, both models,
//     4 clips per job");
//   · enqueue never spends, is idempotent while a job is live, and refuses a
//     proposal that has rendered ("cancel: a queued job only; enqueue is
//     idempotent"); cancel is refused while a create is in flight;
//   · a DRY job runs on stand-ins: would-calls listed, the driver's create never
//     reached (replaces SUNO_DRIVER=fake as the dry mechanism);
//   · a LIVE job through the fake driver: each create booked unpriced with
//     Suno's reason, the job's spend equal to the meter;
//   · Stop between models: the create in flight finishes, Start creates only
//     what is missing ("stop: the create in flight finishes");
//   · a failure fails the job verbatim and the proposal wears it ("a failure
//     fails its job verbatim");
//   · the CLI (lib/sound/suno/cli.ts, what pipeline/suno.mts runs), the Floor's
//     audio composer and Runs act on ONE job id; the ledger leaves its live row to
//     the job store. (Phase 6 L67: the second door was /api/sound/suno{,/queue,
//     /queue/[id]}, the v1 Sound lab's routes, which wave C deletes; their bodies
//     were lib's enqueueProposals / sunoSnapshot / cancelJob, called here.)

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-producer-suno-"));
  process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
  process.env["SOUND_LEDGER_PATH"] = path.join(dir, "ledger.json");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  process.env["IMAGING_ACCESS_SECRET"] = "producer-suno-secret";
  delete process.env["GRAVITONE_DRY_ONLY"];
  delete process.env["NEXT_PUBLIC_DEV_AUTH"];
  delete process.env["SUNO_DRIVER"];
  return dir;
});

import { rmSync } from "node:fs";
import { hostname } from "node:os";

import { laneHold } from "@gt/kernel/job-queue";
import { recover } from "@gt/kernel/job-run";
import { closeProcessKernel } from "@gt/kernel/process";
import { assertReconciled } from "@gt/kernel/spend/projection";
import { SUNO_CREDITS, sunoPlan } from "@gt/producers/suno/producer";

import { projectSuno, sunoSource } from "../../lib/ledger/v1/sources/suno.ts";
import { must, OPERATOR, soundKernel } from "../../lib/producers/sound.ts";
import { driveSuno, launchSuno, sunoKernelId, sunoKernelJobs } from "../../lib/producers/suno.ts";
import { runSunoCli } from "../../lib/sound/suno/cli.ts";
import { FAKE_SUNO, resetFakeSuno } from "../../lib/sound/suno/fakeDriver.ts";
import { cancelJob, clearSunoQueue, enqueueProposals, FAKE_SUNO_DRIVER, setSunoQueue, sunoSnapshot, type SunoDriver } from "../../lib/sound/suno/queue.ts";
import { addProposals, readSuno } from "../../lib/sound/suno/store.ts";
import type { SunoJob, SunoSnapshot } from "../../lib/suno/types.ts";
import { makeRealProduce } from "../../app/(studio)/projects/_port/real.ts";
import { stripsKernel } from "../../lib/producers/strips.ts";

afterAll(() => {
  closeProcessKernel();
  rmSync(ROOT, { recursive: true, force: true });
});
beforeEach(() => resetFakeSuno());

let n = 0;
async function proposal(style = "warm synthwave, analog pads"): Promise<string> {
  const [p] = await addProposals([{ fields: { title: `Probe ${++n}`, style }, lane: { axis: "group", value: "ungrouped" }, origin: "llm" }]);
  return p!.id;
}

async function queued(): Promise<SunoJob> {
  const [j] = await enqueueProposals([await proposal()]);
  return j!;
}

async function launched(id: string, mode: "dry" | "live"): Promise<string> {
  const r = await launchSuno([id], { mode, actor: OPERATOR, dryOnly: false });
  if (r.kind !== "receipt") throw new Error("expected a receipt");
  const c = await launchSuno([id], { mode, actor: OPERATOR, dryOnly: false, token: r.receipt.token });
  if (c.kind !== "launched") throw new Error(`expected a launch, got ${c.kind}`);
  return c.jobIds[0]!;
}

const rec = async (id: string): Promise<SunoJob> => (await readSuno()).jobs.find((j) => j.id === id)!;
const clipsOf = async (id: string) => (await readSuno()).clips.filter((c) => c.jobId === id);

describe("the Suno plan, pure", () => {
  it("one credit-priced create per model, in order, then land", () => {
    const plan = sunoPlan(new Map());
    expect(plan.map((s) => s.name)).toEqual(["create:v6", "create:v6-wild", "land"]);
    expect(plan[0]).toMatchObject({ credit: SUNO_CREDITS, estimate: { usd: null, unpricedReason: SUNO_CREDITS } });
    const booked = new Map([["create:v6", { step: "create:v6", value: {}, at: "2026-10-16T00:00:00.000Z" }]] as const);
    expect(sunoPlan(booked).map((s) => s.name)).toEqual(["create:v6-wild", "land"]);
  });
});

describe("the Suno producer on the kernel", () => {
  it("enqueue never spends, is idempotent while live, and refuses a proposal that has rendered", async () => {
    const pid = await proposal();
    const [a] = await enqueueProposals([pid]);
    const [b] = await enqueueProposals([pid]);
    expect(b!.id).toBe(a!.id);
    expect(sunoKernelJobs().has(sunoKernelId(a!))).toBe(false);
    const kid = await launched(a!.id, "dry");
    await driveSuno([kid], { driver: FAKE_SUNO_DRIVER, dryOnly: false });
    await expect(enqueueProposals([pid])).rejects.toMatchObject({ status: 409, message: expect.stringContaining("riff it") });
  });

  it("a dry job: a receipt on box.chrome, both creates answered by stand-ins, the driver never reached, nothing spent", async () => {
    const job = await queued();
    const r = await launchSuno([job.id], { mode: "dry", actor: OPERATOR });
    expect(r.kind === "receipt" && r.receipt.lines[0]).toMatchObject({ lane: "box.chrome", usd: null, unpricedReason: SUNO_CREDITS });
    const kid = await launched(job.id, "dry");
    const d = await driveSuno([kid], { driver: FAKE_SUNO_DRIVER, dryOnly: false });
    const report = d.reports[0]?.report;
    expect(report?.ok && report.value.outcome).toBe("done");
    expect(report?.ok ? (report.value.wouldCalls ?? []).map((w) => w.name) : []).toEqual(["suno/v6", "suno/v6-wild"]);
    expect(FAKE_SUNO.calls).toEqual([]);
    expect((await clipsOf(job.id)).map((c) => c.model)).toEqual(["v6", "v6", "v6-wild", "v6-wild"]);
    expect((await clipsOf(job.id))[0]?.title).toContain("dry run");
    const k = sunoKernelJobs().get(kid)!;
    expect([k.state, k.spend.usd, k.spend.unpriced]).toEqual(["done", 0, 0]);
    expect((await rec(job.id)).state).toBe("done");
  });

  it("a live job through the fake driver: each create booked unpriced with Suno's reason, spend equals the meter", async () => {
    const job = await queued();
    const kid = await launched(job.id, "live");
    const d = await driveSuno([kid], { driver: FAKE_SUNO_DRIVER, dryOnly: false });
    expect(d.reports[0]?.report.ok && d.reports[0].report.value.outcome).toBe("done");
    expect(FAKE_SUNO.calls.map((c) => c.model)).toEqual(["v6", "v6-wild"]);
    expect((await clipsOf(job.id))).toHaveLength(4);
    const { store } = soundKernel();
    expect(sunoKernelJobs(store).get(kid)?.spend).toEqual({ usd: 0, unpriced: 2, basis: "estimate" });
    expect(() => store.read((t) => assertReconciled(t, kid))).not.toThrow();
    const reasons = store.read((t) => t.all("SELECT reason FROM spend_unpriced WHERE job_id = ?", kid).map((x) => String(x["reason"])));
    expect(reasons.ok && reasons.value).toEqual([SUNO_CREDITS, SUNO_CREDITS]);
  });

  it("cancel is refused while a create is in flight; Stop lets it finish, and Start creates only the missing model", async () => {
    const job = await queued();
    const kid = await launched(job.id, "live");
    let release!: () => void;
    FAKE_SUNO.hold = new Promise<void>((r) => (release = r));
    const running = driveSuno([kid], { driver: FAKE_SUNO_DRIVER, dryOnly: false });
    while (FAKE_SUNO.calls.length === 0) await new Promise((r) => setTimeout(r, 5));
    await expect(cancelJob(job.id)).rejects.toMatchObject({ status: 409, message: expect.stringContaining("rendering now") });
    await setSunoQueue(false); // Stop: pause between models
    FAKE_SUNO.hold = null;
    release();
    await running;
    expect(sunoKernelJobs().get(kid)?.state).toBe("paused");
    expect((await clipsOf(job.id)).map((c) => c.model)).toEqual(["v6", "v6"]);
    expect((await rec(job.id)).state).toBe("queued");
    await setSunoQueue(true); // Start: resume
    await driveSuno([kid], { driver: FAKE_SUNO_DRIVER, dryOnly: false });
    expect(FAKE_SUNO.calls.map((c) => c.model)).toEqual(["v6", "v6-wild"]);
    expect((await rec(job.id)).state).toBe("done");
    await setSunoQueue(false);
  });

  it("a clear never cancels a job whose create is in flight, so its proposal is not queued a second time", async () => {
    const job = await queued();
    const kid = await launched(job.id, "live");
    let release!: () => void;
    FAKE_SUNO.hold = new Promise<void>((r) => (release = r));
    const running = driveSuno([kid], { driver: FAKE_SUNO_DRIVER, dryOnly: false });
    while (FAKE_SUNO.calls.length === 0) await new Promise((r) => setTimeout(r, 5));
    await setSunoQueue(false);
    // Stop reads `queued`, but the create is still spending: neither door cancels it.
    await expect(cancelJob(job.id)).rejects.toMatchObject({ status: 409, message: expect.stringContaining("rendering now") });
    expect(await clearSunoQueue({ jobIds: [job.id] })).toMatchObject({ cancelled: 0, skipped: 1 });
    const again = await enqueueProposals([job.proposalId], Date.now(), { launch: false });
    expect(again[0]!.id).toBe(job.id);
    expect(sunoKernelJobs().get(kid)?.state).toBe("paused");
    FAKE_SUNO.hold = null;
    release();
    await running;
    // Once the create has landed its clips the job is an idle paused one, and a clear takes it.
    expect((await rec(job.id)).phase).toBeUndefined();
    expect(await clearSunoQueue({ jobIds: [job.id] })).toMatchObject({ cancelled: 1, skipped: 0 });
    expect(sunoKernelJobs().get(kid)?.state).toBe("cancelled");
  });

  it("a crash mid-create: the job is interrupted and box.chrome HELD; the column says check the library; Start acknowledges and retries", async () => {
    const job = await queued();
    const kid = await launched(job.id, "live");
    const crash = { crash: true };
    const dying: SunoDriver = { ...FAKE_SUNO_DRIVER, create: async () => Promise.reject(crash) };
    await expect(driveSuno([kid], { driver: dying, dryOnly: false, run: { holder: { bootId: "dead-boot", pid: 999_998, host: hostname() }, heartbeatMs: 3_600_000 } })).rejects.toBe(crash);
    must(recover(soundKernel().fx));
    const k = sunoKernelJobs().get(kid)!;
    expect([k.state, k.interruption?.stage]).toEqual(["interrupted", "create:v6"]);
    expect(must(soundKernel().store.read((r) => laneHold(r, "box.chrome")))?.jobId).toBe(kid);
    const snap = await sunoSnapshot();
    expect(snap.queue.interrupted).toContain("on v6 was being created when its driver stopped; check your Suno library");
    expect(snap.jobs.find((j) => j.id === job.id)?.state).toBe("queued");
    // Nothing is claimed on the held lane - not even a fresh job.
    const other = await queued();
    const otherKid = await launched(other.id, "live");
    const held = await driveSuno([otherKid], { driver: FAKE_SUNO_DRIVER, dryOnly: false });
    expect(held.stopped).toContain("credits may be spent - look first");
    // Start is the operator's look: the hold is acknowledged and the job retried.
    await setSunoQueue(true);
    expect(must(soundKernel().store.read((r) => laneHold(r, "box.chrome")))).toBeUndefined();
    await driveSuno([kid, otherKid], { driver: FAKE_SUNO_DRIVER, dryOnly: false });
    expect((await rec(job.id)).state).toBe("done");
    expect((await rec(other.id)).state).toBe("done");
    await setSunoQueue(false);
  });

  it("a failure fails the job with the driver's sentence verbatim, and the proposal wears it", async () => {
    const job = await queued();
    const kid = await launched(job.id, "live");
    FAKE_SUNO.failWith = (_f, model) => (model === "v6-wild" ? "Suno says: out of credits for v6-wild" : null);
    await driveSuno([kid], { driver: FAKE_SUNO_DRIVER, dryOnly: false });
    const k = sunoKernelJobs().get(kid)!;
    expect([k.state, k.error?.message]).toEqual(["failed", "Suno says: out of credits for v6-wild"]);
    const f = await readSuno();
    expect(f.jobs.find((j) => j.id === job.id)).toMatchObject({ state: "failed", error: "Suno says: out of credits for v6-wild" });
    expect(f.proposals.find((p) => p.id === job.proposalId)?.error).toBe("Suno says: out of credits for v6-wild");
  });

  it("the CLI, the Floor and Runs act on one job id; the ledger leaves its live row to the job store", async () => {
    const pid = await proposal();
    // The CLI enqueues and never spends - not even with the column's switch on ...
    await setSunoQueue(true);
    const enq = await runSunoCli(["enqueue", pid, "--json"]);
    expect(enq.code).toBe(0);
    const [job] = (enq.doc as { jobs: SunoJob[] }).jobs;
    expect(sunoKernelJobs().has(sunoKernelId(job!))).toBe(false);
    await setSunoQueue(false);
    // ... queuing the same proposal again gets the same record back ...
    expect((await enqueueProposals([pid]))[0]?.id).toBe(job!.id);
    // ... the CLI launches and drives it, dry ...
    expect((await runSunoCli(["start"])).code).toBe(2);
    const started = await runSunoCli(["start", "--dry", "--json"]);
    expect(started.code).toBe(0);
    const kid = sunoKernelId(job!);
    expect((started.doc as { jobs: SunoJob[] }).jobs.map((j) => j.job)).toEqual([kid]);
    // ... the desk's read sees that job done; cancelling it now is refused (it ended).
    expect((await sunoSnapshot()).jobs.find((j) => j.id === job!.id)).toMatchObject({ state: "done", job: kid });
    await expect(cancelJob(job!.id)).rejects.toMatchObject({ status: 409 });
    const status = await runSunoCli(["status", "--json"]);
    expect((status.doc as SunoSnapshot).jobs.find((j) => j.id === job!.id)?.job).toBe(kid);

    // The other way: the Floor's audio composer launches a take from a sentence, Runs pauses and
    // resumes that job, and the CLI's Start drives the very job the Floor enqueued.
    const floor = makeRealProduce({ store: () => ({ ok: true, value: soundKernel().store }), strips: () => stripsKernel(), env: () => process.env, now: () => Date.now() });
    const input = { lane: "audio", kind: "music", text: "a slow tide under tape hiss" } as const;
    const receipt = await floor.composerReceipt({ input, mode: "dry" }, { who: "op-test" });
    if (!receipt.ok) throw receipt.error;
    const go = await floor.launchRun({ input, token: receipt.value.token, mode: "dry" }, { who: "op-test" });
    if (!go.ok) throw go.error;
    if (go.value.kind !== "launched") throw new Error(`expected a launch, got ${go.value.kind}`);
    const floorJob = go.value.jobId;
    expect(sunoKernelJobs().get(floorJob)?.state).toBe("queued");
    const drawn = floor.listJobs();
    if (!drawn.ok) throw drawn.error;
    expect(drawn.value.filter((j) => j.id === floorJob).map((j) => j.state)).toEqual(["queued"]);
    expect(floor.pauseJob({ jobId: floorJob }, { who: "op-test" }).ok).toBe(true);
    expect(sunoKernelJobs().get(floorJob)?.state).toBe("paused");
    expect(floor.resumeJob({ jobId: floorJob }, { who: "op-test" }).ok).toBe(true);
    const drove = await runSunoCli(["start", "--dry", "--json"]);
    expect(drove.code).toBe(0);
    expect((drove.doc as { jobs: SunoJob[] }).jobs.map((j) => j.job)).toEqual([floorJob]);
    expect(sunoKernelJobs().get(floorJob)?.state).toBe("done");

    const live = await queued();
    await launched(live.id, "dry");
    const read = await sunoSource.read();
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    const p = projectSuno(read.value, { now: new Date(), universe: "real" });
    expect(p.live.map((l) => l.id)).not.toContain(live.id);
    expect((await sunoSnapshot()).jobs.find((j) => j.id === live.id)?.state).toBe("queued");
  });
});
