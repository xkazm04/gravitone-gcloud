import { z } from "zod";
import { parseAt, parseJsonAt, type Parsed } from "@gt/domain/door";
import { AppError } from "@gt/domain/errors";
import type { Actor, Cost } from "@gt/domain/event";
import { canonical } from "../canonical.ts";
import { append } from "../events.ts";
import type { ModuleMigrations } from "../migrate.ts";
import type { Reader, Tx } from "../store.ts";
import type { Quote } from "./quote.ts";

// RECEIPTS - a paid call runs at most once per idempotency key (plan §3.2).
//
// Absorbed from lib/imaging/receipts.ts, a per-process single-flight with a
// value cache. Its money rules are kept, each one:
//   - a miss CLAIMS the key before the vendor is called - one call, one row;
//   - a settled hit REPLAYS the first receipt unchanged, and is not a new spend;
//   - the same key with a different body is a CONFLICT: a key names ONE
//     request, and answering a different prompt with the old result is a
//     silent wrong answer;
//   - a FAILURE IS NEVER RETAINED: a refusal, a 402 or a missing key is a fact
//     about that moment, so a failed claim is released and a retry may pass.
// Upgraded, because v1's receipts lived in one process's memory ("a retry that
// lands on another instance misses and degrades to a second paid call"):
//   - they are rows. A retry from another process, or after a restart, finds
//     the claim; the store's write lock is the single flight.
//   - a claim whose owner DIED is not silently re-run. v1 could not see this
//     case (the Map died with the process); here a pending row outlives its
//     owner, and the vendor may already have billed it. Recovery marks it
//     `interrupted`, and only an operator's release lets the key spend again -
//     the MV and Suno queues' rule ("a crash means switch off and name what was
//     running"), applied per key instead of per queue.
//   - dry and live claims are separate rows (v1 publish: "a dry run does not
//     block the live upload that follows it").
// Dropped: v1's byte-capped value cache. A value here is the call's receipt
// (provenance, blob refs), capped at RECEIPT_VALUE_CAP; bytes belong in blobs.

export type ReceiptMode = "dry" | "live";
export const RECEIPT_TTL_MS = 15 * 60_000;
export const RECEIPT_VALUE_CAP = 256 * 1024;

export const receiptsMigrations: ModuleMigrations = {
  module: "receipts",
  steps: [
    {
      version: 1,
      sql: `
CREATE TABLE receipts (
  scope TEXT NOT NULL,
  key TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('dry', 'live')),
  body_hash TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending', 'settled', 'interrupted')),
  claimed_at TEXT NOT NULL,
  settled_at TEXT,
  value TEXT,
  CHECK ((state = 'settled') = (value IS NOT NULL AND settled_at IS NOT NULL)),
  PRIMARY KEY (scope, key, mode)
) WITHOUT ROWID;`,
    },
  ],
};

export type ReceiptKey = { readonly scope: string; readonly key: string; readonly mode: ReceiptMode };

export type Claim<V> = { readonly kind: "fresh" } | { readonly kind: "replay"; readonly value: V; readonly settledAt: string };

const rowSchema = z.object({
  body_hash: z.string(),
  state: z.enum(["pending", "settled", "interrupted"]),
  claimed_at: z.string(),
  settled_at: z.string().nullable(),
  value: z.string().nullable(),
});

const WHERE = "scope = ? AND key = ? AND mode = ?";
const label = (k: ReceiptKey): string => `${k.mode} ${k.scope}/${k.key}`;
const subjectOf = (k: ReceiptKey) => ({ kind: "receipt", id: `${k.mode}:${k.scope}/${k.key}` });

export function readReceipt(r: Reader, k: ReceiptKey): z.output<typeof rowSchema> | undefined {
  const row = r.get(`SELECT body_hash, state, claimed_at, settled_at, value FROM receipts WHERE ${WHERE}`, k.scope, k.key, k.mode);
  if (row === undefined) return undefined;
  const p = parseAt("receipt row", rowSchema, row);
  if (!p.ok) throw p.error;
  return p.value;
}

/**
 * Claim `k` for one call, inside the caller's transaction. Fresh: go ahead and
 * call. Replay: the first call's receipt, unchanged. Throws `conflict` for a
 * different body or a call still in flight, `refused` for an interrupted one.
 */
export function claimReceipt<S extends z.ZodType>(
  t: Tx,
  k: ReceiptKey,
  bodyHash: string,
  valueSchema: S,
  actor: Actor,
  ttlMs: number = RECEIPT_TTL_MS,
): Claim<Parsed<z.output<S>>> {
  const prior = readReceipt(t, k);
  if (prior !== undefined) {
    if (prior.body_hash !== bodyHash) throw new AppError("conflict", `receipt ${label(k)} was already used for a different request`);
    if (prior.state === "pending") throw new AppError("conflict", `receipt ${label(k)} is in flight since ${prior.claimed_at}`);
    if (prior.state === "interrupted") {
      throw new AppError("refused", `receipt ${label(k)} was interrupted mid-call at ${prior.claimed_at}; the vendor may have billed it, so an operator releases it before it spends again`);
    }
    const settledAt = prior.settled_at ?? prior.claimed_at;
    if (Date.parse(t.at) - Date.parse(settledAt) < ttlMs && prior.value !== null) {
      const v = parseJsonAt(`receipt ${label(k)} value`, valueSchema, prior.value);
      if (!v.ok) throw v.error;
      return { kind: "replay", value: v.value, settledAt };
    }
    t.run(`DELETE FROM receipts WHERE ${WHERE}`, k.scope, k.key, k.mode);
  }
  t.run("INSERT INTO receipts (scope, key, mode, body_hash, state, claimed_at) VALUES (?, ?, ?, ?, 'pending', ?)", k.scope, k.key, k.mode, bodyHash, t.at);
  append(t, { actor, type: "receipt.claimed", subject: subjectOf(k), data: { bodyHash } });
  return { kind: "fresh" };
}

/** Where a booked figure came from: only a live call's vendor figure is money
 *  that left an account. A dry receipt is the model's, always. */
export function costOf(q: Quote, mode: ReceiptMode): Cost | undefined {
  if (q.usd === null) return undefined;
  return { usd: q.usd, src: mode === "live" && q.basis === "vendor-reported" ? "real" : "model" };
}

/** Record what the call returned. The receipt's own event carries its cost. */
export function settleReceipt(t: Tx, k: ReceiptKey, value: unknown, q: Quote, actor: Actor): void {
  const text = canonical(value);
  if (text.length > RECEIPT_VALUE_CAP) {
    throw new AppError("invalid", `receipt ${label(k)} value is ${text.length} bytes; the cap is ${RECEIPT_VALUE_CAP} - keep bytes in blobs and the ref here`);
  }
  const done = t.run(`UPDATE receipts SET state = 'settled', settled_at = ?, value = ? WHERE ${WHERE} AND state = 'pending'`, t.at, text, k.scope, k.key, k.mode);
  if (done.changes !== 1) throw new AppError("conflict", `receipt ${label(k)} is not pending; nothing to settle`);
  const cost = costOf(q, k.mode);
  const data = q.usd === null ? { basis: q.basis, unpricedReason: q.note } : { basis: q.basis, note: q.note };
  append(t, cost === undefined ? { actor, type: "receipt.settled", subject: subjectOf(k), data } : { actor, type: "receipt.settled", subject: subjectOf(k), cost, data });
}

/** A failed call's claim, or an interrupted one an operator has looked at:
 *  gone, so the key may be tried again. */
export function releaseReceipt(t: Tx, k: ReceiptKey, actor: Actor, reason: string): boolean {
  const gone = t.run(`DELETE FROM receipts WHERE ${WHERE} AND state IN ('pending', 'interrupted')`, k.scope, k.key, k.mode).changes === 1;
  if (gone) append(t, { actor, type: "receipt.released", subject: subjectOf(k), data: { reason } });
  return gone;
}

/** Recovery's act: every claim still pending was owned by a process that is
 *  gone (the caller asserts that). Each is named, never re-run. */
export function interruptPending(t: Tx, actor: Actor, scope?: string): ReceiptKey[] {
  const rows = scope === undefined ? t.all("SELECT scope, key, mode FROM receipts WHERE state = 'pending'") : t.all("SELECT scope, key, mode FROM receipts WHERE state = 'pending' AND scope = ?", scope);
  const keys: ReceiptKey[] = [];
  for (const row of rows) {
    const p = parseAt("pending receipt", z.object({ scope: z.string(), key: z.string(), mode: z.enum(["dry", "live"]) }), row);
    if (!p.ok) throw p.error;
    t.run(`UPDATE receipts SET state = 'interrupted' WHERE ${WHERE}`, p.value.scope, p.value.key, p.value.mode);
    append(t, { actor, type: "receipt.interrupted", subject: subjectOf(p.value), data: {} });
    keys.push(p.value);
  }
  return keys;
}
