import { describe, expect, it } from "vitest";

import type { Job } from "@gt/domain/job";
import type { StepContext } from "@gt/kernel/job-core";

import { COVER_BRIEF_STEPS, coverBriefPlan, defineCoverBrief, listenOf, listenStep, MEASURE_STEP, parseBriefAnswer, parseCoverBriefRequest, WRITE_STEP } from "../src/cover-brief/define.ts";

// The brief's plan, request and answer door (spark track-mirror-studio, cover brief WP-A), pure: five steps in order,
// only the missing ones planned, an unknown step fatal, a malformed request refused, the writer's answer held to the
// section rules. The bound job is tests/next-server/cover-brief.test.ts.

const booked = (...names: string[]) => new Map(names.map((n) => [n, {} as never]));
const base = {
  coverId: "cov-0123456789ab",
  durationS: 215.7,
  model: "gemini-3.8-flash",
  by: "op",
  estimates: { measure: { seconds: 30, usd: 0 }, listen: { seconds: 40, usd: 0.01 }, write: { seconds: 180, usd: null, unpricedReason: "the seat" } },
};
const answer = { style: "Lofi Hip Hop, instrumental, 808 sub bass", sourceStyle: "A slow instrumental with a sub bass", section: { startS: 0, endS: 215.7 }, lyrics: "", why: "Two reads of three said lo-fi hip hop.", agreed: 2 };

describe("the brief plan", () => {
  it("plans measure, listen-1..3 then write, and exactly the steps not yet booked", () => {
    const r = parseCoverBriefRequest(base);
    if (!r.ok) throw r.error;
    expect(COVER_BRIEF_STEPS).toEqual(["measure", "listen-1", "listen-2", "listen-3", "write"]);
    expect(coverBriefPlan(r.value, booked()).map((s) => s.name)).toEqual(COVER_BRIEF_STEPS);
    expect(coverBriefPlan(r.value, booked(MEASURE_STEP, listenStep(1), listenStep(2))).map((s) => s.name)).toEqual(["listen-3", "write"]);
    expect(coverBriefPlan(r.value, booked(...COVER_BRIEF_STEPS))).toEqual([]);
    expect(coverBriefPlan(r.value, booked()).map((s) => s.estimate.seconds)).toEqual([30, 40, 40, 40, 180]);
  });

  it("reads a listen from its step name, and nothing from a step that listens to nothing", () => {
    expect([listenOf("listen-1"), listenOf("listen-3")]).toEqual([1, 3]);
    expect([listenOf("listen-0"), listenOf("listen-4"), listenOf(WRITE_STEP), listenOf("listen-01")]).toEqual([undefined, undefined, undefined, undefined]);
  });

  it("an unknown step is fatal", async () => {
    const r = parseCoverBriefRequest(base);
    if (!r.ok) throw r.error;
    const req = r.value;
    const fail = async () => ({ kind: "fatal" as const, code: "internal" as const, message: "not this one" });
    const p = defineCoverBrief("seat.text", { request: () => ({ ok: true, value: req }), measure: fail, listen: fail, write: fail, ended: async () => undefined });
    const job = { id: "job:cover-brief:cov-0123456789ab" } as Job;
    const out = await p.perform({ name: "listen-4", estimate: { seconds: 1, usd: 0 } }, { job } as StepContext);
    expect(out).toEqual({ kind: "fatal", code: "internal", message: "a cover brief job has no step listen-4" });
  });

  it("refuses a malformed request at the door", () => {
    expect(parseCoverBriefRequest(base).ok).toBe(true);
    expect(parseCoverBriefRequest({ ...base, coverId: "cov-xyz" }).ok).toBe(false);
    expect(parseCoverBriefRequest({ ...base, durationS: 0 }).ok).toBe(false);
    expect(parseCoverBriefRequest({ ...base, extra: 1 }).ok).toBe(false);
    expect(parseCoverBriefRequest({ ...base, estimates: { measure: base.estimates.measure, listen: base.estimates.listen } }).ok).toBe(false);
    const { by: _by, ...unsigned } = base;
    expect(parseCoverBriefRequest(unsigned).ok).toBe(false);
  });
});

describe("the writer's answer at its door", () => {
  it("covers a song that fits whole, whatever section the writer gave", () => {
    const r = parseBriefAnswer({ ...answer, section: { startS: 30, endS: 120 } }, 215.7);
    expect(r.ok && r.value.section).toEqual({ startS: 0, endS: 215.7 });
  });

  it("holds a longer song's section inside the song and between the two limits, trimming a frame of overshoot", () => {
    const why = (section: { startS: number; endS: number }) => {
      const r = parseBriefAnswer({ ...answer, section }, 420);
      return r.ok ? r.value.section : r.error.message;
    };
    expect(why({ startS: 40, endS: 380 })).toEqual({ startS: 40, endS: 380 });
    expect(why({ startS: 70, endS: 421 })).toEqual({ startS: 70, endS: 420 });
    expect(why({ startS: 0, endS: 400 })).toBe("brief: section 0-400 s is longer than 360 s");
    expect(why({ startS: 100, endS: 105 })).toBe("brief: section 100-105 s is shorter than 10 s");
    expect(why({ startS: 100, endS: 430 })).toBe("brief: section 100-430 s ends past the song's 420 s");
    expect(why({ startS: 200, endS: 150 })).toBe("brief: section 200-150 s ends before it starts");
  });

  it("refuses lyrics, a missing reason, an agreement past three and an extra key", () => {
    expect(parseBriefAnswer(answer, 215.7).ok).toBe(true);
    expect(parseBriefAnswer({ ...answer, lyrics: "[Verse]\nthe rain on the glass" }, 215.7).ok).toBe(false);
    expect(parseBriefAnswer({ ...answer, why: "" }, 215.7).ok).toBe(false);
    expect(parseBriefAnswer({ ...answer, agreed: 4 }, 215.7).ok).toBe(false);
    expect(parseBriefAnswer({ ...answer, style: "x".repeat(1001) }, 215.7).ok).toBe(false);
    expect(parseBriefAnswer({ ...answer, title: "Tears" }, 215.7).ok).toBe(false);
  });
});
