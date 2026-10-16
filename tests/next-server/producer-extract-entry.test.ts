import { ROOT, disposeRoot, galleryDir, uploads } from "./producer-extract-harness.ts";

import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));
// The guard is not what is under test here (tests/next-server/route.test.ts is); the route behind it is.
vi.mock("../../lib/apiAuth.ts", () => ({ guardRequest: async () => null, guardAccessOnly: async () => null }));

import { usableFix as packageFix } from "@gt/producers/extract/units";

import { runCli } from "../../pipeline/foundry/extract.mts";
import { POST } from "../../app/api/foundry/extract/[id]/step/route.ts";
import { createRun } from "../../lib/foundry/extract/store.ts";
import { usableFix as v1Fix } from "../../lib/foundry/extract/vocabulary.ts";
import { closeKernel, kernel } from "../../lib/kernelStore.ts";
import { loadJob } from "@gt/kernel/job";
import { loadRun } from "@gt/kernel/records/schema";
import type { Result } from "@gt/domain/errors";

const must = <T,>(r: Result<T>): T => {
  if (!r.ok) throw r.error;
  return r.value;
};

// The extract job's two doors - the CLI and the /step route - act on THE SAME
// job record: the CLI enqueues, the route kicks it, both name one job id. The
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

const step = (runId: string, body: unknown) =>
  POST(new Request(`http://127.0.0.1:3211/api/foundry/extract/${runId}/step`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }), { params: Promise.resolve({ id: runId }) });
const bodyOf = async (r: Response) => z.record(z.string(), z.unknown()).parse(await r.json());

describe("the CLI and the route act on the same job", () => {
  it("the CLI enqueues a dry job and leaves it (--detach); the route kicks THAT job, and a second kick finds the same one", async () => {
    const r = await cli([galleryDir("detach", 2), "--slug", "detach", "--dry", "--detach", "--json"]);
    expect(r.code, r.err).toBe(0);
    const d = parseDoc(r.out);
    expect(d.job?.state).toBe("queued");
    expect(d.job?.mode).toBe("dry");
    const runId = d.runId ?? "";
    expect(d.jobId).toBe(`job:run:${runId}`);

    const kick = await step(runId, {});
    expect(kick.status).toBe(200);
    const k = await bodyOf(kick);
    expect(k["jobId"]).toBe(d.jobId);
    expect(k["kicked"]).toBe(true);
    expect(["yielded", "done"]).toContain(k["outcome"]);

    // The CLI reads the job the route moved.
    const s = await cli(["--status", runId, "--json"]);
    expect(s.code).toBe(0);
    expect(parseDoc(s.out).jobId).toBe(d.jobId);
  });

  it("the route alone: an empty body is the receipt, a stale token is 409 with the fresh one, the fresh one enqueues and kicks", async () => {
    // A run made by v1's create route (POST /api/foundry/extract) has no job yet.
    const m = await createRun("route-alone", uploads(1), { rounds: 1, replicas: 1, transfers: 0 });
    const first = await bodyOf(await step(m.id, {}));
    const receipt = z.object({ token: z.string(), mode: z.literal("dry") }).loose().parse(first["receipt"]);
    const stale = await step(m.id, { token: "not-the-token" });
    expect(stale.status).toBe(409);
    const fresh = z.object({ token: z.string() }).loose().parse((await bodyOf(stale))["fresh"]);
    expect(fresh.token).toBe(receipt.token);
    const go = await step(m.id, { token: fresh.token });
    expect(go.status).toBe(200);
    const g = await bodyOf(go);
    expect(g["jobId"]).toBe(`job:run:${m.id}`);
    expect(g["kicked"]).toBe(true);
    // Confirming again launches nothing new: the run's job is the same job.
    const again = await bodyOf(await step(m.id, { token: fresh.token }));
    expect(again["jobId"]).toBe(`job:run:${m.id}`);
  });

  it("the route refuses a live arm under GRAVITONE_DRY_ONLY", async () => {
    const m = await createRun("route-live", uploads(1), {});
    const rc = z.object({ token: z.string() }).loose().parse((await bodyOf(await step(m.id, { mode: "live" })))["receipt"]);
    const r = await step(m.id, { mode: "live", token: rc.token });
    expect(r.status).toBe(403);
    expect(String((await bodyOf(r))["detail"])).toMatch(/GRAVITONE_DRY_ONLY/);
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
