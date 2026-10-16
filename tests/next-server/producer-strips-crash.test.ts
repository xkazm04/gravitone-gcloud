import { closeAll, disposeRoot, fakeCapture, fakeSeat, hostB, LIVE, open, operator, RUN, seed, type Seat, type World } from "./producer-strips-harness.ts";

import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { parseAt } from "@gt/domain/door";
import { jobIdSchema } from "@gt/domain/ids";
import { enumerateCrashes } from "@gt/kernel/crash";
import type { Effects } from "@gt/kernel/effects";
import { ackLane } from "@gt/kernel/job-queue";
import { recover, runJob } from "@gt/kernel/job-run";
import { get, retry } from "@gt/kernel/job";
import { reconcileJobSpend } from "@gt/kernel/spend/projection";

import { stripsRoot } from "../../lib/foundry/strips/store.ts";
import type { StripRun } from "../../lib/foundry/strips/types.ts";
import { stripsProducer } from "../../lib/producers/strips.ts";

// A strip job killed after every effect it performs: the run is interrupted (v1's
// "running forever" closes - a dead driver is named, with its step), the seat.text lane
// HOLDS until the operator acknowledges it, and the operator's retry finishes the run
// without buying a booked turn again. The one turn that may be bought twice is the one in
// flight when the process died before its page landed: the interruption names it, which is
// what the lane hold tells the operator to look at.

afterAll(() => disposeRoot());
afterEach(() => closeAll());

const jid = (id: string) => {
  const p = parseAt("job id", jobIdSchema, id);
  if (!p.ok) throw p.error;
  return p.value;
};

type CW = World & { runId: string; jobId: string; seat: Seat; interrupted: string[] };

describe("a crash at every effect boundary", () => {
  it("is interrupted, holds its lane, and an operator's retry finishes it without re-buying a booked turn", async () => {
    const cap = fakeCapture();
    const bindingOf = (w: CW) => ({ seat: w.seat.seat, capture: cap.capture, kernel: w.strips });
    const report = await enumerateCrashes<CW>({
      async open() {
        const w = open();
        const { runId, jobId } = await seed(w, LIVE, { only: ["E01"] });
        return { ...w, runId, jobId, seat: fakeSeat(), interrupted: [] };
      },
      reopen(w) {
        w.kernel.close();
        return { ...w, ...open(w.file, w.clock) };
      },
      close: (w) => w.kernel.close(),
      effects: (w): Effects => w.strips.fx,
      async scenario(fx, w) {
        await runJob(fx, stripsProducer(bindingOf(w)), w.jobId, RUN);
      },
      async recover(fx, w) {
        const rec = recover(fx, { holder: hostB, alive: (pid) => pid === hostB.pid });
        if (!rec.ok) throw rec.error;
        const got = get(w.kernel.store, jid(w.jobId));
        if (!got.ok) throw got.error;
        if (got.value.job.state === "interrupted") {
          w.interrupted.push(got.value.job.interruption?.stage ?? "(between steps)");
          if (!ackLane(w.kernel.store, "seat.text", operator).ok) throw new Error("ack refused");
          if (!retry(w.kernel.store, jid(w.jobId), operator).ok) throw new Error("retry refused");
        }
        const now = get(w.kernel.store, jid(w.jobId));
        if (now.ok && now.value.job.state === "queued") {
          const r = await runJob(fx, stripsProducer(bindingOf(w)), w.jobId, { ...RUN, holder: hostB, alive: (pid) => pid === hostB.pid });
          if (!r.ok) throw r.error;
        }
      },
      invariant(w, phase) {
        const got = get(w.kernel.store, jid(w.jobId));
        if (!got.ok) return got.error.message;
        const job = got.value.job;
        const m = JSON.parse(readFileSync(path.join(stripsRoot(), w.runId, "run.json"), "utf8")) as StripRun;
        if (job.state === "done" && m.status !== "awaiting-triage") return `job done over a run that is ${m.status}`;
        if (phase === "crashed") return undefined;
        if (job.state !== "done") return `recovered to ${job.state}${job.error ? `: ${job.error.message}` : ""}`;
        const counts = new Map<string, number>();
        for (const c of w.seat.calls) counts.set(c, (counts.get(c) ?? 0) + 1);
        const twice = [...counts.values()].filter((n) => n > 1).length;
        const inFlight = w.interrupted.some((s) => /^(author|fix|review):/.test(s));
        if (twice > (inFlight ? 1 : 0)) return `${twice} turn(s) bought twice (${w.seat.calls.join(", ")}); interrupted at ${w.interrupted.join(", ") || "nothing"}`;
        const rec = w.kernel.store.read((t) => reconcileJobSpend(t, w.jobId));
        if (!rec.ok || rec.value.drift !== undefined) return `spend drifted from the meter: ${JSON.stringify(rec.ok ? rec.value.drift : rec.error.message)}`;
        return undefined;
      },
    });
    expect(report.prefixes).toBeGreaterThan(10);
    expect(report.violations).toEqual([]);
  }, 180_000);
});
