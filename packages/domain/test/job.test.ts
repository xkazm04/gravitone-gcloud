import { describe, expect, it } from "vitest";

import { jobSchema } from "../src/job.ts";
import { slotSchema } from "../src/slot.ts";
import { accept, AT, HOLDER, refuse } from "./_records.ts";

const queued = {
  id: "job_why-bitcoin_frames",
  of: { kind: "part", id: "p-frames" },
  producer: "frames",
  lane: "gpu.local",
  state: "queued",
  mode: { kind: "dry" },
  attempt: 1,
  progress: { done: 0, total: 40 },
  spend: { usd: 0, unpriced: 0, basis: "reported" },
  failStreak: 0,
};
const lease = { holder: HOLDER, fence: 7, acquiredAt: AT, heartbeatAt: AT, ttlS: 30 };
const running = { ...queued, state: "running", lease, slot: "gpu.local#1", progress: { done: 22, total: 40, stage: "generating" } };

describe("job", () => {
  it("parses a queued job with no optional keys present", () => {
    const j = accept(jobSchema, queued);
    for (const k of ["lease", "error", "stop", "interruption"]) expect(k in j, k).toBe(false);
  });
  it("holds a lease exactly while running", () => {
    accept(jobSchema, running);
    refuse(jobSchema, { ...queued, state: "running" }, "lease");
    refuse(jobSchema, { ...queued, lease }, "lease");
  });
  it("a lease is on a slot of the job's own lane, and a slot is held only under a lease (Phase 4 lane slots)", () => {
    refuse(jobSchema, { ...running, slot: undefined }, "slot");
    refuse(jobSchema, { ...running, slot: "seat.text#1" }, "slot");
    refuse(jobSchema, { ...queued, slot: "gpu.local#1" }, "slot");
  });
  it("carries its mode, producer, ceiling, steer and correlation on the record", () => {
    refuse(jobSchema, { ...queued, mode: undefined }, "mode");
    refuse(jobSchema, { ...queued, producer: "" }, "producer");
    refuse(jobSchema, { ...queued, mode: { kind: "live" } }, "mode");
    const live = { kind: "live", arm: { by: { kind: "operator", id: "kazda" }, at: AT, reason: "launch receipt confirmed" } };
    accept(jobSchema, { ...queued, mode: live, ceilingUsd: 2.5, steer: { prefer: "google", exclude: ["qwen"] }, correlation: { projectId: "prj-1", runId: "run-1" } });
    refuse(jobSchema, { ...queued, ceilingUsd: 0 }, "ceilingUsd");
  });
  it("a lease carries a fence that only a positive count can be", () => {
    refuse(jobSchema, { ...running, lease: { ...lease, fence: 0 } }, "fence");
  });
  it("failed carries the engine's sentence, and only failed does", () => {
    const failed = { ...queued, state: "failed", attempt: 2, failStreak: 3, error: { code: "unavailable", message: "3 consecutive vendor failures; the last: 400" } };
    accept(jobSchema, failed);
    refuse(jobSchema, { ...failed, error: undefined }, "error");
    refuse(jobSchema, { ...queued, error: failed.error }, "error");
    refuse(jobSchema, { ...failed, error: { code: "exploded", message: "x" } }, "error.code");
  });
  it("a money stop is failed + budget + stop, never a vendor failure", () => {
    const stop = { by: "run-ceiling", spentUsd: 1.9842, ceilingUsd: 2, at: AT };
    const stopped = { ...queued, state: "failed", error: { code: "budget", message: "Run ceiling reached: $1.9842 of $2.00 spent" }, stop };
    expect(accept(jobSchema, stopped).failStreak).toBe(0);
    refuse(jobSchema, { ...stopped, error: { code: "unavailable", message: "x" } }, "stop");
    refuse(jobSchema, { ...stopped, stop: undefined }, "stop");
  });
  it("an interrupted job names what was running and whose it was; failed does not", () => {
    const interruption = { at: AT, holder: HOLDER, stage: "imaging" };
    accept(jobSchema, { ...queued, state: "interrupted", interruption });
    refuse(jobSchema, { ...queued, state: "interrupted" }, "interruption");
    refuse(jobSchema, { ...queued, interruption }, "interruption");
  });
  it("belongs to exactly one part or run", () => {
    accept(jobSchema, { ...queued, of: { kind: "run", id: "suno-queue-20" } });
    refuse(jobSchema, { ...queued, of: { kind: "project", id: "x" } }, "of");
  });
  it("refuses progress past its total and NaN spend", () => {
    refuse(jobSchema, { ...queued, progress: { done: 41, total: 40 } }, "progress");
    refuse(jobSchema, { ...queued, spend: { ...queued.spend, usd: Number.NaN } }, "spend.usd");
  });
});

describe("slot", () => {
  const scheduled = {
    id: "sl-58ca3dd6",
    libraryItemId: "5c255235-afa7-403c-9e08-fb10c42c924c",
    channel: "youtube",
    at: "2026-09-23T14:00:00.000Z",
    state: "scheduled",
    title: "Glass Harbor — they never break in",
    description: "A crew that never breaks in waits for the one door every city leaves unlocked.",
    tags: ["heist", "short film"],
  };
  it("parses a scheduled slot from the fixture universe", () => {
    const s = accept(slotSchema, scheduled);
    for (const k of ["claim", "drift", "missedAt", "publicationId", "error"]) expect(k in s, k).toBe(false);
  });
  it("holds a claim exactly while publishing — the at-most-once record", () => {
    accept(slotSchema, { ...scheduled, state: "publishing", claim: { holder: HOLDER, at: AT } });
    refuse(slotSchema, { ...scheduled, state: "publishing" }, "claim");
    refuse(slotSchema, { ...scheduled, claim: { holder: HOLDER, at: AT } }, "claim");
  });
  it("a missed slot says when; a published one names its publication; a failed one says why", () => {
    accept(slotSchema, { ...scheduled, state: "missed", missedAt: AT });
    refuse(slotSchema, { ...scheduled, state: "missed" }, "missedAt");
    refuse(slotSchema, { ...scheduled, state: "published" }, "publicationId");
    accept(slotSchema, { ...scheduled, state: "failed", error: "interrupted before the publish finished" });
    refuse(slotSchema, { ...scheduled, state: "failed" }, "error");
  });
  it("only a slot waiting to fire can drift", () => {
    accept(slotSchema, { ...scheduled, drift: "export_missing" });
    accept(slotSchema, { ...scheduled, state: "missed", missedAt: AT, drift: "channel_not_wired" });
    refuse(slotSchema, { ...scheduled, state: "published", publicationId: "pub-e504e30c", drift: "export_missing" }, "drift");
  });
});
