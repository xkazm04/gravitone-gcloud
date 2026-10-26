// THE MUSIC-VIDEO PRODUCER (Phase 4, L31) - one track's video as one kernel job
// on box.render, bound to v1's mv.json and engines. Fake engines, a temp sound
// store and a temp kernel store: no browser, no ffmpeg, no model, no credits.
// What is pinned, and which v1 probe assertion it carries
// (tests/golden-path/mv-queue.probe.spec.ts):
//   · the plan as data: the step list is booked first, a regenerate runs only
//     its part, and the progress ledger skips a redo step that already landed
//     ("regenerate re-runs only its part's steps");
//   · a launch is a receipt, then a confirm; enqueue never spends ("enqueue
//     never starts");
//   · a DRY job runs end to end on stand-ins: would-calls listed, no vendor
//     reached, no spend (replaces `__setMvEngines` as the dry mechanism);
//   · a LIVE job through a fake vendor: studio credits and a seat that reports
//     nothing are booked unpriced with their reasons, a reported turn priced,
//     and the job's spend equals the meter;
//   · Start, Runs' acts and the CLI's drive act on ONE job id; a read starts nothing
//     (Phase 6 L67: Start was POST /api/sound/mv/run, the v1 Settled column's route, which
//     wave C deletes; its body was lib's mvStartReceipt / startMvWith, called here);
//   · the v1 readers keep reading mv.json.

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-producer-mv-"));
  process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
  process.env["SOUND_LEDGER_PATH"] = path.join(dir, "ledger.json");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  process.env["IMAGING_ACCESS_SECRET"] = "producer-mv-secret";
  delete process.env["GRAVITONE_DRY_ONLY"];
  delete process.env["NEXT_PUBLIC_DEV_AUTH"];
  delete process.env["LEONARDO_STUDIO_CDP"];
  return dir;
});

import { existsSync, readFileSync, rmSync } from "node:fs";
import { hostname } from "node:os";
import path from "node:path";

import { recover } from "@gt/kernel/job-run";
import { closeProcessKernel } from "@gt/kernel/process";
import { assertReconciled } from "@gt/kernel/spend/projection";
import { mvPlan, STUDIO_CREDITS } from "@gt/producers/mv/producer";
import { planOf } from "@gt/producers/mv/plan";

import { mvSource, projectMv } from "../../lib/ledger/v1/sources/mv.ts";
import { driveMv, launchMv, mvKernelId, mvKernelJobs, mvProducer } from "../../lib/producers/mv.ts";
import { must, OPERATOR, soundKernel } from "../../lib/producers/sound.ts";
import { importFolder } from "../../lib/sound/mv/importFolder.ts";
import { enqueueMv, mvSnapshot, mvStartReceipt, regenerateMv, setMvQueue, startMvWith } from "../../lib/sound/mv/queue.ts";
import { readMv, withMv } from "../../lib/sound/mv/store.ts";
import type { MvJob } from "../../lib/sound/mv/types.ts";
import { makeRealProduce } from "../../app/(studio)/projects/_port/real.ts";
import { stripsKernel } from "../../lib/producers/strips.ts";
import { audioDir, mvFakes, TREAT_USD } from "./producer-mv-fakes.ts";
import { blobStore } from "@gt/kernel/blob";
import { blobRootOf } from "../../lib/kernelProcess.ts";

afterAll(() => {
  closeProcessKernel();
  rmSync(ROOT, { recursive: true, force: true });
});

const out = (step: string, value: Record<string, unknown>) => [step, { step, value, at: "2026-10-16T00:00:00.000Z" }] as const;

async function oneTrack(title: string): Promise<MvJob> {
  const { takeIds } = await importFolder(audioDir(ROOT, [`${title}.mp3`]));
  const [job] = await enqueueMv([{ kind: "take", id: takeIds[0]!, title }]);
  return job!;
}

async function launched(id: string, mode: "dry" | "live"): Promise<string> {
  const r = await launchMv([id], { mode, actor: OPERATOR, dryOnly: false });
  if (r.kind !== "receipt") throw new Error("expected a receipt");
  const c = await launchMv([id], { mode, actor: OPERATOR, dryOnly: false, token: r.receipt.token });
  if (c.kind !== "launched") throw new Error(`expected a launch, got ${c.kind}`);
  return c.jobIds[0]!;
}

const record = async (id: string): Promise<MvJob> => (await readMv()).jobs.find((j) => j.id === id)!;

describe("the music-video plan, pure", () => {
  it("books its step list first, then runs it and lands; a bought still is credit-priced", () => {
    expect(mvPlan(new Map()).map((s) => s.name)).toEqual(["plan"]);
    const booked = new Map([out("plan", { steps: ["fetch", "still", "video"], supplied: false }), out("fetch", {})]);
    const left = mvPlan(booked);
    expect(left.map((s) => s.name)).toEqual(["still", "video", "land"]);
    expect(left[0]).toMatchObject({ credit: STUDIO_CREDITS, estimate: { usd: null } });
    expect(left[1]?.estimate.usd).toBe(0);
    // A supplied picture is copied, never bought: free, no credit.
    expect(mvPlan(new Map([out("plan", { steps: ["still"], supplied: true })]))[0]).toEqual({ name: "still", estimate: { seconds: 1, usd: 0 } });
  });

  it("a regenerate runs only its part; the progress ledger skips what landed; a motion redo with no treatment is a treat", () => {
    const done = { files: { audio: "a", still: "s", video: "v", envelope: "e" }, analysis: {}, treatment: {}, metadata: {} };
    expect(planOf({ ...done, redo: ["metadata"] })).toEqual(["metadata"]);
    expect(planOf({ ...done, redo: ["image"] }, ["treat"])).toEqual(["still", "video"]);
    expect(planOf({ files: { audio: "a", envelope: "e" }, analysis: {}, redo: ["motion"] })).toEqual(["treat", "still", "metadata", "video"]);
  });
});

describe("the music-video producer on the kernel", () => {
  it("a dry job: a receipt first, then the job runs end to end on stand-ins, lists its would-calls and spends nothing", async () => {
    const job = await oneTrack("01_Walls Unwind (main)");
    expect(mvKernelJobs().size).toBe(0); // enqueue never launches, never spends
    const r = await launchMv([job.id], { mode: "dry", actor: OPERATOR });
    expect(r.kind).toBe("receipt");
    if (r.kind !== "receipt") return;
    expect(r.receipt.lines[0]).toMatchObject({ key: mvKernelId(job), lane: "box.render", usd: null, provider: "mv" });
    expect(r.receipt.lines[0]?.unpricedReason).toContain("Leonardo studio credits");
    expect(mvKernelJobs().size).toBe(0); // a receipt writes nothing
    const kid = await launched(job.id, "dry");
    expect((await record(job.id)).job).toBe(kid);

    const { calls, engines } = mvFakes();
    const d = await driveMv([kid], { engines, dryOnly: false });
    const report = d.reports[0]?.report;
    expect(report?.ok && report.value.outcome).toBe("done");
    const names = report?.ok ? (report.value.wouldCalls ?? []).map((w) => w.name) : [];
    expect(new Set(names)).toEqual(new Set(["leonardo-studio/studio-still", "text-router/mv-treatment", "text-router/mv-metadata"]));
    // The paid engines were never reached; the free local work ran.
    expect([calls.still, calls.treat, calls.metadata]).toEqual([0, 0, 0]);
    expect([calls.analyse, calls.render]).toEqual([1, 1]);
    const k = mvKernelJobs().get(kid)!;
    expect([k.state, k.mode.kind, k.spend.usd, k.spend.unpriced]).toEqual(["done", "dry", 0, 0]);
    const j = await record(job.id);
    expect(j.state).toBe("done");
    expect(j.treatment?.rationale).toContain("dry run");
    expect(Object.keys(j.files).sort()).toEqual(["audio", "envelope", "still", "video"]);
    expect(j.files.still).toMatch(/still\.png$/);
  });

  it("a stale token launches nothing and returns the fresh receipt; a dry-only process refuses live", async () => {
    const a = await oneTrack("02_The Kettle Ticks");
    const r = await launchMv([a.id], { mode: "live", actor: OPERATOR, dryOnly: false });
    if (r.kind !== "receipt") throw new Error("expected a receipt");
    // The queue moves under the receipt: another job lands on box.render first.
    const b = await oneTrack("03_Door on the Chain");
    await launched(b.id, "dry");
    const stale = await launchMv([a.id], { mode: "live", actor: OPERATOR, dryOnly: false, token: r.receipt.token });
    expect(stale.kind).toBe("stale");
    expect(mvKernelJobs().has(mvKernelId(a))).toBe(false);
    const fresh = stale.kind === "stale" ? stale.fresh.token : "";
    await expect(launchMv([a.id], { mode: "live", actor: OPERATOR, dryOnly: true, token: fresh })).rejects.toMatchObject({ code: "refused" });
    expect(mvKernelJobs().has(mvKernelId(a))).toBe(false);
  });

  it("a live job through a fake vendor: credits and a silent seat unpriced with their reasons, a reported turn priced, spend equals the meter", async () => {
    const job = await oneTrack("04_Porch Light Burning Low (instrumental)");
    const kid = await launched(job.id, "live");
    const { calls, engines } = mvFakes();
    const d = await driveMv([kid], { engines, dryOnly: false });
    expect(d.reports[0]?.report.ok && d.reports[0].report.value.outcome).toBe("done");
    expect([calls.still, calls.treat, calls.metadata, calls.respent.length]).toEqual([1, 1, 1, 0]);
    const { store } = soundKernel();
    const k = mvKernelJobs(store).get(kid)!;
    expect(k.spend).toEqual({ usd: TREAT_USD, unpriced: 2, basis: "estimate" });
    expect(() => store.read((t) => assertReconciled(t, kid))).not.toThrow();
    const reasons = store.read((t) => t.all("SELECT reason FROM spend_unpriced WHERE job_id = ?", kid).map((x) => String(x["reason"])));
    expect(reasons.ok && reasons.value.some((x) => x.includes("Leonardo studio credits"))).toBe(true);
    expect(reasons.ok && reasons.value.some((x) => x.includes("reported no cost for the mv-metadata turn"))).toBe(true);
    expect((await record(job.id)).state).toBe("done");
  });

  it("a regenerate is a new job that runs only its part; the progress ledger skips a redo step that already landed", async () => {
    const job = await oneTrack("05_Stay (instrumental)");
    const first = await launched(job.id, "live");
    const { calls, engines } = mvFakes();
    await driveMv([first], { engines, dryOnly: false });
    const before = await record(job.id);
    const stillBytes = readFileSync(path.join(ROOT, "sound", before.files.still!), "utf8");

    await regenerateMv(job.id, { part: "metadata" });
    const r1 = await record(job.id);
    expect(r1.job).toBeUndefined(); // a new attempt: launched by Start, not by the old job
    const second = await launched(job.id, "live");
    expect(second).not.toBe(first);
    await driveMv([second], { engines, dryOnly: false });
    expect([calls.metadata, calls.treat, calls.still, calls.render]).toEqual([2, 1, 1, 1]);
    expect(readFileSync(path.join(ROOT, "sound", (await record(job.id)).files.still!), "utf8")).toBe(stillBytes);

    // An image regenerate whose treatment already landed (a run that died after
    // it, before its job booked it): the ledger says so, and the turn is not re-run.
    await regenerateMv(job.id, { part: "image", note: "colder" });
    await withMv((f) => void (f.progress[job.id] = ["treat"]));
    const third = await launched(job.id, "live");
    await driveMv([third], { engines, dryOnly: false });
    expect([calls.treat, calls.still, calls.render]).toEqual([1, 2, 2]);
    const done = await record(job.id);
    expect([done.state, done.redo, (await readMv()).progress[job.id]]).toEqual(["done", undefined, undefined]);
  });

  it("Start, Runs and the CLI's drive act on one job id: Start launches it, Runs pauses and resumes it, the drive runs it, a read starts nothing", async () => {
    // Runs' server side (app/(studio)/projects/_port/real.ts) over the kernel the producer launches on.
    const runs = makeRealProduce({ store: () => ({ ok: true, value: soundKernel().store }), strips: () => stripsKernel(), env: () => process.env, now: () => Date.now() });
    const { takeIds } = await importFolder(audioDir(ROOT, ["06_Night Ferry.mp3"]));
    const [job] = await enqueueMv([{ kind: "take", id: takeIds[0]!, title: "06_Night Ferry" }]);
    // The receipt Start would confirm, then Start with its token.
    const receipt = await mvStartReceipt();
    expect(receipt.lines.map((l) => l.key)).toContain(mvKernelId(job!));
    expect("stale" in (await startMvWith("stale"))).toBe(true);
    process.env["GRAVITONE_DRY_ONLY"] = "1"; // Start launches dry in a dry-only process
    try {
      const started = await startMvWith((await mvStartReceipt()).token);
      expect("stale" in started).toBe(false);
    } finally {
      delete process.env["GRAVITONE_DRY_ONLY"];
    }
    const kid = mvKernelId(job!);
    const k = mvKernelJobs().get(kid)!;
    expect([k.state, k.mode.kind]).toEqual(["queued", "dry"]);
    // Runs draws that job, and its acts land on it.
    const drawn = (() => {
      const l = runs.listJobs();
      if (!l.ok) throw l.error;
      return l.value.filter((j) => j.id === kid).map((j) => j.state);
    })();
    expect(drawn).toEqual(["queued"]);
    expect(runs.pauseJob({ jobId: kid }, { who: "op-test" }).ok).toBe(true);
    expect(mvKernelJobs().get(kid)?.state).toBe("paused");
    expect(runs.resumeJob({ jobId: kid }, { who: "op-test" }).ok).toBe(true);
    // A read is a read: the snapshot starts nothing, and draws the job's state, not mv.json's mirror.
    const snap = await mvSnapshot();
    expect(snap.jobs.find((j) => j.id === job!.id)).toMatchObject({ state: "queued", job: kid });
    expect(mvKernelJobs().get(kid)?.state).toBe("queued");
    // The CLI drives the same job id (pipeline/music-video.mts run -> lib/producers/mv.ts driveMv).
    await driveMv([kid], { engines: mvFakes().engines, dryOnly: true });
    const after = await mvSnapshot();
    expect(after.jobs.find((j) => j.id === job!.id)).toMatchObject({ state: "done", job: kid });
    await setMvQueue(false);
  });

  it("a crash at the still: the job is interrupted, the board reads its sentence, no mv job is claimed until the operator's Start retries it", async () => {
    const job = await oneTrack("08_Harbour Fog");
    const kid = await launched(job.id, "live");
    const crash = { crash: true };
    const dead = mvFakes();
    dead.engines.still = async () => {
      throw crash; // the process dies inside the still: the crash harness's sentinel, not an Error
    };
    await expect(driveMv([kid], { engines: dead.engines, dryOnly: false, run: { holder: { bootId: "dead-boot", pid: 999_999, host: hostname() }, heartbeatMs: 3_600_000 } })).rejects.toBe(crash);
    must(recover(soundKernel().fx)); // the startup sweep: pid 999999 is gone
    const k = mvKernelJobs().get(kid)!;
    expect([k.state, k.interruption?.stage]).toEqual(["interrupted", "still"]);
    const snap = await mvSnapshot();
    expect(snap.jobs.find((j) => j.id === job.id)?.state).toBe("queued");
    expect(snap.queue.interrupted).toContain('"Harbour Fog" was interrupted while imaging when its driver stopped');
    expect(snap.queue.interrupted).toContain("Leonardo studio");
    // v1 switched its queue off over this: here no mv job is claimed until someone looks.
    const health = await mvProducer({ engines: mvFakes().engines }).health?.();
    expect(health).toMatchObject({ ok: false });
    expect(health && !health.ok ? health.reason : "").toContain("interrupted at its still");
    // Start is the operator's look: the job is retried. Stop pauses it again; Start resumes it.
    await setMvQueue(true);
    expect(mvKernelJobs().get(kid)?.state).toBe("queued");
    await setMvQueue(false);
    expect(mvKernelJobs().get(kid)?.state).toBe("paused");
    await setMvQueue(true);
    const { calls, engines } = mvFakes();
    const d = await driveMv([kid], { engines, dryOnly: false });
    expect(d.reports[0]?.report.ok && d.reports[0].report.value.outcome).toBe("done");
    expect([calls.still, calls.treat, calls.metadata]).toEqual([1, 0, 1]); // the treatment landed before the crash
    await setMvQueue(false);
  });

  it("the v1 readers keep reading mv.json: the ledger projects its clocks and leaves its live row to the job store", async () => {
    const job = await oneTrack("07_Undertow");
    const kid = await launched(job.id, "dry");
    const snap = await mvSource.read();
    expect(snap.ok).toBe(true);
    if (!snap.ok) return;
    const p = projectMv(snap.value, { now: new Date(), universe: "real" });
    expect(p.live.map((l) => l.id)).not.toContain(job.id);
    await driveMv([kid], { engines: mvFakes().engines, dryOnly: false });
    const read = await mvSource.read();
    const ended = read.ok ? projectMv(read.value, { now: new Date(), universe: "real" }).events.filter((e) => e.subject.id === job.id).map((e) => e.type) : [];
    expect(ended).toContain("job.end");
    expect((await mvSnapshot()).jobs.find((j) => j.id === job.id)?.state).toBe("done");
    expect(existsSync(path.join(ROOT, "sound", "mv.json"))).toBe(true);
  });
});

describe("the sound kernel's blobs", () => {
  // One store, one blob root: what the mv and Suno drive writes through its effects is read back
  // where every other door reads that store's blobs (lib/kernelProcess.ts blobRootOf, `<dir>/blobs`).
  it("a blob written through soundKernel's effects is read from the store's own blob root", async () => {
    const { store, fx } = soundKernel();
    const ref = must(await fx.blob(new Uint8Array([7, 7, 7]), "audio/wav"));
    const back = await blobStore(blobRootOf(store)).read(ref);
    expect(back.ok ? back.value.byteLength : back.error.message).toBe(3);
  });
});
