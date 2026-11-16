import { describe, expect, it } from "vitest";

import type { Job } from "@gt/domain/job";
import type { StepContext } from "@gt/kernel/job-core";

import { COVER_SUNO_STEPS, coverStep, coverSunoPlan, defineCoverSuno, parseCoverSunoRequest, readStep, stepOf, UPLOAD_STEP } from "../src/cover-suno/define.ts";

// A cover's Suno send, pure (spark suno-covers WP1): five steps in order, only the missing ones planned, the cover steps
// paid in credits, an unknown step fatal, a malformed request refused at the door. The bound job is
// tests/next-server/cover-suno.test.ts.

const booked = (...names: string[]) => new Map(names.map((n) => [n, {} as never]));
const base = {
  coverId: "cov-0123456789ab",
  n: 1,
  style: "Dark synthwave, 100 BPM",
  lyrics: "",
  model: "v6",
  takes: 2,
  by: "op",
  estimates: { upload: { seconds: 30, usd: 0 }, cover: { seconds: 120, usd: null, unpricedReason: "credits" }, read: { seconds: 60, usd: 0 } },
};

describe("the cover-suno plan", () => {
  it("plans upload, cover-1, cover-2, read-1, read-2, and exactly the steps not yet booked", () => {
    const r = parseCoverSunoRequest(base);
    if (!r.ok) throw r.error;
    expect(COVER_SUNO_STEPS).toEqual(["upload", "cover-1", "cover-2", "read-1", "read-2"]);
    expect(coverSunoPlan(r.value, booked()).map((s) => s.name)).toEqual([...COVER_SUNO_STEPS]);
    expect(coverSunoPlan(r.value, booked(UPLOAD_STEP, coverStep(1))).map((s) => s.name)).toEqual(["cover-2", "read-1", "read-2"]);
    expect(coverSunoPlan(r.value, booked(...COVER_SUNO_STEPS))).toEqual([]);
  });

  it("prices only the covers in credits; the upload and the reads are free", () => {
    const r = parseCoverSunoRequest(base);
    if (!r.ok) throw r.error;
    const plan = coverSunoPlan(r.value, booked());
    expect(plan.map((s) => [s.name, s.estimate.usd, s.credit !== undefined])).toEqual([
      ["upload", 0, false],
      ["cover-1", null, true],
      ["cover-2", null, true],
      ["read-1", 0, false],
      ["read-2", 0, false],
    ]);
  });

  it("reads a take from its step name, and nothing from a step it does not have", () => {
    expect([stepOf(coverStep(2)), stepOf(readStep(1))]).toEqual([{ kind: "cover", take: 2 }, { kind: "read", take: 1 }]);
    expect([stepOf("cover-3"), stepOf("read-0"), stepOf("upload"), stepOf("cover-12")]).toEqual([undefined, undefined, undefined, undefined]);
  });

  it("routes each step to its port, and an unknown step is fatal", async () => {
    const r = parseCoverSunoRequest(base);
    if (!r.ok) throw r.error;
    const seen: string[] = [];
    const port = (name: string) => async () => {
      seen.push(name);
      return { kind: "produced" as const, output: {}, costUsd: 0 };
    };
    const p = defineCoverSuno("cloud.suno", {
      request: () => ({ ok: true, value: r.value }),
      upload: port("upload"),
      cover: async (_r, take) => (seen.push(`cover-${take}`), { kind: "produced" as const, output: {}, costUsd: 0 }),
      read: async (_r, take) => (seen.push(`read-${take}`), { kind: "produced" as const, output: {}, costUsd: 0 }),
      ended: async () => undefined,
    });
    const ctx = { job: { id: "job:cover-suno:cov-0123456789ab:1" } as Job } as StepContext;
    for (const name of COVER_SUNO_STEPS) await p.perform({ name, estimate: { seconds: 1, usd: 0 } }, ctx);
    expect(seen).toEqual(["upload", "cover-1", "cover-2", "read-1", "read-2"]);
    const out = await p.perform({ name: "cover-3", estimate: { seconds: 1, usd: 0 } }, ctx);
    expect(out).toEqual({ kind: "fatal", code: "internal", message: "a cover-suno job has no step cover-3" });
  });

  it("refuses a malformed request at the door", () => {
    expect(parseCoverSunoRequest(base).ok).toBe(true);
    expect(parseCoverSunoRequest({ ...base, takes: 3 }).ok).toBe(false);
    expect(parseCoverSunoRequest({ ...base, n: 0 }).ok).toBe(false);
    expect(parseCoverSunoRequest({ ...base, coverId: "cov-xyz" }).ok).toBe(false);
    expect(parseCoverSunoRequest({ ...base, model: "v9" }).ok).toBe(false);
    expect(parseCoverSunoRequest({ ...base, style: "" }).ok).toBe(false);
    expect(parseCoverSunoRequest({ ...base, durationS: 5 }).ok).toBe(false);
    expect(parseCoverSunoRequest({ ...base, extra: 1 }).ok).toBe(false);
    expect(parseCoverSunoRequest({ ...base, uploadClipId: "clip_1", controls: { variety: 2, weirdness: 0 } }).ok).toBe(true);
    const { by: _by, ...unsigned } = base;
    expect(parseCoverSunoRequest(unsigned).ok).toBe(false);
  });
});
