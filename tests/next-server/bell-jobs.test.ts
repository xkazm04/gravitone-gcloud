import { describe, expect, it } from "vitest";

import { BELL_CAP, bellJobs } from "../../app/(studio)/_shell/bell.ts";
import type { ProduceJob } from "../../app/(studio)/projects/_port/contract.ts";
import { eventsOf, jobCounts, parseMarks, type Job } from "../../lib/jobs.tsx";

// The bell is a view of the server's Jobs (lib/jobs.tsx); nothing about a job is kept in the
// browser but the viewer's read marks.

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

describe("what the viewer has not seen", () => {
  it("an ending after the watermark is unread; a read mark or an earlier ending is read", () => {
    const ev = eventsOf([settled("a", "done", 100), settled("b", "failed", 200), settled("c", "done", 50), settled("i", "interrupted", 300)], { seenAt: 60, read: ["a@100"] });
    expect(ev.map((e) => [e.jobId, e.read, e.ok])).toEqual([
      ["b", false, false],
      ["a", true, true],
      ["c", true, true],
    ]);
  });

  it("a retried job that ends again is news again", () => {
    const [first] = eventsOf([settled("a", "done", 100)], { seenAt: 0, read: [] });
    const [again] = eventsOf([settled("a", "done", 900)], { seenAt: 0, read: [first?.id ?? ""] });
    expect(again?.read).toBe(false);
  });

  it("the retired job store's record, a torn value or nothing at all starts the watermark now", () => {
    const now = 5_000;
    expect(parseMarks(null, now)).toEqual({ seenAt: now, read: [] });
    expect(parseMarks(JSON.stringify({ jobs: [{ id: "x" }], events: [] }), now)).toEqual({ seenAt: now, read: [] });
    expect(parseMarks("{torn", now)).toEqual({ seenAt: now, read: [] });
    expect(parseMarks(JSON.stringify({ v: 2, seenAt: 42, read: ["a@1"] }), now)).toEqual({ seenAt: 42, read: ["a@1"] });
  });

  it("the harness counts each job once, the server's list and the turn ledger together", () => {
    const running: Job = { id: "b", kind: "image", label: "b", status: "running", startedAt: 0, href: "/projects/runs?job=b", measured: false, progress: 0 };
    const local = [settled("a", "done", 1), running];
    expect(jobCounts(local, [{ id: "a", status: "done" }, { id: "t1", status: "running" }, { id: "t2", status: "failed" }])).toEqual({ running: 2, total: 4 });
  });
});
