"use client";

// THE GATE KERNEL - the verdict state machine every /foundry tab used to carry
// its own copy of, built once over an adapter.
//
// A "gate" is a surface where a human decides items one key at a time and a
// commit later acts on the decisions (the Cull, the Extract bench, the Dojo).
// What is common to all of them, and what this owns:
//
//   - LATEST-WINS DETAIL LOADS. A monotonic ticket is taken at call time and
//     checked before anything is applied, so run A's response can never write
//     A's verdicts onto run B (the poll re-requests the SAME id, which is why
//     it is a ticket and not an `id === selected` comparison).
//   - OPTIMISTIC VERDICTS, applied synchronously, so a burst of keystrokes
//     never reads a stale map.
//   - A WRITE QUEUE: keys merge over a window (WRITE_WINDOW_MS), then ONE
//     `adapter.write(id, changes)` goes out. `changes` names only the keys this
//     tab touched, never the whole map: the adapter reads the server fresh and
//     merges them, so another tab or the Board having decided something else
//     in between is not overwritten. Writes are chained, so a clear right
//     after a set cannot overtake it.
//   - UNDO (Z), on lib/board/undo.ts - the Board's own stack.
//   - A `pagehide` FLUSH through `adapter.keepalive`, because a debounced save
//     is exactly what a closing tab loses.
//   - THE COMMIT-PLAN DIALOG STATE (the old `useCommitPlan`): a ticketed
//     "ask the server what this commit will do".
//
// The controller (`createGate`) is plain TypeScript with no React in it, so
// tests/golden-path/foundry-gate-kernel.probe.spec.ts drives it in the Node
// lane against a fake adapter. `useGate` is the thin React binding.

import { useEffect, useState, useSyncExternalStore } from "react";

import { latestUndo, popUndo, pushUndo, reversal, type UndoEntry, type VerdictState } from "@/lib/board/undo";

export const WRITE_WINDOW_MS = 400;

export type GateSave = "idle" | "saving" | "saved" | "error";

/** What a gate needs from its source. `TVerdict` is the source's own record. */
export interface GateAdapter<TDetail, TVerdict, TPlan = never, TResult = never> {
  loadDetail(id: string): Promise<TDetail>;
  /** The decided keys of a loaded detail. Absent = undecided. */
  verdictsOf(detail: TDetail): Record<string, TVerdict>;
  /** A committed gate is final: decide is refused with no network call. */
  readOnlyOf(detail: TDetail): boolean;
  /** Read FRESH, apply `changes` (null deletes), write. Never a stale whole map. */
  write(id: string, changes: ReadonlyMap<string, TVerdict | null>): Promise<void>;
  /** Best effort at `pagehide`: fire-and-forget with `keepalive`, no await. */
  keepalive(id: string, changes: ReadonlyMap<string, TVerdict | null>): void;
  /** The Board's vocabulary for a record, for lib/board/undo.ts. */
  stateOf(v: TVerdict | undefined): VerdictState;
  previewCommit?(id: string): Promise<TPlan>;
  commit?(id: string, token?: string): Promise<TResult>;
}

export interface GateSnapshot<TDetail, TVerdict, TPlan> {
  id: string | null;
  detail: TDetail | null;
  verdicts: Record<string, TVerdict>;
  readOnly: boolean;
  save: GateSave;
  /** A load that failed, for the surface to show; null when the last load landed. */
  loadError: string | null;
  canUndo: boolean;
  plan: { plan: TPlan | null; loading: boolean; error: string | null };
}

export interface GateOptions {
  /** Merge window before a write goes out. */
  windowMs?: number;
}

export interface Gate<TDetail, TVerdict, TPlan, TResult> {
  getSnapshot(): GateSnapshot<TDetail, TVerdict, TPlan>;
  subscribe(listener: () => void): () => void;
  /** Make `id` the current gate and load it. Pending writes for the previous one still go out. */
  select(id: string): Promise<void>;
  /** (Re)load a given id. `keepVerdicts` is the poll's: the local verdicts are the human's. */
  load(id: string, keepVerdicts: boolean): Promise<void>;
  /** Apply one value to one or many keys; null clears. False when refused (no id, or read-only). */
  decide(keys: string | readonly string[], value: TVerdict | null, label?: string): boolean;
  undo(): boolean;
  /** Send whatever is queued now and resolve when it landed. */
  flush(): Promise<void>;
  /** `pagehide`: send what is queued through the adapter's keepalive door. */
  flushOnHide(): void;
  /** Flush, then ask the server what a commit would do. */
  prepareCommit(): Promise<void>;
  clearPlan(): void;
  /** Flush, then commit with the plan's token. Resolves with the adapter's result. */
  commit(): Promise<TResult>;
  /** Listen for `pagehide` on `target`; returns the detach. */
  attach(target: EventTarget): () => void;
}

export function createGate<TDetail, TVerdict, TPlan = never, TResult = never>(
  adapter: GateAdapter<TDetail, TVerdict, TPlan, TResult>,
  options: GateOptions = {},
): Gate<TDetail, TVerdict, TPlan, TResult> {
  const windowMs = options.windowMs ?? WRITE_WINDOW_MS;
  const listeners = new Set<() => void>();

  let snap: GateSnapshot<TDetail, TVerdict, TPlan> = {
    id: null,
    detail: null,
    verdicts: {},
    readOnly: false,
    save: "idle",
    loadError: null,
    canUndo: false,
    plan: { plan: null, loading: false, error: null },
  };
  const publish = (patch: Partial<GateSnapshot<TDetail, TVerdict, TPlan>>) => {
    snap = { ...snap, ...patch };
    for (const l of [...listeners]) l();
  };

  let detailTicket = 0;
  let planTicket = 0;

  // The queue belongs to ONE gate id: a select() flushes the old one first.
  let pending = new Map<string, TVerdict | null>();
  let pendingFor: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let chain: Promise<unknown> = Promise.resolve();

  let undoStack: UndoEntry[] = [];
  let undoSeq = 0;
  /** The raw record each undo entry's keys held before, by entry id. */
  const undoRaw = new Map<number, Map<string, TVerdict | undefined>>();

  const clearTimer = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  function flush(): Promise<void> {
    clearTimer();
    if (!pending.size || pendingFor === null) return chain.then(() => undefined);
    const id = pendingFor;
    const changes = pending;
    pending = new Map();
    pendingFor = null;
    if (id === snap.id) publish({ save: "saving" });
    const run = chain
      .catch(() => undefined)
      .then(() => adapter.write(id, changes))
      .then(
        () => {
          if (id === snap.id && !pending.size) publish({ save: "saved" });
        },
        () => {
          // Keep what did not go out, unless a newer decision superseded the key,
          // so the next decision's flush carries it instead of losing it silently.
          if (pendingFor === null || pendingFor === id) {
            for (const [k, v] of changes) if (!pending.has(k)) pending.set(k, v);
            pendingFor = id;
          }
          if (id === snap.id) publish({ save: "error" });
        },
      );
    chain = run;
    return run;
  }

  function queue(id: string, key: string, value: TVerdict | null) {
    if (pendingFor !== null && pendingFor !== id) void flush();
    pendingFor = id;
    pending.set(key, value);
    clearTimer();
    timer = setTimeout(() => void flush(), windowMs);
  }

  function applyLocal(keys: readonly string[], value: TVerdict | null) {
    const next = { ...snap.verdicts };
    for (const k of keys) {
      if (value === null) delete next[k];
      else next[k] = value;
    }
    publish({ verdicts: next, save: "saving" });
  }

  const gate: Gate<TDetail, TVerdict, TPlan, TResult> = {
    getSnapshot: () => snap,
    subscribe(l) {
      listeners.add(l);
      return () => void listeners.delete(l);
    },

    load(id, keepVerdicts) {
      const ticket = ++detailTicket;
      // A rejection path, always: an unhandled one would surface in the app's
      // bell as a failed SAVE (GlobalErrorBridge), the wrong message for a read.
      return adapter.loadDetail(id).then(
        (d) => {
          if (ticket !== detailTicket) return;
          publish({
            detail: d,
            readOnly: adapter.readOnlyOf(d),
            loadError: null,
            ...(keepVerdicts ? {} : { verdicts: { ...adapter.verdictsOf(d) } }),
          });
        },
        (e) => {
          if (ticket !== detailTicket) return;
          publish({ loadError: e instanceof Error ? e.message : "could not load that run" });
        },
      );
    },

    select(id) {
      // The previous gate's queue goes out under ITS id before anything resets.
      void flush();
      undoStack = [];
      undoRaw.clear();
      planTicket++;
      publish({
        id,
        detail: null,
        verdicts: {},
        readOnly: false,
        save: "idle",
        loadError: null,
        canUndo: false,
        plan: { plan: null, loading: false, error: null },
      });
      return gate.load(id, false);
    },

    decide(keys, value, label) {
      const id = snap.id;
      if (!id || snap.readOnly) return false;
      const list = typeof keys === "string" ? [keys] : [...keys];
      if (!list.length) return false;
      const raw = new Map<string, TVerdict | undefined>();
      for (const k of list) raw.set(k, snap.verdicts[k]);
      const changes = list.map((k) => ({
        itemId: k,
        prev: adapter.stateOf(raw.get(k)),
        next: adapter.stateOf(value ?? undefined),
      }));
      const entry: UndoEntry = { id: ++undoSeq, itemId: list[0], label: label ?? list[0], at: Date.now(), changes };
      undoStack = pushUndo(undoStack, entry);
      undoRaw.set(entry.id, raw);
      for (const eid of [...undoRaw.keys()]) if (!undoStack.some((e) => e.id === eid)) undoRaw.delete(eid);
      applyLocal(list, value);
      for (const k of list) queue(id, k, value);
      publish({ canUndo: undoStack.length > 0 });
      return true;
    },

    undo() {
      const id = snap.id;
      if (!id || snap.readOnly) return false;
      const [entry, rest] = popUndo(undoStack);
      if (!entry) return false;
      undoStack = rest;
      const raw = undoRaw.get(entry.id);
      undoRaw.delete(entry.id);
      for (const w of reversal(entry)) {
        const prev = raw?.get(w.itemId);
        const value = prev === undefined ? null : prev;
        applyLocal([w.itemId], value);
        queue(id, w.itemId, value);
      }
      publish({ canUndo: latestUndo(undoStack) !== null });
      return true;
    },

    flush,

    flushOnHide() {
      clearTimer();
      if (!pending.size || pendingFor === null) return;
      const id = pendingFor;
      const changes = pending;
      pending = new Map();
      pendingFor = null;
      adapter.keepalive(id, changes);
    },

    async prepareCommit() {
      const id = snap.id;
      if (!id || !adapter.previewCommit) return;
      const mine = ++planTicket;
      publish({ plan: { plan: null, loading: true, error: null } });
      try {
        // The plan is computed from the SERVER's verdicts; a queued write that
        // has not landed would make its token stale the moment it does.
        await flush();
        const p = await adapter.previewCommit(id);
        if (mine !== planTicket) return;
        publish({ plan: { plan: p, loading: false, error: null } });
      } catch (e) {
        if (mine !== planTicket) return;
        publish({ plan: { plan: null, loading: false, error: e instanceof Error ? e.message : "could not prepare the commit plan" } });
      }
    },

    clearPlan() {
      planTicket++;
      publish({ plan: { plan: null, loading: false, error: null } });
    },

    async commit() {
      const id = snap.id;
      if (!id || !adapter.commit) throw new Error("nothing to commit");
      await flush();
      return adapter.commit(id, (snap.plan.plan as { token?: string } | null)?.token);
    },

    attach(target) {
      const on = () => gate.flushOnHide();
      target.addEventListener("pagehide", on);
      return () => target.removeEventListener("pagehide", on);
    },
  };
  return gate;
}

/** The React binding. `adapter` must be a stable reference (a module constant). */
export function useGate<TDetail, TVerdict, TPlan = never, TResult = never>(
  adapter: GateAdapter<TDetail, TVerdict, TPlan, TResult>,
  options?: GateOptions,
) {
  const [gate] = useState(() => createGate(adapter, options));
  const snapshot = useSyncExternalStore(gate.subscribe, gate.getSnapshot, gate.getSnapshot);
  useEffect(() => {
    const detach = gate.attach(window);
    return () => {
      detach();
      void gate.flush();
    };
  }, [gate]);
  return { gate, ...snapshot };
}
