// WHICH RULES JUDGED A MESH. A GateResult's `version` (../types.ts) names the ported scorer and the
// PoF commit it came from, so a sidecar read in PoF can tell whether its own gate would agree.
// Bump these when a newer PoF commit is ported into ./.

/** PoF scoreMesh + gateRequestFor + gradeFaceBudget + gradeWorldScale (mesh-score.ts @ a85aaede, gate-request.ts @ 4f5a8f58). */
export const MESH_GATE_VERSION = "pof/mesh-score.ts@a85aaede";
export const BUDGET_GATE_VERSION = "pof/face-budget.ts@5b0e018c";
export const SCALE_GATE_VERSION = "pof/world-scale.ts@f87067fe";
/** PoF gateRig with skeleton-profiles, rig-binding, rig-presets and bone-conform, all @ 09e7a90d. */
export const RIG_GATE_VERSION = "pof/rig-gate.ts@09e7a90d";
/** This repo's own concept check (../inputGate.ts); PoF's input gate is a VLM call, not ported. */
export const INPUT_GATE_VERSION = "gravitone/inputGate.ts@2026-10-22b";
