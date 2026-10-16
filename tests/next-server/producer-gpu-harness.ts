import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { parseAt, parseJsonAt } from "@gt/domain/door";
import type { Actor } from "@gt/domain/event";
import { jobIdSchema, type JobId } from "@gt/domain/ids";
import type { Job } from "@gt/domain/job";
import { get } from "@gt/kernel/job";
import { openKernel, type Kernel } from "@gt/kernel/kernel";

// THE FOUNDRY GPU PRODUCERS' TEST WORLD (L34): forge and Dojo, whose plan and
// receipt are Node's and whose perform is Python's (pipeline/foundry/worker.py).
// Every test gets its own universe - a kernel store, a runs root, a training root,
// a frames dir - in a temp directory named by the env vars both languages honour
// (GRAVITONE_STORE_PATH, FOUNDRY_RUNS_DIR, FOUNDRY_TRAINING_DIR, FOUNDRY_FRAMES_DIR).
// GRAVITONE_DRY_ONLY=1 in every child: no ComfyUI, no Ollama, no Google, ever.

export const REPO = process.cwd();
export const operator: Actor = { kind: "operator", id: "l34" };
const TMP = mkdtempSync(path.join(os.tmpdir(), "gt-l34-"));
export const disposeAll = (): void => rmSync(TMP, { recursive: true, force: true });

export function findPython(): string | undefined {
  for (const bin of ["python", "python3", "py"]) {
    const r = spawnSync(bin, ["-c", "import sys; print(sys.version_info[0])"], { encoding: "utf8" });
    if (r.status === 0 && r.stdout.trim() === "3") return bin;
  }
  return undefined;
}
export const PYTHON = findPython();

/** A 1x1 PNG: a frame the dry forge copies whole. */
export const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

let n = 0;
export type Universe = { readonly dir: string; readonly store: string; readonly runs: string; readonly training: string; readonly frames: string; readonly env: NodeJS.ProcessEnv };

export function universe(): Universe {
  const dir = path.join(TMP, `u${++n}`);
  const u = { dir, store: path.join(dir, "store.sqlite"), runs: path.join(dir, "foundry-out", "runs"), training: path.join(dir, "foundry-out", "training"), frames: path.join(dir, "frames") };
  for (const d of [u.runs, u.training, u.frames]) mkdirSync(d, { recursive: true });
  writeFileSync(path.join(u.frames, "f1.jpg"), PNG);
  const env: NodeJS.ProcessEnv = { ...process.env, GRAVITONE_STORE_PATH: u.store, FOUNDRY_RUNS_DIR: u.runs, FOUNDRY_TRAINING_DIR: u.training, FOUNDRY_FRAMES_DIR: u.frames, GRAVITONE_DRY_ONLY: "1", PYTHONIOENCODING: "utf-8" };
  // The store exists and is migrated before any Python process opens it (Python never migrates).
  const k = openKernel(u.store);
  if (!k.ok) throw k.error;
  k.value.close();
  return { ...u, env };
}

export function kernelOf(u: Universe): Kernel {
  const k = openKernel(u.store);
  if (!k.ok) throw k.error;
  return k.value;
}

export const jid = (id: string): JobId => {
  const p = parseAt("job id", jobIdSchema, id);
  if (!p.ok) throw p.error;
  return p.value;
};

export function jobOf(k: Kernel, id: string): Job {
  const r = get(k.store, jid(id));
  if (!r.ok) throw r.error;
  return r.value.job;
}

export type Spawned = { readonly status: number | null; readonly stdout: string; readonly stderr: string };

export function py(u: Universe, args: readonly string[], extra: Readonly<Record<string, string>> = {}): Spawned {
  const r = spawnSync(PYTHON ?? "python", args, { cwd: REPO, env: { ...u.env, ...extra }, encoding: "utf8", timeout: 120_000 });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

export function pyAsync(u: Universe, args: readonly string[], extra: Readonly<Record<string, string>> = {}): ChildProcess {
  return spawn(PYTHON ?? "python", args, { cwd: REPO, env: { ...u.env, ...extra }, stdio: ["ignore", "pipe", "pipe"] });
}

export function nodeCli(u: Universe, args: readonly string[], extra: Readonly<Record<string, string>> = {}): Spawned {
  const r = spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", ...args], { cwd: REPO, env: { ...u.env, ...extra }, encoding: "utf8", timeout: 120_000 });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

const docSchema = z.record(z.string(), z.unknown());
/** The last stdout line as the one JSON document a `--json` CLI prints. */
export function docOf(s: Spawned): Record<string, unknown> {
  const last = s.stdout.trim().split("\n").at(-1) ?? "";
  const d = parseJsonAt("cli document", docSchema, last);
  if (!d.ok) throw new Error(`no JSON document (exit ${String(s.status)}): ${s.stdout}\n${s.stderr}`);
  return d.value;
}

/** One stdout line per job (the worker's --json). */
export function linesOf(s: Spawned): Record<string, unknown>[] {
  return s.stdout
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l, i) => {
      const d = parseJsonAt(`worker line ${i + 1}`, docSchema, l);
      if (!d.ok) throw d.error;
      return d.value;
    });
}

/** Wait until `test()` holds, polling; throws with `what` on timeout. */
export async function until(test: () => boolean, what: string, ms = 30_000): Promise<void> {
  const end = Date.now() + ms;
  while (!test()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

/** Step names started, in order, from the job's events (both attempts). */
export function startsOf(k: Kernel, jobId: string): string[] {
  const r = k.store.read((t) => t.all("SELECT json_extract(data, '$.step') AS s FROM events WHERE subject_id = ? AND type = 'job.step-started' ORDER BY seq", jobId).map((row) => String(row["s"])));
  if (!r.ok) throw r.error;
  return r.value;
}
