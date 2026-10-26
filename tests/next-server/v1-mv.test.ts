import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { mvSource, projectMv, type MvSnapshot } from "../../lib/ledger/v1/sources/mv.ts";
import type { IngestEvent, ProjectCtx } from "../../lib/ledger/v1/types.ts";

// The music-video queue over a literal mv.json (lib/sound/mv/store.ts MvFile).
// The case this adapter exists to get right: retryMv and regenerateMv DELETE
// a job's endedAt, so an end is a fact only as the attempt that wrote it.

const ctx = (iso = "2026-10-15T12:00:00.000Z"): ProjectCtx => ({ now: new Date(iso), universe: "real" });
const T = Date.parse("2026-10-15T10:00:00.000Z");
type Job = MvSnapshot["jobs"][number];
const job = (id: string, title: string, state: Job["state"], over: Partial<Job> = {}): Job => ({ id, source: { kind: "take", id: `st-${id}`, title }, state, verdict: null, enqueuedAt: T, ...over });
const snap = (over: Partial<MvSnapshot> = {}): MvSnapshot => ({
  queue: { running: true },
  jobs: [
    job("mj-1", "Stay Here", "active", { startedAt: T + 1000, phase: "imaging" }),
    job("mj-2", "Night Ferry", "queued"),
    job("mj-3", "Siren", "done", { startedAt: T - 9000, endedAt: T - 1000 }),
    job("mj-4", "Shoal", "failed", { startedAt: T - 5000, endedAt: T - 4000, error: "Leonardo studio: no credits" }),
  ],
  worker: { pid: 4242, at: T },
  workerAlive: true,
  scoutClips: new Set<string>(),
  ...over,
});
const byType = (events: readonly IngestEvent[]): Record<string, number> => {
  const m: Record<string, number> = {};
  for (const e of events) m[e.type] = (m[e.type] ?? 0) + 1;
  return m;
};

describe("mv projection", () => {
  it("counts the facts it projects, every key distinct", () => {
    const p = projectMv(snap({ jobs: [...snap().jobs, job("mj-5", "Undertow", "done", { startedAt: T - 20_000, endedAt: T - 10_000, verdict: "keep" })] }), ctx());
    expect(byType(p.events)).toEqual(p.tally.facts);
    expect(p.tally.facts).toEqual({ "job.enqueue": 5, "job.start": 4, "job.end": 3, "verdict.keep": 1 });
    expect(new Set(p.events.map((e) => e.key)).size).toBe(p.events.length);
  });

  it("a retried job's first end survives as its own fact; the retry's end is a new one", () => {
    const failed = projectMv(snap(), ctx()).events.filter((e) => e.subject.id === "mj-4");
    // retryMv: state queued, enqueuedAt restamped, endedAt and error deleted; then a run restamps startedAt.
    const retried = job("mj-4", "Shoal", "done", { enqueuedAt: T + 100, startedAt: T + 200, endedAt: T + 900 });
    const after = projectMv(snap({ jobs: [retried] }), ctx()).events.filter((e) => e.subject.id === "mj-4");
    const ends = [...failed, ...after].filter((e) => e.type === "job.end");
    expect(ends.map((e) => [e.key, e.data["state"]])).toEqual([
      [`mv:mj-4:end.${T - 5000}.${T - 4000}`, "failed"],
      [`mv:mj-4:end.${T + 200}.${T + 900}`, "done"],
    ]);
    expect(new Set([...failed, ...after].map((e) => e.key)).size).toBe(failed.length + after.length);
  });

  it("active runs while its worker lives and is interrupted when the worker's pid is gone", () => {
    expect(projectMv(snap(), ctx()).live.map((j) => [j.id, j.state, j.progress?.stage])).toEqual([
      ["mj-1", "running", "imaging"],
      ["mj-2", "queued", undefined],
    ]);
    const dead = projectMv(snap({ workerAlive: false }), ctx()).live[0];
    expect(dead).toMatchObject({ id: "mj-1", state: "interrupted", error: "the worker process 4242 that held mv.json is gone" });
  });

  it("the queued job recover() named by its cleaned title is interrupted; the rest are paused while the switch is off", () => {
    const why = `"Night Ferry" was interrupted while imaging when the server stopped; a still may have been spent in the Leonardo studio - check it before starting`;
    const p = projectMv(snap({ queue: { running: false, interrupted: why }, jobs: [job("mj-2", "02 - Night_Ferry (main).mp3", "queued"), job("mj-6", "Other", "queued")] }), ctx());
    expect(p.live.map((j) => [j.id, j.state, j.error])).toEqual([
      ["mj-2", "interrupted", why],
      ["mj-6", "paused", undefined],
    ]);
    expect(p.events.filter((e) => e.type === "queue.interrupt")).toHaveLength(1);
  });

  it("finished videos with no verdict are one pile on the Weir", () => {
    expect(projectMv(snap(), ctx()).weir).toEqual([{ source: "mv", id: "mv/settled", title: "videos to judge", media: "video", kind: "cull", since: "2026-10-15T09:59:59.000Z", decided: 0, pending: 1, href: "/board" }]);
  });

  it("a scout visualizer is judged on its night's packet, so it is not in the pile", () => {
    const scout = snap({ jobs: [job("mj-9", "Night drive", "done", { source: { kind: "clip", id: "sc-scout", title: "Night drive" }, startedAt: T - 9000, endedAt: T - 1000 })], scoutClips: new Set(["sc-scout"]) });
    expect(projectMv(scout, ctx()).weir).toEqual([]);
  });
});

describe("mv reader", () => {
  const root = mkdtempSync(path.join(tmpdir(), "gt-mv-"));
  const before = process.env["SOUND_STORE_DIR"];
  afterAll(() => {
    if (before === undefined) delete process.env["SOUND_STORE_DIR"];
    else process.env["SOUND_STORE_DIR"] = before;
    rmSync(root, { recursive: true, force: true });
  });

  it("reads mv.json through readMv and probes the worker's pid", async () => {
    process.env["SOUND_STORE_DIR"] = root;
    writeFileSync(path.join(root, "mv.json"), JSON.stringify({ version: 1, queue: { running: false }, jobs: [{ ...job("mj-1", "a", "queued"), files: {} }], imports: [], progress: {}, worker: { pid: process.pid, at: T } }));
    const r = await mvSource.read();
    expect(r.ok && [r.value.jobs.map((j) => j.id), r.value.workerAlive]).toEqual([["mj-1"], true]);
  });
});
