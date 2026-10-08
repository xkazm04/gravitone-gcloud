// THE TURN LEDGER — one durable record per AI turn, on the server. SERVER ONLY.
//
// Until this file the only record of a minutes-long paid turn was a row in one
// browser tab's localStorage (lib/jobs.tsx, `gravitone.jobs.v1`). A reload
// rewrote it `interrupted` — "the prototype cannot reattach to it" — and the
// answer lived only in the HTTP response of a request the tab had stopped
// reading. This is the record moving to where the work runs (AIO-A, stage 1).
//
// ── SHAPE ───────────────────────────────────────────────────────────────────
//
// One JSON file per turn, `<dir>/<id>.json`, written whole through the
// foundry run-store kernel's `writeJsonAtomic` (tmp + rename, with the Windows
// rename retry), so a reader sees the old record or the new one and never half
// of either. `<dir>` is `TEXT_TURN_DIR` when set, else `foundry-out/turns/`
// (gitignored with every other foundry output).
//
// THE PROMPT IS NEVER WRITTEN. A record carries `promptDigest` (sha256) and
// `promptChars`, nothing else of it — lib/text/log.ts's rule, and the one the
// text-engine-A card states for a durable record: the prompt holds the
// creator's unpublished notebook, and a file that outlives the request is
// exactly where it must not linger. The RESULT is kept: it is the validated
// artifact (a plan, scene specs), which is what the record exists to hold.
//
// ── WHO OWNS A RUNNING RECORD: bootId + pid + host ──────────────────────────
//
// `bootId` names the server process that dispatched the turn. It is minted once
// per process and kept on `globalThis`, so a dev-server module reload does not
// mint a second one and orphan its own live turns.
//
// A `running` record whose bootId is not ours was dispatched by another
// process. Usually that process is gone (a restart), its engine with it, and
// the sweep below marks the record `orphaned` — the server-side twin of
// lib/jobs.tsx's `interrupted`, and what frees its slot. But two servers on one
// checkout is a normal state here (`next dev`, plus the cx capture server on
// :3007 with its own dist dir), and both read and write this directory. So a
// foreign record is orphaned only if its owner is provably gone: a different
// host can't be probed and is treated as gone; on this host the owner's pid is
// asked (`process.kill(pid, 0)`). A pid that is alive and is not ours belongs
// to a living server, whose turn is left alone and keeps its slot.
//
// What this cannot see: a pid reused by an unrelated process after the owner
// died reads as alive, and that record keeps its slot until the reused pid
// exits. Rare, and it fails closed (a 409, never two engines on one slot).

import { randomBytes, createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import { hostname } from "node:os";
import path from "node:path";

import { readJson, writeJsonAtomic } from "../foundry/runStore";
import type { Provenance } from "../imaging/types";
import type { TextProvenance, TurnClass } from "../text/types";

export type TurnStatus = "accepted" | "running" | "done" | "failed" | "cancelled" | "orphaned";

/** The statuses a turn can still leave. Everything else is terminal and is
 *  never written over. */
export const LIVE: ReadonlySet<TurnStatus> = new Set(["accepted", "running"]);

/** What a WORK kind (lib/turns/runner.ts `WorkSpec`) leaves where a text turn
 *  leaves its `TextProvenance`. A work kind books no text spend row, so it must
 *  not carry a text receipt — that would be a forged one. The imaging lane
 *  carries the imaging router's own `Provenance`; the local lane carries what a
 *  local render can honestly say, its wall time. */
export type WorkReceipt =
  | { lane: "imaging"; provenance: Provenance }
  | { lane: "local"; wallMs: number; detail?: Record<string, unknown> };

/** What `TurnRecord.receipt` holds. A work receipt also names every text-receipt
 *  key as absent, so a reader of the text fields (`rec.receipt.costUsd`) still
 *  compiles and reads `undefined` on a work record — the widening is additive
 *  for every existing reader, and a new reader tells the two apart by `lane`. */
export type RecordReceipt = TextProvenance | (WorkReceipt & { [K in keyof TextProvenance]?: undefined });

/** The `turn` a work kind's record carries, in place of a router turn class. */
export type WorkTurn = "image-generate" | "local-render";

export interface TurnRecord {
  v: 1;
  /** `tn-` + 12 hex, minted before anything is dispatched. */
  id: string;
  /** The job kind a client asked for ("recalibrate"). */
  kind: string;
  /** The router's turn class it runs as ("edit-plan"), or, for a work kind,
   *  the lane's word for it. */
  turn: TurnClass | WorkTurn;
  projectId: string;
  /** `${projectId}:${kind}` for a serialised kind — at most one live record may
   *  hold it — or null for a kind that may run in parallel. */
  slot: string | null;
  status: TurnStatus;
  bootId: string;
  pid: number;
  host?: string;
  startedAt: string;
  updatedAt: string;
  endedAt?: string;
  /** sha256 of the prompt as built. Never the prompt. */
  promptDigest: string;
  promptChars: number;
  /** The router's provenance — rung, transport, cost and its basis — or, on a
   *  work kind, its `WorkReceipt` (told apart by the `lane` key). */
  receipt?: RecordReceipt;
  /** Set on a work kind that nothing below can abort: `cancelTurn` answers
   *  `not-cancellable` and a watching tab draws no Stop. */
  uncancellable?: true;
  /** The validated artifact the kind's settle hook returned. Only on `done`. */
  result?: unknown;
  error?: { kind: string; message: string; findings?: string[] };
}

export const TURN_DIR_VAR = "TEXT_TURN_DIR";

export function turnDir(): string {
  const env = process.env[TURN_DIR_VAR]?.trim();
  return env ? path.resolve(env) : path.join(process.cwd(), "foundry-out", "turns");
}

/* ── per-process identity, kept across module reloads ─────────────────────── */

type Shared = { bootId: string; writes: Map<string, Promise<unknown>>; swept: Map<string, Promise<unknown>> };
const G = globalThis as typeof globalThis & { __gravitoneTurnLedger?: Shared };
const shared: Shared = (G.__gravitoneTurnLedger ??= {
  bootId: `b-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`,
  writes: new Map(),
  swept: new Map(),
});

export function currentBootId(): string {
  return shared.bootId;
}

export const TURN_ID_RE = /^tn-[0-9a-f]{12}$/;

export function mintTurnId(): string {
  return `tn-${randomBytes(6).toString("hex")}`;
}

export const digestOf = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");

/** A record skeleton for a turn this process is about to dispatch. */
export function newRecord(fields: {
  id: string;
  kind: string;
  turn: TurnClass | WorkTurn;
  projectId: string;
  slot: string | null;
  /** The text the digest covers. */
  prompt: string;
  /** Its length, when that is not `prompt.length`. */
  chars?: number;
  uncancellable?: boolean;
}): TurnRecord {
  const now = new Date().toISOString();
  return {
    v: 1,
    id: fields.id,
    kind: fields.kind,
    turn: fields.turn,
    projectId: fields.projectId,
    slot: fields.slot,
    status: "accepted",
    bootId: shared.bootId,
    pid: process.pid,
    host: hostname(),
    startedAt: now,
    updatedAt: now,
    promptDigest: digestOf(fields.prompt),
    promptChars: fields.chars ?? fields.prompt.length,
    ...(fields.uncancellable ? { uncancellable: true as const } : {}),
  };
}

/* ── reads and writes ─────────────────────────────────────────────────────── */

function fileOf(id: string): string {
  if (!TURN_ID_RE.test(id)) throw new TurnIdError(id);
  return path.join(turnDir(), `${id}.json`);
}

/** A string that is not a turn id. Routes answer it 400 — it never reaches the
 *  filesystem, so `..` cannot make the GET a reader of the machine. */
export class TurnIdError extends Error {
  constructor(id: string) {
    super(`${JSON.stringify(id.slice(0, 40))} is not a turn id.`);
    this.name = "TurnIdError";
  }
}

export async function readTurn(id: string): Promise<TurnRecord | null> {
  return readJson<TurnRecord>(fileOf(id));
}

/** Write a whole record. Through the per-id queue, so it cannot interleave
 *  with an `updateTurn` on the same record in this process. */
export function writeTurn(rec: TurnRecord): Promise<void> {
  return serially(rec.id, () => writeJsonAtomic(fileOf(rec.id), rec));
}

/**
 * Read-check-write one record. `fn` gets the record as it is NOW and returns
 * the next one, or null to leave it alone. Serialised per id in this process:
 * the run settling and a cancel arriving are two writers of one file, and the
 * guard each of them applies ("only if still live") is only a guard if nothing
 * can write between its read and its write.
 */
export function updateTurn(
  id: string,
  fn: (rec: TurnRecord) => TurnRecord | null,
): Promise<TurnRecord | null> {
  return serially(id, async () => {
    const cur = await readTurn(id);
    if (!cur) return null;
    const next = fn(cur);
    if (!next) return cur;
    const out = { ...next, updatedAt: new Date().toISOString() };
    await writeJsonAtomic(fileOf(id), out);
    return out;
  });
}

function serially<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const key = `${turnDir()}|${id}`;
  const prev = shared.writes.get(key) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.catch(() => undefined);
  shared.writes.set(key, tail);
  void tail.then(() => {
    if (shared.writes.get(key) === tail) shared.writes.delete(key);
  });
  return run;
}

/** Every record in the directory. A file that is mid-write or damaged is
 *  skipped, not fatal: one bad record must not take the ledger down. */
export async function listTurns(): Promise<TurnRecord[]> {
  let names: string[];
  try {
    names = await readdir(turnDir());
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
  const out: TurnRecord[] = [];
  for (const n of names) {
    if (!n.endsWith(".json") || !TURN_ID_RE.test(n.slice(0, -5))) continue;
    try {
      const r = await readJson<TurnRecord>(path.join(turnDir(), n));
      if (r) out.push(r);
    } catch {
      // mid-write or damaged — see above
    }
  }
  return out;
}

/** The live record holding `slot`, if any. The LEDGER is the truth here, not
 *  this process's memory, so a turn another living server holds is seen. */
export async function slotHolder(slot: string): Promise<TurnRecord | null> {
  return (await listTurns()).find((r) => r.slot === slot && LIVE.has(r.status)) ?? null;
}

/* ── the boot sweep ───────────────────────────────────────────────────────── */

function ownerAlive(r: TurnRecord): boolean {
  if (r.bootId === shared.bootId) return true;
  if (!r.host || r.host !== hostname()) return false;
  if (r.pid === process.pid) return false; // our pid, an earlier boot's bootId
  try {
    process.kill(r.pid, 0);
    return true;
  } catch (e) {
    // EPERM: the process exists and belongs to someone else — alive.
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Mark every live record whose owning process is gone `orphaned`. Never
 * re-dispatched (background-jobs#startup-sweeps): a minutes-long paid turn is
 * not something to repeat on the server's own initiative, and its prompt was
 * never stored to repeat it from.
 */
export async function sweepTurns(): Promise<{ orphaned: string[] }> {
  const orphaned: string[] = [];
  for (const r of await listTurns()) {
    if (!LIVE.has(r.status) || ownerAlive(r)) continue;
    const out = await updateTurn(r.id, (cur) =>
      LIVE.has(cur.status) && !ownerAlive(cur)
        ? {
            ...cur,
            status: "orphaned",
            endedAt: new Date().toISOString(),
            error: {
              kind: "orphaned",
              message:
                "The server that was running this turn stopped before it finished. Its result was never received; nothing was changed.",
            },
          }
        : null,
    );
    if (out?.status === "orphaned") orphaned.push(r.id);
  }
  return { orphaned };
}

/** The sweep, once per turn directory per process — every route calls this
 *  before it reads or claims, so the first touch after a boot settles what the
 *  last boot left behind. */
export function ensureSwept(): Promise<unknown> {
  const dir = turnDir();
  let p = shared.swept.get(dir);
  if (!p) {
    p = sweepTurns().catch((e) => {
      // A failed sweep is retried on the next touch rather than remembered.
      shared.swept.delete(dir);
      throw e;
    });
    shared.swept.set(dir, p);
  }
  return p;
}
