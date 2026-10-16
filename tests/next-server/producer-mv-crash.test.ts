// THE MUSIC-VIDEO PRODUCER UNDER CRASHES AND A SECOND DRIVER (Phase 4, L31).
//
// (a) Crash-prefix enumeration (kernel crash.ts) over a LIVE job through fake
//     vendors: the process dies after every effect the drive makes - every
//     kernel transaction, every vendor call, every fence check before an
//     artefact write - and a restarted process sweeps, the operator retries,
//     and the job is driven again. INVARIANT, at every prefix: no vendor is
//     asked for an output mv.json already holds (v1's never-re-spend, now
//     across the two stores: a still that landed before the kernel booked it
//     is skipped, not bought again); recovered, the job's spend equals its
//     meter and the job is done with every file. Carries the v1 probe's
//     "crash-resume ... resumes at the missing step".
// (b) Two drivers: one cannot take a job another runs, nor a second job on the
//     same box.render slot; a driver that slept past its TTL is taken over, and
//     when it wakes it writes NOTHING - not the kernel booking (the fence) and
//     not its still over the new holder's (the artefact fence). Replaces the v1
//     probe's mv.json pid-lease case ("lease: a live process ... pauses this
//     worker"), whose lease is gone.

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-producer-mv-crash-"));
  process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
  process.env["SOUND_LEDGER_PATH"] = path.join(dir, "ledger.json");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  delete process.env["GRAVITONE_DRY_ONLY"];
  return dir;
});

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { Holder } from "@gt/domain/job";
import { parseAt } from "@gt/domain/door";
import { jobIdSchema } from "@gt/domain/ids";
import { blobStore } from "@gt/kernel/blob";
import { enumerateCrashes, type CrashSpec } from "@gt/kernel/crash";
import { liveEffects, type Effects } from "@gt/kernel/effects";
import { verify } from "@gt/kernel/events";
import type { Producer } from "@gt/kernel/job-core";
import { enqueue, get, retry } from "@gt/kernel/job";
import { recover, runJob } from "@gt/kernel/job-run";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { closeProcessKernel } from "@gt/kernel/process";
import { reconcileJobSpend } from "@gt/kernel/spend/projection";

import { mvKernelId, mvProducer } from "../../lib/producers/mv.ts";
import { readMv } from "../../lib/sound/mv/store.ts";
import type { MvJob } from "../../lib/sound/mv/types.ts";
import { ANALYSIS, mvFakes, type Calls } from "./producer-mv-fakes.ts";

afterAll(() => {
  closeProcessKernel();
  rmSync(ROOT, { recursive: true, force: true });
});

const OPERATOR = { kind: "operator", id: "kazda" } as const;
const LIVE = { kind: "live", arm: { by: OPERATOR, at: "2026-10-16T12:00:00.000Z", reason: "test: spend semantics" } } as const;
const first: Holder = { bootId: "boot-a", pid: 501, host: "box-a" };
// The restarted process: same host and pid (it inherited the number), a new boot.
const second: Holder = { bootId: "boot-a-2", pid: 501, host: "box-a" };
const must = <T>(r: { ok: true; value: T } | { ok: false; error: Error }): T => {
  if (!r.ok) throw r.error;
  return r.value;
};
const jid = (s: string) => must(parseAt("job id", jobIdSchema, s));

/** A track whose audio and analysis landed already: the job is treat, still, metadata, video. */
function seed(soundDir: string, id: string): MvJob {
  const job: MvJob = { id, source: { kind: "take", id: "st-x", title: "08_Stay (instrumental)" }, state: "queued", files: { audio: `mv/${id}/audio.mp3`, envelope: `mv/${id}/envelope.json` }, analysis: ANALYSIS, verdict: null, enqueuedAt: 1_000 };
  mkdirSync(path.join(soundDir, "mv", id), { recursive: true });
  writeFileSync(path.join(soundDir, "mv", id, "audio.mp3"), "audio");
  writeFileSync(path.join(soundDir, "mv", id, "envelope.json"), "{}");
  writeFileSync(path.join(soundDir, "mv.json"), JSON.stringify({ version: 1, queue: { running: false }, jobs: [job], imports: [], progress: {} }));
  return job;
}

/** The bound producer without its health probe: the probe reads the process kernel, and this world drives its own. */
function noHealth(calls?: { engines: ReturnType<typeof mvFakes>["engines"] }): Producer {
  const { health: _h, ...p } = mvProducer(calls === undefined ? {} : { engines: calls.engines });
  return p;
}

type W = { dir: string; file: string; k: Kernel; fx: Effects; calls: Calls; producer: Producer; kid: string };
let n = 0;

function world(dir: string, file: string, prior?: W): W {
  const k = must(openKernel(file, { snapshotDir: dir }));
  const fakes = mvFakes(prior === undefined ? {} : { calls: prior.calls });
  return { dir, file, k, fx: liveEffects(k.store, blobStore(path.join(dir, "blobs"))), calls: fakes.calls, producer: noHealth({ engines: fakes.engines }), kid: prior?.kid ?? "" };
}

function invariant(w: W, phase: "crashed" | "recovered"): string | undefined {
  const chain = must(verify(w.k.store));
  if (chain.state !== "intact") return `chain broken: ${JSON.stringify(chain)}`;
  if (w.calls.respent.length > 0) return `re-spent: ${w.calls.respent.join(", ")}`;
  // A step that metered its call and died before its booking leaves the record
  // behind the meter until the sweep re-projects it (job-run.ts interrupt):
  // the meter is the truth, so reconciliation is asked of the recovered world.
  if (phase === "crashed") return undefined;
  const rec = must(w.k.store.read((r) => reconcileJobSpend(r, w.kid)));
  if (rec.drift !== undefined) return `spend drifted from the meter: ${JSON.stringify(rec)}`;
  const { job } = must(get(w.k.store, jid(w.kid)));
  if (job.state !== "done") return `recovery left the job ${job.state}`;
  if (w.calls.still > 2) return `the still was bought ${w.calls.still} times`;
  return undefined;
}

describe("the music-video producer under crashes", () => {
  it("(a) dies after every effect, is swept and retried: no output mv.json holds is bought again, spend equals the meter, the job finishes", async () => {
    const spec: CrashSpec<W> = {
      open: () => {
        const dir = path.join(ROOT, `w${++n}`);
        mkdirSync(dir, { recursive: true });
        process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
        const rec = seed(path.join(dir, "sound"), "mj-00000000aa");
        const w = world(dir, path.join(dir, "k.sqlite"));
        w.kid = mvKernelId(rec);
        must(enqueue(w.k.store, { id: w.kid, of: { kind: "run", id: "mv.mj-00000000aa.1000" }, producer: "mv", lane: "box.render", mode: LIVE }, OPERATOR));
        return w;
      },
      reopen: (w) => {
        w.k.close();
        return world(w.dir, w.file, w);
      },
      close: (w) => w.k.close(),
      effects: (w) => w.fx,
      scenario: async (fx, w) => {
        must(await runJob(fx, w.producer, w.kid, { holder: first, alive: () => true, heartbeatMs: 3_600_000 }));
      },
      recover: async (fx, w) => {
        must(recover(fx, { holder: second, alive: () => true }));
        const id = jid(w.kid);
        if (must(get(w.k.store, id)).job.state === "interrupted") must(retry(w.k.store, id, OPERATOR));
        if (must(get(w.k.store, id)).job.state === "queued") must(await runJob(fx, w.producer, w.kid, { holder: second, alive: () => true, heartbeatMs: 3_600_000 }));
      },
      invariant,
    };
    const report = await enumerateCrashes(spec);
    expect(report.effects).toContain("call:perform:still");
    expect(report.effects).toContain("call:leonardo-studio/studio-still");
    expect(report.effects.filter((e) => e === "tx:artefact.fence").length).toBeGreaterThan(4);
    expect(report.violations).toEqual([]);
  }, 120_000);
});

describe("two drivers on one job", () => {
  it("(b) a second driver takes neither the running job nor the slot; a driver taken over writes nothing when it wakes", async () => {
    const dir = path.join(ROOT, "fence");
    mkdirSync(dir, { recursive: true });
    process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
    const rec = seed(path.join(dir, "sound"), "mj-00000000bb");
    const k = must(openKernel(path.join(dir, "k.sqlite"), { snapshotDir: dir }));
    const fx = liveEffects(k.store, blobStore(path.join(dir, "blobs")));
    const kid = mvKernelId(rec);
    must(enqueue(k.store, { id: kid, of: { kind: "run", id: "mv.mj-00000000bb.1000" }, producer: "mv", lane: "box.render", mode: LIVE }, OPERATOR));
    must(enqueue(k.store, { id: "job:run:other", of: { kind: "run", id: "other" }, producer: "mv", lane: "box.render", mode: LIVE }, OPERATOR));

    let release!: () => void;
    let entered!: () => void;
    const inStill = new Promise<void>((r) => (entered = r));
    const a = mvFakes({ tag: "A", hold: () => new Promise<void>((r) => (release = r)), stillEntered: () => entered() });
    const driverA = noHealth({ engines: a.engines });
    const holderB: Holder = { bootId: "boot-b", pid: 502, host: "box-b" };
    const A = runJob(fx, driverA, kid, { holder: first, alive: () => true, ttlS: 1, heartbeatMs: 3_600_000 });
    await inStill;

    const b = mvFakes({ tag: "B" });
    const driverB = noHealth({ engines: b.engines });
    expect(must(await runJob(fx, driverB, kid, { holder: holderB, alive: () => true })).outcome).toBe("not-queued");
    expect(must(await runJob(fx, driverB, "job:run:other", { holder: holderB, alive: () => true })).outcome).toBe("busy");

    // A sleeps past its TTL; B sweeps (A's fence expired), the operator retries, B finishes the job.
    await new Promise((r) => setTimeout(r, 2_100));
    expect(must(recover(fx, { holder: holderB, alive: () => true })).map((j) => j.state)).toEqual(["interrupted"]);
    must(retry(k.store, jid(kid), OPERATOR));
    expect(must(await runJob(fx, driverB, kid, { holder: holderB, alive: () => true })).outcome).toBe("done");
    const sound = path.join(dir, "sound");
    const landed = (await readMv()).jobs[0]!;
    const stillB = readFileSync(path.join(sound, landed.files.still!), "utf8");
    expect(stillB).toBe("jpeg B#1");

    // A wakes with its still in hand: refused by the fence, nothing of it lands.
    release();
    const late = await A;
    expect(late.ok).toBe(false);
    expect(readFileSync(path.join(sound, landed.files.still!), "utf8")).toBe(stillB);
    const after = (await readMv()).jobs[0]!;
    expect([after.state, after.error]).toEqual(["done", undefined]);
    expect(must(get(k.store, jid(kid))).job.state).toBe("done");
    k.close();
  }, 30_000);
});
