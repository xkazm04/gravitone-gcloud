// A STUDIO PART ACT UNDER CRASHES (Phase 4 wave C, L37). Three queued follow-ups on a notebook,
// launched LIVE through a fake text engine (never the vendor), so the job is three paid units:
//   - crash-prefix enumeration (kernel crash.ts): the process dies after every effect the drive
//     makes; a restarted process sweeps, the operator acknowledges the held seat lane and retries.
//     INVARIANT at every prefix: no question whose answer the job already booked is asked again
//     (the never-re-spend rule, by unit), the event chain is intact; recovered, the job is done,
//     its spend equals the meter and all three answers landed as revisions waiting for a decision;
//   - a refused act states the work's sentence and buys nothing.

import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const p = process.getBuiltinModule("node:path");
  delete process.env["GRAVITONE_DRY_ONLY"];
  return fs.mkdtempSync(p.join(os.tmpdir(), "gt-step-crash-"));
});

import { ok } from "@gt/domain/errors";
import { parseAt } from "@gt/domain/door";
import { jobIdSchema } from "@gt/domain/ids";
import type { Holder } from "@gt/domain/job";
import { enumerateCrashes, type CrashSpec } from "@gt/kernel/crash";
import type { Effects } from "@gt/kernel/effects";
import { verify } from "@gt/kernel/events";
import { enqueue, get, retry } from "@gt/kernel/job";
import { ackLane } from "@gt/kernel/job-queue";
import { recover, runJob } from "@gt/kernel/job-run";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { readPart, writePart } from "@gt/kernel/parts/driver";
import { compose } from "@gt/kernel/records/write";
import { reconcileJobSpend } from "@gt/kernel/spend/projection";

import { fixtureSource } from "../../lib/notebook/source.ts";
import type { TextRequest, TextResult } from "../../lib/text/types.ts";
import { effectsOf, launchPartAct, partActReceipt, researchProducer, researchUnits, withRecords } from "../../lib/producers/research.ts";

afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

const OP = { kind: "operator", id: "kazda" } as const;
const first: Holder = { bootId: "boot-a", pid: 601, host: "box-a" };
const second: Holder = { bootId: "boot-a-2", pid: 601, host: "box-a" };
const NOW = Date.parse("2026-10-16T09:00:00Z");
const must = <T>(r: { ok: true; value: T } | { ok: false; error: Error }): T => {
  if (!r.ok) throw r.error;
  return r.value;
};
const PROJECT = "why-bitcoin";
const PART = `${PROJECT}/research`;

type Calls = { asked: string[]; respent: string[] };
type W = { dir: string; k: Kernel; fx: Effects; calls: Calls; jobId: string };

/** The fake engine: answers each follow-up with a confirmation of a real fact. It notes a
 *  question asked again although the job had ALREADY BOOKED its answer - the re-spend. */
function fakeReason(w: () => W): (req: TextRequest) => Promise<TextResult> {
  return async (req) => {
    const q = /"prompt":"([^"]+)"/.exec(req.prompt)?.[1] ?? "?";
    const id = { "whale holders?": "fu-1", "mining cost?": "fu-2", "etf flows?": "fu-3" }[q] ?? "?";
    const me = w();
    const booked = me.k.store.read((r) => r.get("SELECT 1 AS x FROM job_outputs WHERE job_id = ? AND step = ?", me.jobId, `unit:fu:${id}`));
    if (booked.ok && booked.value !== undefined) me.calls.respent.push(id);
    me.calls.asked.push(id);
    const fact = fixtureSource().notebook.facts[0]?.id ?? "f-1";
    const json = { summary: `on ${q}`, effects: [{ kind: "confirms", targetId: fact, note: q }], sources: ["fake"], verdict: "strengthened" };
    return { text: JSON.stringify(json), json, provenance: { provider: "claude-cli", model: "fake", transport: "local-subprocess", rung: "preferred", turn: req.turn, schemaEnforcement: "native", durationMs: 5, costUsd: 0.02, costBasis: "vendor-reported", promptChars: req.prompt.length } };
  };
}

let n = 0;
function open(): W {
  const dir = path.join(ROOT, `w${++n}`);
  mkdirSync(dir, { recursive: true });
  const k = must(openKernel(path.join(dir, "k.sqlite"), { snapshotDir: dir }));
  must(compose(k.store, { recipe: "film/short-educational-video" }, OP, { id: PROJECT }));
  const src = fixtureSource();
  const followUps = [
    ["fu-1", "whale holders?"],
    ["fu-2", "mining cost?"],
    ["fu-3", "etf flows?"],
  ].map(([id, prompt]) => ({ id, kind: "question", prompt, status: "queued" }));
  const nb = { topic: "why bitcoin", notebook: src.notebook, engine: null, followUps, revisions: [], source: { kind: src.kind, conclusions: src.conclusions, dimensions: src.dimensions, tags: src.tags, digest: src.digest } };
  must(writePart(k.store, { projectId: PROJECT, partId: PART, baseRev: "current", act: "land", op: { seed: true }, label: "seed", by: { kind: "machine", id: "seed" }, next: () => ok({ "research-notebook": nb }) }));
  const ref = { projectId: PROJECT, partId: PART, act: "follow-up" };
  const units = withRecords(researchUnits);
  const receipt = must(partActReceipt(k.store, ref, units, { mode: "live", now: NOW }));
  const launched = must(launchPartAct(k.store, ref, units, { mode: "live", now: NOW, token: receipt.token, actor: OP, dryOnly: false }));
  if (launched.kind !== "launched") throw new Error("stale");
  return { dir, k, fx: effectsOf(k.store), calls: { asked: [], respent: [] }, jobId: launched.jobId };
}

function reopen(w: W): W {
  w.k.close();
  const k = must(openKernel(path.join(w.dir, "k.sqlite"), { snapshotDir: w.dir }));
  return { ...w, k, fx: effectsOf(k.store) };
}

describe("a part act under crashes", () => {
  it("dies after every effect, is swept, acknowledged and retried: no booked question is asked again, spend equals the meter, every answer lands", async () => {
    let current: W | undefined;
    const producer = researchProducer("seat.text", { reason: fakeReason(() => current as W) });
    const drive = (fx: Effects, w: W, holder: Holder) => runJob(fx, producer, w.jobId, { holder, alive: () => true, heartbeatMs: 3_600_000 });
    const spec: CrashSpec<W> = {
      open: () => (current = open()),
      reopen: (w) => (current = reopen(w)),
      close: (w) => w.k.close(),
      effects: (w) => w.fx,
      scenario: async (fx, w) => {
        must(await drive(fx, w, first));
      },
      recover: async (fx, w) => {
        must(recover(fx, { holder: second, alive: () => true }));
        const id = must(parseAt("job id", jobIdSchema, w.jobId));
        if (must(get(w.k.store, id)).job.state === "interrupted") {
          // A paid lane holds after a crash (decision 6): the operator looks, acknowledges, retries.
          must(ackLane(w.k.store, "seat.text", OP));
          must(retry(w.k.store, id, OP));
        }
        if (must(get(w.k.store, id)).job.state === "queued") must(await drive(fx, w, second));
      },
      invariant: (w, phase) => {
        const chain = must(verify(w.k.store));
        if (chain.state !== "intact") return `chain broken: ${JSON.stringify(chain)}`;
        if (w.calls.respent.length > 0) return `asked again after its answer was booked: ${w.calls.respent.join(", ")}`;
        if (phase === "crashed") return undefined;
        const rec = must(w.k.store.read((r) => reconcileJobSpend(r, w.jobId)));
        if (rec.drift !== undefined) return `spend drifted from the meter: ${JSON.stringify(rec)}`;
        const { job } = must(get(w.k.store, must(parseAt("job id", jobIdSchema, w.jobId))));
        if (job.state !== "done") return `recovery left the job ${job.state}`;
        const nb = must(readPart(w.k.store, { projectId: PROJECT, partId: PART })).records.get("research-notebook");
        const revs = Array.isArray(nb?.["revisions"]) ? nb["revisions"].length : 0;
        if (revs !== 3) return `${revs} revisions landed, not 3`;
        return undefined;
      },
    };
    const report = await enumerateCrashes(spec);
    expect(report.effects).toContain("call:perform:unit:fu:fu-2");
    expect(report.effects).toContain("call:text-router/research");
    expect(report.effects).toContain("tx:part.land");
    expect(report.violations).toEqual([]);
  }, 180_000);

  it("the uninterrupted live run books three paid turns on the job and lands three revisions as the job", async () => {
    let current: W | undefined;
    const w = (current = open());
    const r = must(await runJob(w.fx, researchProducer("seat.text", { reason: fakeReason(() => current as W) }), w.jobId, { holder: first, alive: () => true }));
    expect(r.outcome).toBe("done");
    expect(r.job?.spend).toEqual({ usd: 0.06, unpriced: 0, basis: "reported" });
    expect(w.calls.asked).toEqual(["fu-1", "fu-2", "fu-3"]);
    const nb = must(readPart(w.k.store, { projectId: PROJECT, partId: PART })).records.get("research-notebook");
    expect((nb?.["followUps"] as { status: string }[]).map((q) => q.status)).toEqual(["returned", "returned", "returned"]);
    w.k.close();
  });

  it("a second confirm of the same act is the same job (one purchase); a stale token writes nothing", async () => {
    const w = open();
    const ref = { projectId: PROJECT, partId: PART, act: "follow-up" };
    const units = withRecords(researchUnits);
    const receipt = must(partActReceipt(w.k.store, ref, units, { mode: "live", now: NOW }));
    // The queue moved (open() launched this act): the old receipt is stale, the fresh one adopts the live job.
    const again = must(launchPartAct(w.k.store, ref, units, { mode: "live", now: NOW, token: receipt.token, actor: OP, dryOnly: false }));
    expect(again).toMatchObject({ kind: "launched", jobId: w.jobId, adopted: true });
    const stale = must(launchPartAct(w.k.store, ref, units, { mode: "live", now: NOW, token: "not-the-token", actor: OP, dryOnly: false }));
    expect(stale.kind).toBe("stale");
    expect(must(w.k.store.read((r) => r.all("SELECT id FROM jobs"))).length).toBe(1);
    w.k.close();
  });

  it("the part's own Plan job (no act in its id) runs the kind's first act: a dry research run lands the notebook", async () => {
    const dir = path.join(ROOT, "plan-job");
    mkdirSync(dir, { recursive: true });
    const k = must(openKernel(path.join(dir, "k.sqlite"), { snapshotDir: dir }));
    must(compose(k.store, { recipe: "film/short-educational-video" }, OP, { id: PROJECT }));
    must(enqueue(k.store, { id: `job:part:${PART}`, of: { kind: "part", id: PART }, producer: "research", lane: "seat.text", correlation: { projectId: PROJECT } }, OP));
    const r = must(await runJob(effectsOf(k.store), researchProducer(), `job:part:${PART}`, { holder: first, alive: () => true, dryOnly: true }));
    expect(r.outcome).toBe("done");
    expect(r.wouldCalls?.map((c) => `${c.provider}/${c.model}`)).toEqual(["text-router/research"]);
    const nb = must(readPart(k.store, { projectId: PROJECT, partId: PART })).records.get("research-notebook");
    expect(Array.isArray((nb?.["notebook"] as { facts?: unknown[] } | undefined)?.facts)).toBe(true);
    k.close();
  });

  it("a follow-up with nothing queued is refused on the receipt - no job, nothing bought", () => {
    const w = open();
    const ref = { projectId: PROJECT, partId: PART, act: "generate-ideas" };
    const r = partActReceipt(w.k.store, ref, withRecords(researchUnits), { mode: "dry", now: NOW });
    expect(r.ok ? "" : r.error.message).toBe("ideas are the ads face's act");
    w.k.close();
  });
});
