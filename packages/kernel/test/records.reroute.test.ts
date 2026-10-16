import { afterEach, describe, expect, it } from "vitest";
import type { Actor } from "@gt/domain/event";
import { AppError } from "@gt/domain/errors";
import { enqueue, loadJob, putJob } from "../src/job.ts";
import { openKernel, type Kernel } from "../src/kernel.ts";
import { launchProject, planReceipt } from "../src/records/launch.ts";
import { readProject } from "../src/records/read.ts";
import { moveRouteIn, relaunchIn, rerouteIn, routeKind } from "../src/records/reroute.ts";
import { compose } from "../src/records/write.ts";
import type { RouteOutcome } from "../src/router/types.ts";
import type { Store } from "../src/store.ts";
import { must, steppingClock } from "./helpers.ts";

// A RE-ROUTE IS ONE RECORDS VERB IN ONE TRANSACTION (L41): the job's steer (or its successor on
// another lane) and the part row's option move together, or neither does.

const OP: Actor = { kind: "operator", id: "op" };
const NOW = Date.parse("2026-10-16T09:00:00Z");
let open: Kernel[] = [];
afterEach(() => {
  for (const k of open) k.close();
  open = [];
});
function store(): Store {
  const k = must(openKernel(":memory:", { clock: steppingClock("2026-10-16T08:00:00.000Z") }));
  open.push(k);
  return k.store;
}
function launched(s: Store, recipe: string, id = "p1"): void {
  must(compose(s, { recipe }, OP, { id }));
  const receipt = must(planReceipt(s, id, { mode: "dry" }, { now: NOW }));
  must(launchProject(s, { id, baseRev: 1, token: receipt.token, mode: "dry" }, OP, { now: NOW, dryOnly: true }));
}
const routed = (): RouteOutcome => ({
  kind: "routed",
  planKey: "generate",
  chain: ["google"],
  choice: { provider: "google", model: "m", lane: "cloud.google", transport: "cloud", rung: "preferred", quote: { usd: 0.04, basis: "estimated", note: "table rate" }, seconds: 1 },
  trail: [],
});
const job = (s: Store, id: string) => must(s.read((r) => loadJob(r, id).job));
const ordOf = (s: Store, id: string) => must(s.read((r) => r.get("SELECT ord FROM jobs WHERE id = ?", id)?.["ord"]));
const partOf = (s: Store, id: string) => must(readProject(s, "p1", { now: NOW })).parts.find((p) => p.id === id);
const GOOGLE = "frames/google/gemini-3.1-flash-image";

describe("relaunchIn - another lane", () => {
  it("cancels the job naming its successor, enqueues it in the same queue place on the target's lane, and moves the part row to it", () => {
    const s = store();
    launched(s, "film/trailer");
    const old = "job:part:p1/frames";
    const ord = ordOf(s, old);
    // Somebody is already in the target lane's line: the successor still takes the old job's place, not the back.
    must(enqueue(s, { id: "job:run:other", of: { kind: "run", id: "other" }, producer: "extract", lane: "cloud.google" }, OP));
    expect(ordOf(s, "job:run:other")).toBe(ord);
    expect(must(s.read((r) => routeKind(r, { jobId: old, key: GOOGLE, now: NOW, judge: routed })))).toBe("relaunch");
    const moved = must(s.tx((t) => moveRouteIn(t, { jobId: old, key: GOOGLE, now: NOW, judge: routed }, OP)));
    expect(moved).toMatchObject({ how: "relaunch", jobId: `${old}~2`, target: { key: GOOGLE, lane: "cloud.google" } });
    expect(job(s, old).state).toBe("cancelled");
    expect(job(s, `${old}~2`)).toMatchObject({ state: "planned", lane: "cloud.google", producer: "frames", steer: { pin: "google" }, correlation: { projectId: "p1" } });
    expect(ordOf(s, `${old}~2`)).toBe(ord);
    expect(partOf(s, "p1/frames")).toMatchObject({ chosen: GOOGLE, jobId: `${old}~2` });
    const cancelled = must(s.read((r) => r.get("SELECT data FROM events WHERE type = 'job.cancelled' AND subject_id = ?", old)?.["data"]));
    expect(String(cancelled)).toContain(`"reroutedTo":"${old}~2"`);
  });

  it("keeps a paused job paused, and refuses a running or finished one", () => {
    const s = store();
    launched(s, "film/trailer");
    const id = "job:part:p1/research";
    must(s.tx((t) => putJob(t, { ...loadJob(t, id).job, state: "paused" })));
    const moved = must(s.tx((t) => relaunchIn(t, { jobId: id, key: "research/google/gemini-3.1-pro-preview", now: NOW }, OP)));
    expect(job(s, moved.jobId).state).toBe("paused");
    must(s.tx((t) => putJob(t, { ...loadJob(t, moved.jobId).job, state: "done" })));
    const done = s.tx((t) => relaunchIn(t, { jobId: moved.jobId, key: "research/claude-cli/claude-opus-5", now: NOW }, OP));
    expect(done.ok ? "moved" : done.error.code).toBe("refused");
  });
});

describe("rerouteIn - the same lane", () => {
  it("steers the job in place and moves the row's option, in the caller's transaction: a rollback leaves neither", () => {
    const s = store();
    launched(s, "album-video");
    const id = "job:part:p1/render";
    const options = must(readProject(s, "p1", { now: NOW })).parts.find((p) => p.id === "p1/render");
    const draft = options !== undefined && "options" in options ? options.options.find((o) => o.model === "libx264-draft") : undefined;
    if (draft === undefined) throw new Error("no draft option");
    const before = partOf(s, "p1/render");
    expect(job(s, id).steer).toEqual({ pin: "ffmpeg" });
    // The caller's transaction throws after the verb: nothing the verb wrote survives.
    const rolled = s.tx((t) => {
      rerouteIn(t, { jobId: id, key: draft.key, now: NOW, judge: routed }, OP);
      throw new AppError("conflict", "the caller changed its mind");
    });
    expect(rolled.ok).toBe(false);
    expect(partOf(s, "p1/render")).toEqual(before);
    expect(job(s, id).steer).toEqual({ pin: "ffmpeg" });
    const moved = must(s.tx((t) => moveRouteIn(t, { jobId: id, key: draft.key, now: NOW, judge: routed }, OP)));
    expect(moved).toMatchObject({ how: "steer", jobId: id });
    expect(job(s, id)).toMatchObject({ state: "planned", lane: "box.render", steer: {} });
    expect(partOf(s, "p1/render")).toMatchObject({ chosen: draft.key, jobId: id });
  });

  it("refuses to steer across lanes (that is a relaunch) and refuses a target the router refuses", () => {
    const s = store();
    launched(s, "film/trailer");
    const cross = s.tx((t) => rerouteIn(t, { jobId: "job:part:p1/frames", key: GOOGLE, now: NOW, judge: routed }, OP));
    expect(cross.ok ? "steered" : cross.error.message).toContain("relaunch it");
    const refusing = (): RouteOutcome => ({ kind: "refused", reason: "not-permitted", code: "refused", message: "no such pin", trail: [] });
    const refused = s.tx((t) => moveRouteIn(t, { jobId: "job:part:p1/frames", key: GOOGLE, now: NOW, judge: refusing }, OP));
    expect(refused.ok ? "moved" : refused.error.message).toContain("no such pin");
    expect(job(s, "job:part:p1/frames").state).toBe("planned");
  });
});
