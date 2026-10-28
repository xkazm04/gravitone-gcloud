import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";

import { z } from "zod";

import { parseJsonAt } from "@gt/domain/door";
import { err, ok, type Result } from "@gt/domain/errors";

import { canSpawnLocalBinaries } from "../deployment.ts";
import { renderAudition, renderSketch, SIDECAR_SCRIPT, type AuditionSpec, type SketchSpec } from "./sidecar.ts";

// WARM RENDERERS - the audition and sketch renders through long-lived `sidecar.py serve` processes.
//
// A render is about a second of work; starting Python and importing NumPy is three more on a loaded
// box (measured: imports 3.1 s, an audition 1.0 s, in one process). An ear that waits four seconds
// per press is an ear people stop pressing, so two workers are kept running and fed one JSON line
// per request (pipeline/audio/audition.py `serve`). Every request is bounded; a worker that
// overruns is killed and the next request starts a fresh one. A worker that cannot start - no
// Python, a posture that may not spawn - leaves the per-call spawn (./sidecar.ts) in charge, which
// answers in its own words. The pool lives on globalThis so a dev reload does not orphan workers;
// a worker whose parent goes away sees its stdin close and exits.

type Verb = "audition" | "sketch";
type Done = Result<{ readonly durationS: number }>;
type Pending = { readonly verb: Verb; readonly resolve: (r: Done) => void; readonly timer: ReturnType<typeof setTimeout> };
type Worker = { readonly child: ChildProcess; readonly pending: Map<string, Pending>; buf: string; said: string; dead: boolean };
type Pool = { workers: Worker[]; seq: number; broken: string | null };

const SIZE = 2;
const KEEP_STDERR = 4096;
const g = globalThis as typeof globalThis & { __gtAuditionPool?: Pool };
const pool = (): Pool => (g.__gtAuditionPool ??= { workers: [], seq: 0, broken: null });
const python = (): string => process.env["PYTHON"] ?? (process.platform === "win32" ? "python" : "python3");

const answerSchema = z.object({ id: z.string().nullable(), ok: z.boolean(), error: z.string().optional(), kind: z.string().optional(), durationS: z.number().optional() });

function settle(w: Worker, id: string, r: Done): void {
  const p = w.pending.get(id);
  if (p === undefined) return;
  clearTimeout(p.timer);
  w.pending.delete(id);
  p.resolve(r);
}

function retire(w: Worker, why: string): void {
  if (w.dead) return;
  w.dead = true;
  const p = pool();
  p.workers = p.workers.filter((x) => x !== w);
  for (const id of [...w.pending.keys()]) settle(w, id, err("unavailable", why));
  if (w.child.exitCode === null) w.child.kill();
}

function start(): Worker | null {
  let child: ChildProcess;
  try {
    child = spawn(python(), [path.resolve(SIDECAR_SCRIPT), "serve", "--json"], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  } catch (e) {
    pool().broken = e instanceof Error ? e.message : String(e);
    return null;
  }
  // A warm worker never keeps its parent alive: a CLI or a test ends when its own work does.
  child.unref();
  for (const s of [child.stdin, child.stdout, child.stderr]) (s as unknown as { unref?: () => void } | null)?.unref?.();
  const w: Worker = { child, pending: new Map(), buf: "", said: "", dead: false };
  child.stdout?.on("data", (b: Buffer) => {
    w.buf += b.toString("utf8");
    for (let at = w.buf.indexOf("\n"); at >= 0; at = w.buf.indexOf("\n")) {
      const line = w.buf.slice(0, at).trim();
      w.buf = w.buf.slice(at + 1);
      if (line === "") continue;
      const doc = parseJsonAt("audition worker", answerSchema, line);
      const id = doc.ok ? doc.value.id : null;
      if (!doc.ok || id === null) continue; // not an answer to a request: the request's own timer speaks
      const a = doc.value;
      const verb = w.pending.get(id)?.verb ?? "audition";
      settle(w, id, a.ok ? ok({ durationS: a.durationS ?? 0 }) : err(a.kind === "refused" ? "invalid" : "unavailable", `audio sidecar ${verb}: ${a.error ?? "failed"}`));
    }
  });
  child.stderr?.on("data", (b: Buffer) => {
    w.said = (w.said + b.toString("utf8")).slice(-KEEP_STDERR);
  });
  child.on("error", (e) => {
    pool().broken = e.message;
    retire(w, `audition worker could not run: ${e.message}`);
  });
  child.on("exit", (code) => retire(w, `audition worker exited ${String(code)}${w.said.trim() === "" ? "" : `: ${w.said.trim().split(/\r?\n/).slice(-2).join(" | ")}`}`));
  pool().workers.push(w);
  return w;
}

/** The live worker with the least queued, starting one while the pool is under size. */
function pick(): Worker | null {
  const p = pool();
  const live = p.workers.filter((w) => !w.dead);
  const idle = live.find((w) => w.pending.size === 0);
  if (idle !== undefined) return idle;
  if (live.length < SIZE) return start() ?? live[0] ?? null;
  return live.sort((a, b) => a.pending.size - b.pending.size)[0] ?? null;
}

function viaWorker(verb: Verb, spec: AuditionSpec | SketchSpec, out: string, timeoutMs: number): Promise<Done> | null {
  if (!canSpawnLocalBinaries() || pool().broken !== null) return null;
  const w = pick();
  if (w === null || w.child.stdin === null) return null;
  const id = `r${++pool().seq}`;
  return new Promise<Done>((resolve) => {
    const timer = setTimeout(() => retire(w, `audio sidecar ${verb} did not finish in ${Math.round(timeoutMs / 1000)} s and was stopped`), timeoutMs);
    w.pending.set(id, { verb, resolve, timer });
    w.child.stdin?.write(`${JSON.stringify({ id, verb, spec, out })}\n`, (e) => {
      if (e) retire(w, `audition worker refused the request: ${e.message}`);
    });
  });
}

/** An audition through a warm worker, or through a fresh process when no worker can run. */
export async function renderAuditionWarm(spec: AuditionSpec, out: string, timeoutMs: number): Promise<Done> {
  const r = await viaWorker("audition", spec, out, timeoutMs);
  return r ?? renderAudition(spec, out, { timeoutMs });
}

/** A sketch through a warm worker, or through a fresh process when no worker can run. */
export async function renderSketchWarm(spec: SketchSpec, out: string, timeoutMs: number): Promise<Done> {
  const r = await viaWorker("sketch", spec, out, timeoutMs);
  return r ?? renderSketch(spec, out, { timeoutMs });
}

/** Stop every warm worker (a test's afterAll; a server never needs to). */
export function stopWorkers(): void {
  for (const w of [...pool().workers]) retire(w, "audition worker stopped");
}
