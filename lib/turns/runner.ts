// THE TURN RUNNER — a turn is started by the server, owned by the server, and
// only watched by a tab. SERVER ONLY. (AIO-A, stage 1: the kernel.)
//
// `startTurn` is intent-first: it builds the prompt, claims the slot, MINTS THE
// ID and WRITES THE RECORD before anything is dispatched
// (durable-agent-operations#intent-mints-the-identity), then runs the turn
// detached from the request that asked for it. The route answers 202 with the
// id; whoever wants the answer reads the record. A tab that reloads, closes or
// leaves the step loses nothing, because nothing was ever in the tab.
//
// ── A TURN KIND IS A SPEC, AND THE SETTLE HOOK IS ITS DOOR ──────────────────
//
// `reason()` stays the one chokepoint and is not changed in shape. What each
// route does around it — assemble a prompt from its input, then validate the
// answer into an artifact (parseEditPlan, the stray and blind guards,
// parseNotebook) — becomes a `TurnSpec`: `prepare` before, `settle` after
// (text-engine-A's per-route settle hook). The record then holds the
// VALIDATED artifact or the findings that refused it, never a raw answer a
// client has to re-parse. A kind is registered once by the module that owns
// its prompt. Stage 1 registers none: /api/recalibrate hands its assembly over
// in stage 2.
//
// ── SERIALISED, AND WHERE THAT RULE NOW LIVES ───────────────────────────────
//
// A serialised kind allows one live turn per project (lib/jobs.tsx's
// SERIALISED set, which could only "narrow" the cross-tab race, in its own
// words, because two tabs each read localStorage and each wrote). Here the
// check and the claim happen under one in-process lock per slot, against the
// LEDGER — so two tabs, two devices, or a turn another server on this checkout
// is still running all see the same holder. ONE NODE PROCESS IS ASSUMED for
// the lock itself: two servers that claim the same slot in the same
// millisecond can both win. When the app scales out, the lock becomes a lease.
//
// ── CANCEL ──────────────────────────────────────────────────────────────────
//
// Each running turn keeps an AbortController in this process. `cancelTurn`
// writes `cancelled` FIRST, then aborts; the signal travels reason() → the
// local adapter → runClaude → killTree, and the engine's process tree ends. The
// run's own settle writes only over a LIVE record, so an engine answer that
// lands after the cancel — the race between "it answered" and "they pressed
// stop" — cannot overwrite it.

import { TextError } from "../text/errors";
import { reason } from "../text/router";
import type { TextResult, TurnClass } from "../text/types";
import {
  ensureSwept,
  LIVE,
  mintTurnId,
  newRecord,
  readTurn,
  slotHolder,
  updateTurn,
  writeTurn,
  type TurnRecord,
} from "./ledger";

/** What a client sent that a kind cannot build a prompt from. The route
 *  answers it 400, and nothing has been written or dispatched. */
export class TurnInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TurnInputError";
  }
}

export interface TurnSpec<I = unknown, R = unknown> {
  /** The job kind a client names ("recalibrate"). */
  kind: string;
  /** The router's turn class it runs as. */
  turn: TurnClass;
  /** One live turn per project, or any number in parallel. */
  serialised: boolean;
  /** Validate the client's input and build the prompt. Throws TurnInputError
   *  for a request it cannot serve. Runs BEFORE the record exists. */
  prepare(input: unknown): Promise<{ prompt: string; schema?: Record<string, unknown>; input: I }>;
  /** The kind's own door over the engine's answer. Its return value is the
   *  record's `result`; a throw fails the turn with the thrown message (and its
   *  `findings`, when the error carries them). */
  settle(result: TextResult, input: I): R | Promise<R>;
}

/* ── the registry ─────────────────────────────────────────────────────────── */

const KINDS = new Map<string, TurnSpec>();

/** Register a kind. Returns the unregister. A second registration of one name
 *  is a bug — two owners of one prompt — and throws. */
export function registerTurnKind(spec: TurnSpec): () => void {
  if (KINDS.has(spec.kind)) throw new Error(`turn kind ${spec.kind} is already registered`);
  KINDS.set(spec.kind, spec);
  return () => {
    if (KINDS.get(spec.kind) === spec) KINDS.delete(spec.kind);
  };
}

export const turnKind = (kind: string): TurnSpec | undefined => KINDS.get(kind);
export const turnKinds = (): string[] => [...KINDS.keys()].sort();

/* ── in-process state: who runs here, and the per-slot lock ───────────────── */

type Shared = {
  live: Map<string, AbortController>;
  runs: Map<string, Promise<TurnRecord>>;
  locks: Map<string, Promise<unknown>>;
};
const G = globalThis as typeof globalThis & { __gravitoneTurnRunner?: Shared };
const shared: Shared = (G.__gravitoneTurnRunner ??= { live: new Map(), runs: new Map(), locks: new Map() });

/** Resolves once every turn this process has dispatched has settled — for a
 *  graceful shutdown, and for a probe that must not leave a run behind it in a
 *  serial lane (a run outliving its fake engine would spawn whatever `claude`
 *  PATH resolves to next). */
export async function whenIdle(): Promise<void> {
  while (shared.runs.size) await Promise.all([...shared.runs.values()]);
}

function underLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = shared.locks.get(key) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.catch(() => undefined);
  shared.locks.set(key, tail);
  void tail.then(() => {
    if (shared.locks.get(key) === tail) shared.locks.delete(key);
  });
  return run;
}

/* ── start ────────────────────────────────────────────────────────────────── */

export type StartOutcome =
  | { ok: true; turnId: string; record: TurnRecord; done: Promise<TurnRecord> }
  | { ok: false; holder: TurnRecord };

/**
 * Start one turn. Resolves as soon as the record is written — never with the
 * answer. `done` settles with the final record and NEVER rejects: a detached
 * run whose failure nobody awaited would be an unhandled rejection, which in a
 * route handler is the server going down.
 */
export async function startTurn(spec: TurnSpec, projectId: string, rawInput: unknown): Promise<StartOutcome> {
  await ensureSwept();
  const { prompt, schema, input } = await spec.prepare(rawInput);
  const slot = spec.serialised ? `${projectId}:${spec.kind}` : null;

  const claimed = await underLock(slot ?? `free:${projectId}:${spec.kind}`, async () => {
    if (slot) {
      const holder = await slotHolder(slot);
      if (holder) return { won: false, holder } as const;
    }
    const rec = newRecord({ id: mintTurnId(), kind: spec.kind, turn: spec.turn, projectId, slot, prompt });
    await writeTurn(rec);
    const ctl = new AbortController();
    shared.live.set(rec.id, ctl);
    return { won: true, rec, ctl } as const;
  });
  if (!claimed.won) return { ok: false, holder: claimed.holder };

  const { rec, ctl } = claimed;
  const done = run(spec, rec.id, prompt, schema, input, ctl);
  shared.runs.set(rec.id, done);
  void done.then(() => shared.runs.delete(rec.id));
  return { ok: true, turnId: rec.id, record: rec, done };
}

/** Write `next` only over a LIVE record. This is the whole of "a late resolve
 *  cannot overwrite a cancel". */
const ifLive = (id: string, patch: (cur: TurnRecord) => Partial<TurnRecord>) =>
  updateTurn(id, (cur) => (LIVE.has(cur.status) ? { ...cur, ...patch(cur) } : null));

async function run(
  spec: TurnSpec,
  id: string,
  prompt: string,
  schema: Record<string, unknown> | undefined,
  input: unknown,
  ctl: AbortController,
): Promise<TurnRecord> {
  try {
    await ifLive(id, () => ({ status: "running" }));
    if (ctl.signal.aborted) throw new TextError("The turn was cancelled before it was dispatched.", "cancelled");
    const served = await reason({ prompt, turn: spec.turn, schema, signal: ctl.signal });
    let result: unknown;
    try {
      result = await spec.settle(served, input);
    } catch (e) {
      // The engine answered and the kind's door refused it. The receipt is
      // kept — the turn was paid for whether or not its answer was usable.
      const findings = (e as { findings?: unknown }).findings;
      await ifLive(id, () => ({
        status: "failed",
        endedAt: new Date().toISOString(),
        receipt: served.provenance,
        error: {
          kind: "bad-response",
          message: e instanceof Error ? e.message : String(e),
          ...(Array.isArray(findings) ? { findings: findings.map(String) } : {}),
        },
      }));
      return (await readTurn(id))!;
    }
    await ifLive(id, () => ({
      status: "done",
      endedAt: new Date().toISOString(),
      receipt: served.provenance,
      result,
    }));
  } catch (e) {
    const cancelled = ctl.signal.aborted || (e instanceof TextError && e.kind === "cancelled");
    await ifLive(id, () =>
      cancelled
        ? { status: "cancelled", endedAt: new Date().toISOString() }
        : {
            status: "failed",
            endedAt: new Date().toISOString(),
            error: {
              kind: e instanceof TextError ? e.kind : "failed",
              message: e instanceof Error ? e.message : String(e),
            },
          },
    ).catch((err) => console.error("[turns] could not settle", id, err));
  } finally {
    shared.live.delete(id);
  }
  return (await readTurn(id).catch(() => null)) ?? ({ id, status: "failed" } as TurnRecord);
}

/* ── cancel ───────────────────────────────────────────────────────────────── */

export type CancelOutcome =
  | { ok: true; record: TurnRecord }
  | { ok: false; why: "not-found" }
  | { ok: false; why: "settled" | "not-here"; record: TurnRecord };

/**
 * Cancel a live turn this process is running: the record says `cancelled`
 * before the signal fires, so the record is never behind the engine. A turn
 * that has already settled is reported as it is. A live turn another server
 * is running cannot be stopped from here — this process holds no handle on its
 * engine — and saying `cancelled` would be a lie about a process still billing.
 */
export async function cancelTurn(id: string): Promise<CancelOutcome> {
  await ensureSwept();
  const cur = await readTurn(id);
  if (!cur) return { ok: false, why: "not-found" };
  if (!LIVE.has(cur.status)) return { ok: false, why: "settled", record: cur };
  const ctl = shared.live.get(id);
  if (!ctl) return { ok: false, why: "not-here", record: cur };

  const out = await ifLive(id, () => ({
    status: "cancelled",
    endedAt: new Date().toISOString(),
  }));
  ctl.abort();
  if (!out || out.status !== "cancelled") return { ok: false, why: "settled", record: out ?? cur };
  return { ok: true, record: out };
}
