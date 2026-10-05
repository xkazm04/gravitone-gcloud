// STEP RECORDS, DECLARED ONCE — the key, its owner, its version, how to read it.
//
// The step store (../stepStore.ts) is a key/value store: `readStep<T>` returns
// whatever is on disk cast to whatever the caller asked for, and every phase key
// is a string literal retyped at each reader. That is how three kinds of silent
// data loss lived in the tree, each re-fixed (or not) per site:
//
//   · a record a NEWER build wrote was read as this build's shape, and the next
//     save wrote the downgrade over it (the persisted-payload-versioning ADR,
//     .vault/Architect/decisions/2026-08-29-persisted-payload-versioning.md,
//     rule 3 — "refuse, never downgrade" — had no seam to live in);
//   · a read-merge-write copied four times read through `loadStep`, which turns
//     a FAILED read into `{}`, and then merged one field over the whole record;
//   · a hook that marked itself loaded on a failed read and then saved.
//
// A def is the one place a record's key and shape live. `readRecord` is the
// read seam the ADR's rules 3 and 4 hang off: absent `v` is v1 (rule 1), a `v`
// above the def's is REFUSED as "future" (rule 3), each lower `v` is walked up
// through the def's pure migrations (rule 4), and the result is parsed — a shape
// the parser does not accept is refused as "malformed" rather than cast.
//
// WHAT IS DELIBERATELY NOT HERE YET (later stages of the same card): lineage
// (`derivesFrom` is accepted and stored, nothing reads it), the staleness
// projection, the step-local defs for frames/score/cut/trailer, and the ratchet
// against literal keys outside this directory.
//
// No React in this module: the hook is `useRecord.ts`, the writes `patch.ts`.

import type { PhaseKey } from "@/lib/projects";

import { readStep, type ReadOutcome } from "../stepStore";

/* ──────────────────────────────── refusals ───────────────────────────────── */

/** Why a stored record was not handed to the caller.
 *
 *  `future` — written by a newer build; this one does not know its shape and
 *  must not save over it. `malformed` — the parser (or a migration) could not
 *  make a record of it. A class so a parser's return can be told from a record
 *  by `instanceof`, never by sniffing for a field a record might also carry. */
export class RecordRefusal {
  constructor(
    readonly refused: "future" | "malformed",
    readonly detail: string,
  ) {}
}

/** For a parser: "this is not a record I can read", with the reason. */
export const malformed = (detail: string) => new RecordRefusal("malformed", detail);

/** The refusal half of a read outcome, plain data so it survives a `setState`. */
export interface Refused {
  ok: false;
  refused: "future" | "malformed";
  detail: string;
}

export type RecordReadOutcome<T> = ReadOutcome<T> | Refused;

/* ──────────────────────────────── the def ────────────────────────────────── */

/** A pure vN → vN+1 step over the stored object. Ships in the same commit as the
 *  shape change that needs it (ADR rule 4). */
export type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

export interface RecordSpec<T extends object> {
  /** The step-store key, `${projectId}:${key}` on disk. */
  key: string;
  /** The step whose directory exports this def and whose writer owns the shape. */
  owner: PhaseKey;
  /** The CURRENT shape version; every write through the def stamps it. */
  version: number;
  /** Stored object (already migrated to `version`) → the record, or a refusal.
   *  v1 means "every field optional" (ADR rule 1), so a parser fills defaults
   *  and refuses only what it cannot read; it should keep fields it does not
   *  know, so a patch never drops a field a sibling writer added. */
  parse: (raw: Record<string, unknown>) => T | RecordRefusal;
  /** `migrate[n]` takes a vN object to vN+1. Required for 1..version-1. */
  migrate?: Readonly<Record<number, Migration>>;
  /** The records this one is derived from. Accepted now; read by the lineage
   *  stage. */
  derivesFrom?: readonly RecordDef<object>[];
}

export interface RecordDef<T extends object> {
  readonly key: string;
  readonly owner: PhaseKey;
  readonly version: number;
  readonly parse: (raw: Record<string, unknown>) => T | RecordRefusal;
  readonly migrate: Readonly<Record<number, Migration>>;
  readonly derivesFrom: readonly RecordDef<object>[];
}

const REGISTRY = new Map<string, RecordDef<object>>();

/**
 * Declare a record. Throws on a def that cannot be honoured — a missing
 * migration, a bad version, or a second OWNER claiming a key — because each of
 * those is a programming error that would otherwise surface as a stranded or
 * overwritten record in somebody's browser.
 *
 * Re-declaring a key under the SAME owner replaces the def: that is a module
 * re-evaluated by hot reload, not two writers.
 */
export function defineRecord<T extends object>(spec: RecordSpec<T>): RecordDef<T> {
  if (!spec.key) throw new Error("defineRecord: a record needs a key");
  if (!Number.isInteger(spec.version) || spec.version < 1)
    throw new Error(`defineRecord(${spec.key}): version must be a positive integer, got ${spec.version}`);
  const migrate = spec.migrate ?? {};
  for (let n = 1; n < spec.version; n++)
    if (typeof migrate[n] !== "function")
      throw new Error(`defineRecord(${spec.key}): v${spec.version} needs a migration from v${n}`);
  const prior = REGISTRY.get(spec.key);
  if (prior && prior.owner !== spec.owner)
    throw new Error(`defineRecord(${spec.key}): already owned by ${prior.owner}, claimed again by ${spec.owner}`);

  const def: RecordDef<T> = {
    key: spec.key,
    owner: spec.owner,
    version: spec.version,
    parse: spec.parse,
    migrate,
    derivesFrom: spec.derivesFrom ?? [],
  };
  REGISTRY.set(spec.key, def);
  return def;
}

/** Every def declared so far in this module graph — for the lineage stage and
 *  the ratchet, which need the population rather than one def. */
export function recordDefs(): readonly RecordDef<object>[] {
  return [...REGISTRY.values()];
}

/* ──────────────────────────────── decoding ───────────────────────────────── */

export const isPlainObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The version a stored object claims. Absent is 1, permanently (ADR rule 1). */
function storedVersion(stored: Record<string, unknown>): number | RecordRefusal {
  const v = stored.v ?? 1;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1) return malformed(`v is ${JSON.stringify(stored.v)}`);
  return v;
}

/** Is this stored object from a build newer than the def? Cheap — no parse. */
export function isFromTheFuture(def: RecordDef<object>, stored: unknown): boolean {
  if (!isPlainObject(stored)) return false;
  const v = storedVersion(stored);
  return typeof v === "number" && v > def.version;
}

/**
 * Stored data → the record, synchronously, with no I/O — so the same decision
 * runs at the read seam and inside a patch's transaction.
 *
 * `undefined` (never written) is a real answer and passes through.
 */
export function decodeRecord<T extends object>(
  def: RecordDef<T>,
  stored: unknown,
): { ok: true; data: T | undefined } | Refused {
  const refused = (r: RecordRefusal): Refused => ({ ok: false, refused: r.refused, detail: r.detail });
  if (stored === undefined) return { ok: true, data: undefined };
  if (!isPlainObject(stored)) return refused(malformed(`${def.key} is stored as ${typeof stored}, not an object`));

  const v = storedVersion(stored);
  if (v instanceof RecordRefusal) return refused(v);
  if (v > def.version)
    return refused(
      new RecordRefusal("future", `${def.key} was written as v${v} by a newer build; this build reads up to v${def.version}`),
    );

  let cur: Record<string, unknown> = stored;
  for (let n = v; n < def.version; n++) {
    try {
      cur = def.migrate[n]({ ...cur });
    } catch (e) {
      return refused(malformed(`${def.key}: migration v${n}→v${n + 1} failed: ${message(e)}`));
    }
  }

  let parsed: T | RecordRefusal;
  try {
    parsed = def.parse(cur);
  } catch (e) {
    return refused(malformed(`${def.key}: ${message(e)}`));
  }
  return parsed instanceof RecordRefusal ? refused(parsed) : { ok: true, data: parsed };
}

/**
 * The read seam. Three answers, and they mean different things to a writer:
 *
 *   · `ok: true` — the record (or `undefined`: never written). Safe to build on.
 *   · `ok: false, trouble` — the read FAILED; the work may be on disk and out
 *     of reach. Reported through the store's trouble channel already.
 *   · `ok: false, refused` — read, and not ours to interpret. Saving now would
 *     overwrite a newer build's record or one nobody can parse.
 *
 * In every `ok: false` case the caller must not write — `useRecord` enforces it.
 */
export async function readRecord<T extends object>(
  def: RecordDef<T>,
  projectId: string,
): Promise<RecordReadOutcome<T>> {
  const r = await readStep<unknown>(projectId, def.key);
  if (!r.ok) return r;
  return decodeRecord(def, r.data);
}
