// THE SUNO PRODUCER UNDER CRASHES (Phase 4, L31) - crash-prefix enumeration
// (kernel crash.ts) over a LIVE job through the fake driver. The process dies
// after every effect of the drive; a restarted process sweeps, the operator
// LOOKS (acknowledges the box.chrome hold the crash left - v1's "check your Suno
// library before starting") and retries, and the job is driven again.
// INVARIANT at every prefix: no create is asked for a model suno.json already
// holds clips for (v1's "after Start only the missing model is created", now
// across the kernel and the store); an interrupted job HELD its paid lane until
// the acknowledgement; recovered, the job is done with exactly four clips and its
// spend equals its meter. Carries the v1 probe's "crash-resume: an active job
// goes back to queued, the queue stops naming it, and after Start only the
// missing model is created".

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-producer-suno-crash-"));
  process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  delete process.env["GRAVITONE_DRY_ONLY"];
  return dir;
});

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { parseAt } from "@gt/domain/door";
import { jobIdSchema } from "@gt/domain/ids";
import type { Holder } from "@gt/domain/job";
import { blobStore } from "@gt/kernel/blob";
import { enumerateCrashes, type CrashSpec } from "@gt/kernel/crash";
import { liveEffects, type Effects } from "@gt/kernel/effects";
import { verify } from "@gt/kernel/events";
import type { Producer } from "@gt/kernel/job-core";
import { enqueue, get, retry } from "@gt/kernel/job";
import { ackLane, laneHold } from "@gt/kernel/job-queue";
import { recover, runJob } from "@gt/kernel/job-run";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { closeProcessKernel } from "@gt/kernel/process";
import { reconcileJobSpend } from "@gt/kernel/spend/projection";

import { sunoKernelId, sunoProducer } from "../../lib/producers/suno.ts";
import { fakeCreateSunoTracks, resetFakeSuno } from "../../lib/sound/suno/fakeDriver.ts";
import type { SunoDriver } from "../../lib/sound/suno/drivers.ts";
import { readSuno } from "../../lib/sound/suno/store.ts";
import type { SunoJob } from "../../lib/suno/types.ts";

afterAll(() => {
  closeProcessKernel();
  rmSync(ROOT, { recursive: true, force: true });
});

const OPERATOR = { kind: "operator", id: "kazda" } as const;
const LIVE = { kind: "live", arm: { by: OPERATOR, at: "2026-10-16T12:00:00.000Z", reason: "test: spend semantics" } } as const;
const first: Holder = { bootId: "boot-a", pid: 501, host: "box-a" };
const second: Holder = { bootId: "boot-a-2", pid: 501, host: "box-a" };
const must = <T>(r: { ok: true; value: T } | { ok: false; error: Error }): T => {
  if (!r.ok) throw r.error;
  return r.value;
};
const jid = (s: string) => must(parseAt("job id", jobIdSchema, s));

type Tally = { creates: number; respent: string[] };
type W = { dir: string; file: string; k: Kernel; fx: Effects; tally: Tally; producer: Producer; kid: string };

/** The fake driver, counting into the world's tally, and telling a create the store already holds clips for. */
function driver(tally: Tally): SunoDriver {
  return {
    probe: async () => ({ ok: true }),
    listLibrary: async () => [],
    async create(fields, model, onPhase) {
      tally.creates++;
      const f = await readSuno();
      if (f.clips.some((c) => c.jobId === "sj-00000000aa" && c.model === model)) tally.respent.push(model);
      return fakeCreateSunoTracks(fields, model, onPhase);
    },
  };
}

function world(dir: string, file: string, prior?: W): W {
  const k = must(openKernel(file, { snapshotDir: dir }));
  const tally = prior?.tally ?? { creates: 0, respent: [] };
  const { health: _h, ...producer } = sunoProducer({ driver: driver(tally) });
  return { dir, file, k, fx: liveEffects(k.store, blobStore(path.join(dir, "blobs"))), tally, producer, kid: prior?.kid ?? "" };
}

function seed(soundDir: string): SunoJob {
  const job: SunoJob = { id: "sj-00000000aa", proposalId: "sp-00000000aa", fields: { title: "Probe", style: "warm synthwave" }, lane: { axis: "group", value: "ungrouped" }, state: "queued", models: ["v6", "v6-wild"], enqueuedAt: 1_000, clipIds: [] };
  mkdirSync(soundDir, { recursive: true });
  const proposal = { id: "sp-00000000aa", fields: job.fields, lane: job.lane, origin: "llm", createdAt: 900 };
  writeFileSync(path.join(soundDir, "suno.json"), JSON.stringify({ version: 1, queue: { running: false }, proposals: [proposal], jobs: [job], clips: [] }));
  return job;
}

const count = (w: W, type: string): number => must(w.k.store.read((r) => Number(r.get("SELECT count(*) AS n FROM events WHERE type = ?", type)?.["n"] ?? 0)));

describe("the Suno producer under crashes", () => {
  it("dies after every effect; the operator looks, acknowledges the hold and retries: no model with clips is created again", async () => {
    let n = 0;
    const spec: CrashSpec<W> = {
      open: () => {
        const dir = path.join(ROOT, `w${++n}`);
        mkdirSync(dir, { recursive: true });
        process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
        resetFakeSuno();
        const job = seed(path.join(dir, "sound"));
        const w = world(dir, path.join(dir, "k.sqlite"));
        w.kid = sunoKernelId(job);
        must(enqueue(w.k.store, { id: w.kid, of: { kind: "run", id: "suno.sj-00000000aa" }, producer: "suno", lane: "box.chrome", mode: LIVE }, OPERATOR));
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
        if (must(get(w.k.store, id)).job.state === "interrupted") {
          // The paid lane HOLDS: nothing is claimed there until the operator has looked.
          expect(must(w.k.store.read((r) => laneHold(r, "box.chrome")))?.jobId).toBe(w.kid);
          expect(must(await runJob(fx, w.producer, w.kid, { holder: second, alive: () => true })).outcome).toBe("not-queued");
          must(ackLane(w.k.store, "box.chrome", OPERATOR));
          must(retry(w.k.store, id, OPERATOR));
        }
        if (must(get(w.k.store, id)).job.state === "queued") must(await runJob(fx, w.producer, w.kid, { holder: second, alive: () => true, heartbeatMs: 3_600_000 }));
      },
      invariant: (w, phase) => {
        const chain = must(verify(w.k.store));
        if (chain.state !== "intact") return `chain broken: ${JSON.stringify(chain)}`;
        if (w.tally.respent.length > 0) return `a model with clips was created again: ${w.tally.respent.join(", ")}`;
        if (count(w, "job.interrupted") > count(w, "lane.held")) return "an interrupted Suno job did not hold box.chrome";
        if (phase === "crashed") return undefined;
        const rec = must(w.k.store.read((r) => reconcileJobSpend(r, w.kid)));
        if (rec.drift !== undefined) return `spend drifted from the meter: ${JSON.stringify(rec)}`;
        const { job } = must(get(w.k.store, jid(w.kid)));
        if (job.state !== "done") return `recovery left the job ${job.state}`;
        return undefined;
      },
    };
    const report = await enumerateCrashes(spec);
    expect(report.effects).toContain("call:suno/v6");
    expect(report.effects).toContain("call:perform:create:v6-wild");
    expect(report.violations).toEqual([]);
    // The last world, recovered: exactly two clips per model in the store.
    const f = await readSuno();
    expect(f.clips.map((c) => c.model).sort()).toEqual(["v6", "v6", "v6-wild", "v6-wild"]);
  }, 120_000);
});
