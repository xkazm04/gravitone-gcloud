// THE ARTICLE RUN STORE — JSON and text files on this machine's disk. Server only.
//
// Same shape as v1 lib/publish/store.ts (gone at L75) and lib/foundry/extract/store.ts, for the
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

import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { acquireLock as acquireDiskLock } from "../diskTx";

import { canTransition as canTransitionData, type ArticleRun, type ArticleStatus } from "./types";

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

/* ── the status machine ──────────────────────────────────────── */

// THE TABLE ITSELF LIVES IN ./types.ts, and this is not tidying.
//
// A client surface has to know which moves are legal - the pipeline canvas
// offers a drag only where the engine would accept it, and the alternative is
// a second copy of the table on the client, which is a second bug: the day the
// two disagree, the canvas offers a move the engine refuses and the operator
// learns that the board lies. This module cannot be that home, because it
// imports `node:fs/promises`. types.ts can: it is types and constants only.
//
// So the DATA lives there and is re-exported here, leaving every server call
// site in this file and in engine.ts untouched. `assertTransition` stays,
// because it throws ArticleError, which is this module's.
export { TRANSITIONS, canTransition } from "./types";

export function assertTransition(from: ArticleStatus, to: ArticleStatus): void {
  if (!canTransitionData(from, to)) {
    throw new ArticleError(`a run that is ${from} cannot become ${to}`, 409, "bad-transition");
  }
}

/* ── locking ───────────────────────────────────────────────────────────────── */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const acquireLock = (dir: string) =>
  acquireDiskLock(path.join(dir, ".lock"), {
    onTimeout: (lock, waitMs) =>
      new ArticleError(`the run is locked (${lock}) and the holder did not release it in ${waitMs} ms`, 409, "locked"),
  });

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

/* ── who drives a run ──────────────────────────────────────────────────────── */

// v1 kept a `.driver` file here - exclusive-create, with the driver's pid - so a second
// drive (a double-clicked resume, the CLI and the server at once) could not spend twice.
// Phase 4 (L30) moved that guarantee to the kernel: a run is driven by its job
// (lib/producers/article.ts), and the job is claimed under a fenced slot lease on
// `seat.text`, so a second driver is refused at the claim and a driver that woke after a
// take-over writes nothing. What the pid file could not do and the fence does: tell a
// live holder on another host from a dead one, and stop a zombie's write. Readers that
// asked `driverAlive` ask the job now (lib/producers/article.ts `articleJobsOf`); a
// `.driver` left by a v1 build is still read by the ledger projection
// (lib/ledger/v1/sources/articles.ts) until its pid dies.
//
// The `.lock` above STAYS. It is not a driver lease: it makes one read-modify-write of
// run.json atomic between processes, and the human's acts at the gate (approve, reject,
// rework) write run.json from a route while no job holds the run. The kernel lease covers
// the drive, not those.

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** A `.driver` a v1 build left, whose pid is still alive: that process is driving the run
 *  outside any job, and a reader must not call the run stalled. Nothing writes the file now. */
export async function legacyDriverAlive(id: string): Promise<boolean> {
  const held = await readJsonFile<{ pid?: number } | null>(path.join(runDir(id), ".driver"), null).catch(() => null);
  return typeof held?.pid === "number" && pidAlive(held.pid);
}
