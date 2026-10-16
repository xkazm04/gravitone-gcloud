import { execFileSync, execSync, spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { parseAt, parseJsonAt } from "@gt/domain/door";
import type { Actor } from "@gt/domain/event";
import { jobIdSchema, type JobId } from "@gt/domain/ids";
import type { Job } from "@gt/domain/job";
import { ackLane, laneHold } from "@gt/kernel/job-queue";
import { get, retry } from "@gt/kernel/job";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { reconcileJobSpend } from "@gt/kernel/spend/projection";

import { REPO_LOCATING_GIT_VARS } from "../../lib/gitEnv.ts";

// PHASE 4 EXIT - CRASH RECOVERY PASSES A KILL TEST, AT THE PROCESS LEVEL (Node half, L44).
//
// packages/kernel/test/job.kill.test.ts kills a child that runs `runJob` over a test
// producer; producer-article-crash.test.ts enumerates crash prefixes inside one process.
// Neither is the thing an operator runs. This is: the REAL worker (`node
// workers/runner.mts`, every producer lib/producers/registry.ts binds) drives a dry
// article job the CLI enqueued (`article.mts run --dry --detach`), on a temp universe,
// and the agent turn behind the dry stand-in seam (ARTICLES_DRY_AGENT_BIN) BLOCKS on its
// Nth call - a step in flight, unbooked. The worker is SIGKILLed (TerminateProcess on
// Windows: no finally, no release, no heartbeat stop). Then, as an operator meets it:
//   restart   the real worker again; its recovery sweep names the job interrupted with
//             the step that was in flight, and seat.text - a PAID lane - HOLDS: a
//             neighbour article enqueued after the crash is not claimed;
//   retry     before the ack, the retried job is still not claimed;
//   ack       the operator acknowledges; the real worker drives both jobs to done, the
//             retried one at attempt 2 WITHOUT starting a step it had booked before the
//             kill - only the one in flight runs again - and its spend equals its meter.

const ROOT = process.cwd();
const RUNNER = path.join(ROOT, "workers", "runner.mts");
const STAND_IN = path.join(ROOT, "lib", "articles", "dryStandIn.mjs");
const STUB = path.join(ROOT, "tests", "fixtures", "articles", "stub-agent.mjs");
const OP: Actor = { kind: "operator", id: "l44-exit" };
/** The agent turn that blocks: the second the gate job asks for (its first is research's). */
const BLOCK_AT = 2;

const U = mkdtempSync(path.join(tmpdir(), "gt-exit-kill-node-"));
const alive: ChildProcess[] = [];
afterAll(() => {
  for (const c of alive) if (c.exitCode === null) c.kill("SIGKILL");
  rmSync(U, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
});

const STORE = path.join(U, "kernel", "store.sqlite");
const TURNS = path.join(U, "turns.log");
const MARK = path.join(U, "blocked.pid");
const WRAPPER = path.join(U, "blocking-stand-in.mjs");

/**
 * The blocking stand-in: one line per turn to TURNS, and on turn BLOCK_AT its pid to MARK
 * and then nothing, for ever. Every other turn is the product's own stand-in, piped through.
 * Paths are baked in: the dry seam hands a turn an isolated workspace and a seat-only env.
 */
function writeWrapper(): void {
  writeFileSync(
    WRAPPER,
    [
      'import { spawn } from "node:child_process";',
      'import fs from "node:fs";',
      `const LOG = ${JSON.stringify(TURNS)}, MARK = ${JSON.stringify(MARK)}, STAND = ${JSON.stringify(STAND_IN)};`,
      "fs.appendFileSync(LOG, `${process.pid}\\n`);",
      'const n = fs.readFileSync(LOG, "utf8").split("\\n").filter(Boolean).length;',
      `if (n === ${BLOCK_AT}) {`,
      "  fs.writeFileSync(MARK, String(process.pid));",
      "  setInterval(() => {}, 60_000);",
      "} else {",
      '  const c = spawn(process.execPath, [STAND, ...process.argv.slice(2)], { stdio: ["pipe", "inherit", "inherit"] });',
      "  process.stdin.pipe(c.stdin);",
      "  c.on(\"exit\", (code) => process.exit(code ?? 1));",
      "}",
      "",
    ].join("\n"),
  );
}

function universeEnv(): NodeJS.ProcessEnv {
  const reg = parseJsonAt("registry fixture", z.object({ registry: z.string() }), execFileSync(process.execPath, [path.join(ROOT, "tests", "fixtures", "articles", "registry-fixture.mjs"), path.join(U, "reg")], { encoding: "utf8" }));
  if (!reg.ok) throw reg.error;
  const tmp = path.join(U, "tmp");
  mkdirSync(tmp, { recursive: true });
  mkdirSync(path.dirname(STORE), { recursive: true });
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const k of [...REPO_LOCATING_GIT_VARS, "GRAVITONE_PRODUCE_SIDE", "STUB_AGENT_ARGV_LOG", "STUB_AGENT_COST", "STUB_AGENT_MODE"]) delete env[k];
  return {
    ...env,
    GRAVITONE_STORE_PATH: STORE,
    GRAVITONE_DRY_ONLY: "1",
    AI_REGISTRY_DIR: reg.value.registry,
    ARTICLES_STORE_DIR: path.join(U, "articles"),
    ARTICLES_DRY_AGENT_BIN: `node|${WRAPPER}`,
    // The live seam never runs under a dry job; pointed at the stub all the same, so nothing here can reach a seat.
    ARTICLES_AGENT_BIN: `node|${STUB}`,
    ARTICLES_CODEX_BIN: `node|${STUB}|--as=codex`,
    ARTICLES_AGY_BIN: `node|${STUB}|--as=agy`,
    ARTICLES_GH_BIN: `node|${path.join(ROOT, "tests", "fixtures", "articles", "stub-gh.mjs")}`,
    TEMP: tmp,
    TMP: tmp,
    TMPDIR: tmp,
  };
}

const docSchema = z.record(z.string(), z.unknown());
/** The one document a `--json` verb prints: pretty (status) or one line after progress lines (run). */
const lastDoc = (stdout: string): Record<string, unknown> => {
  const whole = parseJsonAt("cli document", docSchema, stdout.trim());
  if (whole.ok) return whole.value;
  const d = parseJsonAt("cli document", docSchema, stdout.trim().split("\n").at(-1) ?? "");
  if (!d.ok) throw new Error(`no JSON document: ${stdout}`);
  return d.value;
};
const linesOf = (stdout: string): Record<string, unknown>[] =>
  stdout
    .split("\n")
    .filter((l) => l.trim().startsWith("{"))
    .map((l, i) => {
      const d = parseJsonAt(`worker line ${i + 1}`, docSchema, l);
      if (!d.ok) throw d.error;
      return d.value;
    });

/** `article.mts` exactly as the operator and the /article-run skill run it. */
function articleCli(env: NodeJS.ProcessEnv, args: string): Record<string, unknown> {
  return lastDoc(execSync(`npx --no-install tsx pipeline/article.mts ${args} --json`, { cwd: ROOT, env, encoding: "utf8", timeout: 120_000 }));
}

const WORKER_ARGS = ["--disable-warning=ExperimentalWarning", "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", RUNNER, "--once", "--json", "--lanes", "seat.text", "--idle-ms", "100"];
function workerOnce(env: NodeJS.ProcessEnv): { code: number | null; lines: Record<string, unknown>[]; err: string } {
  const r = spawnSync(process.execPath, WORKER_ARGS, { cwd: ROOT, env, encoding: "utf8", timeout: 240_000 });
  return { code: r.status, lines: linesOf(r.stdout ?? ""), err: r.stderr ?? "" };
}

const jid = (id: string): JobId => {
  const p = parseAt("job id", jobIdSchema, id);
  if (!p.ok) throw p.error;
  return p.value;
};
function kernel(): Kernel {
  const k = openKernel(STORE, { busyTimeoutMs: 30_000 });
  if (!k.ok) throw k.error;
  return k.value;
}
function jobOf(k: Kernel, id: string): Job {
  const r = get(k.store, jid(id));
  if (!r.ok) throw r.error;
  return r.value.job;
}
function booked(k: Kernel, id: string): string[] {
  const r = k.store.read((t) => t.all("SELECT step FROM job_outputs WHERE job_id = ? ORDER BY step", id).map((row) => String(row["step"])));
  if (!r.ok) throw r.error;
  return r.value;
}
function starts(k: Kernel, id: string): string[] {
  const r = k.store.read((t) => t.all("SELECT json_extract(data, '$.step') AS s FROM events WHERE subject_id = ? AND type = 'job.step-started' ORDER BY seq", id).map((row) => String(row["s"])));
  if (!r.ok) throw r.error;
  return r.value;
}
function claims(k: Kernel, id: string): number {
  const r = k.store.read((t) => Number(t.get("SELECT count(*) AS c FROM events WHERE subject_id = ? AND type = 'job.claimed'", id)?.["c"] ?? 0));
  if (!r.ok) throw r.error;
  return r.value;
}
const turns = (): number => (existsSync(TURNS) ? readFileSync(TURNS, "utf8").split("\n").filter(Boolean).length : 0);

async function until(test: () => boolean, what: string, ms: number): Promise<void> {
  const end = Date.now() + ms;
  while (!test()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

describe("the real Node worker, SIGKILLed while an article turn blocks", () => {
  it("restarted, names the job interrupted at its step and holds seat.text until acknowledged; the retry finishes without re-performing a booked step", { timeout: 600_000 }, async () => {
    writeWrapper();
    const env = universeEnv();
    const pre = kernel();
    pre.close();

    const launched = articleCli(env, 'run --topic "a kill test for the text seat" --dry --detach');
    const runId = String(launched["runId"]);
    const id = String(launched["jobId"]);
    expect(launched).toMatchObject({ jobId: `job:run:${runId}`, detached: true, mode: "dry" });

    const w = spawn(process.execPath, WORKER_ARGS, { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
    alive.push(w);
    let wOut = "";
    w.stdout?.on("data", (b: Buffer) => (wOut += b.toString()));
    w.stderr?.on("data", (b: Buffer) => (wOut += b.toString()));
    const k = kernel();
    try {
      await until(() => existsSync(MARK) && jobOf(k, id).state === "running", `turn ${BLOCK_AT} to block (worker said: ${wOut})`, 180_000);
      const inFlight = jobOf(k, id);
      const stage = inFlight.progress.stage;
      expect(stage, "a step is in flight on the record").toBeDefined();
      const before = booked(k, id);
      expect(before.length, "at least one step was booked before the block").toBeGreaterThanOrEqual(1);
      expect(before).not.toContain(stage);
      const holderPid = inFlight.lease?.holder.pid;
      expect(holderPid).toBe(w.pid);

      // The kill: the worker, and the blocked turn it had spawned (a grandchild Windows would orphan).
      const exited = new Promise<void>((resolve) => w.once("exit", () => resolve()));
      w.kill("SIGKILL");
      await exited;
      const turnPid = Number(readFileSync(MARK, "utf8"));
      try {
        process.kill(turnPid, "SIGKILL");
      } catch {
        // already gone with its parent
      }
      expect(jobOf(k, id).state, "nobody has looked yet: the record still says running").toBe("running");

      // A neighbour on the same paid lane, enqueued after the crash by the same CLI.
      const second = articleCli(env, 'run --topic "a neighbour on the held seat" --dry --detach');
      const neighbour = String(second["jobId"]);
      const turnsAtKill = turns();

      // RESTART: the real worker's recovery sweep comes first.
      const r1 = workerOnce(env);
      expect(r1.code, r1.err).toBe(0);
      expect(r1.err).toContain("1 recovered as interrupted");
      expect(jobOf(k, id)).toMatchObject({ state: "interrupted", attempt: 1, interruption: { stage, holder: { pid: holderPid } } });
      const hold = k.store.read((t) => laneHold(t, "seat.text"));
      expect(hold.ok && hold.value).toMatchObject({ jobId: id, stage });
      // A held lane has no claimable head (kernel nextClaimable): the drain does not even look at the
      // neighbour - no line, no claim. It waits in the line, not failed, not driven.
      expect(r1.lines.filter((l) => l["jobId"] === neighbour)).toEqual([]);
      expect(jobOf(k, neighbour).state).toBe("queued");
      expect(claims(k, neighbour)).toBe(0);

      // The CLI's own status names the job and where it stopped.
      const status = articleCli(env, `status ${runId}`);
      expect(status["jobs"]).toEqual([expect.objectContaining({ id, state: "interrupted", stage })]);

      // A retry before the acknowledgement is not claimed either.
      const re = retry(k.store, jid(id), OP);
      expect(re.ok && re.value).toMatchObject({ state: "queued", attempt: 2 });
      const r2 = workerOnce(env);
      expect(r2.code, r2.err).toBe(0);
      expect(r2.lines.filter((l) => l["outcome"] === "done")).toEqual([]);
      expect(jobOf(k, id)).toMatchObject({ state: "queued", attempt: 2 });
      expect(claims(k, id), "claimed once, by the killed worker").toBe(1);
      expect(claims(k, neighbour)).toBe(0);
      expect(turns(), "nothing ran while the lane held").toBe(turnsAtKill);

      // The operator looked.
      const acked = ackLane(k.store, "seat.text", OP);
      expect(acked.ok && acked.value.map((h) => h.jobId)).toEqual([id]);
      const r3 = workerOnce(env);
      expect(r3.code, r3.err).toBe(0);
      expect(jobOf(k, id)).toMatchObject({ state: "done", attempt: 2 });
      expect(jobOf(k, neighbour).state).toBe("done");

      // Never-re-perform: every step booked before the kill started exactly once over both
      // attempts; the step in flight started twice; nothing else ran more than once.
      const all = starts(k, id);
      for (const s of before) expect(all.filter((x) => x === s), `${s} was booked before the kill`).toHaveLength(1);
      expect(all.filter((x) => x === stage), `${String(stage)} was in flight: it runs again`).toHaveLength(2);
      for (const s of new Set(all)) if (s !== stage) expect(all.filter((x) => x === s), s).toHaveLength(1);

      for (const j of [id, neighbour]) {
        const rec = k.store.read((t) => reconcileJobSpend(t, j));
        expect(rec.ok && rec.value.drift, `${j} spend equals its meter`).toBeUndefined();
      }
      const end = articleCli(env, `status ${runId}`);
      expect(end).toMatchObject({ status: "awaiting-approval" });
    } finally {
      k.close();
    }
  });
});
