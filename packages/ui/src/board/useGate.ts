"use client";

// THE GATE'S REACT BINDING - the controller (./gate.ts) is plain TypeScript, so its
// behaviour is held in node (tests/golden-path/foundry-gate-kernel.probe.spec.ts and
// packages/ui/test/gate.test.ts); this file only subscribes a component to it and wires the
// `pagehide` flush for the life of the mount. Moved from v1 app/foundry/gate/useGate.ts,
// which now re-exports it until the Foundry's Cull view retires (Phase 3, L24).

import { useEffect, useState, useSyncExternalStore } from "react";

import { createGate, type Gate, type GateOptions, type GatePort, type GateSnapshot } from "./gate.ts";

export { createGate, WRITE_WINDOW_MS, type Gate, type GateAdapter, type GateOptions, type GatePort, type GateSave, type GateSnapshot } from "./gate.ts";

/** `port` must be a stable reference (a module constant, or memoised). */
export function useGate<TDetail, TVerdict, TPlan = never, TResult = never>(
  port: GatePort<TDetail, TVerdict, TPlan, TResult>,
  options?: GateOptions,
): { readonly gate: Gate<TDetail, TVerdict, TPlan, TResult> } & GateSnapshot<TDetail, TVerdict, TPlan> {
  const [gate] = useState(() => createGate(port, options));
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
