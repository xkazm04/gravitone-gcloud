import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { linesOf, projectGpu, type GpuSnapshot } from "../../lib/ledger/v1/sources/gpu.ts";
import type { IngestEvent, ProjectCtx } from "../../lib/ledger/v1/types.ts";

// The GPU lease queue (v1's lib/gpu/lease.ts, pipeline/gpu/lease.py): the one
// append-only v1 log, every line a fact - frozen history since L27 moved the
// lease onto the kernel slot gpu.local#1, and still projected as before.

const ctx = (iso = "2026-10-15T12:00:00.000Z"): ProjectCtx => ({ now: new Date(iso), universe: "real" });
const T = Date.parse("2026-10-15T11:00:00.000Z");
const LOG = [
  { at: T, ev: "grant", ticket: "t1", tenant: "next-ollama-eye", engine: "ollama", pid: 1, host: "box" },
  { at: T + 3, ev: "release", ticket: "t1", tenant: "next-ollama-eye" },
  { at: T + 3, ev: "release", ticket: "t1", tenant: "next-ollama-eye" },
  { at: T + 10, ev: "reclaim", reclaims: 1, reason: "pid-dead", ticket: "t2", tenant: "forge", pid: 9 },
]
  .map((l) => JSON.stringify(l))
  .join("\n");
const byType = (events: readonly IngestEvent[]): Record<string, number> => {
  const m: Record<string, number> = {};
  for (const e of events) m[e.type] = (m[e.type] ?? 0) + 1;
  return m;
};
const snap = (text: string, status: GpuSnapshot["status"] = { holder: null, stale: null, queue: [] }): GpuSnapshot => ({ ...linesOf(text), status });

describe("gpu projection", () => {
  it("every line is a recorded fact; an identical repeated line is a second fact, not a duplicate key", () => {
    const p = projectGpu(snap(LOG), ctx());
    expect(byType(p.events)).toEqual(p.tally.facts);
    expect(p.tally.facts).toEqual({ "gpu.grant": 1, "gpu.release": 2, "gpu.reclaim": 1 });
    expect(new Set(p.events.map((e) => e.key)).size).toBe(4);
    expect(p.events[0]).toMatchObject({ key: `gpu:t1:grant.${T}.0`, occurredAt: "2026-10-15T11:00:00.000Z", atSrc: "recorded", lane: "gpu.local", actor: { kind: "machine", id: "next-ollama-eye" }, data: { runId: "t1", engine: "ollama" } });
  });

  it("appending to the log re-keys nothing it already held", () => {
    const a = projectGpu(snap(LOG), ctx()).events.map((e) => e.key);
    const b = projectGpu(snap(`${LOG}\n${JSON.stringify({ at: T + 20, ev: "wait", ticket: "t3", tenant: "forge" })}\n`), ctx("2026-10-16T00:00:00.000Z")).events.map((e) => e.key);
    expect(b.slice(0, a.length)).toEqual(a);
    expect(b).toHaveLength(a.length + 1);
  });

  it("a torn final line is skipped by line number, the rest still project", () => {
    const s = snap(`${LOG}\n{"at":17920`);
    expect(s.lines).toHaveLength(4);
    expect(s.skipped).toEqual([{ id: "queue.jsonl:5", reason: expect.stringMatching(/^gpu queue line 5: not valid JSON/) }]);
  });

  it("the holder occupies gpu.local - interrupted once the broker calls it stale - and waiters queue", () => {
    const holder = { tenant: "forge-comfy", engine: "comfy", pid: 4, host: "box", jobPrefix: "forge", acquiredAt: T, heartbeatAt: T, ttlS: 120, ticket: "t9" };
    const live = projectGpu(snap(LOG, { holder, stale: null, queue: [{ tenant: "eye", engine: "ollama", pid: 5 }] }), ctx()).live;
    expect(live.map((j) => [j.id, j.state, j.lane])).toEqual([
      ["t9", "running", "gpu.local"],
      ["wait:eye:5", "queued", "gpu.local"],
    ]);
    const stale = projectGpu(snap(LOG, { holder, stale: "heartbeat-expired", queue: [] }), ctx()).live[0];
    expect(stale).toMatchObject({ state: "interrupted", error: "lease is stale (heartbeat-expired); the next acquire reclaims it", startedAt: "2026-10-15T11:00:00.000Z" });
  });

  it("a kernel job holding the slot is not drawn again: Runs has the job from the kernel's own list", () => {
    const job = { tenant: "forge job job:run:f1", engine: "job", pid: 4, host: "box", jobPrefix: "", acquiredAt: T, heartbeatAt: T, ttlS: 120, ticket: "t9" };
    const p = projectGpu(snap(LOG, { holder: job, stale: null, queue: [{ tenant: "eye", engine: "ollama", pid: 5 }] }), ctx());
    expect(p.live.map((j) => j.id)).toEqual(["wait:eye:5"]);
    expect(p.tally.records).toEqual({ "lease.waiting": 1 });
  });
});
