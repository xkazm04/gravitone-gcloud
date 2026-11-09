// WORK THAT NEEDS THE OPERATOR, IN SIGHT (spark fable-ten B): the header's needs chip, Runs'
// `?state=` filter, and the worker chip on the Plan and Runs - their pure halves.
//
//   1. ONE definition of what needs the operator (runs/_runs/needs.ts NEEDS): the header's fold,
//      Runs' rose total, its `needs` filter and the inspector's failed list count the same jobs.
//   2. Runs' address: a default is never written, an unknown state reads as every state.
//   3. Each filter leaves exactly the bars its totals chip counts.
//   4. The header chip is absent at zero, names a read failure in the store's words, and takes
//      its words and hue from the status vocabulary.
//   5. The worker chip is drawn only for queued work with no beat, and says a failed read.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { jobMachine, type JobState } from "@gt/domain/job.machine";
import { STATUS } from "@gt/ui/components/status/status.ts";

import { needsChip } from "../../app/(studio)/_shell/needsChip.ts";
import { WorkerChip, workerWords } from "../../app/(studio)/projects/_plan/WorkerChip.tsx";
import { buildRuns, type KernelJobInput } from "../../app/(studio)/projects/runs/_runs/model.ts";
import { NEEDS, NEEDS_HREF, needsCount, needsTotal } from "../../app/(studio)/projects/runs/_runs/needs.ts";
import { parseRuns, runsSearch } from "../../app/(studio)/projects/runs/_runs/url.ts";
import { failedOf, filterModel, RUN_FILTERS, totalsOf } from "../../app/(studio)/projects/runs/_runs/view.ts";

const NOW = Date.parse("2026-11-09T12:00:00.000Z");
const kjob = (state: JobState, id: string = state): KernelJobInput => ({ id: `job:${id}`, title: id, lane: "seat.text", state, progress: { done: 0, total: 1 }, attempt: 1 });
const OPEN: JobState[] = [...jobMachine.states];
const weir = (id: string) => ({ source: "forge", id, title: id, kind: "cull" as const, media: "image" as const, href: `/board/${id}`, since: "2026-11-09T10:00:00.000Z", decided: 0, pending: 3 });
const model = () =>
  buildRuns({
    now: NOW,
    live: { jobs: [], weir: [weir("w1"), weir("w2")], slots: [{ source: "publish", id: "s1", title: "slot", channel: "youtube", status: "scheduled", publishAt: "2026-11-09T18:00:00.000Z", href: "/floor", projectId: "p" }], holds: [], failures: [] },
    kernel: OPEN.map((s) => kjob(s)),
    ledger: [],
  });

describe("1. one definition of what needs the operator", () => {
  it("is failed and interrupted, nothing else", () => {
    expect(jobMachine.states.filter((s) => NEEDS.has(s))).toEqual(["failed", "interrupted"]);
  });

  it("the header's fold, Runs' total, its needs filter and the inspector's list count the same jobs", () => {
    const states: JobState[] = ["failed", "failed", "interrupted", "queued", "running", "done", "cancelled", "paused"];
    const m = buildRuns({ now: NOW, live: { jobs: [], weir: [], slots: [], holds: [], failures: [] }, kernel: states.map((s, i) => kjob(s, `${s}-${i}`)), ledger: [] });
    const fold = needsCount(states.map((state) => ({ state })));
    expect(fold).toEqual({ failed: 2, interrupted: 1 });
    expect(needsTotal(fold)).toBe(totalsOf(m).failed);
    expect(filterModel(m, "needs").jobs.map((j) => j.key)).toEqual(failedOf(m).map((j) => j.key));
  });

  it("the header's door opens Runs on that filter", () => {
    expect(parseRuns(Object.fromEntries(new URL(NEEDS_HREF, "http://x").searchParams)).state).toBe("needs");
  });
});

describe("2. Runs' address", () => {
  it("the bare address is every lane, nothing selected, 24h, every state - and writes back as nothing", () => {
    const sel = parseRuns({});
    expect(sel).toEqual({ job: null, project: null, zoom: "24h", state: null });
    expect(runsSearch(sel)).toBe("");
  });

  it("an unknown or empty state reads as every state, never an error", () => {
    expect(parseRuns({ state: "bogus" }).state).toBeNull();
    expect(parseRuns({ state: "" }).state).toBeNull();
    expect(parseRuns({ state: ["needs", "weir"] }).state).toBeNull();
  });

  it("every filter round-trips, beside the other keys", () => {
    for (const state of RUN_FILTERS) {
      const sel = { job: "kernel:job:a", project: "p1", zoom: "3d" as const, state };
      expect(parseRuns(Object.fromEntries(new URLSearchParams(runsSearch(sel))))).toEqual(sel);
    }
    expect(runsSearch({ job: null, project: null, zoom: "24h", state: "weir" })).toBe("state=weir");
  });
});

describe("3. a filter leaves exactly what its chip counts", () => {
  it("each state's bars are the chip's figure, and nothing else is drawn", () => {
    const m = model();
    const t = totalsOf(m);
    const n = (f: (typeof RUN_FILTERS)[number]) => {
      const x = filterModel(m, f);
      return x.jobs.length + x.weir.length;
    };
    expect([n("running"), n("waiting"), n("weir"), n("needs")]).toEqual([t.running, t.waiting, t.weir, t.failed]);
    expect(filterModel(m, "running").jobs.map((j) => j.state)).toEqual(["running"]);
    expect(filterModel(m, "waiting").jobs.map((j) => j.state).sort()).toEqual(["paused", "planned", "queued"]);
    expect(filterModel(m, "needs").jobs.map((j) => j.state).sort()).toEqual(["failed", "interrupted"]);
    expect(filterModel(m, "weir").jobs).toEqual([]);
    for (const f of RUN_FILTERS) expect(filterModel(m, f).pins).toEqual([]);
  });

  it("no filter is the model itself", () => {
    const m = model();
    expect(filterModel(m, null)).toBe(m);
  });
});

describe("4. the header's needs chip", () => {
  const facts = (failed: number, interrupted: number) => ({ needs: { failed, interrupted }, problems: [], head: 7 });

  it("is absent at zero", () => {
    expect(needsChip(facts(0, 0))).toBeNull();
  });

  it("states a read failure in the store's words, never an absence", () => {
    const c = needsChip({ needs: null, problems: ["jobs: SQLITE_BUSY: database is locked"], head: null });
    expect(c).toMatchObject({ value: "unread", tone: "rose" });
    expect(c?.name).toContain("SQLITE_BUSY: database is locked");
  });

  it("counts both states, in the vocabulary's words and hue, and names what it counts", () => {
    expect(needsChip(facts(2, 1))).toEqual({ label: "3", value: `${STATUS.job.failed.label} · ${STATUS.job.interrupted.label}`, tone: "rose", name: "jobs that need you: 2 failed, 1 interrupted" });
    expect(needsChip(facts(0, 2))).toMatchObject({ label: "2", value: "interrupted", tone: "amber" });
    expect(needsChip(facts(1, 0))).toMatchObject({ label: "1", value: "failed", tone: "rose" });
  });
});

describe("5. the worker chip", () => {
  const none = (lastBeat: string | null) => ({ verdict: { kind: "none" as const, queued: 3, queuedSince: "2026-11-09T11:00:00.000Z", lastBeat } });

  it("draws nothing when nothing is queued or something beats", () => {
    expect(workerWords({ verdict: { kind: "quiet" } }, NOW)).toBeNull();
    expect(workerWords({ verdict: { kind: "alive" } }, NOW)).toBeNull();
    expect(renderToStaticMarkup(h(WorkerChip, { read: { verdict: { kind: "alive" } }, now: NOW }))).toBe("");
    expect(renderToStaticMarkup(h(WorkerChip, { read: null, now: NOW }))).toBe("");
  });

  it("queued work and no beat: the last beat, and the queue's age in its name", () => {
    expect(workerWords(none("2026-11-09T09:30:00.000Z"), NOW)).toEqual({ label: "no worker", value: "last 09:30", tone: "amber", name: "no worker: 3 queued since 11:00; last worker heartbeat 09:30" });
    expect(workerWords(none(null), NOW)).toMatchObject({ value: "never seen", name: "no worker: 3 queued since 11:00; no worker heartbeat on record" });
  });

  it("a read that failed is drawn, in the store's words", () => {
    expect(workerWords({ problem: "kernel: the store is locked" }, NOW)).toMatchObject({ value: "unread", tone: "rose", name: "the worker could not be read: kernel: the store is locked" });
  });
});
