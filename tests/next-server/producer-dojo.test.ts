import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { parseJsonAt } from "@gt/domain/door";
import { AppError } from "@gt/domain/errors";
import type { Holder } from "@gt/domain/job";
import { enumerateCrashes } from "@gt/kernel/crash";
import type { Effects } from "@gt/kernel/effects";
import { ackLane, laneHold } from "@gt/kernel/job-queue";
import { recover, runJob } from "@gt/kernel/job-run";
import { retry } from "@gt/kernel/job";
import type { Kernel } from "@gt/kernel/kernel";
import { assertReconciled, reconcileJobSpend } from "@gt/kernel/spend/projection";
import { defineDojoGoogle, type DojoGooglePorts } from "@gt/producers/dojo/define";
import { dojoLocalSteps, localOrder, runnerOf } from "@gt/producers/dojo/plan";
import type { Served } from "@gt/producers/extract/define";

import { dojoGooglePorts, driveDojo, effectsFor, launchDojo } from "../../lib/producers/dojo.ts";
import { disposeAll, docOf, jobOf, kernelOf, linesOf, nodeCli, operator, PNG, py, pyAsync, PYTHON, REPO, startsOf, universe, until, type Universe } from "./producer-gpu-harness.ts";

// A DOJO CYCLE AS A KERNEL JOB (L34). The stack decides the lane and the performer:
// local -> gpu.local, Python (pipeline/foundry/dojo_job.py under worker.py); google
// -> cloud.google, Node (packages/producers/src/dojo/define.ts), every Nano Banana
// and Gemini call metered against the job. Every child runs dry under
// GRAVITONE_DRY_ONLY=1; the live google cases run IN PROCESS against a fake vendor
// at the ports - never the router.
//
// Where v1's guarantees went:
//   dojo_run.py stack purity ("never guesses which bill")  -> "stack purity", both languages
//   a file on disk is a finished render; a key a readback  -> plan-cases.json, both languages
//   dojo_video's all-error readback is never cached         -> "a readback that read nothing"
//                                                             (now every runner, not one of three)
//   dojo-pairs-nb: an arm with all its PNGs is not re-billed -> "a crash at every effect boundary"

afterAll(disposeAll);
// Every case spawns Python (and the launcher spawns Node): seconds each, more under a loaded full suite.
vi.setConfig({ testTimeout: 120_000 });
const RUN_PY = path.join("pipeline", "foundry", "dojo_run.py");
const WORKER = path.join("pipeline", "foundry", "worker.py");
const LAUNCH = path.join("pipeline", "foundry", "launch.mts");

type Spec = Record<string, unknown>;
function cycle(u: Universe, id: string, spec: Spec): string {
  const dir = path.join(u.training, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "gen-spec.json"), JSON.stringify(spec));
  writeFileSync(path.join(dir, "cycle.json"), JSON.stringify({ version: 1, id, status: "generating", improvements: [{ claim: "the challenger holds the key light", subject: "frame-direction", technique: "t" }], log: [] }));
  return dir;
}
const pair = (id: string, seed: number, b: Spec = {}, c: Spec = {}) => ({ id, seed, baseline: { prompt: `${id} baseline`, ...b }, challenger: { prompt: `${id} challenger`, ...c } });
const LOCAL_IMAGE: Spec = { stack: "local", media: "image", pairs: [pair("p1", 1), pair("p2", 2)] };
const SERIAL: Spec = { stack: "local", media: "video", pairs: [pair("p1", 1, { engine: "h3-ref2va", ref: "x.png" }, { engine: "wan" }), pair("p2", 2, { engine: "wan" }, { engine: "h3-ref2va", ref: "x.png" })] };
const GOOGLE: Spec = { stack: "google", media: "image", repeats: 2, pairs: [pair("g1", 1)] };

const readbacks = (dir: string) => {
  const r = parseJsonAt("readbacks.json", z.record(z.string(), z.unknown()), readFileSync(path.join(dir, "readbacks.json"), "utf8"));
  if (!r.ok) throw r.error;
  return r.value;
};

describe.skipIf(PYTHON === undefined)("the local plan is one function in two languages", () => {
  const caseSchema = z.object({ name: z.string(), units: z.array(z.object({ key: z.string(), rendered: z.boolean(), read: z.boolean() })), booked: z.array(z.string()), abandoned: z.boolean().optional(), expect: z.array(z.string()) });
  const file = path.join(REPO, "packages", "producers", "src", "dojo", "plan-cases.json");
  const cases = parseJsonAt("plan-cases.json", z.object({ cases: z.array(caseSchema) }), readFileSync(file, "utf8"));
  if (!cases.ok) throw cases.error;

  it("Node's dojoLocalSteps and Python's dojo_job.plan give every case's answer", () => {
    for (const c of cases.value.cases) expect(dojoLocalSteps(c.units, new Set(c.booked), c.abandoned === undefined ? {} : { abandoned: c.abandoned }), c.name).toEqual(c.expect);
    const script = ["import json, sys", "sys.path.insert(0, 'pipeline/foundry')", "import dojo_job", `cases = json.load(open(${JSON.stringify(file)}, encoding='utf-8'))['cases']`, "print(json.dumps([dojo_job.plan({'units': c['units']}, set(c['booked']), c.get('abandoned', False)) for c in cases]))"].join("\n");
    const r = py(universe(), ["-c", script]);
    expect(r.status, r.stderr).toBe(0);
    const got = parseJsonAt("python plans", z.array(z.array(z.string())), r.stdout.trim());
    if (!got.ok) throw got.error;
    expect(got.value).toEqual(cases.value.cases.map((c) => c.expect));
  });
});

describe.skipIf(PYTHON === undefined)("the serial-lane render order is one rule in two languages", () => {
  // An arm whose engine is null or "" is the default engine (wan) on both sides: the plan's units are "in the runner's own render order".
  const spec = { stack: "local", media: "video", pairs: [{ id: "p1", baseline: { prompt: "a", engine: null }, challenger: { prompt: "b", engine: "h3-ref2va" } }, { id: "p2", baseline: { prompt: "c", engine: "" }, challenger: { prompt: "d", engine: "wan" } }] };
  const want = ["p1--baseline", "p2--baseline", "p2--challenger", "p1--challenger"];

  it("Node's localOrder and Python's dojo_video_h3.order agree on a null or empty engine", () => {
    expect(localOrder(spec, "video-serial-lanes").map((u) => `${u.pair}--${u.arm}`)).toEqual(want);
    const script = ["import json, sys", "sys.path.insert(0, 'pipeline/foundry')", "import dojo_video_h3", `spec = json.loads(${JSON.stringify(JSON.stringify(spec))})`, "print(json.dumps([p['id'] + '--' + a for p, a in dojo_video_h3.order(spec)]))"].join("\n");
    const r = py(universe(), ["-c", script]);
    expect(r.status, r.stderr).toBe(0);
    const got = parseJsonAt("python order", z.array(z.string()), r.stdout.trim());
    if (!got.ok) throw got.error;
    expect(got.value).toEqual(want);
  });
});

describe.skipIf(PYTHON === undefined)("stack purity: a cycle names its bill, or nothing runs", () => {
  it("a spec with no stack is refused in v1's words - by runnerOf, by the launcher before any receipt, by dojo_run.py with exit 1", () => {
    const r = runnerOf({ media: "image", pairs: [] });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.message).toContain("never guesses which bill");
    expect(runnerOf({ stack: "google", media: "video", pairs: [] }).ok, "google video has no lane").toBe(false);
    const u = universe();
    const dir = cycle(u, "nostack", { media: "image", pairs: [pair("p1", 1)] });
    const k = kernelOf(u);
    const l = launchDojo(k.store, "nostack", { mode: "dry", actor: operator, dryOnly: true, root: u.training });
    expect(l.ok).toBe(false);
    k.close();
    const cli = py(u, [RUN_PY, dir, "--dry", "--json"]);
    expect(cli.status).toBe(1);
    expect(String(docOf(cli)["error"])).toContain("never guesses which bill");
    // Python's own rule, not only the launcher's: a worker session re-reads the spec it runs.
    const direct = py(u, ["-c", ["import sys", "sys.path.insert(0, 'pipeline/foundry')", "import dojo_job", "try:", "    print(dojo_job.runner_of({'media': 'image', 'pairs': []}))", "except SystemExit as e:", "    print('REFUSED', e.code)"].join("\n")]);
    expect(direct.stdout).toContain("REFUSED");
    expect(direct.stdout).toContain("never guesses which bill");
  });

  it("a refusal names the actual cause, in both languages: only google video is 'no lane'", () => {
    const say = (r: ReturnType<typeof runnerOf>) => (r.ok ? "" : r.error.message);
    const local = say(runnerOf({ stack: "local", media: "audio", pairs: [] }));
    expect(local).toContain("no runner for stack=local media=audio");
    expect(local).not.toContain("google video");
    expect(say(runnerOf({ stack: "google", media: "video", pairs: [] }))).toContain("google video has no lane");
    const script = ["import sys", "sys.path.insert(0, 'pipeline/foundry')", "import dojo_job", "for spec in ({'stack': 'local', 'media': 'audio'}, {'stack': 'google', 'media': 'video'}):", "    try:", "        dojo_job.runner_of(spec)", "    except SystemExit as e:", "        print('REFUSED', e.code)"].join("\n");
    const r = py(universe(), ["-c", script]);
    expect(r.status, r.stderr).toBe(0);
    const [loc, goog] = r.stdout.trim().split(/\r?\n/);
    expect(loc).toContain("no runner for stack=local media=audio");
    expect(loc).not.toContain("google video");
    expect(goog).toContain("google video has no lane");
  });

  it("the stack decides the lane: local is gpu.local, google is cloud.google", () => {
    expect(runnerOf(LOCAL_IMAGE)).toMatchObject({ ok: true, value: { lane: "gpu.local", media: "image" } });
    expect(runnerOf(SERIAL)).toMatchObject({ ok: true, value: { lane: "gpu.local", media: "video-serial-lanes" } });
    expect(runnerOf(GOOGLE)).toMatchObject({ ok: true, value: { lane: "cloud.google" } });
  });
});

describe.skipIf(PYTHON === undefined)("a local cycle as a dry job", () => {
  it("dojo_run.py --dry --json renders every arm then reads every arm back, on gpu.local, and the judge's prepare reads the result", () => {
    const u = universe();
    const dir = cycle(u, "img", LOCAL_IMAGE);
    const r = py(u, [RUN_PY, dir, "--dry", "--json"]);
    expect(r.status, r.stderr).toBe(0);
    expect(docOf(r)).toMatchObject({ ok: true, cycle: "img", jobId: "job:run:dojo:img", state: "done" });
    const k = kernelOf(u);
    const job = jobOf(k, "job:run:dojo:img");
    expect(job).toMatchObject({ producer: "dojo", lane: "gpu.local", mode: { kind: "dry" }, of: { id: "dojo:img" } });
    const row = k.store.read((t) => t.get("SELECT job_id, json_extract(record, '$.recipe') AS recipe, json_extract(record, '$.input.producer') AS by, json_extract(record, '$.input.cycle') AS cycle FROM runs WHERE id = ?", "dojo:img"));
    expect(row.ok && row.value).toMatchObject({ job_id: "job:run:dojo:img", recipe: "style/dojo-cycle", by: "dojo", cycle: "img" });
    expect(startsOf(k, job.id)).toEqual(["render:p1--baseline", "render:p1--challenger", "render:p2--baseline", "render:p2--challenger", "readback:p1--baseline", "readback:p1--challenger", "readback:p2--baseline", "readback:p2--challenger"]);
    k.close();
    expect(Object.keys(readbacks(dir)).sort()).toEqual(["p1--baseline", "p1--challenger", "p2--baseline", "p2--challenger"]);
    // v1's reader of a cycle's renders and readbacks: dojo_judge.py prepare (no Gemini).
    const prep = py(u, [path.join("pipeline", "foundry", "dojo_judge.py"), "prepare", dir, "--no-gemini"]);
    expect(prep.status, prep.stderr).toBe(0);
    const sheet = parseJsonAt("worksheet", z.array(z.object({ id: z.string() })), readFileSync(path.join(dir, "judging-worksheet.json"), "utf8"));
    expect(sheet.ok && sheet.value.map((w) => w.id)).toEqual(["p1", "p2"]);
  });

  it("the serial-lane runner keeps its engine order: every wan clip before any H3 one, posters and all", () => {
    const u = universe();
    const dir = cycle(u, "h3", SERIAL);
    expect(py(u, [RUN_PY, dir, "--dry", "--json"]).status).toBe(0);
    const k = kernelOf(u);
    expect(startsOf(k, "job:run:dojo:h3").filter((s) => s.startsWith("render:"))).toEqual(["render:p1--challenger", "render:p2--baseline", "render:p1--baseline", "render:p2--challenger"]);
    k.close();
    for (const tag of ["t0", "t1", "t2"]) expect(statSync(path.join(dir, "pairs", `p1--baseline--${tag}.png`)).size).toBeGreaterThan(0);
  });

  it("dojo_run.py --detach, the Node launcher and launchDojo name one job; worker.py drives it", () => {
    const u = universe();
    const dir = cycle(u, "one", LOCAL_IMAGE);
    const d = py(u, [RUN_PY, dir, "--dry", "--detach", "--json"]);
    expect(docOf(d)).toMatchObject({ ok: true, jobId: "job:run:dojo:one", detached: true });
    expect(docOf(nodeCli(u, [LAUNCH, "dojo", "one", "--dry", "--detach", "--json"]))).toMatchObject({ kind: "existing", jobId: "job:run:dojo:one" });
    const k = kernelOf(u);
    const l = launchDojo(k.store, "one", { mode: "dry", actor: operator, dryOnly: true, root: u.training });
    expect(l.ok && l.value).toMatchObject({ kind: "existing", jobId: "job:run:dojo:one" });
    k.close();
    const w = py(u, [WORKER, "--once", "--json"]);
    expect(linesOf(w)).toEqual([{ jobId: "job:run:dojo:one", lane: "gpu.local", producer: "dojo", outcome: "done", state: "done" }]);
  });

  it("a readback that read nothing is not cached: the job fails counting it, and a retry reads only that unit", () => {
    const u = universe();
    const dir = cycle(u, "rb", LOCAL_IMAGE);
    expect(py(u, [RUN_PY, dir, "--dry", "--detach", "--json"]).status).toBe(0);
    const once = ["import sys", "sys.path.insert(0, 'pipeline/foundry')", "import dojo_job, worker", "real = dojo_job.dry_readback", "calls = []", "def rb(video):", "    calls.append(1)", "    return None if len(calls) == 2 else real(video)", "dojo_job.dry_readback = rb", "sys.exit(worker.main(['--once', '--json']))"].join("\n");
    const r = py(u, ["-c", once]);
    expect(r.status).toBe(1);
    expect(String(linesOf(r)[0]?.["error"])).toContain("4/4 unit(s) rendered, 3/4 read back");
    expect(Object.keys(readbacks(dir))).not.toContain("p1--challenger");
    const k = kernelOf(u);
    const id = "job:run:dojo:rb";
    const before = startsOf(k, id).length;
    expect(retry(k.store, jobOf(k, id).id, operator).ok).toBe(true);
    expect(py(u, [WORKER, "--once", "--json"]).status).toBe(0);
    expect(startsOf(k, id).slice(before)).toEqual(["readback:p1--challenger"]);
    k.close();
  });

  it("a SIGKILL mid-cycle: interrupted naming its step, no hold on gpu.local, and the retry performs no booked unit again", async () => {
    const u = universe();
    const dir = cycle(u, "kill", LOCAL_IMAGE);
    expect(py(u, [RUN_PY, dir, "--dry", "--detach", "--json"]).status).toBe(0);
    const id = "job:run:dojo:kill";
    const k = kernelOf(u);
    const child = pyAsync(u, [WORKER, "--once", "--json"], { FOUNDRY_DRY_STEP_MS: "300" });
    const booked = (): string[] => {
      const r = k.store.read((t) => t.all("SELECT step FROM job_outputs WHERE job_id = ?", id).map((x) => String(x["step"])));
      return r.ok ? r.value : [];
    };
    await until(() => booked().length >= 3 && jobOf(k, id).progress.stage !== undefined, "three booked units and one in flight");
    child.kill("SIGKILL");
    await new Promise<void>((resolve) => child.once("exit", () => resolve()));
    const first = booked();
    const swept = recover(effectsFor(k.store, u.store));
    if (!swept.ok) throw swept.error;
    expect(jobOf(k, id).state).toBe("interrupted");
    const held = k.store.read((t) => laneHold(t, "gpu.local"));
    expect(held.ok && held.value).toBeUndefined();
    expect(retry(k.store, jobOf(k, id).id, operator).ok).toBe(true);
    expect(py(u, [WORKER, "--once", "--json"]).status).toBe(0);
    const starts = startsOf(k, id);
    for (const s of first) expect(starts.filter((x) => x === s), s).toHaveLength(1);
    expect(jobOf(k, id).state).toBe("done");
    expect(Object.keys(readbacks(dir))).toHaveLength(4);
    k.close();
  }, 60_000);
});

/* ── the google stack: Node, metered ──────────────────────────────────────── */

const hostA: Holder = { bootId: "boot-a", pid: 501, host: "box" };
const hostB: Holder = { bootId: "boot-b", pid: 502, host: "box" };
const RUN = { holder: hostA, alive: () => true, sleep: async () => {} } as const;

type Fake = { calls: string[]; ports: DojoGooglePorts };
function fakeGoogle(root: string, script: { readonly generateUsd?: number; readonly unpricedReadback?: boolean; readonly overBudget?: boolean; readonly throwGenerate?: string } = {}): Fake {
  const calls: string[] = [];
  const disk = dojoGooglePorts(root);
  const ports: DojoGooglePorts = {
    ...disk,
    async generate({ prompt, count }): Promise<Served<readonly string[]>> {
      calls.push(`generate:${prompt}`);
      if (script.overBudget === true) throw new AppError("budget", "The imaging spend ceiling for this window is reached.");
      if (script.throwGenerate !== undefined) throw new Error(script.throwGenerate);
      return { value: Array.from({ length: count }, () => PNG.toString("base64")), model: "google/fake-pixels", costUsd: script.generateUsd ?? 0.09 };
    },
    async recognize(): Promise<Served<unknown>> {
      calls.push("recognize");
      return script.unpricedReadback === true ? { value: { look: "fake" }, model: "google/fake-eye" } : { value: { look: "fake" }, model: "google/fake-eye", costUsd: 0.002 };
    },
  };
  return { calls, ports };
}

async function launchGoogle(k: Kernel, u: Universe, id: string, mode: "dry" | "live", ceilingUsd?: number): Promise<string> {
  const base = { mode, actor: operator, dryOnly: false, root: u.training, ...(ceilingUsd === undefined ? {} : { ceilingUsd }) };
  const r0 = launchDojo(k.store, id, base);
  if (!r0.ok || r0.value.kind !== "receipt") throw new Error(`no receipt: ${JSON.stringify(r0)}`);
  const r1 = launchDojo(k.store, id, { ...base, token: r0.value.receipt.token });
  if (!r1.ok || r1.value.kind !== "launched") throw new Error(`not launched: ${JSON.stringify(r1)}`);
  return r1.value.jobId;
}

describe("a google cycle as a job, every call metered", () => {
  it("dry: runs end to end on stand-ins, lists its would-calls, spends nothing, never calls the vendor", async () => {
    const u = universe();
    const dir = cycle(u, "g", GOOGLE);
    const k = kernelOf(u);
    const id = await launchGoogle(k, u, "g", "dry");
    const fake = fakeGoogle(u.training);
    const r = await driveDojo(k.store, u.store, id, { ...RUN, producer: defineDojoGoogle(fake.ports) });
    if (!r.ok) throw r.error;
    expect(r.value.outcome).toBe("done");
    expect(r.value.wouldCalls?.map((c) => c.model)).toEqual(["generate", "recognize", "recognize", "generate", "recognize", "recognize"]);
    expect(fake.calls).toEqual([]);
    expect(jobOf(k, id)).toMatchObject({ lane: "cloud.google", spend: { usd: 0, unpriced: 0 } });
    expect(Object.keys(readbacks(dir)).sort()).toEqual(["g1--baseline--r1", "g1--baseline--r2", "g1--challenger--r1", "g1--challenger--r2"]);
    k.close();
  });

  it("live with a fake vendor: the job's spend is the meter's, a readback with no figure is counted unpriced, and a done arm is never billed again", async () => {
    const u = universe();
    cycle(u, "gl", GOOGLE);
    const k = kernelOf(u);
    const id = await launchGoogle(k, u, "gl", "live");
    const fake = fakeGoogle(u.training, { unpricedReadback: true });
    const r = await driveDojo(k.store, u.store, id, { ...RUN, producer: defineDojoGoogle(fake.ports) });
    if (!r.ok) throw r.error;
    expect(r.value.outcome).toBe("done");
    const job = jobOf(k, id);
    expect(job.spend.usd).toBeCloseTo(2 * 0.09 + 4 * 0.002, 6);
    expect(job.spend.unpriced).toBe(4);
    expect(k.store.read((t) => assertReconciled(t, id)).ok).toBe(true);
    // A second launch of the done cycle: everything is on disk, so nothing is planned and nothing billed.
    const again = await launchGoogle(k, u, "gl", "live");
    expect(again).toBe(`${id}~2`);
    const r2 = await driveDojo(k.store, u.store, again, { ...RUN, producer: defineDojoGoogle(fake.ports) });
    expect(r2.ok && r2.value.outcome).toBe("done");
    expect(fake.calls.filter((c) => c.startsWith("generate:"))).toHaveLength(2);
    k.close();
  });

  it("a refusal for money is a money stop, never a breaker count", async () => {
    const u = universe();
    cycle(u, "gm", GOOGLE);
    const k = kernelOf(u);
    const id = await launchGoogle(k, u, "gm", "live");
    const fake = fakeGoogle(u.training, { overBudget: true });
    const r = await driveDojo(k.store, u.store, id, { ...RUN, producer: defineDojoGoogle(fake.ports) });
    expect(r.ok).toBe(true);
    const job = jobOf(k, id);
    expect(job.state).toBe("failed");
    expect(job.error?.code).toBe("budget");
    expect(job.failStreak).toBe(0);
    expect(fake.calls).toHaveLength(1);
    expect(job.spend.unpriced, "a refusal never reached the vendor").toBe(0);
    k.close();
  });

  it("a generate that throws after reaching the vendor books a row for every call", async () => {
    const u = universe();
    cycle(u, "gt", GOOGLE);
    const k = kernelOf(u);
    const id = await launchGoogle(k, u, "gt", "live");
    const fake = fakeGoogle(u.training, { throwGenerate: "socket hang up after the request was accepted" });
    const r = await driveDojo(k.store, u.store, id, { ...RUN, producer: defineDojoGoogle(fake.ports) });
    expect(r.ok).toBe(true);
    const job = jobOf(k, id);
    expect(job.state).toBe("failed");
    expect(fake.calls.length).toBeGreaterThan(0);
    expect(job.spend.unpriced, "one unpriced row per failed call").toBe(fake.calls.length);
    const why = k.store.read((t) => t.all("SELECT reason FROM spend_unpriced WHERE job_id = ?", id));
    expect(why.ok && why.value.every((row) => String(row["reason"]).includes("socket hang up"))).toBe(true);
    expect(k.store.read((t) => assertReconciled(t, id)).ok).toBe(true);
    k.close();
  });

  it("a gpu.local dojo job is refused by the google producer before anything is claimed", async () => {
    const u = universe();
    cycle(u, "loc", LOCAL_IMAGE);
    const k = kernelOf(u);
    const l0 = launchDojo(k.store, "loc", { mode: "dry", actor: operator, dryOnly: true, root: u.training });
    if (!l0.ok || l0.value.kind !== "receipt") throw new Error("no receipt");
    const l1 = launchDojo(k.store, "loc", { mode: "dry", actor: operator, dryOnly: true, root: u.training, token: l0.value.receipt.token });
    if (!l1.ok || l1.value.kind !== "launched") throw new Error("not launched");
    const r = await runJob(effectsFor(k.store, u.store), defineDojoGoogle(fakeGoogle(u.training).ports), l1.value.jobId, RUN);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.message).toContain("cloud.google producer may not run it");
    expect(jobOf(k, l1.value.jobId).state).toBe("queued");
    k.close();
  });
});

describe("a google cycle: a crash at every effect boundary", () => {
  it("is interrupted, holds cloud.google until acknowledged, and an operator's retry finishes it with no arm billed twice", async () => {
    type W = { u: Universe; k: Kernel; id: string; fake: Fake; interrupted: string[] };
    const report = await enumerateCrashes<W>({
      async open() {
        const u = universe();
        cycle(u, "c", GOOGLE);
        const k = kernelOf(u);
        const fake = fakeGoogle(u.training);
        return { u, k, id: await launchGoogle(k, u, "c", "live"), fake, interrupted: [] };
      },
      reopen(w) {
        w.k.close();
        return { ...w, k: kernelOf(w.u) };
      },
      close: (w) => w.k.close(),
      effects: (w): Effects => effectsFor(w.k.store, w.u.store),
      async scenario(fx, w) {
        await runJob(fx, defineDojoGoogle(w.fake.ports), w.id, RUN);
      },
      async recover(fx, w) {
        const rec = recover(fx, { holder: hostB, alive: (pid) => pid === hostB.pid });
        if (!rec.ok) throw rec.error;
        if (jobOf(w.k, w.id).state === "interrupted") {
          w.interrupted.push(jobOf(w.k, w.id).interruption?.stage ?? "(between steps)");
          const held = w.k.store.read((t) => laneHold(t, "cloud.google"));
          if (!held.ok || held.value === undefined) throw new Error("a paid lane must hold after an interruption");
          if (!ackLane(w.k.store, "cloud.google", operator).ok) throw new Error("ack refused");
          if (!retry(w.k.store, jobOf(w.k, w.id).id, operator).ok) throw new Error("retry refused");
        }
        if (jobOf(w.k, w.id).state === "queued") {
          const r = await runJob(fx, defineDojoGoogle(w.fake.ports), w.id, { ...RUN, holder: hostB, alive: (pid) => pid === hostB.pid });
          if (!r.ok) throw r.error;
        }
      },
      invariant(w, phase) {
        if (phase === "crashed") return undefined;
        const job = jobOf(w.k, w.id);
        if (job.state !== "done") return `recovered to ${job.state}${job.error ? `: ${job.error.message}` : ""}`;
        const gens = w.fake.calls.filter((c) => c.startsWith("generate:"));
        const twice = gens.length - new Set(gens).size;
        const inFlight = w.interrupted.some((s) => s.startsWith("generate:"));
        if (twice > (inFlight ? 1 : 0)) return `${twice} arm(s) billed twice; interrupted at ${w.interrupted.join(", ") || "nothing"}`;
        const rec = w.k.store.read((t) => reconcileJobSpend(t, w.id));
        if (!rec.ok || rec.value.drift !== undefined) return `spend drifted from the meter: ${JSON.stringify(rec.ok ? rec.value.drift : rec.error.message)}`;
        return undefined;
      },
    });
    expect(report.prefixes).toBeGreaterThan(10);
    expect(report.violations).toEqual([]);
  }, 180_000);
});
