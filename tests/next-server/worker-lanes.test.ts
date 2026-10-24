import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ok, type Result } from "@gt/domain/errors";
import type { Producer } from "@gt/kernel/job-core";
import { enqueue, get } from "@gt/kernel/job";
import { openKernel } from "@gt/kernel/kernel";
import { writePart } from "@gt/kernel/parts/driver";
import { compose } from "@gt/kernel/records/write";
import { producerSet } from "@gt/producers/set";

import { framesUnits } from "../../lib/producers/frames.ts";
import { BOUND, lanesOf, producers } from "../../lib/producers/registry.ts";
import { launchPartAct, partActReceipt } from "../../lib/producers/research.ts";

// THE WORKER CARRIES A PRODUCER PER LANE, AND A STEP'S ENDING OPENS ITS GATE (L41).
//   - producerSet keys `<name>@<lane>`: one name on two lanes is two bindings; twice on one is refused;
//   - the registry binds each studio step on every lane its catalog options reach, and Dojo's
//     google stack on cloud.google only (its gpu.local cycles are Python's);
//   - `--once` names a head it does not carry even when there was nothing it could start;
//   - a part job the WORKER drove opens its READY gate's packet (the route did; the worker did not).

const ROOT = process.cwd();
const RUNNER = path.join(ROOT, "workers", "runner.mts");
const OP = { kind: "operator", id: "op" } as const;
const NOW = Date.parse("2026-10-16T09:00:00Z");
const dir = mkdtempSync(path.join(tmpdir(), "gt-worker-lanes-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
let n = 0;
const fresh = (): string => path.join(dir, `s-${++n}.sqlite`);

function must<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.value;
}

function runner(store: string, args: string[]) {
  return spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", RUNNER, ...args], {
    cwd: ROOT,
    env: { ...process.env, GRAVITONE_STORE_PATH: store, GRAVITONE_DRY_ONLY: "1" },
    encoding: "utf8",
    timeout: 120_000,
  });
}

const stub = (lane: Producer["lane"]): Producer => ({ lane, plan: () => [], perform: async () => ({ kind: "produced", output: {} }) });

describe("producerSet per lane", () => {
  it("binds one name on two lanes as two keys, and refuses the same name twice on one lane", () => {
    const set = must(producerSet([{ name: "research", producer: stub("seat.text") }, { name: "research", producer: stub("cloud.google") }]));
    expect([...set.keys()]).toEqual(["research@seat.text", "research@cloud.google"]);
    const twice = producerSet([{ name: "research", producer: stub("seat.text") }, { name: "research", producer: stub("seat.text") }]);
    expect(twice.ok ? "accepted" : twice.error.message).toBe("producers: research is bound twice on seat.text");
  });
});

describe("the registry", () => {
  it("binds every studio step on each lane its part options reach, and Dojo's google stack on cloud.google only", () => {
    const keys = new Set(must(producers()).keys());
    expect(lanesOf("research")).toEqual(["seat.text", "cloud.google"]);
    for (const name of ["research", "script", "frames", "motion", "score", "cut", "still", "words", "voice"] as const)
      for (const lane of lanesOf(name)) expect(keys.has(`${name}@${lane}`), `${name}@${lane}`).toBe(true);
    expect(keys.has("frames@cloud.leonardo")).toBe(true);
    expect(keys.has("dojo@cloud.google")).toBe(true);
    expect(keys.has("dojo@gpu.local")).toBe(false);
    expect(keys.has("forge@gpu.local")).toBe(false);
    // Each binding runs on the lane it is keyed by: runJob refuses any other.
    for (const b of BOUND) expect(keys.has(`${b.name}@${b.producer.lane}`)).toBe(true);
  });
});

describe("the --once drain names what it does not carry", () => {
  it("a head no binding reaches is named on stderr even when nothing could start, and left queued", () => {
    const file = fresh();
    const k = must(openKernel(file));
    must(enqueue(k.store, { id: "job:run:forge-x", of: { kind: "run", id: "forge-x" }, producer: "forge", lane: "gpu.local" }, OP));
    k.close();
    const r = runner(file, ["--once", "--json", "--idle-ms", "50", "--lanes", "gpu.local"]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.trim()).toBe("");
    expect(r.stderr).toContain("job:run:forge-x heads gpu.local for producer forge, which this worker does not carry");
    const after = must(openKernel(file));
    expect(must(get(after.store, "job:run:forge-x" as never)).job.state).toBe("queued");
    after.close();
  }, 60_000); // spawns the real runner, whose cold start alone measured 5.56 s - past vitest's 5 s default

  it("a head on a lane outside --lanes is not this worker's to report", () => {
    const file = fresh();
    const k = must(openKernel(file));
    must(enqueue(k.store, { id: "job:run:forge-y", of: { kind: "run", id: "forge-y" }, producer: "forge", lane: "gpu.local" }, OP));
    k.close();
    const r = runner(file, ["--once", "--idle-ms", "50", "--lanes", "seat.text"]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stderr).not.toContain("forge-y");
  }, 60_000);
});

const unit = (id: string, at: string) => ({
  id, sourceId: "r1", beatRef: { at }, ordinal: 1, ofBeat: 1, startS: 0, holdS: 5, kind: "beat", beatKind: "hook", title: `beat ${id}`, line: "a line",
  plate: { subject: `a wide quiet field of soft grey shapes, ${id}`, state: "empty" }, clip: { status: "not-started", motion: "" }, elements: [], texts: [],
});

describe("a worker-driven part job opens its ready gate", () => {
  it("frames plates rendered by the worker (dry) leave the frames gate's packet open", async () => {
    const file = fresh();
    const k = must(openKernel(file));
    const store = k.store;
    must(compose(store, { recipe: "film/short-educational-video" }, OP, { id: "wg" }));
    must(writePart(store, { projectId: "wg", partId: "wg/frames", baseRev: "current", act: "land", op: { seed: true }, label: "seed", by: { kind: "machine", id: "test" }, next: () => ok({ frames: { units: [unit("u1", "0:00"), unit("u2", "0:05")], renderId: "r1" } }) }));
    const ref = { projectId: "wg", partId: "wg/frames", act: "render-plates" };
    const receipt = must(partActReceipt(store, ref, framesUnits, { mode: "dry", now: NOW }));
    const launched = must(launchPartAct(store, ref, framesUnits, { mode: "dry", now: NOW, token: receipt.token, actor: OP, dryOnly: true }));
    if (launched.kind !== "launched") throw new Error(`not launched: ${launched.kind}`);
    const packets = () => must(store.read((r) => r.all("SELECT id, state FROM packets ORDER BY id").map((x) => `${String(x["id"])} ${String(x["state"])}`)));
    expect(packets()).toEqual([]);
    k.close();

    const r = runner(file, ["--once", "--json", "--idle-ms", "50", "--lanes", "gpu.local"]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain(`"jobId":"${launched.jobId}"`);
    const after = must(openKernel(file));
    try {
      expect(must(get(after.store, launched.jobId as never)).job.state).toBe("done");
      const opened = must(after.store.read((rd) => rd.all("SELECT id, state FROM packets ORDER BY id").map((x) => `${String(x["id"])} ${String(x["state"])}`)));
      expect(opened).toEqual(["pkt:step:wg/gate:frames open"]);
      const failed = must(after.store.read((rd) => rd.all("SELECT 1 AS x FROM events WHERE type = 'job.settle-failed'")));
      expect(failed).toEqual([]);
    } finally {
      after.close();
    }
  }, 150_000);
});
