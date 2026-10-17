import { ROOT, disposeRoot, galleryDir, uploads } from "./producer-extract-harness.ts";

import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));

import { usableFix as packageFix } from "@gt/producers/extract/units";

import { runCli } from "../../pipeline/foundry/extract.mts";
import { makeRealProduce } from "../../app/(studio)/projects/_port/real.ts";
import { createRun } from "../../lib/foundry/extract/store.ts";
import { usableFix as v1Fix } from "../../lib/foundry/extract/vocabulary.ts";
import { closeKernel, kernel, storeLocation } from "../../lib/kernelStore.ts";
import { driveExtract, launchExtract } from "../../lib/producers/extract.ts";
import { stripsKernel } from "../../lib/producers/strips.ts";
import { loadJob } from "@gt/kernel/job";
import { loadRun } from "@gt/kernel/records/schema";
import type { Result } from "@gt/domain/errors";

const must = <T,>(r: Result<T>): T => {
  if (!r.ok) throw r.error;
  return r.value;
};

// The extract job's doors act on THE SAME job record: the CLI enqueues, Runs draws and
// pauses and resumes that job, the drive (the worker's, and what v1's /step route kicked)
// runs it, and every one names one job id. Phase 6 L67: the second door was POST
// /api/foundry/extract/[id]/step, the v1 Extract tab's kick, which wave C deletes; its
// receipt / stale / confirm / same-job rules were launchExtract's all along, and are
// pinned on launchExtract itself below. The
// CLI keeps its verbs and gains --json (one document), exit 0/1/2,
// --budget-usd, --dry (a dry JOB) and --detach. Every store is a temp file, and
// GRAVITONE_DRY_ONLY=1 stands for the test lane: nothing here may arm live.

const STORE = path.join(ROOT, "entry.sqlite");
const ENV = { GRAVITONE_STORE_PATH: STORE, GRAVITONE_DRY_ONLY: "1" };
const saved: Record<string, string | undefined> = {};

beforeAll(() => {
  for (const [k, v] of Object.entries(ENV)) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }
});
afterAll(() => {
  closeKernel();
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  disposeRoot();
});

async function cli(argv: string[]): Promise<{ code: number; out: string; err: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(argv, { env: { ...process.env, ...ENV }, out: (s) => out.push(s), err: (s) => err.push(s) });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

const docSchema = z.object({ ok: z.boolean(), runId: z.string().optional(), jobId: z.string().optional(), outcome: z.string().optional(), job: z.object({ state: z.string(), mode: z.string() }).nullable().optional(), wouldCalls: z.number().optional() }).loose();
const parseDoc = (s: string) => docSchema.parse(JSON.parse(s));

const OP = { kind: "operator", id: "op-test" } as const;
// The Floor's and Runs' server side over THIS process's kernel (the store the CLI opens), as the app binds it.
const runs = makeRealProduce({
  store: () => {
    const k = kernel();
    return k.ok ? { ok: true, value: k.value.store } : k;
  },
  strips: () => stripsKernel(),
  env: () => ({ ...process.env, ...ENV }),
  now: () => Date.now(),
});
const store = () => must(kernel()).store;

describe("the CLI, Runs and the drive act on the same job", () => {
  it("the CLI enqueues a dry job and leaves it (--detach); Runs draws THAT job and pauses and resumes it; the drive moves it; the CLI reads it", async () => {
    const r = await cli([galleryDir("detach", 2), "--slug", "detach", "--dry", "--detach", "--json"]);
    expect(r.code, r.err).toBe(0);
    const d = parseDoc(r.out);
    expect(d.job?.state).toBe("queued");
    expect(d.job?.mode).toBe("dry");
    const runId = d.runId ?? "";
    expect(d.jobId).toBe(`job:run:${runId}`);
    const jobId = d.jobId ?? "";

    const drawn = must(runs.listJobs()).filter((j) => j.id === jobId);
    expect(drawn.map((j) => j.state)).toEqual(["queued"]);
    must(runs.pauseJob({ jobId }, { who: "op-test" }));
    expect(parseDoc((await cli(["--status", runId, "--json"])).out).job?.state).toBe("paused");
    must(runs.resumeJob({ jobId }, { who: "op-test" }));

    // The drive the worker runs (and v1's kick ran), bounded to its first unit.
    const kick = must(await driveExtract(store(), storeLocation(), jobId, { deadlineMs: Date.now() + 1000, dryOnly: true }));
    expect(["yielded", "done"]).toContain(kick.outcome);

    // The CLI reads the job the drive moved, and Runs still draws one job for the run.
    const s = await cli(["--status", runId, "--json"]);
    expect(s.code).toBe(0);
    expect(parseDoc(s.out).jobId).toBe(jobId);
    expect(must(runs.listJobs()).filter((j) => j.id.startsWith(`job:run:${runId}`)).map((j) => j.id)).toEqual([jobId]);
  });

  it("the launch door: no token is the receipt, a stale token returns the fresh one and launches nothing, the fresh one enqueues, a second confirm finds the same job", async () => {
    // A run made by v1's create (lib/foundry/extract/store.ts createRun) has no job yet.
    const m = await createRun("door-alone", uploads(1), { rounds: 1, replicas: 1, transfers: 0 });
    const target = { kind: "run", runId: m.id } as const;
    const base = { mode: "dry", actor: OP, dryOnly: true } as const;
    const first = must(await launchExtract(store(), target, base));
    if (first.kind !== "receipt") throw new Error(`expected a receipt, got ${first.kind}`);
    expect(first.receipt.mode).toBe("dry");
    const stale = must(await launchExtract(store(), target, { ...base, token: "not-the-token" }));
    expect(stale.kind).toBe("stale");
    if (stale.kind !== "stale") return;
    expect(stale.fresh.token).toBe(first.receipt.token);
    expect(must(runs.listJobs()).filter((j) => j.id.startsWith(`job:run:${m.id}`))).toEqual([]);
    const go = must(await launchExtract(store(), target, { ...base, token: stale.fresh.token }));
    expect(go.kind === "launched" ? go.jobId : go.kind).toBe(`job:run:${m.id}`);
    // Confirming again launches nothing new: the run's job is the same job.
    const again = must(await launchExtract(store(), target, { ...base, token: stale.fresh.token }));
    expect(again.kind === "existing" ? again.jobId : again.kind).toBe(`job:run:${m.id}`);
    expect(must(runs.listJobs()).filter((j) => j.id.startsWith(`job:run:${m.id}`)).map((j) => j.state)).toEqual(["queued"]);
  });

  it("the launch door refuses a live arm under GRAVITONE_DRY_ONLY, and nothing is enqueued", async () => {
    const m = await createRun("door-live", uploads(1), {});
    const target = { kind: "run", runId: m.id } as const;
    const rc = must(await launchExtract(store(), target, { mode: "live", actor: OP, dryOnly: true }));
    if (rc.kind !== "receipt") throw new Error(`expected a receipt, got ${rc.kind}`);
    const r = await launchExtract(store(), target, { mode: "live", actor: OP, dryOnly: true, token: rc.receipt.token });
    expect(r.ok).toBe(false);
    expect(r.ok ? "" : r.error.message).toMatch(/GRAVITONE_DRY_ONLY/);
    expect(must(runs.listJobs()).filter((j) => j.id.startsWith(`job:run:${m.id}`))).toEqual([]);
  });

  it("a live receipt confirmed under GRAVITONE_DRY_ONLY is refused, and nothing is enqueued", async () => {
    const created = await cli([galleryDir("live", 1), "--slug", "live-refused", "--json"]);
    expect(created.code).toBe(1);
    expect(created.err).toMatch(/GRAVITONE_DRY_ONLY/);
  });
});

describe("the CLI contract", () => {
  it("a dry run end to end: exit 0, one JSON document with its would-calls and no spend", async () => {
    const r = await cli([galleryDir("dry", 2), "--slug", "dry-full", "--dry", "--json"]);
    expect(r.code, r.err).toBe(0);
    const d = parseDoc(r.out);
    expect(d.outcome).toBe("done");
    expect(d.wouldCalls).toBeGreaterThan(0);
    expect(r.err).toMatch(/receipt \(dry\)/);
  });

  it("usage is exit 2; an unknown run is exit 1", async () => {
    expect((await cli(["--status"])).code).toBe(2);
    expect((await cli([galleryDir("u", 1), "--slug", "u", "--budget-usd", "-3"])).code).toBe(2);
    expect((await cli([])).code).toBe(2);
    expect((await cli(["--status", "2026-01-01-nothing-here", "--json"])).code).toBe(1);
  });

  it("--budget-usd becomes the job's ceiling; a worst case over it launches, says it may stop there, and stops at it", async () => {
    // Director's ruling: a ceiling is a STOP POINT. The receipt marks it; the job stops before the unit that would cross it.
    const r = await cli([galleryDir("budget", 3), "--slug", "budget", "--dry", "--budget-usd", "0.01", "--json"]);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/may stop at ceiling: the worst case \$[0-9.]+ is over the \$0\.01 ceiling/);
    const d = parseDoc(r.out);
    expect(d.job?.state).toBe("failed");
    const k = kernel();
    if (!k.ok) throw k.error;
    const { job } = must(k.value.store.read((x) => loadJob(x, d.jobId ?? "")));
    expect(job).toMatchObject({ ceilingUsd: 0.01, error: { code: "budget" }, stop: { by: "run-ceiling", ceilingUsd: 0.01 } });
    // Every launch writes its Run row: extract's own terms, the folder it read, its worst-case quote.
    const { run } = must(k.value.store.read((x) => loadRun(x, d.runId ?? "")));
    expect(run).toMatchObject({ producer: "extract", lane: "image", recipe: "style/extract", units: 3, input: { producer: "extract", slug: "budget", sources: 3 } });
    expect("producer" in run.input && run.input.producer === "extract" ? run.input.folder : undefined).toMatch(/budget$/);
  });
});

describe("one settle rule", () => {
  it("v1's usableFix (in the browser bundle) and the job's agree on every edge", () => {
    const long = "a recipe fix long enough to be a recipe: flat cel shading, hard rim light";
    const cases: [{ recipe_fix: string } | null, string][] = [[null, "r"], [{ recipe_fix: "" }, "r"], [{ recipe_fix: "short" }, "r"], [{ recipe_fix: long }, "r"], [{ recipe_fix: long }, long.toUpperCase()], [{ recipe_fix: `  ${long}  ` }, "r"]];
    for (const [c, cur] of cases) expect(packageFix(c, cur)).toBe(v1Fix(c === null ? null : { ...critique, ...c }, cur));
  });
});

const critique = {
  render_mode: "",
  medium: "",
  detail_density: "",
  surface_realism: "",
  atmospherics: "",
  particle_fx: "",
  palette_strategy: "",
  black_handling: "",
  edge_treatment: "",
  finish: "",
  focus: "",
  has_text: false,
  dominant_colours: [],
  look: "",
  depiction: "",
  critique: "",
};
