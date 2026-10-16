import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { parseJsonAt } from "@gt/domain/door";
import type { PlanView } from "@gt/domain/produce";
import { blobStore, type BlobStore } from "@gt/kernel/blob";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { gateFacts } from "@gt/kernel/parts/gates";
import { launchProject, planReceipt } from "@gt/kernel/records/launch";
import { readProject } from "@gt/kernel/records/read";
import { reconcileJobSpend } from "@gt/kernel/spend/projection";

import { readArchive, rowLine, type Archive } from "../../lib/import/archive.ts";
import { commitImport } from "../../lib/import/commit.ts";
import { exportProjects } from "../../lib/import/export.ts";
import { kernelIdOf, planImport } from "../../lib/import/project.ts";
import { clearV1, seedV1, v1Archive, type Seeded } from "./import-harness.ts";

// PHASE 4 EXIT - AN IMPORTED PROJECT ROUND-TRIPS WITH ITS PLAN (plan §6, L44 item 4).
//
// The whole loop an owner walks once, against bytes v1 wrote (its own exportAccount over its own
// IndexedDB, tests/next-server/import-harness.ts): the archive -> the preview and its confirm ->
// the Plan, which opens with v1's finished steps as finished parts (their imported jobs done, at
// $0) and v1's sign-off as a ratified gate -> the parts v1 never worked launched THROUGH A
// RECEIPT, a stale token refused with the fresh receipt, only the unfinished parts getting jobs ->
// the real worker process (`node workers/runner.mts --once --json`, the real producer registry)
// driving them DRY -> the re-export, where every v1 row nobody touched comes back byte for byte.
//
// import-roundtrip.test.ts (L42) proves each leg alone; this file proves they compose, and that a
// launch after an import is a launch of the REMAINDER (L43 item 3: a part with no v1 work reads
// unlaunched, and a Plan launch launches only parts without a finished job).
//
// Every process is GRAVITONE_DRY_ONLY=1 in a temp universe the file removes; nothing spends.

const ROOT = process.cwd();
const RUNNER = path.join(ROOT, "workers", "runner.mts");
const OP = { kind: "operator", id: "l44" } as const;
const NOW = Date.parse("2026-10-16T09:00:00Z");
const DIR = mkdtempSync(path.join(tmpdir(), "gt-exit-roundtrip-"));
afterAll(() => rmSync(DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));
beforeEach(async () => {
  await clearV1();
});

type World = { readonly file: string; readonly k: Kernel; readonly blobs: BlobStore; readonly archive: Archive };
let n = 0;

/** A temp kernel store whose blobs sit where the worker process looks for them (beside the store). */
async function importedWorld(seed: Seeded): Promise<World> {
  const dir = path.join(DIR, `u${++n}`);
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "store.sqlite");
  const k = openKernel(file);
  if (!k.ok) throw k.error;
  const blobs = blobStore(path.join(dir, "blobs"));
  const a = readArchive(await v1Archive(seed.uid));
  if (!a.ok) throw a.error;
  const preview = k.value.store.read((r) => planImport(r, a.value));
  if (!preview.ok) throw preview.error;
  const done = await commitImport({ store: k.value.store, blobs, actor: OP }, a.value, preview.value.token);
  if (!done.ok) throw done.error;
  expect(done.value.kind).toBe("done");
  return { file, k: k.value, blobs, archive: a.value };
}

const ctx = () => gateFacts(NOW);
function planOf(w: World, id: string): PlanView {
  const v = readProject(w.k.store, id, ctx());
  if (!v.ok) throw v.error;
  return v.value;
}
const keyOf = (id: string, partId: string): string => partId.slice(id.length + 1);
const partsBy = (w: World, id: string) => new Map(planOf(w, id).parts.map((p) => [keyOf(id, p.id), p]));

type JobRow = { readonly id: string; readonly state: string; readonly attempt: number; readonly mode: string; readonly usd: number };
function jobsOf(w: World, projectId: string): JobRow[] {
  const r = w.k.store.read((rd) =>
    rd
      .all("SELECT id, state, json_extract(record, '$.attempt') AS attempt, json_extract(record, '$.mode.kind') AS mode, json_extract(record, '$.spend.usd') AS usd FROM jobs WHERE json_extract(record, '$.correlation.projectId') = ? ORDER BY id", projectId)
      .map((x) => ({ id: String(x["id"]), state: String(x["state"]), attempt: Number(x["attempt"]), mode: String(x["mode"]), usd: Number(x["usd"]) })),
  );
  if (!r.ok) throw r.error;
  return r.value;
}

/** The worker an operator starts, over this universe's store: drains what it can start, dry. */
function worker(w: World): { code: number | null; lines: { jobId: string; outcome: string; state?: string; error?: string }[]; err: string } {
  const r = spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", RUNNER, "--once", "--json", "--idle-ms", "100"], {
    cwd: ROOT,
    env: { ...process.env, GRAVITONE_STORE_PATH: w.file, GRAVITONE_DRY_ONLY: "1" },
    encoding: "utf8",
    timeout: 240_000,
  });
  const line = z.object({ jobId: z.string(), outcome: z.string(), state: z.string().optional(), error: z.string().optional() });
  const lines = (r.stdout ?? "")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l, i) => {
      const p = parseJsonAt(`worker line ${i + 1}`, line, l);
      if (!p.ok) throw new Error(`${p.error.message}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
      return p.value;
    });
  return { code: r.status, lines, err: r.stderr ?? "" };
}

/** The archive's rows of one store, by row id, as v1 writes them (the round trip's unit of equality). */
const linesOf = (a: Archive, s: "steps" | "projects" | "themes" | "uploads"): Map<string, string> => new Map(a.rows[s].map((r) => [String(r["id"]), rowLine(s, r)]));

async function reexport(w: World, ids: readonly string[], uid: string): Promise<Archive> {
  const out = await exportProjects(w.k.store, w.blobs, { ids, uid, now: NOW });
  if (!out.ok) throw out.error;
  const back = readArchive(out.value);
  if (!back.ok) throw back.error;
  return back.value;
}

function reconciled(w: World, jobIds: readonly string[]): void {
  for (const id of jobIds) {
    const r = w.k.store.read((rd) => reconcileJobSpend(rd, id));
    expect(r.ok && r.value.drift, `${id}: the job's spend equals its meter`).toBeUndefined();
  }
}

const WORK_DONE = ["research", "script", "frames", "score", "cut"] as const;

describe("an imported film round-trips with its plan (Phase 4 exit)", () => {
  it("the Plan opens with v1's finished steps finished, its sign-off ratified, and the step v1 never worked unlaunched", async () => {
    const seed = await seedV1("uid-exit");
    const w = await importedWorld(seed);
    try {
      const id = kernelIdOf(seed.film.id);
      const parts = partsBy(w, id);
      for (const key of WORK_DONE) {
        const p = parts.get(key);
        expect(p?.state, `${key} is finished`).toBe("ratified");
        expect(p && "jobId" in p ? p.jobState : undefined, `${key}'s imported job is done`).toBe("done");
      }
      expect(parts.get("gate:frames")?.state, "v1's frames sign-off ratifies the gate").toBe("ratified");
      expect(parts.get("gate:score")?.state, "a step done but never signed off waits at its gate").toBe("awaiting_gate");
      // Imported finished jobs spent nothing and their spend is their meter's (zero rows).
      const imported = jobsOf(w, id);
      expect(imported.map((j) => j.id).sort()).toEqual(WORK_DONE.map((k) => `job:part:${id}/${k}`).sort());
      expect(imported.every((j) => j.state === "done" && j.usd === 0)).toBe(true);
      reconciled(w, imported.map((j) => j.id));
      // L43 item 3: a part with no v1 work and no job reads unlaunched - not "queued" with nothing queued.
      const motion = parts.get("motion");
      expect(motion && "jobId" in motion ? motion.jobId : undefined, "motion has no job yet").toBeUndefined();
      expect(motion?.state, "motion has no v1 work and no job: it must not read queued").not.toBe("queued");
    } finally {
      w.k.close();
    }
  });

  it("launches only the remainder through a receipt, the worker drives it dry, and the untouched v1 rows re-export byte for byte", async () => {
    const seed = await seedV1("uid-exit");
    const w = await importedWorld(seed);
    try {
      const id = kernelIdOf(seed.film.id);
      const before = new Map(jobsOf(w, id).map((j) => [j.id, j]));

      // The receipt prices the remainder only: the work parts without a finished job.
      const rec = planReceipt(w.k.store, id, { mode: "dry" }, ctx());
      if (!rec.ok) throw new Error(`an imported plan's remainder has no receipt: ${rec.error.message}`);
      expect(rec.value.mode).toBe("dry");
      const priced = rec.value.lines.map((l) => keyOf(id, l.key));
      for (const k of WORK_DONE) expect(priced, `${k} is finished and is not priced again`).not.toContain(k);

      // A stale token is refused with the fresh receipt, nothing launched.
      const rev = planOf(w, id).project.rev;
      const stale = launchProject(w.k.store, { id, baseRev: rev, token: "not-the-token", mode: "dry" }, OP, { ...ctx(), dryOnly: true });
      expect(stale.ok).toBe(false);
      if (!stale.ok) {
        expect(stale.error.code).toBe("conflict");
        expect(stale.fresh?.token).toBe(rec.value.token);
      }
      expect(jobsOf(w, id).length).toBe(before.size);

      const launched = launchProject(w.k.store, { id, baseRev: rev, token: rec.value.token, mode: "dry" }, OP, { ...ctx(), dryOnly: true });
      if (!launched.ok) throw launched.error;
      expect(launched.value.jobIds, "only the part v1 never worked gets a job").toEqual([`job:part:${id}/motion`]);
      // The finished parts keep their imported jobs, untouched: same ids, done, attempt 1.
      const after = new Map(jobsOf(w, id).map((j) => [j.id, j]));
      for (const [jid, j] of before) expect(after.get(jid), `${jid} is not relaunched`).toEqual(j);

      // The worker drives the remainder, dry, through the real producer registry.
      const run = worker(w);
      expect(run.code, run.err).toBe(0);
      const motion = jobsOf(w, id).find((j) => j.id === `job:part:${id}/motion`);
      expect(motion, "motion's upstream was ratified by the import: the job is released and driven").toMatchObject({ state: "done", mode: "dry", usd: 0 });
      reconciled(w, jobsOf(w, id).map((j) => j.id));

      // Re-export: every v1 row nobody touched comes back byte for byte. Motion wrote only its own
      // records - `motion` and `motion-direction` (@gt/domain/steps registry) - and those are its work.
      const back = await reexport(w, [id], seed.uid);
      const was = linesOf(w.archive, "steps");
      for (const [rowId, line] of linesOf(back, "steps")) {
        const phase = rowId.slice(seed.film.id.length + 1);
        if (!rowId.startsWith(`${seed.film.id}:`) || phase === "motion" || phase.startsWith("motion-")) continue;
        expect(line, rowId).toBe(was.get(rowId));
      }
      expect(linesOf(back, "projects").get(seed.film.id)).toBe(linesOf(w.archive, "projects").get(seed.film.id));
    } finally {
      w.k.close();
    }
  }, 300_000);
});

describe("an imported draft launches like a composed one and leaves its neighbours' rows alone", () => {
  // One import and one drain shared by the two cases: the round trip, and what the drain did to the draft.
  let seed: Seeded;
  let w: World;
  let run: ReturnType<typeof worker>;
  let draft = "";
  afterAll(() => w?.k.close());

  it("receipt (a stale token refused, nothing written) -> confirm -> the worker drains it dry -> the film and the ad re-export byte for byte", async () => {
    seed = await seedV1("uid-exit");
    w = await importedWorld(seed);
    draft = kernelIdOf(seed.empty.id);
    expect(planOf(w, draft).project.launched).toBe(false);
    expect(jobsOf(w, draft)).toEqual([]);

    const rec = planReceipt(w.k.store, draft, { mode: "dry" }, ctx());
    if (!rec.ok) throw rec.error;
    expect(rec.value.mode).toBe("dry");
    const rev = planOf(w, draft).project.rev;
    const stale = launchProject(w.k.store, { id: draft, baseRev: rev, token: `${rec.value.token}x`, mode: "dry" }, OP, { ...ctx(), dryOnly: true });
    expect(!stale.ok && stale.error.code).toBe("conflict");
    expect(!stale.ok && stale.fresh?.token).toBe(rec.value.token);
    expect(jobsOf(w, draft)).toEqual([]);
    const launched = launchProject(w.k.store, { id: draft, baseRev: rev, token: rec.value.token, mode: "dry" }, OP, { ...ctx(), dryOnly: true });
    if (!launched.ok) throw launched.error;
    expect(launched.value.jobIds.length).toBeGreaterThan(0);

    run = worker(w);
    const jobs = jobsOf(w, draft);
    // The drain ran the draft's first part to done, dry, at $0, each job's spend its meter's.
    expect(run.lines.find((l) => l.jobId === `job:part:${draft}/research`), run.err).toMatchObject({ outcome: "done", state: "done" });
    expect(jobs.every((j) => j.mode === "dry" && j.usd === 0)).toBe(true);
    reconciled(w, jobs.map((j) => j.id));
    // The imported film's finished jobs were not touched by the drain.
    const film = kernelIdOf(seed.film.id);
    expect(jobsOf(w, film).every((j) => j.state === "done" && j.attempt === 1)).toBe(true);

    const back = await reexport(w, [film, kernelIdOf(seed.ad.id)], seed.uid);
    const was = linesOf(w.archive, "steps");
    const now = linesOf(back, "steps");
    const mine = [...was.keys()].filter((k) => k.startsWith(`${seed.film.id}:`) || k.startsWith(`${seed.ad.id}:`)).sort();
    expect([...now.keys()].sort()).toEqual(mine);
    for (const [rowId, line] of now) expect(line, rowId).toBe(was.get(rowId));
    for (const s of ["projects", "themes", "uploads"] as const) for (const [rowId, line] of linesOf(back, s)) expect(line, rowId).toBe(linesOf(w.archive, s).get(rowId));
  }, 300_000);

  it("a plan launch's dry drain fails no part: a part whose act waits on a human act is not driven into failed", () => {
    expect(draft, "the round trip above ran").not.toBe("");
    // DEFECT (L44, 2026-10-16): the teaser's script part is released after research, claimed, and
    // FAILS with "compose cut needs a composed spine" - its default act needs the operator's
    // composed spine, which no plan launch provides. A whole-plan launch therefore always ends with
    // a red part in Runs and a worker exit 1. Kept red until the producer waits (or the launch holds
    // the part) instead of failing it.
    const failed = run.lines.filter((l) => l.outcome === "failed").map((l) => `${l.jobId}: ${l.error ?? ""}`);
    expect(failed).toEqual([]);
    expect(run.code, run.err).toBe(0);
  });
});
