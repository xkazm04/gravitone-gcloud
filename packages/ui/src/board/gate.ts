// THE GATE KERNEL - the verdict state machine every decision surface shares, over a port.
//
// Moved from v1 app/foundry/gate/useGate.ts (Phase 3, plan §3.1: "useGate into ui/board,
// unchanged in behaviour") onto a `GatePort` with no lib/ import, so the Foundry's Cull, the
// Extract bench and the Board's desks drive one controller. What it owns, all kept:
//
//   - LATEST-WINS DETAIL LOADS. A monotonic ticket is taken at call time and checked before
//     anything is applied, so run A's response never lands on run B (a poll re-requests the
//     SAME id, which is why it is a ticket and not an `id === selected` comparison).
//   - OPTIMISTIC VERDICTS, applied synchronously, so a burst of keystrokes never reads a
//     stale map.
//   - A WRITE QUEUE: writes wait out a window (WRITE_WINDOW_MS), then go out naming only the
//     keys this tab touched, never the whole map, and chained, so a clear right after a set
//     cannot overtake it. A failed write keeps what did not go out for the next flush.
//   - UNDO, on ./undo.ts (the v1 Board's stack).
//   - A `pagehide` FLUSH through the port's keepalive door - a debounced save is exactly what
//     a closing tab loses.
//   - THE COMMIT PLAN: a ticketed "ask the server what this commit will do", asked only after
//     the queue landed, because a queued write would stale the plan's token the moment it did.
//
// UPGRADED, for a port that keeps the history itself (`history`, the kernel's decision log):
// v1's window MERGED every key into one write, and that write was one undo step on nothing -
// the stack lived in this tab. The kernel's undo unit is the WRITE (one patch = one act), so
// merging two keypresses into one write would make one ⌫ take back two decisions, which is
// the failure undo-history/gesture-coalescing names ("two rapid distinct actions fuse into
// one"). With a history port each decide is its own act: the window still delays and batches
// the SENDING, the acts stay distinct, and undo is the server's - it survives a reload and
// another tab sees it (kernel/decision core.ts planUndo). An act not yet sent is taken back
// here, with no network at all. Without a history port, v1's merge is unchanged.

import { AppError } from "@gt/domain/errors";

import { latestUndo, popUndo, pushUndo, reversal, type UndoEntry, type VerdictState } from "./undo.ts";

export const WRITE_WINDOW_MS = 400;

export type GateSave = "idle" | "saving" | "saved" | "error";

/** What a gate needs from its source. `TVerdict` is the source's own record. */
export interface GatePort<TDetail, TVerdict, TPlan = never, TResult = never> {
  loadDetail(id: string): Promise<TDetail>;
  /** The decided keys of a loaded detail. Absent = undecided. */
  verdictsOf(detail: TDetail): Readonly<Record<string, TVerdict>>;
  /** A committed gate is final: decide is refused with no network call. */
  readOnlyOf(detail: TDetail): boolean;
  /** Apply `changes` (null clears) to the server's CURRENT map. Never a stale whole map. */
  write(id: string, changes: ReadonlyMap<string, TVerdict | null>): Promise<void>;
  /** Best effort at `pagehide`: fire-and-forget, no await. */
  keepalive(id: string, changes: ReadonlyMap<string, TVerdict | null>): void;
  /** The undo stack's vocabulary for a record. */
  stateOf(v: TVerdict | undefined): VerdictState;
  previewCommit?(id: string): Promise<TPlan>;
  commit?(id: string, token?: string): Promise<TResult>;
  /** The server keeps the decision history: one decide is one act, and undo is the server's. */
  history?: {
    undo(id: string): Promise<TDetail>;
    /** Is there an act left to take back on the server (read from a loaded detail)? */
    undoable(detail: TDetail): boolean;
  };
}

/** v1's name for the port, kept for the Foundry's adapters. */
export type GateAdapter<TDetail, TVerdict, TPlan = never, TResult = never> = GatePort<TDetail, TVerdict, TPlan, TResult>;

export interface GateSnapshot<TDetail, TVerdict, TPlan> {
  readonly id: string | null;
  readonly detail: TDetail | null;
  readonly verdicts: Readonly<Record<string, TVerdict>>;
  readonly readOnly: boolean;
  readonly save: GateSave;
  /** A load that failed, for the surface to show; null when the last load landed. */
  readonly loadError: string | null;
  /** The last failed write or undo, verbatim; null once one lands. (v1 dropped its words.) */
  readonly writeError: string | null;
  readonly canUndo: boolean;
  readonly plan: { readonly plan: TPlan | null; readonly loading: boolean; readonly error: string | null };
}

export interface GateOptions {
  /** Window before queued writes go out. */
  readonly windowMs?: number;
}

export interface Gate<TDetail, TVerdict, TPlan, TResult> {
  getSnapshot(): GateSnapshot<TDetail, TVerdict, TPlan>;
  subscribe(listener: () => void): () => void;
  /** Make `id` the current gate and load it. Pending writes for the previous one still go out. */
  select(id: string): Promise<void>;
  /** (Re)load a given id. `keepVerdicts` is the poll's: the local verdicts are the operator's. */
  load(id: string, keepVerdicts: boolean): Promise<void>;
  /** Apply one value to one or many keys; null clears. False when refused (no id, or read-only). */
  decide(keys: string | readonly string[], value: TVerdict | null, label?: string): boolean;
  undo(): boolean;
  /** Send whatever is queued now and resolve when it landed. */
  flush(): Promise<void>;
  /** `pagehide`: send what is queued through the port's keepalive door. */
  flushOnHide(): void;
  /** Flush, then ask the server what a commit would do. */
  prepareCommit(): Promise<void>;
  clearPlan(): void;
  /** Flush, then commit with the plan's token. Resolves with the port's result. */
  commit(): Promise<TResult>;
  /** Listen for `pagehide` on `target`; returns the detach. */
  attach(target: EventTarget): () => void;
}

type Act<TVerdict> = { readonly entry: number; readonly changes: Map<string, TVerdict | null> };

const messageOf = (e: unknown, fallback: string): string => (e instanceof Error ? e.message : fallback);

/** A plan's commit token, when it carries one (v1 read it through a cast; this is the guard). */
function tokenOf(plan: unknown): string | undefined {
  if (typeof plan !== "object" || plan === null || !("token" in plan)) return undefined;
  return typeof plan.token === "string" ? plan.token : undefined;
}

export function createGate<TDetail, TVerdict, TPlan = never, TResult = never>(
  port: GatePort<TDetail, TVerdict, TPlan, TResult>,
  options: GateOptions = {},
): Gate<TDetail, TVerdict, TPlan, TResult> {
  const windowMs = options.windowMs ?? WRITE_WINDOW_MS;
  const listeners = new Set<() => void>();
  const history = port.history;

  let snap: GateSnapshot<TDetail, TVerdict, TPlan> = {
    id: null,
    detail: null,
    verdicts: {},
    readOnly: false,
    save: "idle",
    loadError: null,
    writeError: null,
    canUndo: false,
    plan: { plan: null, loading: false, error: null },
  };
  const publish = (patch: Partial<GateSnapshot<TDetail, TVerdict, TPlan>>): void => {
    snap = { ...snap, ...patch };
    for (const l of [...listeners]) l();
  };

  let detailTicket = 0;
  let planTicket = 0;

  // The queue belongs to ONE gate id: a select() flushes the old one first. Without a
  // history port it holds one merged act; with one, an act per decide.
  let pending: Act<TVerdict>[] = [];
  let pendingFor: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let chain: Promise<unknown> = Promise.resolve();

  let undoStack: UndoEntry[] = [];
  let undoSeq = 0;
  /** The raw record each undo entry's keys held before, by entry id. */
  const undoRaw = new Map<number, Map<string, TVerdict | undefined>>();
  /** A history port's server has an act this tab may take back. */
  let serverUndoable = false;

  const canUndoNow = (): boolean => (history === undefined ? latestUndo(undoStack) !== null : pending.length > 0 || serverUndoable);

  const clearTimer = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const merged = (acts: readonly Act<TVerdict>[]): Map<string, TVerdict | null> => {
    const out = new Map<string, TVerdict | null>();
    for (const a of acts) for (const [k, v] of a.changes) out.set(k, v);
    return out;
  };

  function flush(): Promise<void> {
    clearTimer();
    if (pending.length === 0 || pendingFor === null) return chain.then(() => undefined);
    const id = pendingFor;
    const acts = pending;
    pending = [];
    pendingFor = null;
    if (id === snap.id) publish({ save: "saving" });
    let sent = 0;
    const run = chain
      // A failed earlier write already reported itself; the queue behind it still goes out.
      .catch(() => undefined)
      .then(async () => {
        for (const a of acts) {
          await port.write(id, a.changes);
          sent++;
          if (history !== undefined) serverUndoable = true;
        }
      })
      .then(
        () => {
          if (id === snap.id && pending.length === 0) publish({ save: "saved", writeError: null, canUndo: canUndoNow() });
        },
        (e: unknown) => {
          // Keep what did not go out, unless a newer decision superseded the key, so the next
          // flush carries it instead of losing it silently.
          const left = acts.slice(sent);
          if (pendingFor === null || pendingFor === id) {
            if (history === undefined) {
              // v1's one merged map: what failed, under whatever was decided since.
              const changes = new Map([...merged(left), ...merged(pending)]);
              if (changes.size > 0) pending = [{ entry: left[0]?.entry ?? 0, changes }];
            } else pending = [...left, ...pending];
            pendingFor = id;
          }
          if (id === snap.id) publish({ save: "error", writeError: messageOf(e, "the verdict did not save") });
        },
      );
    chain = run;
    return run;
  }

  function queue(id: string, entry: number, changes: Map<string, TVerdict | null>): void {
    if (pendingFor !== null && pendingFor !== id) void flush();
    pendingFor = id;
    const last = pending[pending.length - 1];
    if (history === undefined && last !== undefined) for (const [k, v] of changes) last.changes.set(k, v);
    else pending.push({ entry, changes });
    clearTimer();
    timer = setTimeout(() => void flush(), windowMs);
  }

  function applyLocal(keys: Iterable<string>, valueOf: (k: string) => TVerdict | null): void {
    const next: Record<string, TVerdict> = { ...snap.verdicts };
    for (const k of keys) {
      const v = valueOf(k);
      if (v === null) delete next[k];
      else next[k] = v;
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
      // A rejection path, always: an unhandled one would surface as a failed SAVE.
      return port.loadDetail(id).then(
        (d) => {
          if (ticket !== detailTicket) return;
          if (history !== undefined) serverUndoable = history.undoable(d);
          publish({
            detail: d,
            readOnly: port.readOnlyOf(d),
            loadError: null,
            canUndo: canUndoNow(),
            ...(keepVerdicts ? {} : { verdicts: { ...port.verdictsOf(d) } }),
          });
        },
        (e: unknown) => {
          if (ticket !== detailTicket) return;
          publish({ loadError: messageOf(e, "could not load that run") });
        },
      );
    },

    select(id) {
      // The previous gate's queue goes out under ITS id before anything resets.
      void flush();
      undoStack = [];
      undoRaw.clear();
      serverUndoable = false;
      planTicket++;
      publish({
        id,
        detail: null,
        verdicts: {},
        readOnly: false,
        save: "idle",
        loadError: null,
        writeError: null,
        canUndo: false,
        plan: { plan: null, loading: false, error: null },
      });
      return gate.load(id, false);
    },

    decide(keys, value, label) {
      const id = snap.id;
      if (id === null || snap.readOnly) return false;
      const list = typeof keys === "string" ? [keys] : [...keys];
      const first = list[0];
      if (first === undefined) return false;
      const raw = new Map<string, TVerdict | undefined>();
      for (const k of list) raw.set(k, snap.verdicts[k]);
      const changes = list.map((k) => ({ itemId: k, prev: port.stateOf(raw.get(k)), next: port.stateOf(value ?? undefined) }));
      const entry: UndoEntry = { id: ++undoSeq, itemId: first, label: label ?? first, at: Date.now(), changes };
      undoStack = pushUndo(undoStack, entry);
      undoRaw.set(entry.id, raw);
      for (const eid of [...undoRaw.keys()]) if (!undoStack.some((e) => e.id === eid)) undoRaw.delete(eid);
      applyLocal(list, () => value);
      queue(id, entry.id, new Map(list.map((k) => [k, value])));
      publish({ canUndo: canUndoNow() });
      return true;
    },

    undo() {
      const id = snap.id;
      if (id === null || snap.readOnly) return false;
      if (history === undefined) {
        const [entry, rest] = popUndo(undoStack);
        if (entry === null) return false;
        undoStack = rest;
        const raw = undoRaw.get(entry.id);
        undoRaw.delete(entry.id);
        for (const w of reversal(entry)) {
          const value = raw?.get(w.itemId) ?? null;
          applyLocal([w.itemId], () => value);
          queue(id, entry.id, new Map([[w.itemId, value]]));
        }
        publish({ canUndo: canUndoNow() });
        return true;
      }
      // An act that has not left this tab is taken back here; the server never hears of it.
      const unsent = pendingFor === id ? pending[pending.length - 1] : undefined;
      if (unsent !== undefined) {
        pending = pending.slice(0, -1);
        if (pending.length === 0) clearTimer();
        const raw = undoRaw.get(unsent.entry);
        undoRaw.delete(unsent.entry);
        undoStack = undoStack.filter((e) => e.id !== unsent.entry);
        applyLocal(unsent.changes.keys(), (k) => raw?.get(k) ?? null);
        publish({ save: pending.length > 0 ? "saving" : "saved", canUndo: canUndoNow() });
        return true;
      }
      if (!serverUndoable) return false;
      publish({ save: "saving" });
      const run = chain
        .catch(() => undefined)
        .then(() => history.undo(id))
        .then(
          (d) => {
            if (id !== snap.id) return;
            serverUndoable = history.undoable(d);
            publish({ detail: d, verdicts: { ...port.verdictsOf(d) }, save: "saved", writeError: null, canUndo: canUndoNow() });
          },
          (e: unknown) => {
            if (id === snap.id) publish({ save: "error", writeError: messageOf(e, "the undo did not land") });
          },
        );
      chain = run;
      return true;
    },

    flush,

    flushOnHide() {
      clearTimer();
      if (pending.length === 0 || pendingFor === null) return;
      const id = pendingFor;
      // A closing tab gets one keepalive request; the acts' boundaries are what it loses.
      const changes = merged(pending);
      pending = [];
      pendingFor = null;
      port.keepalive(id, changes);
    },

    async prepareCommit() {
      const id = snap.id;
      if (id === null || port.previewCommit === undefined) return;
      const mine = ++planTicket;
      publish({ plan: { plan: null, loading: true, error: null } });
      try {
        await flush();
        const p = await port.previewCommit(id);
        if (mine !== planTicket) return;
        publish({ plan: { plan: p, loading: false, error: null } });
      } catch (e) {
        if (mine !== planTicket) return;
        publish({ plan: { plan: null, loading: false, error: messageOf(e, "could not prepare the commit plan") } });
      }
    },

    clearPlan() {
      planTicket++;
      publish({ plan: { plan: null, loading: false, error: null } });
    },

    async commit() {
      const id = snap.id;
      if (id === null || port.commit === undefined) throw new AppError("refused", "nothing to commit");
      await flush();
      return port.commit(id, tokenOf(snap.plan.plan));
    },

    attach(target) {
      const on = (): void => gate.flushOnHide();
      target.addEventListener("pagehide", on);
      return () => target.removeEventListener("pagehide", on);
    },
  };
  return gate;
}
