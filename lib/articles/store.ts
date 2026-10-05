// THE ARTICLE RUN STORE — JSON and text files on this machine's disk. Server only.
//
// Same shape as lib/publish/store.ts and lib/foundry/extract/store.ts, for the
// same reasons: no database (the repo's out-of-scope wall), state as JSON under
// `foundry-out/` (gitignored), every write tmp + rename so a reader never sees
// half a file, and an exclusive-create lock file because TWO PROCESSES write a
// run — the Next server behind /api/articles and `pipeline/article.mts`, the
// headless CLI an agent drives. The lock is per run: two runs never contend.
//
// A corrupt run.json is NOT replaced with a fresh one — that would erase a run
// that may have spent money. It throws, and the caller reports it.
//
// THE STATUS MACHINE LIVES HERE, not in the engine, because the store is the
// one door every status change goes through: `updateRun` refuses an illegal
// transition before it writes, whoever asked for it.

import { mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ArticleRun, ArticleStatus } from "./types";

export class ArticleError extends Error {
  constructor(
    message: string,
    /** HTTP-shaped: 400 bad input, 404 no such run, 409 wrong state or busy,
     *  502 an outside tool failed, 503 the registry cannot be reached. */
    readonly status: number,
    /** A closed, greppable name for the failure. */
    readonly code: string,
  ) {
    super(message);
    this.name = "ArticleError";
  }
}

/** Read lazily per call, so a test (or the CLI) can point the store at a temp
 *  directory with ARTICLES_STORE_DIR after this module was imported. */
export function storeRoot(): string {
  const env = process.env.ARTICLES_STORE_DIR?.trim();
  return env ? path.resolve(env) : path.join(process.cwd(), "foundry-out", "articles");
}

/** Run ids are minted by `freshRunId`; a run path is built from an id that a
 *  CLI argument or a URL segment carries, so it is held to the minted shape. */
export const RUN_ID_RE = /^[a-z0-9][a-z0-9-]{0,90}$/;

export function runDir(id: string): string {
  if (!RUN_ID_RE.test(id)) throw new ArticleError(`not a run id: ${JSON.stringify(id)}`, 400, "bad-id");
  return path.join(storeRoot(), id);
}

/** Resolve a run-relative path, refusing anything that escapes the run. */
export function inRun(id: string, rel: string): string {
  const dir = runDir(id);
  const abs = path.resolve(dir, rel);
  if (abs !== dir && !abs.startsWith(dir + path.sep)) {
    throw new ArticleError(`path escapes the run: ${JSON.stringify(rel)}`, 400, "bad-path");
  }
  return abs;
}

export function slugify(text: string, max = 48): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}

/** `<YYYY-MM-DD>-<slug>`, suffixed until free. */
export async function freshRunId(seed: string, now: Date = new Date()): Promise<string> {
  const base = `${now.toISOString().slice(0, 10)}-${slugify(seed, 40) || "article"}`;
  await mkdir(storeRoot(), { recursive: true });
  for (let i = 0; i < 200; i++) {
    const id = i ? `${base}-${i + 1}` : base;
    try {
      await stat(path.join(storeRoot(), id));
    } catch {
      return id;
    }
  }
  throw new ArticleError("too many runs with that topic today", 409, "id-exhausted");
}

/* ── atomic writes ─────────────────────────────────────────────────────────── */

let tmpCounter = 0;

/** tmp + rename, with the short retry Windows needs when a reader (or an
 *  antivirus scan) holds the target for a moment — lib/foundry/runStore.ts
 *  measured the same EPERM/EBUSY window. */
export async function writeFileAtomic(file: string, data: string | Uint8Array): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${++tmpCounter}.tmp`;
  await writeFile(tmp, data);
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(tmp, file);
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if ((code === "EPERM" || code === "EBUSY" || code === "EACCES") && attempt < 9) {
        await sleep(5 * (attempt + 1));
        continue;
      }
      await rm(tmp, { force: true });
      throw e;
    }
  }
}

export const writeJsonAtomic = (file: string, value: unknown) =>
  writeFileAtomic(file, `${JSON.stringify(value, null, 2)}\n`);

/** A JSON file, or `fallback` when it does not exist. A file that exists and
 *  does not parse throws — it is never read as empty. */
export async function readJsonFile<T>(file: string, fallback: T): Promise<T> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw e;
  }
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    throw new ArticleError(`${file} is not valid JSON (${(e as Error).message})`, 500, "corrupt-file");
  }
}

export async function readTextFile(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw e;
  }
}

/* ── the status machine ────────────────────────────────────────────────────── */

/**
 * Every legal move. `failed` is reachable from every working state and leaves
 * only through `resume`, which goes back to the state whose step failed —
 * hence its wide row. `rejected` and `landed` are terminal.
 *
 * `approved` is reachable ONLY from `awaiting-approval` (the human's act) and
 * from `failed` when the failure happened during landing (a resume re-lands;
 * it never re-approves). Pushing to the registry is reachable only through
 * `approved -> landing`, so nothing that has not passed the gate can land.
 *
 * `critiquing` (scope amendment 1) sits between `drafting` and `checking` and
 * is the only way to `checking`: no draft reaches the gate unreviewed. A
 * critique that fails its quorum is `failed` with `critique-quorum`, and a
 * resume goes back into `critiquing`.
 */
export const TRANSITIONS: Record<ArticleStatus, readonly ArticleStatus[]> = {
  queued: ["researching", "failed"],
  researching: ["drafting", "failed"],
  drafting: ["critiquing", "failed"],
  critiquing: ["checking", "failed"],
  checking: ["awaiting-approval", "failed"],
  "awaiting-approval": ["approved", "rejected"],
  approved: ["landing", "failed"],
  landing: ["landed", "failed"],
  landed: [],
  rejected: [],
  failed: ["queued", "researching", "drafting", "critiquing", "checking", "approved"],
};

export function canTransition(from: ArticleStatus, to: ArticleStatus): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

export function assertTransition(from: ArticleStatus, to: ArticleStatus): void {
  if (!canTransition(from, to)) {
    throw new ArticleError(`a run that is ${from} cannot become ${to}`, 409, "bad-transition");
  }
}

/* ── locking ───────────────────────────────────────────────────────────────── */

const LOCK_STALE_MS = 30_000;
const LOCK_WAIT_MS = 10_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function acquireLock(dir: string): Promise<() => Promise<void>> {
  await mkdir(dir, { recursive: true });
  const lock = path.join(dir, ".lock");
  const started = Date.now();
  for (;;) {
    try {
      const fh = await open(lock, "wx");
      await fh.writeFile(JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
      await fh.close();
      return () => rm(lock, { force: true });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      // A mutation is milliseconds of JSON; a lock this old has no living owner.
      const age = await stat(lock).then((s) => Date.now() - s.mtimeMs).catch(() => 0);
      if (age > LOCK_STALE_MS) {
        await rm(lock, { force: true });
        continue;
      }
      if (Date.now() - started > LOCK_WAIT_MS) {
        throw new ArticleError(`the run is locked (${lock}) and the holder did not release it in ${LOCK_WAIT_MS} ms`, 409, "locked");
      }
      await sleep(20 + Math.random() * 30);
    }
  }
}

const queues = new Map<string, Promise<unknown>>();

/** Run `fn` with exclusive access to one run, in this process AND across
 *  processes. */
export function withRunLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const dir = runDir(id);
  const prev = queues.get(dir) ?? Promise.resolve();
  const run = prev.then(async () => {
    const release = await acquireLock(dir);
    try {
      return await fn();
    } finally {
      await release();
    }
  });
  const tail = run.catch(() => undefined);
  queues.set(dir, tail);
  void tail.then(() => {
    if (queues.get(dir) === tail) queues.delete(dir);
  });
  return run;
}

/* ── the manifest ──────────────────────────────────────────────────────────── */

export async function readRun(id: string): Promise<ArticleRun> {
  const file = path.join(runDir(id), "run.json");
  const run = await readJsonFile<ArticleRun | null>(file, null);
  if (!run) throw new ArticleError(`no article run called ${id}`, 404, "not-found");
  return run;
}

/** Write a brand-new run. Refuses to overwrite one that exists. */
export async function writeNewRun(run: ArticleRun): Promise<void> {
  const dir = runDir(run.id);
  await withRunLock(run.id, async () => {
    const exists = await stat(path.join(dir, "run.json")).then(() => true, () => false);
    if (exists) throw new ArticleError(`run ${run.id} already exists`, 409, "exists");
    await writeJsonAtomic(path.join(dir, "run.json"), run);
  });
}

/**
 * Read-modify-write one run under its lock. The mutator receives a copy and
 * returns the next state; a status change is checked against TRANSITIONS
 * before anything is written, and `updatedAt` is stamped here.
 */
export async function updateRun(
  id: string,
  mutate: (run: ArticleRun) => ArticleRun | Promise<ArticleRun>,
  now: () => Date = () => new Date(),
): Promise<ArticleRun> {
  return withRunLock(id, async () => {
    const before = await readRun(id);
    const after = await mutate(structuredClone(before));
    assertTransition(before.status, after.status);
    after.id = before.id;
    after.updatedAt = now().toISOString();
    await writeJsonAtomic(path.join(runDir(id), "run.json"), after);
    return after;
  });
}

/** Every run on disk, newest first. A directory with an unreadable manifest is
 *  skipped and named in `damaged`, not hidden. */
export async function listRuns(): Promise<{ runs: ArticleRun[]; damaged: string[] }> {
  let names: string[] = [];
  try {
    names = await readdir(storeRoot());
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  const runs: ArticleRun[] = [];
  const damaged: string[] = [];
  for (const name of names) {
    if (!RUN_ID_RE.test(name)) continue;
    try {
      const run = await readJsonFile<ArticleRun | null>(path.join(storeRoot(), name, "run.json"), null);
      if (run) runs.push(run);
    } catch {
      damaged.push(name);
    }
  }
  runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  return { runs, damaged };
}

/* ── the driver lease ──────────────────────────────────────────────────────── */

/**
 * WHO IS DRIVING THIS RUN. A run's steps take minutes, so a second driver (a
 * double-clicked resume, the CLI and the server at once) would spend twice and
 * race on the out/ files. A driver holds `.driver` — exclusive-create, with its
 * pid — for the whole drive. A lease whose pid is no longer alive is a crashed
 * driver and is broken; that is what makes `resume` possible after a kill.
 */
export interface DriverLease {
  release: () => Promise<void>;
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

export async function driverAlive(id: string): Promise<boolean> {
  const file = path.join(runDir(id), ".driver");
  const held = await readJsonFile<{ pid?: number } | null>(file, null).catch(() => null);
  return !!held?.pid && pidAlive(held.pid);
}

export async function acquireDriver(id: string): Promise<DriverLease> {
  const file = path.join(runDir(id), ".driver");
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fh = await open(file, "wx");
      await fh.writeFile(JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
      await fh.close();
      return { release: () => rm(file, { force: true }) };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      if (await driverAlive(id)) break;
      await rm(file, { force: true });
    }
  }
  throw new ArticleError(`run ${id} is already being driven by a live process`, 409, "busy");
}
