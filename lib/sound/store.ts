// THE SOUND STORE — three JSON files and a folder of audio on this machine's
// disk, plus the git-tracked ledger beside them. Server-only.
//
//   <root>/takes.json    { version, takes: SoundTake[] }
//   <root>/hunts.json    { version, hunts: Hunt[] }
//   <root>/groups.json   { version, groups: SoundGroups }
//   <root>/files/<id>.<ext>   the bytes a take's `file.path` names
//   <ledger>             pipeline/sound/ledger.json — { verdicts, lessons }
//
// <root> is foundry-out/sound/ (gitignored, like every other foundry output);
// SOUND_STORE_DIR moves it, SOUND_LEDGER_PATH moves the ledger, both read
// lazily per call so a probe or the CLI can point them at a temp directory
// after this module was imported (lib/publish/store.ts:62, same reason).
//
// THE SHAPE IS lib/publish/store.ts's, ON PURPOSE AND FOR ITS REASON. Two
// processes write these files: the Next server (the Sound lab, the Library)
// and pipeline/sound.mts (an agent generating into Triage, judging from a
// terminal). An in-process queue orders writes inside one process; the
// exclusive-create lock file orders them across the two. Every mutation runs
// under both, through `withStore`, and the LEDGER is written inside the same
// transaction as the take whose verdict it records — so a crash can lose a
// whole judgement but never leave a verdict in the ledger that the store does
// not hold, or the other way round.
//
// ATOMIC WRITES. tmp + rename for every JSON file and every audio file: a
// reader sees the old file or the new one, never half. A corrupt JSON file is
// NOT replaced with an empty one — that would erase a shelf of judged takes —
// it throws, and the caller reports it.

import { mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { outPath, soundLedgerFile } from "../fixtures/roots";
import type { Hunt, HuntNode, Lesson, SoundGroups, SoundTake } from "./types";
import type { LedgerVerdict } from "./ledger";

/** A failure with the HTTP status the routes answer it with. The message is
 *  the engine's own sentence and reaches the operator verbatim as `{ error }`. */
export class SoundError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "SoundError";
    this.status = status;
  }
}

export function storeRoot(): string {
  const env = process.env.SOUND_STORE_DIR?.trim();
  return env ? path.resolve(env) : outPath("sound");
}

export function ledgerPath(): string {
  const env = process.env.SOUND_LEDGER_PATH?.trim();
  return env ? path.resolve(env) : soundLedgerFile();
}

/** Ids are minted here (`st-` / `hn-` / `ls-` + 10 hex), but one also arrives
 *  from a URL segment, a CLI argument, or a migrated Library row that keeps its
 *  own id — so every id that becomes part of a path is held to this shape. */
export const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
export function safeId(id: string): string {
  if (!ID_RE.test(id)) throw new SoundError(`not a valid id: ${JSON.stringify(id).slice(0, 90)}`, 400);
  return id;
}

export interface TakesFile {
  version: 1;
  takes: SoundTake[];
}
export interface HuntsFile {
  version: 1;
  hunts: Hunt[];
}
export interface GroupsFile {
  version: 1;
  groups: SoundGroups;
}
export interface LedgerFile {
  verdicts: LedgerVerdict[];
  lessons: Lesson[];
}

/** The rows an empty arrangement starts with. Genre groups for music, sfx
 *  categories for effects — the operator renames, adds and reorders them; these
 *  are only so the first kept take has somewhere other than "ungrouped" to go. */
export const DEFAULT_GROUPS: SoundGroups = {
  music: ["ambient", "cinematic", "electronic", "hip hop"],
  sfx: ["impacts", "whooshes", "risers", "ambiences", "ui"],
};

const FILES = { takes: "takes.json", hunts: "hunts.json", groups: "groups.json" } as const;

type Kind = keyof typeof FILES | "ledger";
type Shape = { takes: TakesFile; hunts: HuntsFile; groups: GroupsFile; ledger: LedgerFile };

const EMPTY: { [K in Kind]: () => Shape[K] } = {
  takes: () => ({ version: 1, takes: [] }),
  hunts: () => ({ version: 1, hunts: [] }),
  groups: () => ({ version: 1, groups: { music: [...DEFAULT_GROUPS.music], sfx: [...DEFAULT_GROUPS.sfx] } }),
  ledger: () => ({ verdicts: [], lessons: [] }),
};

const fileOf = (kind: Kind) => (kind === "ledger" ? ledgerPath() : path.join(storeRoot(), FILES[kind]));

async function readKind<K extends Kind>(kind: K): Promise<Shape[K]> {
  const file = fileOf(kind);
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return EMPTY[kind]() as Shape[K];
    throw e;
  }
  let parsed: Shape[K];
  try {
    parsed = JSON.parse(raw) as Shape[K];
  } catch (e) {
    throw new SoundError(`${file} is not valid JSON (${(e as Error).message}); refusing to overwrite it`, 500);
  }
  // A file a person edited by hand (the ledger is git-tracked and meant to be
  // read) may lose a key; an absent array is an empty one, an absent object is
  // the default — never a crash on the next judgement.
  if (kind === "ledger") {
    const l = parsed as LedgerFile;
    l.verdicts = Array.isArray(l.verdicts) ? l.verdicts : [];
    l.lessons = Array.isArray(l.lessons) ? l.lessons : [];
  } else if (kind === "takes") {
    const f = parsed as TakesFile;
    f.takes = Array.isArray(f.takes) ? f.takes.map(withTakeDefaults) : [];
  } else if (kind === "hunts") {
    const f = parsed as HuntsFile;
    f.hunts = Array.isArray(f.hunts) ? f.hunts.map((h) => ({ ...h, nodes: Array.isArray(h.nodes) ? h.nodes.map(withNodeDefaults) : [] })) : [];
  }
  else if (kind === "groups") (parsed as GroupsFile).groups ??= EMPTY.groups().groups;
  return parsed;
}

/* ── reading an older file ───────────────────────────────────────────────────
 * The closeout of round 4 added fields to SoundTake (the Library's facts),
 * MeasuredSound (durationS) and HuntNode (loop, terms, tempo, key). A file
 * written before them is read with each one at its absent value — null, or an
 * empty terms bag — so every reader (routes, CLI, probes) sees one shape and
 * no consumer has to guard `undefined`. Nothing is rewritten on read; the next
 * write of the row carries the full shape. */

const EMPTY_TERMS = () => ({ genre: [], mood: [], instrument: [], sfxCategory: null });

export function withTakeDefaults(t: SoundTake): SoundTake {
  const o = t as Partial<SoundTake> & SoundTake;
  return {
    ...o,
    measured: o.measured ? { ...o.measured, energy: o.measured.energy ?? null, durationS: o.measured.durationS ?? null } : (o.measured ?? null),
    referenceTrackId: o.referenceTrackId ?? null,
    promptRound: o.promptRound ?? null,
    draftId: o.draftId ?? null,
    variation: o.variation ?? null,
    editModes: o.editModes ?? null,
    fileName: o.fileName ?? null,
    projectId: o.projectId ?? null,
    cueId: o.cueId ?? null,
  };
}

export function withNodeDefaults(n: HuntNode): HuntNode {
  const o = n as Partial<HuntNode> & HuntNode;
  const t = o.terms;
  return {
    ...o,
    loop: typeof o.loop === "boolean" ? o.loop : null,
    terms:
      t && typeof t === "object"
        ? {
            genre: Array.isArray(t.genre) ? t.genre : [],
            mood: Array.isArray(t.mood) ? t.mood : [],
            instrument: Array.isArray(t.instrument) ? t.instrument : [],
            sfxCategory: typeof t.sfxCategory === "string" ? t.sfxCategory : null,
          }
        : EMPTY_TERMS(),
    tempoBpm: typeof o.tempoBpm === "number" && Number.isFinite(o.tempoBpm) ? o.tempoBpm : null,
    key: typeof o.key === "string" && o.key ? o.key : null,
  };
}

let tmpCounter = 0;
const tmpOf = (file: string) => `${file}.${process.pid}.${++tmpCounter}.tmp`;

/** tmp + rename: a reader sees the old file or the new one, never half of one. */
export async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = tmpOf(file);
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tmp, file);
}

/** The same discipline for audio bytes. Returns the store-relative path. */
export async function writeBytesAtomic(rel: string, bytes: Uint8Array): Promise<string> {
  const abs = path.join(storeRoot(), rel);
  await mkdir(path.dirname(abs), { recursive: true });
  const tmp = tmpOf(abs);
  await writeFile(tmp, bytes);
  await rename(tmp, abs);
  return rel.split(path.sep).join("/");
}

/** Resolve a take's `file.path` to an absolute path INSIDE the store, or throw.
 *  The path is written by this module, but takes.json is a file on disk a
 *  person can edit, and a `..` there must not turn the file route into a
 *  reader of the whole machine. */
export function filePathAbs(rel: string): string {
  const root = storeRoot();
  const abs = path.resolve(root, rel);
  if (!abs.startsWith(root + path.sep)) throw new SoundError(`file path escapes the store: ${rel}`, 400);
  return abs;
}

export async function removeFile(rel: string): Promise<void> {
  await rm(filePathAbs(rel), { force: true });
}

// ── locking (lib/publish/store.ts:126, the same two-writer reasoning) ─────────

const LOCK_STALE_MS = 30_000;
const LOCK_WAIT_MS = 10_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function acquireLock(): Promise<() => Promise<void>> {
  const root = storeRoot();
  await mkdir(root, { recursive: true });
  const lock = path.join(root, ".lock");
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
      if (Date.now() - started > LOCK_WAIT_MS)
        throw new SoundError(`the sound store is locked (${lock}) and the holder did not release it in ${LOCK_WAIT_MS} ms`, 503);
      await sleep(20 + Math.random() * 30);
    }
  }
}

let queue: Promise<unknown> = Promise.resolve();

/** Run `fn` with exclusive access to the store (and the ledger), in this
 *  process AND across processes. Every read-modify-write goes through here. */
export function withStore<T>(fn: (tx: StoreTx) => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const release = await acquireLock();
    try {
      const tx = new StoreTx();
      const out = await fn(tx);
      await tx.commit();
      return out;
    } finally {
      await release();
    }
  });
  // the queue survives a failed mutation; the failure belongs to its caller
  queue = run.catch(() => undefined);
  return run;
}

/** A transaction: loads each file at most once, writes back only what was touched. */
export class StoreTx {
  private loaded: { [K in Kind]?: Shape[K] } = {};
  private dirty = new Set<Kind>();

  async get<K extends Kind>(kind: K): Promise<Shape[K]> {
    const have = this.loaded[kind] as Shape[K] | undefined;
    if (have) return have;
    const fresh = await readKind(kind);
    (this.loaded as Record<Kind, unknown>)[kind] = fresh;
    return fresh;
  }

  touch(kind: Kind): void {
    this.dirty.add(kind);
  }

  async commit(): Promise<void> {
    // The ledger LAST: if the store write fails the ledger is untouched, and a
    // verdict is never recorded for a judgement the store did not keep.
    const order = [...this.dirty].sort((a, b) => Number(a === "ledger") - Number(b === "ledger"));
    for (const kind of order) await writeJsonAtomic(fileOf(kind), this.loaded[kind]);
    this.dirty.clear();
  }
}

/** Unlocked snapshot reads, for GETs and the CLI's listings. */
export const readTakes = () => readKind("takes");
export const readHunts = () => readKind("hunts");
export const readGroups = () => readKind("groups");
export const readLedger = () => readKind("ledger");

/** `st-` + 10 hex. Ids sort by nothing; `createdAt` is the order. */
export function mintId(prefix: "st" | "hn" | "ls" | "nd"): string {
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}-${hex}`;
}
