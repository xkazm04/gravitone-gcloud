import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";

import { z } from "zod";

import { parseScoreSpec, type ScoreSpec } from "@gt/domain/audio.score";
import { parseJsonAt } from "@gt/domain/door";
import { err, ok, type Result } from "@gt/domain/errors";

import { canSpawnLocalBinaries } from "../deployment.ts";
import { SIDECAR_SCRIPT, renderScore, renderScoreAnswerSchema, type RenderScoreOptions, type RenderScoreResult } from "./sidecar.ts";
import { renderAudition, renderSketch, type AuditionSpec, type SketchSpec } from "./sidecarPhrase.ts";

// WARM RENDERERS - the audition, sketch and render-score renders through long-lived `sidecar.py serve`
// processes. (render-score joined in stage S2 of spark audio-agent-studio: an agent arranging a track
// renders after nearly every turn, and Vital's cold load is three seconds of each.)
//
// A render is about a second of work; starting Python and importing NumPy is three more on a loaded
// box (measured: imports 3.1 s, an audition 1.0 s, in one process). An ear that waits four seconds
// per press is an ear people stop pressing, so two workers are kept running.
//
// THE QUEUE IS NODE'S. A worker is handed one request at a time and pulls the next when it answers,
// so a request's clock starts when its render does - never while it waits behind another - and a
// worker killed for overrunning takes only its own request down; what was waiting goes to the next
// worker. A worker that cannot start (no Python, a NumPy that will not import) sends the work back
// to the per-call spawn (./sidecar.ts), which answers in its own words with its own remedy. The pool
// lives on globalThis so a dev reload does not orphan workers; they are unref'd so a CLI or a test
// ends with its own work, and a worker whose parent goes away sees its stdin close and exits.

type Verb = "audition" | "sketch" | "render-score";
type Done = Result<{ readonly durationS: number }>;
/** "fallback": no warm worker can run here; the caller renders in a fresh process. */
type Answer<T = unknown> = Result<T> | "fallback";
/** `answer` reads a successful answer line: each verb its own shape (render-score's is the cold verb's). */
type Job = { readonly id: string; readonly verb: Verb; readonly line: string; readonly timeoutMs: number; readonly answer: z.ZodType; readonly resolve: (a: Answer) => void };
type Worker = { readonly child: ChildProcess; current: { readonly job: Job; readonly timer: ReturnType<typeof setTimeout> } | null; answered: boolean; buf: string; said: string; dead: boolean };
type Pool = { workers: Worker[]; queue: Job[]; seq: number; broken: string | null; failedStarts: number };

const SIZE = 2;
/** A whole score (up to 8 stems, Vital among them) is minutes of audio; a phrase is seconds. */
export const RENDER_SCORE_WARM_TIMEOUT_MS = 180_000;
const KEEP_STDERR = 4096;
/** Workers that die before answering once, in a row, before the warm path is given up for this process. */
const START_FAILURES = 2;
// Versioned: a dev reload keeps globalThis, and a pool left by an older shape of this module (one
// without a queue, say) would otherwise be taken up by the new code and fail every render. V3: jobs
// carry their answer schema, and a worker started before render-score existed would not know it.
type OldPool = { workers?: { child?: ChildProcess }[] };
const g = globalThis as typeof globalThis & { __gtAuditionPoolV3?: Pool; __gtAuditionPoolV2?: OldPool; __gtAuditionPool?: OldPool };
for (const w of [...(g.__gtAuditionPool?.workers ?? []), ...(g.__gtAuditionPoolV2?.workers ?? [])]) if (w.child?.exitCode === null) w.child.kill();
delete g.__gtAuditionPool;
delete g.__gtAuditionPoolV2;
const pool = (): Pool => (g.__gtAuditionPoolV3 ??= { workers: [], queue: [], seq: 0, broken: null, failedStarts: 0 });
/** The repo root, pinned as every worker's cwd: the renderer reads repo-relative files (audio.roles.json, .hackathon/). */
const repoRoot = (): string => path.dirname(path.dirname(path.dirname(path.resolve(SIDECAR_SCRIPT))));
const python = (): string => process.env["PYTHON"] ?? (process.platform === "win32" ? "python" : "python3");

/** Every answer line's envelope: whose request, and did it work. The body is read by the job's own schema. */
const envelopeSchema = z.object({ id: z.string().nullable(), ok: z.boolean(), error: z.string().optional(), kind: z.string().optional() });
const phraseAnswerSchema = z.object({ durationS: z.number().optional() }).transform((a) => ({ durationS: a.durationS ?? 0 }));

/** Give everything still waiting back to the per-call spawn: the warm path is broken here. */
function drainToFallback(): void {
  for (const j of pool().queue.splice(0)) j.resolve("fallback");
}

function finish(w: Worker, a: Answer): void {
  const cur = w.current;
  if (cur === null) return;
  clearTimeout(cur.timer);
  w.current = null;
  cur.job.resolve(a);
}

function retire(w: Worker, why: string, broken = false): void {
  if (w.dead) return;
  w.dead = true;
  const p = pool();
  p.workers = p.workers.filter((x) => x !== w);
  if (!w.answered) p.failedStarts += 1;
  if (broken || p.failedStarts >= START_FAILURES) p.broken = why;
  // The request it was rendering ends here: in words when it overran a running worker, back to a
  // fresh process when the worker never answered at all.
  finish(w, broken || !w.answered ? "fallback" : err("unavailable", why));
  if (w.child.exitCode === null) w.child.kill();
  if (p.broken !== null) drainToFallback();
  else dispatch();
}

function start(): Worker | null {
  let child: ChildProcess;
  try {
    child = spawn(python(), [path.resolve(SIDECAR_SCRIPT), "serve", "--json"], { cwd: repoRoot(), windowsHide: true, stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
  } catch (e) {
    pool().broken = e instanceof Error ? e.message : String(e);
    return null;
  }
  child.unref();
  for (const s of [child.stdin, child.stdout, child.stderr]) (s as unknown as { unref?: () => void } | null)?.unref?.();
  const w: Worker = { child, current: null, answered: false, buf: "", said: "", dead: false };
  child.stdout?.on("data", (b: Buffer) => {
    w.buf += b.toString("utf8");
    for (let at = w.buf.indexOf("\n"); at >= 0; at = w.buf.indexOf("\n")) {
      const line = w.buf.slice(0, at).trim();
      w.buf = w.buf.slice(at + 1);
      const doc = line === "" ? null : parseJsonAt("audition worker", envelopeSchema, line);
      const job = w.current?.job;
      if (doc === null || !doc.ok || job === undefined || doc.value.id !== job.id) continue; // not this request's answer: its own timer speaks
      const a = doc.value;
      w.answered = true;
      pool().failedStarts = 0;
      if (!a.ok) {
        finish(w, err(a.kind === "refused" ? "invalid" : "unavailable", `audio sidecar ${job.verb}: ${a.error ?? "failed"}`));
      } else {
        const body = parseJsonAt(`audio sidecar ${job.verb}`, job.answer, line);
        finish(w, body.ok ? ok(body.value) : err("unavailable", body.error.message));
      }
      dispatch();
    }
  });
  child.stderr?.on("data", (b: Buffer) => {
    w.said = (w.said + b.toString("utf8")).slice(-KEEP_STDERR);
  });
  child.on("error", (e) => retire(w, `audition worker could not run: ${e.message}`, true));
  child.on("exit", (code) => retire(w, `audition worker exited ${String(code)}${w.said.trim() === "" ? "" : `: ${w.said.trim().split(/\r?\n/).slice(-2).join(" | ")}`}`));
  pool().workers.push(w);
  return w;
}

/** Hand waiting requests to idle workers, starting workers while the pool is under size. */
function dispatch(): void {
  const p = pool();
  while (p.queue.length > 0 && p.broken === null) {
    const w = p.workers.find((x) => !x.dead && x.current === null) ?? (p.workers.length < SIZE ? start() : null);
    if (w === null || w.child.stdin === null) break;
    const job = p.queue.shift();
    if (job === undefined) break;
    const timer = setTimeout(() => retire(w, `audio sidecar ${job.verb} did not finish in ${Math.round(job.timeoutMs / 1000)} s and was stopped`), job.timeoutMs);
    w.current = { job, timer };
    w.child.stdin.write(job.line, (e) => {
      if (e) retire(w, `audition worker refused the request: ${e.message}`);
    });
  }
  if (p.broken !== null) drainToFallback();
}

/** Queue one request; `request` is the verb's own fields (the id and verb are added here). */
function viaWorker<S extends z.ZodType>(verb: Verb, request: Readonly<Record<string, unknown>>, answer: S, timeoutMs: number): Promise<Answer<z.output<S>>> {
  const p = pool();
  if (!canSpawnLocalBinaries() || p.broken !== null) return Promise.resolve("fallback");
  const id = `r${++p.seq}`;
  return new Promise<Answer<z.output<S>>>((resolve) => {
    p.queue.push({ id, verb, line: `${JSON.stringify({ id, verb, ...request })}\n`, timeoutMs, answer, resolve: resolve as (a: Answer) => void });
    dispatch();
  });
}

/** An audition through a warm worker, or through a fresh process when no worker can run. */
export async function renderAuditionWarm(spec: AuditionSpec, out: string, timeoutMs: number): Promise<Done> {
  const r = await viaWorker("audition", { spec, out }, phraseAnswerSchema, timeoutMs);
  return r === "fallback" ? renderAudition(spec, out, { timeoutMs }) : r;
}

/** A sketch through a warm worker, or through a fresh process when no worker can run. */
export async function renderSketchWarm(spec: SketchSpec, out: string, timeoutMs: number): Promise<Done> {
  const r = await viaWorker("sketch", { spec, out }, phraseAnswerSchema, timeoutMs);
  return r === "fallback" ? renderSketch(spec, out, { timeoutMs }) : r;
}

/**
 * A whole ScoreSpec through a warm worker - the same facts and the same answer as the cold
 * `render-score` verb (./sidecar.ts renderScore), which is the fallback when no worker can run here.
 */
export async function renderScoreWarm(specInput: ScoreSpec, outDir: string, opts: RenderScoreOptions = {}): Promise<Result<RenderScoreResult>> {
  const checked = parseScoreSpec(specInput);
  if (!checked.ok) return checked;
  const timeoutMs = opts.timeoutMs ?? RENDER_SCORE_WARM_TIMEOUT_MS;
  const request = {
    spec: checked.value,
    outDir,
    ...(opts.cacheDir === undefined ? {} : { cacheDir: opts.cacheDir }),
    ...(opts.verifyDeterminism === true ? { verifyDeterminism: true } : {}),
    ...(opts.allowFallback === true ? { allowFallback: true } : {}),
  };
  const r = await viaWorker("render-score", request, renderScoreAnswerSchema, timeoutMs);
  return r === "fallback" ? renderScore(checked.value, outDir, { ...opts, timeoutMs }) : (r as Result<RenderScoreResult>);
}

/**
 * Start the workers before anyone presses play: the first press after a server starts otherwise
 * pays the imports (three seconds) while the person waits on a pulsing mark. Idempotent; a box
 * that cannot spawn, or whose workers already failed to start, is left to the per-call path.
 */
export function warmWorkers(): void {
  const p = pool();
  if (!canSpawnLocalBinaries() || p.broken !== null || p.failedStarts > 0) return;
  while (p.workers.filter((w) => !w.dead).length < SIZE && start() !== null);
}

/** Stop every warm worker (a test's afterAll; a server never needs to). */
export function stopWorkers(): void {
  const p = pool();
  for (const w of [...p.workers]) {
    w.dead = true;
    finish(w, err("unavailable", "audition worker stopped"));
    if (w.child.exitCode === null) w.child.kill();
  }
  p.workers = [];
}
