import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// v1's store module is replaced (its import chain needs the app's `@/` alias);
// the lease rule is v1's real, pure module, compared against below.
const store = vi.hoisted(() => ({ listExtractRuns: vi.fn(), getExtractRun: vi.fn() }));
vi.mock("../../lib/foundry/extract/store.ts", () => store);

import { activeLease, LEASE_TTL_MS } from "../../lib/foundry/extract/lease.ts";
import type { ExtractManifest } from "../../lib/foundry/extract/types.ts";
import { leaseState, projectExtract, type ExtractSnapshot } from "../../lib/ledger/v1/sources/extract.ts";
import type { IngestEvent, ProjectCtx } from "../../lib/ledger/v1/types.ts";

// The extract adapter over literal manifests in engine.ts's shapes. What it
// must get right that the forge does not: a run is RUNNING only while a driver
// holds a fresh lease, a money stop is its own fact, the journal is capped, and
// a generator with no resource lane is said out loud.

const NOW = "2026-10-15T12:00:00.000Z";
const nowMs = Date.parse(NOW);
const ctx: ProjectCtx = { now: new Date(NOW), universe: "fixture" };

type Run = ExtractSnapshot["runs"][number]["run"];
const run = (over: Partial<Run> = {}): Run => ({
  id: "2026-10-15-railyard",
  slug: "railyard",
  created: "2026-10-15T11:50:00.000Z",
  status: "replicating",
  progress: { stage: "replicating", done: 4, total: 9 },
  styles: [
    { id: "ember-lit", name: "Ember-lit realism" },
    { id: "smoke", name: "Smoke" },
  ],
  engines: { vision: "google/gemini-3.6-flash", generator: "google/gemini-3.1-flash-image", reasoner: "claude-cli/claude-opus-5" },
  lease: { owner: "app", at: "2026-10-15T11:59:00.000Z" },
  log: [
    { at: "2026-10-15T11:50:00.000Z", msg: "created with 2 source(s)" },
    { at: "2026-10-15T11:54:00.000Z", msg: "read 2/2 sources" },
  ],
  ...over,
});
const one = (r: Run, verdicts: ExtractSnapshot["runs"][number]["verdicts"] = []): ExtractSnapshot => ({ runs: [{ run: r, verdicts }], skipped: [] });
const byType = (events: readonly IngestEvent[]): Record<string, number> => {
  const m: Record<string, number> = {};
  for (const e of events) m[e.type] = (m[e.type] ?? 0) + 1;
  return m;
};

/** A whole v1 manifest, for v1's own function; only status and lease matter to it. */
const manifest = (status: ExtractManifest["status"], lease: { owner: string; at: string }): ExtractManifest => ({
  id: "m",
  slug: "m",
  created: NOW,
  status,
  progress: { stage: status, done: 0, total: 1 },
  options: { rounds: 1, replicas: 1, transfers: 1, target: 0.9, seed: 1, grouping: "engine" },
  sources: [],
  styles: [],
  engines: {},
  lease,
  log: [],
});

describe("extract liveness", () => {
  it.each([
    ["a fresh stamp", { lease: { owner: "app", at: "2026-10-15T11:59:00.000Z" } }, "running"],
    ["a stamp exactly at the TTL", { lease: { owner: "cli", at: new Date(nowMs - LEASE_TTL_MS).toISOString() } }, "running"],
    ["a stamp past the TTL: the driver died mid-unit", { lease: { owner: "cli", at: new Date(nowMs - LEASE_TTL_MS - 1).toISOString() } }, "interrupted"],
    ["never stamped, never started", { lease: undefined, status: "created" as const }, "queued"],
    ["mid-run with no stamp at all", { lease: undefined }, "paused"],
  ])("%s -> %s", (_name, over, state) => {
    const [job] = projectExtract(one(run(over)), ctx).live;
    expect(job?.state).toBe(state);
  });

  it("agrees with v1's own activeLease on every edge it decides", () => {
    for (const status of ["created", "reading", "transferring", "done", "failed", "committed"] as const) {
      for (const ago of [0, LEASE_TTL_MS, LEASE_TTL_MS + 1]) {
        const lease = { owner: "app", at: new Date(nowMs - ago).toISOString() };
        const v1 = activeLease(manifest(status, lease), nowMs);
        expect(leaseState({ status, lease }, nowMs) === "fresh", `${status} ${ago}`).toBe(v1 !== null);
      }
    }
  });

  it("a finished run is not live; a done one is a cull pile counting its undecided styles", () => {
    const p = projectExtract(one(run({ status: "done", lease: undefined, finished: "2026-10-15T11:58:00.000Z" }), [{ key: "smoke", verdict: "reject", at: NOW }]), ctx);
    expect(p.live).toEqual([]);
    expect(p.weir).toEqual([{ source: "extract", id: "2026-10-15-railyard", title: "extract railyard", media: "image", kind: "cull", since: "2026-10-15T11:58:00.000Z", decided: 1, pending: 1, href: "/floor?lane=image" }]);
  });

  it("a run a scout night launched is no pile of its own: the night's packet decides it", () => {
    const done = run({ status: "done", lease: undefined, finished: "2026-10-15T11:58:00.000Z" });
    const p = projectExtract({ ...one(done), scoutOwned: new Set([done.id]) }, ctx);
    expect(p.weir).toEqual([]);
    expect(p.events.length).toBeGreaterThan(0);
  });

  it("draws the lane of the engine the stage runs, and says so when v1's engine has no lane", () => {
    expect(projectExtract(one(run({ status: "grouping" })), ctx).live[0]).toMatchObject({ lane: "seat.text" });
    const openai = projectExtract(one(run({ engines: { vision: "gemini/gemini-3.7-flash", generator: "openai/gpt-image-2.5" } })), ctx).live[0];
    expect(openai).toMatchObject({ lane: "cloud.google", laneFrom: expect.stringContaining("openai/gpt-image-2.5") });
  });
});

describe("extract facts", () => {
  it("projects what it tallies, including a money stop and a commit", () => {
    const committed = run({
      status: "committed",
      lease: undefined,
      finished: "2026-10-15T11:58:00.000Z",
      stopped: { by: "run-ceiling", spentUsd: 1.92, ceilingUsd: 2, at: "2026-10-15T11:57:00.000Z" },
      committed: { at: "2026-10-15T11:59:30.000Z", kept: ["ember-lit"], rejected: ["smoke"], written: ["ember-lit-2"], spendUsd: 1.92, costPerKeptUsd: 1.92 },
    });
    const p = projectExtract(one(committed, [{ key: "ember-lit", verdict: "keep", at: NOW, reasons: [] }, { key: "smoke", verdict: "reject", at: NOW, reasons: ["muddy"], by: "model" }]), ctx);
    expect(byType(p.events)).toEqual(p.tally.facts);
    expect(p.events.find((e) => e.type === "run.stop")).toMatchObject({ occurredAt: "2026-10-15T11:57:00.000Z", atSrc: "recorded", data: { by: "run-ceiling", spentUsd: 1.92 } });
    // Spend rides in data, never as a cost: the money ledger's own adapter books it.
    expect(p.events.every((e) => e.cost === undefined)).toBe(true);
    expect(p.events.find((e) => e.type === "commit")?.data).toMatchObject({ written: ["ember-lit-2"], spendUsd: 1.92 });
    expect(p.events.find((e) => e.type === "verdict.reject")).toMatchObject({ actor: { kind: "agent" }, subject: { kind: "style", id: "2026-10-15-railyard/smoke" }, data: { reasons: ["muddy"] } });
  });

  it("a journal that dropped its oldest line (the 400 cap) keeps every surviving line's key", () => {
    const lines = Array.from({ length: 5 }, (_, i) => ({ at: `2026-10-15T11:5${i}:00.000Z`, msg: `unit ${i}` }));
    const keys = (log: typeof lines): string[] => projectExtract(one(run({ log })), ctx).events.filter((e) => e.type === "run.log").map((e) => e.key);
    expect(keys(lines.slice(2))).toEqual(keys(lines).slice(2));
  });
});
