import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// The reader's v1 module, replaced: its real import chain leans on the app's
// `@/` alias, which only Next, Playwright and pipeline/ledger-sync.mts resolve.
// The real reader runs over the fixture universe in the reconcile probe.
const store = vi.hoisted(() => ({ listRuns: vi.fn(), getRun: vi.fn() }));
vi.mock("../../lib/foundry/store.ts", () => store);

import { forgeSource, projectForge, type ForgeSnapshot } from "../../lib/ledger/v1/sources/forge.ts";
import type { IngestEvent, ProjectCtx } from "../../lib/ledger/v1/types.ts";

// The forge adapter over literal v1 records, in the shapes forge.py and the
// cull actually write (+00:00 and whole seconds from Python, toISOString from
// the app). No disk: the reader is exercised over the fixture universe in
// v1-sync.test.ts and the reconcile probe.

const ctx = (iso: string, universe: ProjectCtx["universe"] = "real"): ProjectCtx => ({ now: new Date(iso), universe });

type Run = ForgeSnapshot["runs"][number]["run"];
const run = (over: Partial<Run> = {}): Run => ({
  id: "2026-08-26-sweep-01",
  created: "2026-08-26T19:07:41+00:00",
  finished: "2026-08-27T07:13:00+00:00",
  status: "done",
  progress: { stage: "grading", done: 3, total: 3 },
  candidates: [
    { id: "alley/neon-noir--text--s1", status: "graded", grade: { at: "2026-08-27T07:01:00+00:00", grader: "qwen3-vl", grader_digest: "abc", craft: { score: 0.8 }, style: { score: null } } },
    { id: "alley/neon-noir--text--s2", status: "graded", grade: { at: "2026-08-27T07:02:00+00:00", grader: "qwen3-vl", craft: null, style: { score: 0.5 } } },
    { id: "alley/neon-noir--text--s3", status: "failed", grade: null },
  ],
  log: [
    { at: "2026-08-26T19:07:41+00:00", msg: "stage 0: annotate sources" },
    { at: "2026-08-26T19:07:41+00:00", msg: "stage 0: annotate sources" },
    { at: "2026-08-26T19:09:00+00:00", msg: "stage 1: generate candidates (ComfyUI holds the card)" },
  ],
  ...over,
});
const snap = (runs: ForgeSnapshot["runs"]): ForgeSnapshot => ({ runs, skipped: [] });
const verdicts: ForgeSnapshot["runs"][number]["verdicts"] = [
  { key: "alley/neon-noir--text--s1", verdict: "keep", at: "2026-08-27T09:00:00.000Z", by: "human" },
  { key: "alley/neon-noir--text--s2", verdict: "reject", at: "2026-08-27T09:00:05.000Z", by: "model", note: "text in frame" },
];

const byType = (events: readonly IngestEvent[]): Record<string, number> => {
  const m: Record<string, number> = {};
  for (const e of events) m[e.type] = (m[e.type] ?? 0) + 1;
  return m;
};
const keyOf = (events: readonly IngestEvent[], type: string): IngestEvent[] => events.filter((e) => e.type === type);

describe("forge projection", () => {
  it("counts the same facts it projects: the tally is the reconcile probe's other reading", () => {
    const committed = run({ id: "2026-08-20-vault", status: "committed", committed: { at: "2026-08-21T10:00:00.000Z", deleted: 1, kept: 1, undecided: 0 } });
    const p = projectForge(snap([{ run: run(), verdicts }, { run: committed, verdicts: [] }, { run: run({ id: "2026-10-15-dock", status: "generating", finished: undefined }), verdicts: [] }]), ctx("2026-10-15T12:00:00.000Z"));
    expect(byType(p.events)).toEqual(p.tally.facts);
    expect(p.tally.facts).toEqual({ "run.start": 3, "run.log": 9, "candidate.grade": 6, "run.end": 2, "run.status": 2, "verdict.keep": 1, "verdict.reject": 1, commit: 1 });
    expect(p.tally.records).toEqual({ "run.done": 1, "run.committed": 1, "run.generating": 1 });
    expect(new Set(p.events.map((e) => e.key)).size).toBe(p.events.length);
  });

  it("normalises Python's +00:00 seconds to the ledger's millisecond Z, and says the instant was recorded", () => {
    const [start] = keyOf(projectForge(snap([{ run: run(), verdicts: [] }]), ctx("2026-10-15T12:00:00.000Z")).events, "run.start");
    expect(start).toMatchObject({ key: "forge:2026-08-26-sweep-01:run.start", occurredAt: "2026-08-26T19:07:41.000Z", atSrc: "recorded", data: { runId: "2026-08-26-sweep-01", src: "real" } });
  });

  it("re-projecting later yields the same keys; only an observed instant moves", () => {
    const a = projectForge(snap([{ run: run(), verdicts }]), ctx("2026-10-15T12:00:00.000Z")).events;
    const b = projectForge(snap([{ run: run(), verdicts }]), ctx("2026-10-16T12:00:00.000Z")).events;
    expect(b.map((e) => e.key)).toEqual(a.map((e) => e.key));
    const moved = b.filter((e, i) => e.occurredAt !== a[i]?.occurredAt);
    expect(moved.map((e) => [e.type, e.atSrc])).toEqual([["run.status", "derived"]]);
    expect(moved[0]?.occurredAt).toBe("2026-10-16T12:00:00.000Z");
  });

  it("two identical log lines are two facts, and a line keeps its key when an earlier one is gone", () => {
    const full = keyOf(projectForge(snap([{ run: run(), verdicts: [] }]), ctx("2026-10-15T12:00:00.000Z")).events, "run.log");
    expect(new Set(full.map((e) => e.key)).size).toBe(3);
    const trimmed = keyOf(projectForge(snap([{ run: run({ log: run().log.slice(2) }), verdicts: [] }]), ctx("2026-10-15T12:00:00.000Z")).events, "run.log");
    expect(trimmed.map((e) => e.key)).toEqual([full[2]?.key]);
  });

  it("a changed verdict is a new fact beside the old one, never an edit; a model's verdict is an agent's act", () => {
    const first = keyOf(projectForge(snap([{ run: run(), verdicts }]), ctx("2026-10-15T12:00:00.000Z")).events, "verdict.reject");
    const flipped = projectForge(snap([{ run: run(), verdicts: [{ key: "alley/neon-noir--text--s2", verdict: "keep", at: "2026-08-28T10:00:00.000Z" }] }]), ctx("2026-10-15T12:00:00.000Z")).events;
    const keep = keyOf(flipped, "verdict.keep");
    expect(keep).toHaveLength(1);
    expect(keep[0]?.key).not.toBe(first[0]?.key);
    expect(first[0]).toMatchObject({ actor: { kind: "agent" }, subject: { kind: "candidate", id: "2026-08-26-sweep-01/alley/neon-noir--text--s2" }, data: { note: "text in frame" } });
    expect(keep[0]?.actor).toEqual({ kind: "operator", id: "operator" });
  });

  it("live is the /foundry page's LIVE set: created waits, the stages run", () => {
    const p = projectForge(
      snap([
        { run: run({ id: "q", status: "created", finished: undefined }), verdicts: [] },
        { run: run({ id: "g", status: "grading", finished: undefined }), verdicts: [] },
        { run: run({ id: "d" }), verdicts: [] },
      ]),
      ctx("2026-10-15T12:00:00.000Z"),
    );
    expect(p.live.map((j) => [j.id, j.state, j.lane, j.startedAt])).toEqual([
      ["q", "queued", "gpu.local", "2026-08-26T19:07:41.000Z"],
      ["g", "running", "gpu.local", "2026-08-26T19:07:41.000Z"],
    ]);
  });

  it("a committable run with plates is a cull pile on the Weir; one with nothing to judge is not", () => {
    const p = projectForge(
      snap([
        { run: run(), verdicts },
        { run: run({ id: "empty", status: "failed", candidates: [run().candidates[2] ?? run().candidates[0]!] }), verdicts: [] },
        { run: run({ id: "c", status: "committed" }), verdicts: [] },
      ]),
      ctx("2026-10-15T12:00:00.000Z"),
    );
    expect(p.weir).toEqual([{ source: "forge", id: "2026-08-26-sweep-01", title: "forge 2026-08-26-sweep-01", media: "image", kind: "cull", since: "2026-08-27T07:13:00.000Z", decided: 2, pending: 0, href: "/floor?lane=image" }]);
  });

  it("an instant with no zone is never read as local time: it is observed, with the raw text kept", () => {
    const [start] = keyOf(projectForge(snap([{ run: run({ created: "2026-08-26 19:07:41" }), verdicts: [] }]), ctx("2026-10-15T12:00:00.000Z", "fixture")).events, "run.start");
    expect(start).toMatchObject({ atSrc: "derived", occurredAt: "2026-10-15T12:00:00.000Z", data: { unparsedAt: "2026-08-26 19:07:41", src: "fixture" } });
  });
});

describe("forge reader", () => {
  it("skips a record that drifted past the door with the door's words, and keeps the rest", async () => {
    store.listRuns.mockResolvedValue([{ id: "good" }, { id: "drifted" }, { id: "gone" }]);
    store.getRun.mockImplementation(async (id: string) => {
      if (id === "gone") throw new Error("No run called gone.");
      const r = id === "good" ? run({ id }) : { ...run({ id }), status: "exploded" };
      return { run: r, verdicts: { "alley/neon-noir--text--s1": { verdict: "keep", at: "2026-08-27T09:00:00.000Z" } } };
    });
    const r = await forgeSource.read();
    expect(r.ok && r.value.runs.map((x) => [x.run.id, x.verdicts.map((v) => v.key)])).toEqual([["good", ["alley/neon-noir--text--s1"]]]);
    expect(r.ok && r.value.skipped).toEqual([
      { id: "gone", reason: "No run called gone." },
      { id: "drifted", reason: expect.stringMatching(/^forge run drifted: status: /) },
    ]);
  });

  it("fails the source, verbatim, when the listing itself fails", async () => {
    store.listRuns.mockRejectedValue(new Error("EACCES: permission denied, scandir 'foundry-out/runs'"));
    const r = await forgeSource.read();
    expect(!r.ok && r.error.message).toBe("forge: listRuns failed: EACCES: permission denied, scandir 'foundry-out/runs'");
  });
});
