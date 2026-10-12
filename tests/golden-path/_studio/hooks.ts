// THE ONE HOOK DISPATCHER of the node lane (no DOM here, so no renderer).
//
// It used to be copy-pasted into trailer-cut-lifecycle and score-spot-origin
// (and, privately, into six other probes). It installs a MINIMAL dispatcher on
// React's own current-dispatcher slot and calls the real hook module, so the
// real effects run over the real `stepStore` on `fake-indexeddb`.
//
// Implemented: useState, useRef, useEffect, useMemo, useCallback, useReducer.
// Nothing else, on purpose: a hook the subject starts using is a TypeError
// naming it rather than a silent stub. What is NOT covered is React's
// scheduling (batching, transitions, StrictMode double invoke) - the
// renderer's, and this lane has none.
import * as React from "react";

interface Internals {
  H: unknown;
}
export const INTERNALS = (React as unknown as Record<string, Internals>)
  .__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

/** If a React release moves the dispatcher slot, this is what says so: the
 *  failure is reported as broken TOOLING, not as a broken hook. */
export function assertHarnessInstalled(): void {
  if (!INTERNALS) throw new Error("React's client internals are not where this harness expects");
  if (!("H" in INTERNALS)) throw new Error("React's client internals have no dispatcher slot `H`");
}

const sameDeps = (a?: readonly unknown[], b?: readonly unknown[]) =>
  a !== undefined && b !== undefined && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));

/** Let the effects' async bodies settle - they open a database and await it, so
 *  microtask flushing alone is not enough. */
const settle = async () => {
  for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 0));
};

export interface HarnessOptions {
  /**
   * When a pass counts as settled.
   *  - "quiet" (default): no state changed AND no effect fired. Strictest.
   *  - "stable": no state changed. Needed by hooks that sync refs in a DEP-LESS
   *    effect (`useLoadFor`), which by design re-queues on every render, so
   *    "no effect fired" can never be true for them.
   */
  settleWhen?: "quiet" | "stable";
}

export function harness<T>(run: () => T, options: HarnessOptions = {}) {
  const settleWhen = options.settleWhen ?? "quiet";
  const cells: unknown[] = [];
  const refs: { current: unknown }[] = [];
  const committed: { deps?: readonly unknown[]; cleanup?: () => void }[] = [];
  const memos: { deps?: readonly unknown[]; value: unknown }[] = [];
  let ci = 0;
  let ri = 0;
  let ei = 0;
  let mi = 0;
  let dirty = false;
  let queue: (() => void)[] = [];

  const dispatcher = {
    useState(init: unknown) {
      const k = ci++;
      if (!(k in cells)) cells[k] = typeof init === "function" ? (init as () => unknown)() : init;
      return [
        cells[k],
        (v: unknown) => {
          const next = typeof v === "function" ? (v as (p: unknown) => unknown)(cells[k]) : v;
          if (!Object.is(next, cells[k])) {
            cells[k] = next;
            dirty = true;
          }
        },
      ];
    },
    useReducer(
      reducer: (s: unknown, a: unknown) => unknown,
      initialArg: unknown,
      init?: (a: unknown) => unknown,
    ) {
      const k = ci++;
      if (!(k in cells)) cells[k] = init ? init(initialArg) : initialArg;
      return [
        cells[k],
        (action: unknown) => {
          const next = reducer(cells[k], action);
          if (!Object.is(next, cells[k])) {
            cells[k] = next;
            dirty = true;
          }
        },
      ];
    },
    useRef(init: unknown) {
      const k = ri++;
      if (!(k in refs)) refs[k] = { current: init };
      return refs[k];
    },
    useEffect(fn: () => void | (() => void), deps?: readonly unknown[]) {
      const k = ei++;
      const prev = committed[k];
      if (prev && sameDeps(prev.deps, deps)) return;
      queue.push(() => {
        prev?.cleanup?.();
        const cleanup = fn();
        committed[k] = { deps, cleanup: typeof cleanup === "function" ? cleanup : undefined };
      });
    },
    useMemo(fn: () => unknown, deps?: readonly unknown[]) {
      const k = mi++;
      const prev = memos[k];
      if (prev && sameDeps(prev.deps, deps)) return prev.value;
      const value = fn();
      memos[k] = { deps, value };
      return value;
    },
    useCallback(fn: unknown, deps?: readonly unknown[]) {
      return dispatcher.useMemo(() => fn, deps);
    },
  };

  return {
    /** Render, commit effects, let their async bodies land, and repeat while
     *  state keeps changing - what a renderer does, minus what this lane cannot
     *  have. */
    async settleUp(): Promise<T> {
      let out!: T;
      for (let pass = 0; pass < 40; pass++) {
        ci = 0;
        ri = 0;
        ei = 0;
        mi = 0;
        dirty = false;
        const before = INTERNALS.H;
        INTERNALS.H = dispatcher;
        try {
          out = run();
        } finally {
          INTERNALS.H = before;
        }
        const firing = queue;
        queue = [];
        for (const f of firing) f();
        await settle();
        if (!dirty && (settleWhen === "stable" || firing.length === 0)) return out;
      }
      throw new Error(
        "the hook never settled in 40 passes - a render loop, or an effect whose deps change every time",
      );
    },
    unmount() {
      for (const c of committed) c?.cleanup?.();
    },
  };
}
