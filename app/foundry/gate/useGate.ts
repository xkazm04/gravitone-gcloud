// MOVED. The gate kernel lives in @gt/ui (packages/ui/src/board/gate.ts, its React binding
// beside it) since Phase 3, behaviour unchanged, so the Board's desks and this Foundry view
// drive one controller. This re-export keeps the Foundry's Cull working until L24 retires
// that view, and is deleted with it.
export { createGate, useGate, WRITE_WINDOW_MS, type Gate, type GateAdapter, type GateOptions, type GatePort, type GateSave, type GateSnapshot } from "@gt/ui/board/useGate";
