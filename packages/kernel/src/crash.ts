import { errorMessage } from "@gt/domain/errors";
import type { Effects } from "./effects.ts";

// CRASH-PREFIX ENUMERATION - the kernel probes' harness (plan §6, Phase 1 exit).
//
// A driver's correctness under a crash is a finite question: it performs n
// effects, so there are n+1 places it can die (before the first, between any
// two, never after the last - that is a completed run). For each prefix k the
// harness:
//   1. opens a fresh world and runs the scenario, stopping the process after
//      effect k: the k-th effect lands, the scenario never learns it did;
//   2. reopens the world from disk, as a restarted process would, and checks
//      the invariant in phase "crashed" - what any reader may see right now;
//   3. runs recovery with live effects and checks the invariant in phase
//      "recovered" - what the system converges to.
// The uninterrupted run is checked in phase "recovered" too: recovery must
// agree with never having crashed.
//
// Absorbed from v1's tests/golden-path/foundry-catalogue-tx.probe.spec.ts,
// which pinned the catalogue's crash points one by one by hand. Upgraded: the
// points are not listed, they are enumerated from a recording, so a driver that
// gains an effect gains its crash points without anyone editing the test.
//
// A "crash" is a sentinel the wrapped port throws. A scenario that catches it
// and carries on is reported - a driver that swallows an arbitrary throw
// would also swallow a real failure.

export type Phase = "crashed" | "recovered";

export type CrashSpec<W> = {
  /** A fresh, empty world (store, blobs, stubs) in its own directory. */
  open(): Promise<W> | W;
  /** The world as a restarted process finds it: handles closed, reopened from disk. */
  reopen(w: W): Promise<W> | W;
  close(w: W): void;
  effects(w: W): Effects;
  scenario(fx: Effects, w: W): Promise<void>;
  recover(fx: Effects, w: W): Promise<void>;
  /** A sentence naming the violation, or undefined when the world is sound. */
  invariant(w: W, phase: Phase): string | undefined;
};

export type CrashViolation = { readonly k: number; readonly phase: Phase | "scenario"; readonly after: string; readonly reason: string };

export type CrashReport = {
  /** The uninterrupted run's effects, in order. */
  readonly effects: readonly string[];
  /** Crash points tried: one per prefix, 0..effects.length - 1. */
  readonly prefixes: number;
  readonly violations: readonly CrashViolation[];
};

const CRASH: { readonly crash: true } = Object.freeze({ crash: true });

/** Wrap a port so each completed effect is reported, and the k-th one ends the process. */
function instrument(inner: Effects, log: string[], crashAfter: number | undefined): Effects {
  const done = (name: string): void => {
    log.push(name);
    if (log.length === crashAfter) throw CRASH;
  };
  return {
    tx(name, fn) {
      const r = inner.tx(name, fn);
      done(`tx:${name}`);
      return r;
    },
    async blob(bytes, mime) {
      const r = await inner.blob(bytes, mime);
      done("blob");
      return r;
    },
    async call(name, fn) {
      const r = await inner.call(name, fn);
      done(`call:${name}`);
      return r;
    },
  };
}


export async function enumerateCrashes<W>(spec: CrashSpec<W>): Promise<CrashReport> {
  const violations: CrashViolation[] = [];
  const effects: string[] = [];
  const clean = await spec.open();
  try {
    await spec.scenario(instrument(spec.effects(clean), effects, undefined), clean);
    const bad = spec.invariant(clean, "recovered");
    if (bad !== undefined) violations.push({ k: effects.length, phase: "recovered", after: "(uninterrupted)", reason: bad });
  } finally {
    spec.close(clean);
  }

  for (let k = 0; k < effects.length; k++) {
    const after = k === 0 ? "(before the first effect)" : (effects[k - 1] ?? "?");
    const seen: string[] = [];
    let world = await spec.open();
    try {
      // k = 0 dies before any effect, which a scenario cannot observe; it is
      // the empty world, checked like any other prefix.
      if (k > 0) {
        let outcome: "crashed" | "finished" | { failed: unknown } = "finished";
        try {
          await spec.scenario(instrument(spec.effects(world), seen, k), world);
        } catch (e) {
          outcome = e === CRASH ? "crashed" : { failed: e };
        }
        if (outcome !== "crashed") {
          const reason = outcome === "finished" ? "the scenario caught the crash and finished anyway" : `the scenario failed instead of crashing: ${errorMessage(outcome.failed)}`;
          violations.push({ k, phase: "scenario", after, reason });
          continue;
        }
      }
      world = await spec.reopen(world);
      const crashed = spec.invariant(world, "crashed");
      if (crashed !== undefined) violations.push({ k, phase: "crashed", after, reason: crashed });
      try {
        await spec.recover(spec.effects(world), world);
      } catch (e) {
        violations.push({ k, phase: "recovered", after, reason: `recovery failed: ${errorMessage(e)}` });
        continue;
      }
      const recovered = spec.invariant(world, "recovered");
      if (recovered !== undefined) violations.push({ k, phase: "recovered", after, reason: recovered });
    } finally {
      spec.close(world);
    }
  }
  return { effects, prefixes: effects.length, violations };
}
