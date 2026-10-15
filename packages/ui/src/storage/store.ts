// THE BROWSER STORAGE ADAPTER: eviction by construction, reads through a schema,
// failures as Results. Pure over an injected Storage-like backing.
//
// v1 had 10 raw localStorage writers, and the eviction owner (lib/identityEviction.ts)
// kept the user-scoped ones in a HAND list, with a second hand list for the
// identity-independent exceptions and a walk probe (tests/golden-path/identity-
// and-writes) demanding every writer appear on one of the two. The list was right
// because a probe nagged it. Here the list IS the store: a key is written only
// through a `KeyDef` registered when the store is created, with its scope declared
// beside its schema, so `evict("identity")` clears every user-scoped key there is -
// an unregistered key cannot be written, so it cannot be missed.
//
// Kept from identityEviction.ts, with its reasons:
//   · WIPE EVERYTHING USER-SCOPED. Over-wiping costs a refetch; under-wiping costs a
//     cross-account disclosure. `identity` is the default reading of a key; `device`
//     is the enumerated exception and must say why (`why` is required).
//   · NEVER STOP HALFWAY. One key failing to clear does not stop the rest; the
//     report names each failure (v1 `failed`), and eviction never throws.
//   · DRY RUN uses the SAME predicate as the wipe (v1 `dryRun`; data-retention
//     dry-run-preview: a preview computed another way is a lie).
//   · The in-memory copy goes with the stored one (v1 `forgetRemembered`): a tab
//     whose write failed holds its values in memory, and eviction clears that too.
// Kept from lib/useRemembered.ts: when a write fails (private mode, full disk) the
// value is held in memory for this tab, so the control still works and simply does
// not survive the reload - and the caller is TOLD (an `err`), never left guessing.
// Upgraded: one record per key, each read through its own schema door, instead of
// v1's single JSON bag - one corrupt key now loses that key, not every remembered
// choice (client-state rehydration-narrowing: guard each field independently).

import type { z } from "zod";
import { parseAt, parseJsonAt, type Parsed } from "@gt/domain/door";
import { err, ok, type AppError, type Result } from "@gt/domain/errors";

import { classify, troubleError } from "./trouble.ts";

/** `identity`: belongs to whoever is signed in; cleared on every identity flip. `device`: a fact about this machine. */
export type Scope = "identity" | "device";

/** The three calls the adapter makes; `window.localStorage` satisfies it, and so does a test fake. */
export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type KeyDef<S extends z.core.$ZodType = z.core.$ZodType> = {
  readonly key: string;
  readonly scope: Scope;
  readonly schema: S;
  /** Why it is stored, and for `device`, why it survives a change of person. */
  readonly why: string;
};

export const NAMESPACE = "gravitone.";

export function defineKey<S extends z.core.$ZodType>(def: KeyDef<S>): KeyDef<S> {
  return Object.freeze({ ...def });
}

export type EvictionReport = {
  readonly scope: Scope;
  readonly dryRun: boolean;
  /** Keys that held a value (stored or in memory) and were - or would be - removed. */
  readonly removed: readonly string[];
  readonly failures: readonly AppError[];
};

export type Store = {
  /** ok(undefined): never written. err: unreadable, corrupt, or not registered. */
  read<S extends z.core.$ZodType>(def: KeyDef<S>): Result<Parsed<z.output<S>> | undefined>;
  /**
   * The raw stored text, or null when absent or unreadable. A string is stable by
   * value, so `useSyncExternalStore` can take it as its snapshot and parse with
   * `decode` only when it changes.
   */
  snapshot(def: KeyDef): string | null;
  /** Validates through the schema first; nothing invalid reaches storage. */
  write<S extends z.core.$ZodType>(def: KeyDef<S>, value: z.input<S>): Result<null>;
  remove(def: KeyDef): Result<null>;
  evict(scope: Scope, opts?: { dryRun?: boolean }): EvictionReport;
  readonly keys: readonly KeyDef[];
  subscribe(listener: () => void): () => void;
};

/** Refuses a registration that could lie: a duplicate key, a key outside the namespace, a missing reason. */
/** Text from storage, through the key's schema door. null is absence. */
export function decode<S extends z.core.$ZodType>(def: KeyDef<S>, raw: string | null): Result<Parsed<z.output<S>> | undefined> {
  return raw === null ? ok(undefined) : parseJsonAt(`storage:${def.key}`, def.schema, raw);
}

export function createStore(defs: readonly KeyDef[], backing: () => StorageLike | null): Result<Store> {
  const registered = new Map<string, KeyDef>();
  for (const d of defs) {
    if (!d.key.startsWith(NAMESPACE)) return err("invalid", `storage key "${d.key}" is outside the ${NAMESPACE} namespace`);
    if (registered.has(d.key)) return err("invalid", `storage key "${d.key}" is registered twice`);
    if (d.why.trim() === "") return err("invalid", `storage key "${d.key}" has no reason to exist`);
    registered.set(d.key, d);
  }
  const memory = new Map<string, string>();
  const listeners = new Set<() => void>();
  const emit = (): void => {
    for (const l of listeners) l();
  };

  const open = (key: string): Result<StorageLike> => {
    try {
      const b = backing();
      return b === null ? { ok: false, error: troubleError("unavailable", key) } : ok(b);
    } catch (cause) {
      return { ok: false, error: troubleError(classify(cause), key, cause) };
    }
  };
  const isRegistered = (def: KeyDef): Result<null> =>
    registered.get(def.key) === def ? ok(null) : err("refused", `storage key "${def.key}" is not registered with this store`);

  const rawOf = (key: string): Result<string | null> => {
    const held = memory.get(key);
    if (held !== undefined) return ok(held);
    const b = open(key);
    if (!b.ok) return b;
    try {
      return ok(b.value.getItem(key));
    } catch (cause) {
      return { ok: false, error: troubleError(classify(cause), key, cause) };
    }
  };

  function read<S extends z.core.$ZodType>(def: KeyDef<S>): Result<Parsed<z.output<S>> | undefined> {
    const reg = isRegistered(def);
    if (!reg.ok) return reg;
    const raw = rawOf(def.key);
    return raw.ok ? decode(def, raw.value) : raw;
  }

  function write<S extends z.core.$ZodType>(def: KeyDef<S>, value: z.input<S>): Result<null> {
    const reg = isRegistered(def);
    if (!reg.ok) return reg;
    const valid = parseAt(`storage:${def.key}`, def.schema, value);
    if (!valid.ok) return valid;
    const raw = JSON.stringify(value);
    const b = open(def.key);
    let failure: AppError | null = b.ok ? null : b.error;
    if (b.ok) {
      try {
        b.value.setItem(def.key, raw);
        memory.delete(def.key);
      } catch (cause) {
        failure = troubleError(classify(cause), def.key, cause);
      }
    }
    if (failure !== null) memory.set(def.key, raw);
    emit();
    return failure === null ? ok(null) : { ok: false, error: failure };
  }

  /** Clear one key, stored and in memory; ok(true) when it held a value. */
  function clear(key: string, dryRun: boolean): Result<boolean> {
    const had = memory.has(key);
    const b = open(key);
    if (!b.ok) {
      if (!dryRun) memory.delete(key);
      return had ? ok(true) : b;
    }
    try {
      const present = had || b.value.getItem(key) !== null;
      if (!dryRun) {
        b.value.removeItem(key);
        memory.delete(key);
      }
      return ok(present);
    } catch (cause) {
      if (!dryRun) memory.delete(key);
      return { ok: false, error: troubleError(classify(cause), key, cause) };
    }
  }

  const store: Store = {
    keys: [...registered.values()],
    read,
    snapshot(def) {
      if (!isRegistered(def).ok) return null;
      const raw = rawOf(def.key);
      return raw.ok ? raw.value : null;
    },
    write,
    remove(def) {
      const reg = isRegistered(def);
      if (!reg.ok) return reg;
      const r = clear(def.key, false);
      emit();
      return r.ok ? ok(null) : r;
    },
    evict(scope, opts = {}) {
      const dryRun = opts.dryRun === true;
      const removed: string[] = [];
      const failures: AppError[] = [];
      for (const d of registered.values()) {
        if (d.scope !== scope) continue;
        const r = clear(d.key, dryRun);
        if (!r.ok) failures.push(r.error);
        else if (r.value) removed.push(d.key);
      }
      if (!dryRun) emit();
      return { scope, dryRun, removed, failures };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return ok(store);
}
