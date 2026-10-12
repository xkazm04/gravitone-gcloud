// Keyed receipts for the paid imaging routes — a single-flight with a value
// cache, keyed by (principal scope, idempotency key) and pinned to a body hash.
//
// WHY: the server always finishes a render it started and bills it (no route
// reads req.signal), but the HTTP response used to be the only place the paid
// pixels lived. A dropped connection, a reload or a laptop sleep during a
// 60-180 s render left a paid image nobody could claim, and the next click
// paid again. With a receipt the duplicate request either JOINS the call in
// flight or REPLAYS its settled result, and the vendor is dispatched once.
//
// THE RULES, each one a money rule:
//   · a miss claims the entry and runs the router — one hold, one row;
//   · a hit in flight joins the owner's promise. The wait is bounded by the
//     route's maxDuration, which is the owner's own bound too;
//   · a settled hit inside the TTL replays the value, provenance unchanged —
//     the replay is NOT a new spend, and the response says `replayed`;
//   · the same key with a different body is a conflict (409): a key names ONE
//     request, and answering a different prompt with the old pixels would be a
//     silent wrong answer;
//   · a FAILURE IS NEVER RETAINED. A refusal, a 402 or a missing key is a fact
//     about that moment, and a retry with the same key must be allowed to pass
//     once the window rolls. Joiners in flight share the owner's rejection.
//
// Retention is bounded twice: by age (TTL) and by bytes (base64 length),
// oldest first, and it is PER PROCESS. On a scaled-out deploy a retry that
// lands on another instance misses and degrades to the old behaviour — a
// second paid call, never a wrong answer. A shared store (the file/GCS store
// the spend kernel uses) is the next step if that ever matters.
//
// Server-only, like the rest of lib/imaging.

export const RECEIPT_TTL_MS = 15 * 60_000;
export const RECEIPT_CAP_BYTES = 64 * 1024 * 1024;

export type ReceiptOutcome = "fresh" | "joined" | "replayed";

/** The same key was presented with a different body. Mapped to 409
 *  `idempotency-conflict` by lib/imaging/api.ts#errorResponse. */
export class IdempotencyConflict extends Error {
  constructor() {
    super("This idempotency key was already used for a different request.");
    this.name = "IdempotencyConflict";
  }
}

interface Pending {
  state: "pending";
  bodyHash: string;
  promise: Promise<unknown>;
}

interface Settled {
  state: "settled";
  bodyHash: string;
  value: unknown;
  bytes: number;
  at: number;
}

type Entry = Pending | Settled;

/** Insertion-ordered, so the first settled entry is the oldest. */
const entries = new Map<string, Entry>();
let retainedBytes = 0;
let clock: () => number = Date.now;
let limits = { ttlMs: RECEIPT_TTL_MS, capBytes: RECEIPT_CAP_BYTES };

const slot = (scope: string, key: string) => `${scope}\u0000${key}`;

/** Retained size: the base64 of every image the value carries. That is where
 *  the bytes are; provenance is a few hundred characters. */
function sizeOf(value: unknown): number {
  const images = (value as { images?: { base64?: unknown }[] } | null)?.images;
  if (!Array.isArray(images)) return 0;
  return images.reduce((n, i) => n + (typeof i?.base64 === "string" ? i.base64.length : 0), 0);
}

function drop(id: string): void {
  const e = entries.get(id);
  if (e?.state === "settled") retainedBytes -= e.bytes;
  entries.delete(id);
}

function evict(now: number): void {
  for (const [id, e] of entries)
    if (e.state === "settled" && now - e.at >= limits.ttlMs) drop(id);
  for (const [id, e] of entries) {
    if (retainedBytes <= limits.capBytes) break;
    if (e.state === "settled") drop(id);
  }
}

/**
 * Run `run` at most once per (scope, key) while its result is held.
 *
 * Resolves to the value and how it was obtained. Rejects with the owner's
 * error for the owner and every joiner, or with IdempotencyConflict when the
 * key was presented with a different body.
 */
export async function withReceipt<T>(
  opts: { scope: string; key: string; bodyHash: string },
  run: () => Promise<T>,
): Promise<{ value: T; receipt: ReceiptOutcome }> {
  const id = slot(opts.scope, opts.key);
  evict(clock());

  const hit = entries.get(id);
  if (hit) {
    if (hit.bodyHash !== opts.bodyHash) throw new IdempotencyConflict();
    if (hit.state === "settled") return { value: hit.value as T, receipt: "replayed" };
    return { value: (await hit.promise) as T, receipt: "joined" };
  }

  const promise = run();
  const pending: Pending = { state: "pending", bodyHash: opts.bodyHash, promise };
  entries.set(id, pending);
  try {
    const value = await promise;
    // Re-check identity: a reset (probe) may have dropped this entry meanwhile.
    if (entries.get(id) === pending) {
      const bytes = sizeOf(value);
      if (bytes > limits.capBytes) {
        entries.delete(id);
      } else {
        // Delete then set: the settled entry moves to the END, so eviction
        // order is settle order, oldest first.
        entries.delete(id);
        entries.set(id, { state: "settled", bodyHash: opts.bodyHash, value, bytes, at: clock() });
        retainedBytes += bytes;
        evict(clock());
      }
    }
    return { value, receipt: "fresh" };
  } catch (e) {
    if (entries.get(id) === pending) entries.delete(id);
    throw e;
  }
}

/** What is held right now: settled entries and their base64 bytes. */
export function receiptStats(): { entries: number; pending: number; bytes: number } {
  let settled = 0;
  let pending = 0;
  for (const e of entries.values()) {
    if (e.state === "settled") settled++;
    else pending++;
  }
  return { entries: settled, pending, bytes: retainedBytes };
}

/** Probe hook — forget every receipt. */
export function __resetReceipts(): void {
  entries.clear();
  retainedBytes = 0;
}

/** Probe hook — an injected clock, or `null` for Date.now. */
export function __setReceiptClock(fn: (() => number) | null): void {
  clock = fn ?? Date.now;
}

/** Probe hook — override the TTL and/or the byte cap, or `null` for defaults. */
export function __setReceiptLimits(l: { ttlMs?: number; capBytes?: number } | null): void {
  limits = { ttlMs: l?.ttlMs ?? RECEIPT_TTL_MS, capBytes: l?.capBytes ?? RECEIPT_CAP_BYTES };
}
