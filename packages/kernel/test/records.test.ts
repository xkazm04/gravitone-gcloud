import { afterEach, describe, expect, it } from "vitest";
import type { Actor } from "@gt/domain/event";
import { jobIdSchema } from "@gt/domain/ids";
import { cancel, enqueue, loadJob, putJob } from "../src/job.ts";
import { openKernel, type Kernel } from "../src/kernel.ts";
import { launchProject, launchRun, planReceipt, rerouteOptions, runReceipt } from "../src/records/launch.ts";
import { listProjects, readProject } from "../src/records/read.ts";
import { compose, discard, releaseHeld, rename, setPart } from "../src/records/write.ts";
import type { Store } from "../src/store.ts";
import { must, steppingClock } from "./helpers.ts";

const OP: Actor = { kind: "operator", id: "op" };
const NOW = Date.parse("2026-10-16T09:00:00Z");
const ctx = { now: NOW };
const lctx = { now: NOW, dryOnly: true };
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
const ok = <T>(o: { ok: true; value: T } | { ok: false; error: { message: string } }): T => {
  if (!o.ok) throw new Error(o.error.message);
  return o.value;
};
const events = (s: Store, type: string) => must(s.read((r) => r.all("SELECT data FROM events WHERE type = ? ORDER BY seq", type)));
const jobCount = (s: Store) => Number(must(s.read((r) => r.get("SELECT count(*) AS n FROM jobs")))?.["n"]);

function film(s: Store, id = "p1") {
  ok(compose(s, { recipe: "film/trailer" }, OP, { id }));
  return must(readProject(s, id, ctx));
}

describe("compose and the plan", () => {
  it("composes a draft from the recipe: every part on its first option, every state draft, one event", () => {
    const s = store();
    const v = film(s);
    expect(v.project).toMatchObject({ id: "p1", rev: 1, title: "Untitled film", recipe: "film/trailer", state: "draft", launched: false, runtimeS: 120 });
    expect(v.parts.map((p) => p.id.slice(3))).toEqual(["research", "script", "frames", "gate:frames", "motion", "score", "gate:score", "cut", "gate:cut", "slot"]);
    expect(v.parts.every((p) => p.state === "draft")).toBe(true);
    const frames = v.parts.find((p) => p.id === "p1/frames");
    expect(frames).toMatchObject({ kind: "frames", units: 24, unitNoun: "plate", unitsRange: [1, 200], chosen: "frames/comfy/flux-2-dev-fp8" });
    expect(v.totals.gates).toBe(0);
    expect(v.lanes.find((l) => l.lane === "gpu.local")).toMatchObject({ jobs: 2, queuePos: 1 });
    expect(events(s, "project.composed")).toHaveLength(1);
  });

  it("changes a part's option and units at its revision, and refuses a stale one with the current revision", () => {
    const s = store();
    film(s);
    const r = setPart(s, { id: "p1", baseRev: 1, partId: "p1/frames", patch: { option: "frames/google/gemini-3.1-flash-image", units: 30 } }, OP);
    expect(ok(r).rev).toBe(2);
    const frames = must(readProject(s, "p1", ctx)).parts.find((p) => p.id === "p1/frames");
    expect(frames && "estimate" in frames ? frames.estimate.usd : -1).toBeCloseTo(30 * 0.045);
    const stale = setPart(s, { id: "p1", baseRev: 1, partId: "p1/frames", patch: { units: 2 } }, OP);
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect([stale.error.code, stale.current?.rev]).toEqual(["conflict", 2]);
    expect(setPart(s, { id: "p1", baseRev: 2, partId: "p1/frames", patch: { option: "frames/nope/x" } }, OP).ok).toBe(false);
    expect(setPart(s, { id: "p1", baseRev: 2, partId: "p1/research", patch: { units: 3 } }, OP).ok).toBe(false);
    expect(setPart(s, { id: "p1", baseRev: 2, partId: "p1/frames", patch: { units: 201 } }, OP).ok).toBe(false);
  });

  it("renames at its revision, and discards a draft out of the list but not out of the ledger", () => {
    const s = store();
    film(s);
    film(s, "p2");
    expect(ok(rename(s, { id: "p1", baseRev: 1, title: "Port strike" }, OP)).rev).toBe(2);
    ok(discard(s, { id: "p2", baseRev: 1 }, OP));
    const list = must(listProjects(s, ctx));
    expect(list.projects.map((p) => [p.id, p.title, p.group])).toEqual([["p1", "Port strike", "plans"]]);
    expect(readProject(s, "p2", ctx).ok).toBe(false);
    expect(events(s, "project.discarded")).toHaveLength(1);
  });

  it("bounds the list and says when it cut it", () => {
    const s = store();
    for (const id of ["a", "b", "c"]) film(s, id);
    const l = must(listProjects(s, ctx, 2));
    expect(l.projects).toHaveLength(2);
    expect(l.truncated).toBe(true);
  });
});

describe("launch: a receipt, then a confirm", () => {
  it("launches on a fresh token: one job per work part, in one transaction, downstream planned", () => {
    const s = store();
    film(s);
    const receipt = must(planReceipt(s, "p1", { mode: "dry" }, ctx));
    expect(receipt.lines).toHaveLength(6);
    const launched = ok(launchProject(s, { id: "p1", baseRev: 1, token: receipt.token, mode: "dry" }, OP, lctx));
    expect(launched.jobIds).toEqual(["research", "script", "frames", "motion", "score", "cut"].map((k) => `job:part:p1/${k}`));
    const v = must(readProject(s, "p1", ctx));
    expect(v.project).toMatchObject({ launched: true, state: "queued", rev: 2 });
    const state = (k: string) => v.parts.find((p) => p.id === `p1/${k}`)?.state;
    expect([state("research"), state("script"), state("gate:frames"), state("slot")]).toEqual(["queued", "queued", "queued", "queued"]);
    const waiting = must(s.read((r) => loadJob(r, "job:part:p1/script"))).job;
    expect(waiting.state).toBe("planned");
    expect(waiting.mode.kind).toBe("dry");
    expect(events(s, "job.held")).toHaveLength(0);
    expect(must(s.read((r) => loadJob(r, "job:part:p1/research"))).job).toMatchObject({ state: "queued", correlation: { projectId: "p1" }, steer: { pin: "claude-cli" } });
    expect(events(s, "project.launched")).toHaveLength(1);
  });

  it("refuses a stale token with the fresh receipt, and writes nothing", () => {
    const s = store();
    film(s);
    const receipt = must(planReceipt(s, "p1", { mode: "dry" }, ctx));
    must(enqueue(s, { id: "job:run:elsewhere", of: { kind: "run", id: "elsewhere" }, producer: "research", lane: "seat.text" }, OP));
    const r = launchProject(s, { id: "p1", baseRev: 1, token: receipt.token, mode: "dry" }, OP, lctx);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("conflict");
      expect(r.fresh?.token).not.toBe(receipt.token);
    }
    expect(jobCount(s)).toBe(1);
    expect(must(readProject(s, "p1", ctx)).project.launched).toBe(false);
  });

  it("launches a receipt over its ceiling - a stop point, not a refusal - with the ceiling on the job", () => {
    const s = store();
    ok(compose(s, { recipe: "article/post", topic: "provider routing" }, OP, { id: "a1" }));
    const capped = must(planReceipt(s, "a1", { mode: "dry", ceilingUsd: 50 }, ctx));
    expect(capped.overCeiling).toBe(true);
    ok(launchProject(s, { id: "a1", baseRev: 1, token: capped.token, mode: "dry", ceilingUsd: 50 }, OP, lctx));
    expect(must(s.read((r) => loadJob(r, "job:part:a1/article"))).job.ceilingUsd).toBe(50);
    expect(String(events(s, "project.launched")[0]?.["data"])).toContain('"overCeiling":true');
  });

  it("refuses a live launch under dry-only, and arms one outside it", () => {
    const s = store();
    ok(compose(s, { recipe: "article/post", topic: "provider routing" }, OP, { id: "a1" }));
    const live = must(planReceipt(s, "a1", { mode: "live" }, ctx));
    const refused = launchProject(s, { id: "a1", baseRev: 1, token: live.token, mode: "live" }, OP, lctx);
    expect(refused.ok ? "" : refused.error.code).toBe("refused");
    expect(jobCount(s)).toBe(0);
    const armed = launchProject(s, { id: "a1", baseRev: 1, token: live.token, mode: "live" }, OP, { now: NOW, dryOnly: false });
    expect(armed.ok).toBe(true);
    expect(must(s.read((r) => loadJob(r, "job:part:a1/article"))).job.mode).toMatchObject({ kind: "live", arm: { by: OP } });
  });

  it("derives part and project state from the jobs, and releases a planned job once its upstream is ratified", () => {
    const s = store();
    film(s);
    const receipt = must(planReceipt(s, "p1", { mode: "dry" }, ctx));
    ok(launchProject(s, { id: "p1", baseRev: 1, token: receipt.token, mode: "dry" }, OP, lctx));
    expect(must(releaseHeld(s, "p1", OP, ctx))).toEqual([]);
    must(s.tx((t) => putJob(t, { ...loadJob(t, "job:part:p1/research").job, state: "done" })));
    expect(must(releaseHeld(s, "p1", OP, ctx))).toEqual(["job:part:p1/script"]);
    expect(must(s.read((r) => loadJob(r, "job:part:p1/script"))).job.state).toBe("queued");
    expect(events(s, "job.released")).toHaveLength(1);
    expect(must(releaseHeld(s, "p1", OP, ctx))).toEqual([]);
    must(cancel(s, jobIdSchema.parse("job:part:p1/script"), OP));
    const v = must(readProject(s, "p1", ctx));
    expect(v.parts.find((p) => p.id === "p1/script")?.state).toBe("failed");
    expect(v.parts.find((p) => p.id === "p1/frames")?.state).toBe("blocked");
    expect(v.project.state).toBe("blocked");
    expect(must(listProjects(s, ctx)).projects[0]?.group).toBe("blocked");
  });

  it("refuses to change, discard or re-launch a launched plan", () => {
    const s = store();
    film(s);
    const receipt = must(planReceipt(s, "p1", { mode: "dry" }, ctx));
    ok(launchProject(s, { id: "p1", baseRev: 1, token: receipt.token, mode: "dry" }, OP, lctx));
    for (const r of [setPart(s, { id: "p1", baseRev: 2, partId: "p1/frames", patch: { units: 3 } }, OP), discard(s, { id: "p1", baseRev: 2 }, OP)]) expect(r.ok ? "" : r.error.code).toBe("refused");
    expect(planReceipt(s, "p1", { mode: "dry" }, ctx).ok).toBe(false);
  });
});

describe("Floor runs", () => {
  const input = { lane: "audio", text: "a slow bed under the rain", kind: "music" };
  it("prices a composer launch, and launches the Run and its one Job together", () => {
    const s = store();
    const receipt = must(runReceipt(s, input, { mode: "dry" }, ctx));
    expect(receipt.subject).toEqual({ kind: "run", lane: "audio" });
    expect(receipt.lines[0]).toMatchObject({ lane: "box.chrome", provider: "suno", units: 2, usd: null });
    expect(receipt.queuePos).toBe(1);
    const r = ok(launchRun(s, { input, token: receipt.token, mode: "dry" }, OP, { ...lctx, id: "r1" }));
    expect(r).toEqual({ runId: "r1", jobId: "job:run:r1" });
    expect(must(s.read((x) => loadJob(x, "job:run:r1"))).job).toMatchObject({ producer: "suno", lane: "box.chrome", correlation: { runId: "r1" } });
    expect(must(runReceipt(s, input, { mode: "dry" }, ctx)).queuePos).toBe(2);
    const stale = launchRun(s, { input, token: receipt.token, mode: "dry" }, OP, { ...lctx, id: "r2" });
    expect(stale.ok ? "" : stale.error.code).toBe("conflict");
    expect(jobCount(s)).toBe(1);
  });

  it("previews every re-route of a run and of a part, marking the current option", () => {
    const s = store();
    const receipt = must(runReceipt(s, input, { mode: "dry" }, ctx));
    ok(launchRun(s, { input, token: receipt.token, mode: "dry" }, OP, { ...lctx, id: "r1" }));
    const opts = must(rerouteOptions(s, "job:run:r1", ctx));
    expect(opts.map((o) => [o.option.provider, o.current])).toEqual([
      ["suno", true],
      ["elevenlabs", false],
    ]);
    film(s);
    ok(launchProject(s, { id: "p1", baseRev: 1, token: must(planReceipt(s, "p1", { mode: "dry" }, ctx)).token, mode: "dry" }, OP, lctx));
    const frames = must(rerouteOptions(s, "job:part:p1/frames", ctx));
    const nano = frames.find((o) => o.option.provider === "google");
    expect(nano?.dEtaS).toBeLessThan(0);
    expect(nano?.dUsd).toBeCloseTo(24 * 0.045);
  });
});
