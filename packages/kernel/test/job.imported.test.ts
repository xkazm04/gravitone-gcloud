import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { parseJsonAt } from "@gt/domain/door";

import { get, recordImportedJobIn, retry } from "../src/job.ts";
import { must, scratch } from "./helpers.ts";
import { eventTypes, jobId, openWorld, operator, type World } from "./job-fixture.ts";

// A TERMINAL JOB FOR WORK DONE ELSEWHERE (L43 `recordImportedJobIn`): v1's finished projects and
// runs arrive as jobs walked through the job machine, ending as v1 recorded them, having claimed
// nothing and spent nothing - and an ordinary job from then on (a failed one retries like any).

const tmp = scratch("job-imported");
afterAll(() => tmp.dispose());
let n = 0;
const world = (): World => openWorld(path.join(tmp.dir, `i-${++n}.sqlite`));
const IMPORTER = { kind: "machine", id: "v1-import" } as const;
const base = { id: "job:part:p1/research", of: { kind: "part", id: "p1/research" }, producer: "research", lane: "seat.text", correlation: { projectId: "p1" } } as const;

describe("an imported job", () => {
  it("is done through the machine: its progress is its units, no lease, no spend, one import event naming the road", () => {
    const w = world();
    const job = must(w.store.tx((t) => recordImportedJobIn(t, { ...base, units: 3, data: { from: "v1", v1Project: "p-1" } }, IMPORTER)));
    expect(job).toMatchObject({ state: "done", attempt: 1, progress: { done: 3, total: 3, stage: "imported" }, spend: { usd: 0, unpriced: 0 }, mode: { kind: "dry" } });
    expect(job.lease).toBeUndefined();
    expect(must(get(w.store, jobId(base.id))).job).toEqual(job);
    expect(eventTypes(w.store, base.id)).toEqual(["job.enqueued", "job.imported"]);
    const data = must(w.store.read((r) => r.get("SELECT data FROM events WHERE type = 'job.imported' AND subject_id = ?", base.id)?.["data"]));
    expect(must(parseJsonAt("job.imported data", z.unknown(), String(data)))).toMatchObject({ imported: true, path: ["queued", "running", "done"], from: "v1", v1Project: "p-1", projectId: "p1" });
    w.store.close();
  });

  it("ends failed with the sentence its place recorded, and an operator retries it like any failed job", () => {
    const w = world();
    const id = "job:run:r1";
    const job = must(w.store.tx((t) => recordImportedJobIn(t, { id, of: { kind: "run", id: "r1" }, producer: "extract", lane: "cloud.google", units: 4, ending: { state: "failed", code: "unavailable", message: "quota exhausted" } }, IMPORTER)));
    expect(job).toMatchObject({ state: "failed", error: { code: "unavailable", message: "quota exhausted" } });
    expect(must(retry(w.store, jobId(id), operator))).toMatchObject({ state: "queued", attempt: 2 });
    w.store.close();
  });

  it("is refused over an existing job and for units that are not a count, writing nothing", () => {
    const w = world();
    must(w.store.tx((t) => recordImportedJobIn(t, { ...base, units: 1 }, IMPORTER)));
    expect(w.store.tx((t) => recordImportedJobIn(t, { ...base, units: 1 }, IMPORTER))).toMatchObject({ ok: false, error: { code: "conflict" } });
    expect(w.store.tx((t) => recordImportedJobIn(t, { ...base, id: "job:part:p1/script", of: { kind: "part", id: "p1/script" }, units: -1 }, IMPORTER))).toMatchObject({ ok: false, error: { code: "invalid" } });
    expect(eventTypes(w.store, "job:part:p1/script")).toEqual([]);
    w.store.close();
  });
});
