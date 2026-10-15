import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// v1's store module is replaced (its import chain needs the app's `@/` alias).
const store = vi.hoisted(() => ({ listCycles: vi.fn(), getCycle: vi.fn() }));
vi.mock("../../lib/foundry/training/store.ts", () => store);

import { projectTraining, trainingSource, type TrainingSnapshot } from "../../lib/ledger/v1/sources/training.ts";
import type { IngestEvent, ProjectCtx } from "../../lib/ledger/v1/types.ts";

// The Dojo records fewer instants than the forge. Everything v1 wrote no time
// for is observed by the sync (derived) and never given a past it did not have;
// the one commit instant v1 does write - inside a log line - is used.

const NOW = "2026-10-15T12:00:00.000Z";
const ctx = (iso = NOW): ProjectCtx => ({ now: new Date(iso), universe: "real" });

type Cycle = TrainingSnapshot["cycles"][number]["cycle"];
const cycle = (over: Partial<Cycle> = {}): Cycle => ({
  id: "2026-08-30-camera-attitude",
  at: "2026-08-30T15:16:03Z",
  dimension: "media-generation",
  subject: "frame-direction",
  status: "awaiting-gate",
  media: "image",
  improvements: [
    {
      id: "imp-1",
      technique: "camera-attitude",
      pairs: [
        { id: "imp-1-p1", scene: "alley", judge_pick: "challenger", gemini_pick: "baseline" },
        { id: "imp-1-p2", scene: "dock", judge_pick: "tie", gemini_error: "Gemini 503" },
      ],
    },
    { id: "imp-2", technique: "lens", pairs: [{ id: "imp-2-p1", scene: "vault", judge_pick: "baseline" }] },
  ],
  log: [
    { at: "2026-08-30T15:16:03Z", msg: "planned 2 improvements" },
    { at: "2026-08-30T15:40:00Z", msg: "parked for the human gate" },
  ],
  ...over,
});
const one = (c: Cycle, verdicts: TrainingSnapshot["cycles"][number]["verdicts"] = []): TrainingSnapshot => ({ cycles: [{ cycle: c, verdicts }], skipped: [] });
const byType = (events: readonly IngestEvent[]): Record<string, number> => {
  const m: Record<string, number> = {};
  for (const e of events) m[e.type] = (m[e.type] ?? 0) + 1;
  return m;
};

describe("dojo projection", () => {
  it("projects what it tallies: the gate's arrival, every judge pick, each verdict", () => {
    const p = projectTraining(one(cycle(), [{ key: "imp-1", verdict: "approve" }]), ctx());
    expect(byType(p.events)).toEqual(p.tally.facts);
    expect(p.tally.facts).toEqual({ "run.start": 1, "run.log": 2, "judge.pick": 3, "gate.arrive": 1, "verdict.keep": 1 });
  });

  it("what v1 kept no time for is observed now, and keyed so a later sync appends nothing", () => {
    const a = projectTraining(one(cycle(), [{ key: "imp-1", verdict: "approve" }]), ctx()).events;
    const b = projectTraining(one(cycle(), [{ key: "imp-1", verdict: "approve" }]), ctx("2026-10-16T00:00:00.000Z")).events;
    expect(b.map((e) => e.key)).toEqual(a.map((e) => e.key));
    for (const type of ["judge.pick", "verdict.keep", "gate.arrive"]) {
      expect(a.filter((e) => e.type === type).every((e) => e.atSrc === "derived" && e.occurredAt === NOW), type).toBe(true);
    }
    expect(a.find((e) => e.type === "run.start")).toMatchObject({ atSrc: "recorded", occurredAt: "2026-08-30T15:16:03.000Z" });
  });

  it("a verdict keyed by its value: approve then reject is two facts, the second a new key", () => {
    const approve = projectTraining(one(cycle(), [{ key: "imp-2", verdict: "approve" }]), ctx()).events.find((e) => e.type === "verdict.keep");
    const reject = projectTraining(one(cycle(), [{ key: "imp-2", verdict: "reject" }]), ctx()).events.find((e) => e.type === "verdict.reject");
    expect(approve?.key).toBe("dojo:2026-08-30-camera-attitude:verdict.imp-2.approve");
    expect(reject?.key).toBe("dojo:2026-08-30-camera-attitude:verdict.imp-2.reject");
    expect(reject).toMatchObject({ actor: { kind: "operator" }, subject: { kind: "improvement", id: "2026-08-30-camera-attitude/imp-2" } });
  });

  it("the commit takes the instant commitCycle wrote into its log line", () => {
    const log = [...cycle().log, { at: "2026-08-31T09:00:00.000Z", msg: "committed: 2 decided, 6 files deleted, 1 thumb(s) kept" }];
    const commit = projectTraining(one(cycle({ status: "committed", log })), ctx()).events.find((e) => e.type === "commit");
    expect(commit).toMatchObject({ atSrc: "recorded", occurredAt: "2026-08-31T09:00:00.000Z", data: { note: "committed: 2 decided, 6 files deleted, 1 thumb(s) kept" } });
    const unlogged = projectTraining(one(cycle({ status: "committed" })), ctx()).events.find((e) => e.type === "commit");
    expect(unlogged).toMatchObject({ atSrc: "derived", occurredAt: NOW });
  });

  it("a live cycle runs on its phase's lane; the stack comes from the id, and the row says so", () => {
    const lanes = (["planning", "generating", "judging"] as const).map((status) => projectTraining(one(cycle({ status })), ctx()).live[0]);
    expect(lanes.map((j) => [j?.state, j?.lane])).toEqual([
      ["running", "seat.text"],
      ["running", "gpu.local"],
      ["running", "gpu.local"],
    ]);
    const nb = projectTraining(one(cycle({ id: "2026-09-01-nb-counted-beats", status: "judging" })), ctx()).live[0];
    expect(nb).toMatchObject({ lane: "cloud.google", laneFrom: expect.stringContaining("-nb-") });
  });

  it("a gated or failed cycle is a gate pile; a committed one is neither live nor a pile", () => {
    const gated = projectTraining(one(cycle(), [{ key: "imp-1", verdict: "reject" }]), ctx());
    expect(gated.live).toEqual([]);
    expect(gated.weir).toMatchObject([{ kind: "gate", decided: 1, pending: 1 }]);
    expect(projectTraining(one(cycle({ status: "failed" })), ctx()).weir).toHaveLength(1);
    const done = projectTraining(one(cycle({ status: "committed" })), ctx());
    expect([done.live, done.weir]).toEqual([[], []]);
  });
});

describe("dojo reader", () => {
  it("reads v1's drift as measured on this machine: a planned improvement with no pairs, a log of bare strings", async () => {
    store.listCycles.mockResolvedValue([{ id: "2026-09-06-state-coupling" }]);
    store.getCycle.mockResolvedValue({
      cycle: { ...cycle({ id: "2026-09-06-state-coupling", status: "failed" }), improvements: [{ id: "imp-1", technique: "state-coupling" }], log: ["plan: discharges the banked lead"] },
      verdicts: { "imp-1": null },
    });
    const r = await trainingSource.read();
    if (!r.ok) throw r.error;
    expect(r.value.skipped).toEqual([]);
    const p = projectTraining(r.value, ctx());
    expect(p.events.find((e) => e.type === "run.log")).toMatchObject({ atSrc: "derived", data: { note: "plan: discharges the banked lead" } });
    expect(byType(p.events)).toEqual(p.tally.facts);
  });
});
