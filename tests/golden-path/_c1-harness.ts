// SHARED HARNESS for the C1 closing-stage probes (critic-2026-10-07-script-chain,
// Part 1): the minimal hook dispatcher active-notebook.probe.spec.ts uses (no DOM
// in this lane), and the reasoned-notebook fixture. A copy rather than an import,
// because production-script-probes-B migrates active-notebook.probe.spec.ts and
// this stage must not touch it.
import "fake-indexeddb/auto";

import { expect } from "@playwright/test";
import * as React from "react";

import { LIVE_NOTEBOOK_PHASE } from "@/app/_phases/_shared/notebook/useActiveNotebook";
import type { Dimension } from "@/app/_phases/_shared/notebook/dimensions";
import type { Conclusion } from "@/app/_phases/_shared/notebook/conclusions";
import type { Notebook } from "@/app/_phases/_shared/notebook/types";
import { saveStep } from "@/app/_phases/_shared/stepStore";
import type { EngineReceipt } from "@/app/_phases/research/run/live";
import { parseNotebook } from "@/lib/notebook/validate";

import { loadCassette, type CassetteTurn } from "./_helpers";

/* ────────────────────────────── the harness ───────────────────────────────── */
// step-records.probe.spec.ts's dispatcher, plus `useSyncExternalStore` (read the
// snapshot; the next pass re-reads it, which is all a store update means here).
// `settle` turns the loop with setImmediate rather than setTimeout(0): the
// engine's work drains the same, and on this OS a zero timer costs a clock tick,
// which made this file take a minute instead of two seconds.

interface Internals {
  H: unknown;
}
export const INTERNALS = (React as unknown as Record<string, Internals>)
  .__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

const sameDeps = (a?: readonly unknown[], b?: readonly unknown[]) =>
  a !== undefined && b !== undefined && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));

export const settle = async () => {
  for (let i = 0; i < 200; i++) await new Promise((r) => setImmediate(r));
};

/** What `useContext` answers for any context (see the dispatcher). */
const CONTEXT_STUB: unknown = new Proxy(
  {},
  {
    get: (_t, k) => (k === "user" ? null : k === "jobs" ? [] : () => undefined),
  },
);

export function harness<T>(run: () => T) {
  const cells: unknown[] = [];
  const refs: { current: unknown }[] = [];
  const committed: { deps?: readonly unknown[]; cleanup?: () => void }[] = [];
  const memos: { deps?: readonly unknown[]; value: unknown }[] = [];
  let ci = 0;
  let ei = 0;
  let mi = 0;
  let ri = 0;
  let dirty = false;
  let queue: (() => void)[] = [];
  let out!: T;

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
    // Every context reads as a stub that answers "nobody signed in, no jobs":
    // enough for the hooks that read an auth or jobs provider to run here.
    useContext() {
      return CONTEXT_STUB;
    },
    useLayoutEffect(fn: () => void | (() => void), deps?: readonly unknown[]) {
      return dispatcher.useEffect(fn, deps);
    },
    useSyncExternalStore(_subscribe: unknown, getSnapshot: () => unknown) {
      return getSnapshot();
    },
  };

  return {
    async settleUp(): Promise<T> {
      for (let pass = 0; pass < 60; pass++) {
        ci = 0;
        ei = 0;
        mi = 0;
        ri = 0;
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
        if (!dirty) return out;
      }
      throw new Error("the hook never settled in 60 passes");
    },
    get current(): T {
      return out;
    },
    unmount() {
      for (const c of committed) c?.cleanup?.();
    },
  };
}


/* ───────────────────────────────── fixtures ───────────────────────────────── */

/** A schema-valid notebook (the retrieval cassette's answer, as
 *  notebook-source.probe.spec.ts uses it) that declares its own columns, tags
 *  every Fact/Mechanism/Reversal, and carries one conclusion of its own. */
const RAW = (loadCassette("research-retrieve").turns[0]! as CassetteTurn).resultJson as Record<string, unknown>;

export const COLUMNS: Dimension[] = [
  { id: "volume", label: "Volume", purpose: "How much moved.", emptyByOmission: "Nobody measured it.", notApplicable: "Nothing moved." },
  { id: "rate", label: "Rate", purpose: "What it cost.", emptyByOmission: "Nobody priced it.", notApplicable: "Nothing was charged." },
];

export const OWN_CONCLUSION: Conclusion = {
  id: "c-harbour-own",
  claim: "The dredging bill is a rate story, not a volume story.",
  reasoning: "Because the dredging volume and the rate disagree.",
  leap: "moderate",
  restsOn: ["f-volume", "f-rate"],
  falsifiableBy: "A harbour authority invoice.",
  useFor: "thesis",
};

export function liveNotebook(): Notebook {
  const nb = structuredClone(RAW) as {
    facts: { dimension?: string }[];
    mechanisms: { dimension?: string }[];
    reversals: { dimension?: string }[];
  };
  nb.facts.forEach((f, i) => (f.dimension = i % 2 ? "rate" : "volume"));
  nb.mechanisms.forEach((m) => (m.dimension = "volume"));
  nb.reversals.forEach((r) => (r.dimension = "rate"));
  return parseNotebook({ ...nb, dimensions: structuredClone(COLUMNS), conclusions: [OWN_CONCLUSION] }, "harbour dredging costs");
}

export const RECEIPT: EngineReceipt = {
  kind: "local-claude-code",
  provider: "claude-cli",
  model: "probe-model",
  rung: "reason",
  transport: "cli",
  schemaEnforcement: "prompt",
  costBasis: "unpriced",
  durationMs: 1,
  promptChars: 1,
  searched: false,
};

/** What `startLive` writes when a run lands — through the same `saveStep`. */
export async function landLive(projectId: string, receipt: EngineReceipt = RECEIPT): Promise<Notebook> {
  const notebook = liveNotebook();
  const out = await saveStep(projectId, LIVE_NOTEBOOK_PHASE, { topic: "harbour dredging costs", notebook, engine: receipt, savedAt: 1 });
  expect(out.ok, "the live record was not written - nothing below proves anything").toBe(true);
  return notebook;
}
