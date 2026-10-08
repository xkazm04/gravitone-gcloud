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
// ── A WORK KIND IS THE OTHER SPEC SHAPE ─────────────────────────────────────
//
// Not every durable run is a text turn. A poster is an imaging call: its receipt
// is the imaging router's `Provenance`, its spend books on the imaging meter, and
// wrapping it as a `TextResult` would forge a text receipt. A `WorkSpec` has a
// `lane` instead of a turn class, no `reason()` and no `settle`: `prepare`
// validates and names what the digest covers, `work` does the run and hands back
// `{ result, receipt }`, and the record is written `done` with both. Everything
// else — the slot lock, `ifLive`, the boot sweep, the 202 — is shared, and
// `startTurn`/`run` branch on the shape exactly once.
//
// `cancellable: false` is for a kind whose work nothing below can abort (the
// imaging router takes no signal). `cancelTurn` then answers `not-cancellable`
// and writes NOTHING: `cancelled` over a vendor call that is still billing would
// be a lie about the money.
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
  digestOf,
  ensureSwept,
  LIVE,
  mintTurnId,
  newRecord,
  readTurn,
  slotHolder,
  updateTurn,
  writeTurn,
  type TurnRecord,
  type WorkReceipt,
  type WorkTurn,
} from "./ledger";

export type { WorkReceipt };

/** What a client sent that a kind cannot build a prompt from. Nothing has been
 *  written or dispatched. It carries the status every door answers it with —
 *  400 unless the kind says otherwise (a run too large to send is 413) — so
 *  /api/turns and a kind's own route cannot disagree about one refusal. */
export class TurnInputError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 413 = 400,
    readonly code: string = "bad-request",
  ) {
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
  settle(result: TextResult, input: I, via?: unknown): R | Promise<R>;
  /** How the engine is asked, for a kind that is not one `reason()` call —
   *  research tries a retrieval rung and falls back to reasoning, each with its
   *  own prompt and schema. Absent, the runner calls `reason()` with the
   *  prepared prompt and schema. It must go through the router (`reason` /
   *  `retrieve`) and pass `ctx.signal` on, so a cancel reaches the engine's
   *  tree and every served turn books its one spend row. It reports back the
   *  prompt it ACTUALLY sent: the record's `promptDigest` covers that, never
   *  the prepared prompt of a rung that was not used. `via` is handed to
   *  `settle` as its third argument. */
  dispatch?(ctx: DispatchContext<I>): Promise<Dispatched>;
}

export interface DispatchContext<I = unknown> {
  prompt: string;
  schema?: Record<string, unknown>;
  input: I;
  turn: TurnClass;
  signal: AbortSignal;
}

export interface Dispatched {
  served: TextResult;
  /** The prompt that reached the engine that served. */
  prompt: string;
  via?: unknown;
}

/** A kind that is not a text turn (see the header). */
export interface WorkSpec<I = unknown, R = unknown> {
  kind: string;
  /** Never "text": a text kind is a TurnSpec. */
  lane: "imaging" | "local";
  serialised: boolean;
  /** false when nothing below the kind can be aborted. `cancelTurn` then
   *  answers `not-cancellable` and writes nothing. */
  cancellable: boolean;
  /** Validate the input; name what the record's digest covers (a work kind's
   *  record never holds it) and its length. Throws TurnInputError for a request
   *  it cannot serve. Runs BEFORE the record exists. */
  prepare(input: unknown): Promise<{ input: I; digestOf: string; chars: number }>;
  /** The run. Its return value is the record's `result` and `receipt`; a throw
   *  fails the turn with the thrown message. */
  work(ctx: { input: I; signal: AbortSignal }): Promise<{ result: R; receipt: WorkReceipt }>;
}

export const isWorkSpec = (spec: TurnSpec | WorkSpec): spec is WorkSpec => "work" in spec;

const WORK_TURN: Record<WorkSpec["lane"], WorkTurn> = { imaging: "image-generate", local: "local-render" };

/* ── the registry ─────────────────────────────────────────────────────────── */

const KINDS = new Map<string, TurnSpec | WorkSpec>();

/** Register a kind. Returns the unregister. A second registration of one name
 *  is a bug — two owners of one prompt — and throws. */
export function registerTurnKind(spec: TurnSpec | WorkSpec): () => void {
  if (KINDS.has(spec.kind)) throw new Error(`turn kind ${spec.kind} is already registered`);
  KINDS.set(spec.kind, spec);
  return () => {
    if (KINDS.get(spec.kind) === spec) KINDS.delete(spec.kind);
  };
}

export const turnKind = (kind: string): TurnSpec | WorkSpec | undefined => KINDS.get(kind);
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
export async function startTurn(spec: TurnSpec | WorkSpec, projectId: string, rawInput: unknown): Promise<StartOutcome> {
  await ensureSwept();
  // The one branch on the spec's shape: what the record is minted from.
  const plan = isWorkSpec(spec)
    ? await spec.prepare(rawInput).then((p) => ({ prompt: p.digestOf, chars: p.chars, schema: undefined, input: p.input }))
    : await spec.prepare(rawInput).then((p) => ({ ...p, chars: undefined }));
  const { prompt, schema, input, chars } = plan;
  const slot = spec.serialised ? `${projectId}:${spec.kind}` : null;

  const claimed = await underLock(slot ?? `free:${projectId}:${spec.kind}`, async () => {
    if (slot) {
      const holder = await slotHolder(slot);
      if (holder) return { won: false, holder } as const;
    }
    const rec = newRecord({
      id: mintTurnId(),
      kind: spec.kind,
      turn: isWorkSpec(spec) ? WORK_TURN[spec.lane] : spec.turn,
      projectId,
      slot,
      prompt,
      chars,
      uncancellable: isWorkSpec(spec) && !spec.cancellable,
    });
    await writeTurn(rec);
    const ctl = new AbortController();
    shared.live.set(rec.id, ctl);
    return { won: true, rec, ctl } as const;
  });
  if (!claimed.won) return { ok: false, holder: claimed.holder };

  const { rec, ctl } = claimed;
  const done = isWorkSpec(spec) ? runWork(spec, rec.id, input, ctl) : run(spec, rec.id, prompt, schema, input, ctl);
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
    const { served, prompt: sent, via } = spec.dispatch
      ? await spec.dispatch({ prompt, schema, input, turn: spec.turn, signal: ctl.signal })
      : { served: await reason({ prompt, turn: spec.turn, schema, signal: ctl.signal }), prompt, via: undefined };
    // The record was minted against the prepared prompt; when another one was
    // sent, the record says which.
    if (sent !== prompt) await ifLive(id, () => ({ promptDigest: digestOf(sent), promptChars: sent.length }));
    let result: unknown;
    try {
      result = await spec.settle(served, input, via);
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
    await settleThrown(id, ctl, e);
  } finally {
    shared.live.delete(id);
  }
  return (await readTurn(id).catch(() => null)) ?? ({ id, status: "failed" } as TurnRecord);
}

/** A run that threw: `cancelled` when the signal says it was asked to stop,
 *  `failed` with the message otherwise. Written only over a LIVE record. */
async function settleThrown(id: string, ctl: AbortController, e: unknown): Promise<void> {
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
}

/** A work kind's run: no engine, no settle hook — the work's own result and
 *  receipt are the record. */
async function runWork(spec: WorkSpec, id: string, input: unknown, ctl: AbortController): Promise<TurnRecord> {
  try {
    await ifLive(id, () => ({ status: "running" }));
    const { result, receipt } = await spec.work({ input, signal: ctl.signal });
    await ifLive(id, () => ({ status: "done", endedAt: new Date().toISOString(), receipt, result }));
  } catch (e) {
    await settleThrown(id, ctl, e);
  } finally {
    shared.live.delete(id);
  }
  return (await readTurn(id).catch(() => null)) ?? ({ id, status: "failed" } as TurnRecord);
}

/* ── cancel ───────────────────────────────────────────────────────────────── */

export type CancelOutcome =
  | { ok: true; record: TurnRecord }
  | { ok: false; why: "not-found" }
  | { ok: false; why: "settled" | "not-here" | "not-cancellable"; record: TurnRecord };

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
  // A work kind nothing below can abort. Nothing is written: `cancelled` over a
  // vendor call still billing would be a lie about the money.
  if (cur.uncancellable) return { ok: false, why: "not-cancellable", record: cur };
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
