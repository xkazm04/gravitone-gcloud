import { describe, expect, it } from "vitest";

import type { Job } from "@gt/domain/job";
import type { StepContext } from "@gt/kernel/job-core";

import { COVER_STEPS, coverPlan, defineCover, parseCoverRequest, renderStep, tagsFromScore, takeOf, TRANSCRIBE_STEP } from "../src/cover/define.ts";

// The cover's plan and request (spark track-mirror-studio WP1), pure: six steps in order, only the missing ones planned,
// an unknown step fatal, a malformed request refused at the door. The bound job is tests/next-server/cover.test.ts.

const booked = (...names: string[]) => new Map(names.map((n) => [n, {} as never]));
const base = {
  coverId: "cov-0123456789ab",
  startS: 12,
  endS: 32,
  style: "Melancholic lofi hip hop instrumental, 100 BPM, B minor",
  lyrics: "",
  seeds: [1, 2, 3, 4, 5],
  max_duration: 360,
  temperature: 0.8,
  by: "op",
  estimates: { transcribe: { seconds: 10, usd: 0 }, render: { seconds: 60, usd: 0 } },
};

describe("the cover plan", () => {
  it("plans transcribe then render-1..5, and exactly the steps not yet booked", () => {
    const r = parseCoverRequest(base);
    if (!r.ok) throw r.error;
    expect(COVER_STEPS).toEqual(["transcribe", "render-1", "render-2", "render-3", "render-4", "render-5"]);
    expect(coverPlan(r.value, booked()).map((s) => s.name)).toEqual(COVER_STEPS);
    expect(coverPlan(r.value, booked(TRANSCRIBE_STEP, renderStep(1), renderStep(2))).map((s) => s.name)).toEqual(["render-3", "render-4", "render-5"]);
    expect(coverPlan(r.value, booked(...COVER_STEPS))).toEqual([]);
    expect(coverPlan(r.value, booked()).map((s) => s.estimate.seconds)).toEqual([10, 60, 60, 60, 60, 60]);
  });

  it("reads a take from its step name, and nothing from a step it does not have", () => {
    expect([takeOf("render-1"), takeOf("render-5")]).toEqual([1, 5]);
    expect([takeOf("render-0"), takeOf("render-6"), takeOf("transcribe"), takeOf("render-01")]).toEqual([undefined, undefined, undefined, undefined]);
  });

  it("derives the lyrics from the score's section labels, in order, adjacent repeats once", () => {
    const abc = ["X:1", "K:Bm", "% intro", 'V: Vocal', '"Bm"z16|', "% chorus", "z16|", "% chorus", "%%MIDI program 1", "% verse two", "% chorus"].join("\r\n");
    expect(tagsFromScore(abc)).toBe("[Intro]\n\n[Chorus]\n\n[Verse two]\n\n[Chorus]");
    expect(tagsFromScore("X:1\nK:C\nz16|")).toBe("");
  });

  it("an unknown step is fatal", async () => {
    const r = parseCoverRequest(base);
    if (!r.ok) throw r.error;
    const req = r.value;
    const fail = async () => ({ kind: "fatal" as const, code: "internal" as const, message: "not this one" });
    const p = defineCover("gpu.local", { request: () => ({ ok: true, value: req }), transcribe: fail, render: fail, ended: async () => undefined });
    const job = { id: "job:cover:cov-0123456789ab" } as Job;
    const out = await p.perform({ name: "render-6", estimate: { seconds: 1, usd: 0 } }, { job } as StepContext);
    expect(out).toEqual({ kind: "fatal", code: "internal", message: "a cover job has no step render-6" });
  });

  it("refuses a malformed request at the door", () => {
    expect(parseCoverRequest(base).ok).toBe(true);
    expect(parseCoverRequest({ ...base, seeds: [1, 2, 3, 4] }).ok).toBe(false);
    expect(parseCoverRequest({ ...base, seeds: [1, 2, 3, 4, 2 ** 32] }).ok).toBe(false);
    expect(parseCoverRequest({ ...base, coverId: "cov-xyz" }).ok).toBe(false);
    expect(parseCoverRequest({ ...base, max_duration: 120 }).ok).toBe(false);
    expect(parseCoverRequest({ ...base, temperature: 1 }).ok).toBe(false);
    expect(parseCoverRequest({ ...base, style: "" }).ok).toBe(false);
    expect(parseCoverRequest({ ...base, endS: 12 }).ok).toBe(false);
    expect(parseCoverRequest({ ...base, startS: 0, endS: 400 }).ok).toBe(false);
    expect(parseCoverRequest({ ...base, extra: 1 }).ok).toBe(false);
    const { by: _by, ...unsigned } = base;
    expect(parseCoverRequest(unsigned).ok).toBe(false);
  });
});
