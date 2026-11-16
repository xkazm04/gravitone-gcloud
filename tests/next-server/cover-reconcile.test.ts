// A COVER'S RECORD AGAINST THE JOB STORE (lib/sound/cover/reconcile.ts): a status nothing can advance reads as failed
// with its reason, and a server whose two stores do not belong together is named. The 2026-11-08 case: a brief queued
// into a temporary job store, its "queued" written onto a real cover, four hours of waiting for nothing.
import { describe, expect, it } from "vitest";

import type { CoverRecord } from "@gt/domain/cover";

import { lostJob, reconcileCover, storesDisagree } from "../../lib/sound/cover/reconcile.ts";

const base: CoverRecord = {
  id: "cov-000000000001",
  createdAt: "2026-11-08T09:00:00Z",
  title: "Wood For The Trees",
  rights: "own",
  state: "draft",
  source: { file: "source.mp3", mime: "audio/mpeg", name: "a.mp3", durationS: 200 },
  section: { startS: 0, endS: 200 },
  style: "",
  lyrics: "",
  takes: [],
};
const none = () => false;
const all = () => true;
const brief = (state: "queued" | "running" | "done" | "failed") => ({ state, jobId: "job:cover-brief:cov-000000000001", at: "2026-11-08T09:48:45Z" });

describe("reconcileCover", () => {
  it("reads a queued or running brief with no job as failed, naming the job", () => {
    for (const state of ["queued", "running"] as const) {
      const r = reconcileCover({ ...base, brief: brief(state) }, none);
      expect(r.brief?.state).toBe("failed");
      expect(r.brief?.error).toBe(lostJob("job:cover-brief:cov-000000000001"));
    }
  });
  it("leaves a brief whose job exists, and a finished brief, alone", () => {
    const queued = { ...base, brief: brief("queued") };
    expect(reconcileCover(queued, all)).toBe(queued);
    const done = { ...base, brief: brief("done") };
    expect(reconcileCover(done, none)).toBe(done);
  });
  it("fails a queued or rendering cover with no job, its finished takes kept", () => {
    const c: CoverRecord = {
      ...base,
      state: "rendering",
      jobId: "job:cover:cov-000000000001",
      takes: [{ n: 1, seed: 1, state: "done", file: "takes/s1.flac" }, { n: 2, seed: 2, state: "pending" }],
    };
    const r = reconcileCover(c, none);
    expect(r.state).toBe("failed");
    expect(r.takes[0]).toEqual(c.takes[0]);
    expect(r.takes[1]?.state).toBe("failed");
    expect(r.takes[1]?.error).toBe(lostJob("job:cover:cov-000000000001"));
  });
  it("does not judge a cover that names no job, or one whose job exists", () => {
    const noJob: CoverRecord = { ...base, state: "queued" };
    expect(reconcileCover(noJob, none)).toBe(noJob);
    const has: CoverRecord = { ...base, state: "queued", jobId: "job:cover:cov-000000000001" };
    expect(reconcileCover(has, all)).toBe(has);
  });
});

describe("storesDisagree", () => {
  it("is silent when both stores are default, or both are pointed elsewhere", () => {
    expect(storesDisagree({})).toBeUndefined();
    expect(storesDisagree({ GRAVITONE_STORE_PATH: "/t/a.sqlite", SOUND_STORE_DIR: "/t/sound" })).toBeUndefined();
  });
  it("names a temporary job store over the real covers: the 2026-11-08 case", () => {
    expect(storesDisagree({ GRAVITONE_STORE_PATH: "/t/gt-run/store.sqlite" })).toContain("/t/gt-run/store.sqlite");
  });
  it("names temporary covers over the real job store", () => {
    expect(storesDisagree({ SOUND_STORE_DIR: "/t/sound" })).toContain("/t/sound");
  });
});
