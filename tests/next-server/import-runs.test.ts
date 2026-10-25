import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { recordImportedJobIn } from "@gt/kernel/job";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { reconcileJobSpend } from "@gt/kernel/spend/projection";
import type { Store } from "@gt/kernel/store";

import { ARTICLE_STATUSES, WORKING } from "../../lib/articles/types.ts";
import { listV1Runs } from "../../lib/import/runSources.ts";
import { IMPORT_RUN_ACTOR, importRuns, type V1Run } from "../../lib/import/runs.ts";
import { clearV1, seedV1, v1Archive } from "./import-harness.ts";

// THE ONE-TIME IMPORTERS (Phase 4 wave D, L42): v1 runs that predate the job system become Run
// rows with ONE terminal job each; and both CLIs (`pipeline/import/runs.mts`, `projects.mts`) are
// dry by default, idempotent, and answer 0 / 1 / 2.

const ROOT = process.cwd();
const dirs: string[] = [];
let open: Kernel[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});
afterEach(() => {
  for (const k of open) k.close();
  open = [];
});

function temp(prefix: string): string {
  const d = mkdtempSync(path.join(tmpdir(), prefix));
  dirs.push(d);
  return d;
}
function store(): Store {
  const k = openKernel(path.join(temp("gt-import-runs-"), "k.sqlite"));
  if (!k.ok) throw k.error;
  open.push(k.value);
  return k.value.store;
}

/** One scan of 5,000 jobs is milliseconds; 500 of them (the per-run json_extract) is seconds. */
const JOBS_SCAN_BUDGET_MS = 500;

const RUNS: V1Run[] = [
  { source: "forge", runId: "forge:r1", input: { producer: "forge", plan: "plan-a" }, units: 4, at: "2026-09-01T10:00:00Z", state: "done" },
  { source: "extract", runId: "ex-1", input: { producer: "extract", slug: "heist", sources: 3, rounds: 2, replicas: 1, grouping: "engine" }, at: "2026-09-02T10:00:00Z", state: "failed", error: "vision engine refused the gallery" },
  { source: "suno", runId: "suno.sj-1", input: { producer: "suno", proposal: "sj-1" }, at: "2026-09-03T10:00:00Z", state: "live" },
  { source: "mv", runId: "mv.mj-1.1", input: { producer: "mv", track: "mj-1" }, at: "2026-09-04T10:00:00Z", state: "done", job: "job:run:mv.mj-1.1" },
];

describe("v1 runs as Run rows with a terminal job", () => {
  it("imports done and failed as v1 recorded them; skips a working run and one already on a job", () => {
    const s = store();
    const r = importRuns(s, RUNS, { dry: false, now: Date.parse("2026-10-16T09:00:00Z") });
    expect(r.ok && r.value.map((x) => [x.runId, x.outcome])).toEqual([
      ["forge:r1", "imported"],
      ["ex-1", "imported"],
      ["suno.sj-1", "skipped"],
      ["mv.mj-1.1", "skipped"],
    ]);
    const rows = s.read((x) => x.all("SELECT id, state, json_extract(record, '$.error.message') AS e FROM jobs ORDER BY id"));
    expect(rows.ok && rows.value.map((x) => [x["id"], x["state"], x["e"]])).toEqual([
      ["job:run:ex-1", "failed", "vision engine refused the gallery"],
      ["job:run:forge:r1", "done", null],
    ]);
    // The Run row keeps v1's instant, and the ledger the import's provenance.
    const run = s.read((x) => x.get("SELECT created_at FROM runs WHERE id = 'forge:r1'")?.["created_at"]);
    expect(run.ok && run.value).toBe("2026-09-01T10:00:00.000Z");
    const ev = s.read((x) => x.all("SELECT type, occurred_at, json_extract(data, '$.imported') AS i FROM events WHERE type IN ('job.imported', 'run.imported') ORDER BY seq"));
    expect(ev.ok && ev.value.every((e) => e["i"] === 1)).toBe(true);
    expect(ev.ok && ev.value.length).toBe(4);
    // Nothing spent: the job projection reconciles to the (empty) meter.
    const rec = s.read((x) => ["job:run:forge:r1", "job:run:ex-1"].map((id) => reconcileJobSpend(x, id)));
    expect(rec.ok && rec.value.every((x) => x.drift === undefined && x.job.usd === 0)).toBe(true);
  });

  it("writes nothing dry, and nothing twice", () => {
    const s = store();
    const dry = importRuns(s, RUNS, { dry: true, now: 0 });
    expect(dry.ok && dry.value.filter((x) => x.outcome === "would-import").length).toBe(2);
    expect(s.read((x) => x.get("SELECT count(*) AS n FROM runs")?.["n"])).toEqual({ ok: true, value: 0 });
    importRuns(s, RUNS, { dry: false, now: 0 });
    const again = importRuns(s, RUNS, { dry: false, now: 0 });
    expect(again.ok && again.value.map((x) => x.outcome)).toEqual(["skipped", "skipped", "skipped", "skipped"]);
  });
});

describe("a dry import reports what the wet one will do", () => {
  it("refuses a run the Run door refuses, with the door's sentence, and writes nothing", () => {
    const s = store();
    const bad: V1Run = { source: "extract", runId: "ex-bad", input: { producer: "extract", slug: "Not A Slug!", sources: 3, rounds: 2, replicas: 1, grouping: "engine" }, at: "2026-09-02T10:00:00Z", state: "done" };
    const runs = [RUNS[0]!, bad];
    const dry = importRuns(s, runs, { dry: true, now: 0 });
    const wet = importRuns(store(), runs, { dry: false, now: 0 });
    expect(wet.ok && wet.value.map((x) => x.outcome)).toEqual(["imported", "refused"]);
    expect(dry.ok && dry.value.map((x) => [x.runId, x.outcome === "would-import" ? "imported" : x.outcome])).toEqual([["forge:r1", "imported"], ["ex-bad", "refused"]]);
    expect(dry.ok && dry.value[1]!.reason).toBe(wet.ok ? wet.value[1]!.reason : undefined);
    expect(s.read((x) => x.get("SELECT (SELECT count(*) FROM runs) + (SELECT count(*) FROM jobs) + (SELECT count(*) FROM events WHERE type LIKE '%imported') AS n")?.["n"])).toEqual({ ok: true, value: 0 });
  });
});

describe("a dry import over a populated store", () => {
  it("answers 500 runs against 5,000 jobs from one read of the jobs, not one scan per run", () => {
    const s = store();
    const T = Date.parse("2026-10-16T09:00:00Z");
    const seeded = s.tx((t) => {
      for (let i = 0; i < 5000; i++) recordImportedJobIn(t, { id: `job:run:old-${i}`, of: { kind: "run", id: `old-${i}` }, producer: "forge", lane: "box.render", correlation: { runId: `old-${i}` }, units: 1 }, IMPORT_RUN_ACTOR);
    });
    expect(seeded.ok).toBe(true);
    const runs: V1Run[] = Array.from({ length: 500 }, (_, i) => ({ source: "forge", runId: i % 50 === 0 ? `old-${i}` : `forge:new-${i}`, input: { producer: "forge", plan: "plan-a" }, units: 1, at: "2026-09-01T10:00:00Z", state: "done" as const }));
    const t0 = performance.now();
    const dry = importRuns(s, runs, { dry: true, now: T });
    const ms = performance.now() - t0;
    console.log(`import-runs dry 500 runs / 5000 jobs: ${ms.toFixed(0)} ms`);
    expect(dry.ok && dry.value.filter((x) => x.outcome === "skipped").map((x) => x.reason)).toEqual(Array(10).fill("a job already serves this id"));
    expect(dry.ok && dry.value.filter((x) => x.outcome === "would-import")).toHaveLength(490);
    expect(ms).toBeLessThan(JOBS_SCAN_BUDGET_MS);
  });
});

describe("the v1 stores the importer reads", () => {
  it("reports a record whose instant no Date can hold as unread, and lists every other run of every store", async () => {
    const dir = temp("gt-import-sources-");
    const was = process.env["SOUND_STORE_DIR"];
    process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
    try {
      mkdirSync(path.join(dir, "sound"), { recursive: true });
      const at = Date.parse("2026-09-04T10:00:00Z");
      writeFileSync(path.join(dir, "sound", "mv.json"), JSON.stringify({ version: 1, queue: { running: false }, jobs: [{ id: "mj-1", state: "done", enqueuedAt: at }, { id: "mj-2", state: "done", enqueuedAt: 1e20 }], imports: [], progress: {} }));
      const r = await listV1Runs(["mv"]);
      if (!r.ok) throw r.error;
      expect(r.value.runs.map((x) => [x.runId, x.at])).toEqual([[`mv.mj-1.${at}`, "2026-09-04T10:00:00.000Z"]]);
      expect(r.value.unread).toHaveLength(1);
      expect(r.value.unread[0]).toMatch(/^mv mj-2: enqueuedAt /);
    } finally {
      if (was === undefined) delete process.env["SOUND_STORE_DIR"];
      else process.env["SOUND_STORE_DIR"] = was;
    }
  });

  it("reads an article run as working by the article store's own WORKING set, failed as failed, the rest done", async () => {
    const dir = temp("gt-import-articles-");
    const was = process.env["ARTICLES_STORE_DIR"];
    process.env["ARTICLES_STORE_DIR"] = dir;
    try {
      for (const status of ARTICLE_STATUSES) {
        mkdirSync(path.join(dir, `a-${status}`));
        writeFileSync(path.join(dir, `a-${status}`, "run.json"), JSON.stringify({ id: `a-${status}`, status, createdAt: "2026-09-05T10:00:00.000Z", topic: { kind: "free", text: "glass harbors" } }));
      }
      const r = await listV1Runs(["article"]);
      if (!r.ok) throw r.error;
      const got = Object.fromEntries(r.value.runs.map((x) => [x.runId.slice(2), x.state]));
      expect(got).toEqual(Object.fromEntries(ARTICLE_STATUSES.map((s) => [s, s === "failed" ? "failed" : WORKING.includes(s) ? "live" : "done"])));
      // approved and landing are still the driver's: never imported as finished history.
      expect([got["approved"], got["landing"]]).toEqual(["live", "live"]);
    } finally {
      if (was === undefined) delete process.env["ARTICLES_STORE_DIR"];
      else process.env["ARTICLES_STORE_DIR"] = was;
    }
  });
});

/* ── the CLIs, as an operator runs them ─────────────────────────────────── */

const cli = (script: string, argv: readonly string[], cwd: string) => {
  const env = { ...process.env };
  for (const v of ["GRAVITONE_STORE_PATH", "FOUNDRY_DIR", "SOUND_STORE_DIR", "ARTICLES_STORE_DIR", "STRIPS_STORE_DIR"]) delete env[v];
  const r = spawnSync(process.execPath, [path.join(ROOT, "pipeline", "import", script), ...argv], { cwd, env, encoding: "utf8", timeout: 120_000 });
  return { code: r.status, out: r.stdout, err: r.stderr };
};

describe("pipeline/import/runs.mts over the fixture universe", () => {
  it("is dry by default, writes with --yes, is idempotent, and refuses a bad flag with 2", () => {
    const u = temp("gt-import-cli-");
    execFileSync(process.execPath, [path.join(ROOT, "pipeline", "ledger-sync.mts"), "seed-fixtures"], { cwd: u, env: { ...process.env, NEXT_PUBLIC_GRAVITONE_DATA: "fixtures" }, encoding: "utf8" });
    const db = path.join(u, "k.sqlite");
    const parse = (s: string) => JSON.parse(s) as { dry: boolean; runs: { outcome: string }[] };
    const count = (doc: ReturnType<typeof parse>, o: string) => doc.runs.filter((x) => x.outcome === o).length;
    const dry = cli("runs.mts", ["--fixtures", "--store", db, "--json"], u);
    expect(dry.code, dry.err).toBe(0);
    expect(count(parse(dry.out), "would-import")).toBeGreaterThan(10);
    const yes = cli("runs.mts", ["--fixtures", "--store", db, "--json", "--yes"], u);
    expect(yes.code, yes.err).toBe(0);
    expect(count(parse(yes.out), "imported")).toBe(count(parse(dry.out), "would-import"));
    const again = cli("runs.mts", ["--fixtures", "--store", db, "--json", "--yes"], u);
    expect(count(parse(again.out), "imported")).toBe(0);
    expect(cli("runs.mts", ["--only", "nope"], u).code).toBe(2);
  }, 120_000);
});

describe("pipeline/import/projects.mts", () => {
  beforeEach(async () => {
    await clearV1();
  });

  it("previews dry, imports with --yes, skips on a re-run, refuses a corrupt archive with 1", async () => {
    const seed = await seedV1("uid-cli");
    const u = temp("gt-import-pcli-");
    const file = path.join(u, "account.gravitone");
    writeFileSync(file, await v1Archive(seed.uid));
    const db = path.join(u, "k.sqlite");
    const dry = cli("projects.mts", [file, "--store", db, "--json"], u);
    expect(dry.code, dry.err).toBe(0);
    expect((JSON.parse(dry.out) as { preview: { projects: { outcome: string }[] } }).preview.projects.map((p) => p.outcome)).toEqual(["import", "import", "import", "import"]);
    const yes = cli("projects.mts", [file, "--store", db, "--json", "--yes"], u);
    expect(yes.code, yes.err).toBe(0);
    expect((JSON.parse(yes.out) as { outcomes: { outcome: string }[] }).outcomes.map((o) => o.outcome)).toEqual(["imported", "imported", "imported", "imported"]);
    const again = cli("projects.mts", [file, "--store", db, "--json", "--yes"], u);
    expect((JSON.parse(again.out) as { outcomes: { outcome: string }[] }).outcomes.map((o) => o.outcome)).toEqual(["skipped", "skipped", "skipped", "skipped"]);
    const bad = path.join(u, "bad.gravitone");
    writeFileSync(bad, "not an archive\n");
    const refused = cli("projects.mts", [bad, "--store", db, "--json"], u);
    expect(refused.code).toBe(1);
    expect(JSON.parse(refused.out)).toMatchObject({ detail: "malformed" });
    expect(cli("projects.mts", [], u).code).toBe(2);
  }, 120_000);
});
