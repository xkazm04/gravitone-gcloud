import { describe, expect, it } from "vitest";

import { BELL_CAP, bellJobs } from "../../app/(studio)/_shell/bell.ts";
import type { ProduceJob } from "../../app/(studio)/projects/_port/contract.ts";
import { jobCounts, type Job } from "../../lib/jobs.tsx";

// The bell is a view of the server's Jobs (lib/jobs.tsx); nothing about a job is kept in the
// browser. (The viewer's read marks and the settled-job news, `eventsOf`/`parseMarks`, retired at
// L74 with the provider that drew them: nothing mounted it after the Phase 6 cutover.)

const job = (id: string, state: ProduceJob["state"], s: number, e: number, more: Partial<ProduceJob> = {}): ProduceJob => ({
  id,
  title: `title ${id}`,
  lane: "cloud.google",
  state,
  after: [],
  s,
  e,
  queuePos: null,
  blocked: false,
  held: false,
  attempt: 1,
  model: "m",
  units: 1,
  noun: "plate",
  seconds: 10,
  usd: null,
  src: "model",
  mode: "dry",
  reroutable: false,
  ...more,
});

describe("the bell's job list", () => {
  it("holds what runs and what ended; the queue is Runs'", () => {
    const out = bellJobs([job("a", "running", 10, 50), job("b", "queued", 0, 0), job("c", "paused", 0, 0), job("d", "done", 1, 20), job("e", "failed", 2, 30, { error: "vendor 500" }), job("f", "interrupted", 3, 40), job("g", "cancelled", 0, 5), job("h", "planned", 0, 0)]);
    expect(out.map((j) => [j.id, j.status])).toEqual([
      ["f", "interrupted"],
      ["e", "failed"],
      ["d", "done"],
      ["a", "running"],
    ]);
    expect(out.find((j) => j.id === "e")?.error).toBe("vendor 500");
    // A running job has no ending yet; a settled one carries its own.
    expect(out.find((j) => j.id === "a")?.endedAt).toBeUndefined();
    expect(out.find((j) => j.id === "d")?.endedAt).toBe(20);
  });

  it("newest first by the moment that matters, capped, each with its door into Runs", () => {
    const many = Array.from({ length: BELL_CAP + 5 }, (_, i) => job(`job:run:${i}`, "done", i, 100 + i));
    const out = bellJobs([job("job:run:live", "running", 1000, 2000), ...many]);
    expect(out).toHaveLength(BELL_CAP);
    expect(out[0]?.id).toBe("job:run:live");
    expect(out[1]?.id).toBe(`job:run:${BELL_CAP + 4}`);
    expect(out[0]?.href).toBe("/projects/runs?job=job%3Arun%3Alive");
  });

  it("a part's job is called a part; a run's by its media lane", () => {
    const [p, r] = bellJobs([job("p", "running", 2, 0, { partId: "x/frames", projectId: "x" }), job("r", "running", 1, 0, { media: "image" })]);
    expect(p?.kind).toBe("part");
    expect(p?.projectId).toBe("x");
    expect(r?.kind).toBe("image");
  });
});

const settled = (id: string, status: Job["status"], endedAt: number): Job => ({ id, kind: "image", label: id, status, startedAt: 0, endedAt, href: `/projects/runs?job=${id}`, measured: false, progress: 0 });

describe("the harness's count", () => {
  it("the harness counts each job once, the server's list and the turn ledger together", () => {
    const running: Job = { id: "b", kind: "image", label: "b", status: "running", startedAt: 0, href: "/projects/runs?job=b", measured: false, progress: 0 };
    const local = [settled("a", "done", 1), running];
    expect(jobCounts(local, [{ id: "a", status: "done" }, { id: "t1", status: "running" }, { id: "t2", status: "failed" }])).toEqual({ running: 2, total: 4 });
  });
});
