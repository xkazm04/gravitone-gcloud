import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { projectSuno, sunoSource, type SunoSnapshot } from "../../lib/ledger/v1/sources/suno.ts";
import type { IngestEvent, ProjectCtx } from "../../lib/ledger/v1/types.ts";

// The Suno queue over a literal suno.json (lib/sound/suno/store.ts SunoFile):
// epoch-ms clocks, a crash that switched the queue off, and the reader going
// through readSuno - never sunoSnapshot, which would kick the worker.

const ctx = (iso = "2026-10-15T12:00:00.000Z"): ProjectCtx => ({ now: new Date(iso), universe: "real" });
const T = Date.parse("2026-10-15T10:00:00.000Z");
type Job = SunoSnapshot["jobs"][number];
const job = (id: string, title: string, state: Job["state"], over: Partial<Job> = {}): Job => ({ id, proposalId: "sp-1", fields: { title, style: "strings" }, state, models: ["v6", "v6-wild"], enqueuedAt: T, clipIds: [], ...over });
const file = (over: Partial<SunoSnapshot> = {}): SunoSnapshot => ({
  queue: { running: false, interrupted: `"Harbor glass" on v6 was being created when the server stopped; check your Suno library before starting` },
  proposals: [{ id: "sp-1", origin: "custom", createdAt: T - 60_000 }],
  jobs: [
    job("sj-1", "Harbor glass", "queued", { startedAt: T + 1000 }),
    job("sj-2", "Low tide", "queued"),
    job("sj-3", "Lantern", "done", { startedAt: T + 2000, endedAt: T + 9000, clipIds: ["sc-1"] }),
    job("sj-4", "Breakwater", "failed", { startedAt: T + 3000, endedAt: T + 4000, error: "Suno: the Create button never enabled" }),
  ],
  clips: [
    { id: "sc-1", origin: "queue", jobId: "sj-3", model: "v6", createdAt: T + 8000, verdict: "keep", title: "Lantern", durationS: 182 },
    { id: "sc-2", origin: "library", jobId: null, model: "v4.5", createdAt: T - 3_600_000, verdict: null, title: "Old pier", durationS: null },
  ],
  ...over,
});
const byType = (events: readonly IngestEvent[]): Record<string, number> => {
  const m: Record<string, number> = {};
  for (const e of events) m[e.type] = (m[e.type] ?? 0) + 1;
  return m;
};

describe("suno projection", () => {
  it("counts the facts it projects; epoch ms become the ledger's ISO instant", () => {
    const p = projectSuno(file(), ctx());
    expect(byType(p.events)).toEqual(p.tally.facts);
    expect(new Set(p.events.map((e) => e.key)).size).toBe(p.events.length);
    expect(p.events.find((e) => e.key === `suno:sj-4:end.${T + 4000}.failed`)).toMatchObject({
      occurredAt: "2026-10-15T10:00:04.000Z",
      atSrc: "recorded",
      lane: "box.chrome",
      data: { error: "Suno: the Create button never enabled", state: "failed" },
    });
  });

  it("the crash sentence is a fact, and the job it names is interrupted, carrying it; the rest wait on the switch", () => {
    const p = projectSuno(file(), ctx());
    expect(p.events.filter((e) => e.type === "queue.interrupt").map((e) => e.data["error"])).toEqual([file().queue.interrupted]);
    expect(p.live.map((j) => [j.id, j.state])).toEqual([
      ["sj-1", "interrupted"],
      ["sj-2", "paused"],
    ]);
    expect(p.live[0]?.error).toBe(file().queue.interrupted);
    const on = projectSuno(file({ queue: { running: true }, jobs: [job("sj-5", "x", "active", { startedAt: T, model: "v6", phase: "rendering" }), job("sj-6", "y", "queued")] }), ctx());
    expect(on.live.map((j) => [j.id, j.state, j.startedAt, j.progress?.stage])).toEqual([
      ["sj-5", "running", "2026-10-15T10:00:00.000Z", "rendering v6"],
      ["sj-6", "queued", undefined, undefined],
    ]);
  });

  it("a second run of a stopped job is a second start, beside the first", () => {
    const a = projectSuno(file(), ctx()).events.filter((e) => e.type === "job.start" && e.subject.id === "sj-1");
    const jobs = file().jobs.map((j) => (j.id === "sj-1" ? { ...j, startedAt: T + 50_000 } : j));
    const b = projectSuno(file({ jobs }), ctx()).events.filter((e) => e.type === "job.start" && e.subject.id === "sj-1");
    expect(new Set([...a, ...b].map((e) => e.key)).size).toBe(2);
  });

  it("unjudged clips are one triage pile", () => {
    expect(projectSuno(file(), ctx()).weir).toEqual([{ source: "suno", id: "suno/triage", title: "suno clips to judge", media: "audio", kind: "cull", since: "2026-10-15T09:00:00.000Z", decided: 1, pending: 1, href: "/board" }]);
  });
});

describe("suno reader", () => {
  const root = mkdtempSync(path.join(tmpdir(), "gt-suno-"));
  const before = process.env["SOUND_STORE_DIR"];
  afterAll(() => {
    if (before === undefined) delete process.env["SOUND_STORE_DIR"];
    else process.env["SOUND_STORE_DIR"] = before;
    rmSync(root, { recursive: true, force: true });
  });

  it("reads suno.json through readSuno; an absent file is an empty, stopped queue", async () => {
    process.env["SOUND_STORE_DIR"] = root;
    const empty = await sunoSource.read();
    expect(empty.ok && empty.value).toEqual({ queue: { running: false }, proposals: [], jobs: [], clips: [] });
    writeFileSync(path.join(root, "suno.json"), JSON.stringify({ version: 1, ...file(), proposals: [{ ...file().proposals[0], fields: { style: "s" }, lane: { axis: "group", value: "g" } }] }));
    const r = await sunoSource.read();
    expect(r.ok && r.value.jobs.map((j) => j.id)).toEqual(["sj-1", "sj-2", "sj-3", "sj-4"]);
  });
});
