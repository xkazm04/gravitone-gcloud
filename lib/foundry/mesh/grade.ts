// THE FINISHED MESH'S GATES, AS THE MANIFEST CARRIES THEM (spark game-3d-assets WP2). PoF's
// scorers are ported verbatim under ./gates/; this file only asks them the questions a finished
// variant owes and writes each answer as a ../types.ts GateResult:
//
//   mesh    scoreMesh over the delivered glb's metrics, at stage `finished`, against the class's
//           thresholds and the brief's budget (gateRequestFor - the one rule PoF grades by)
//   budget  gradeFaceBudget: the delivered triangles against the budget the brief asked for
//   scale   gradeWorldScale: the longest extent against the class's honest nominal size (a
//           character is the 1.8 m Mannequin; a weapon or a prop has none, so it reads unmeasured)
//   rig     scoreRig on the rigged glb, expecting a biped bound to ue5-mannequin's chains (the
//           expectation lynx-bench's gate.cjs graded rounds 2-4 by)
//
// UNMEASURED IS NOT A PASS (game-production: generated-mesh-acceptance). A gate whose input is
// missing - no metrics, no rigged file, a file the parser cannot read - reports `unmeasured` and
// says why as its one line, never `pass` and never silence. GateResult has no reason field, so the
// sentence rides in `warns`, prefixed `unmeasured:`.

import { readFile } from "node:fs/promises";

import { gradeFaceBudget } from "./gates/face-budget";
import { gateRequestFor } from "./gates/gate-request";
import { scoreMesh, type MeshMetrics } from "./gates/mesh-score";
import { parseGlbRig, scoreRig } from "./gates/rig-gate";
import { gradeWorldScale } from "./gates/world-scale";
import { BUDGET_GATE_VERSION, MESH_GATE_VERSION, RIG_GATE_VERSION, SCALE_GATE_VERSION } from "./gates/version";
import type { AssetClass, GateResult } from "./types";

/** An input a gate reads: the thing, or why it is not there (the sentence the gate then says). */
export type Measured<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly why: string };

const unmeasured = (name: GateResult["name"], version: string, why: string, gradedAs?: string): GateResult => ({
  name,
  version,
  verdict: "unmeasured",
  fails: [],
  warns: [`unmeasured: ${why}`],
  ...(gradedAs === undefined ? {} : { gradedAs }),
});

const METRIC_KEYS = ["verts", "faces", "watertight", "windingConsistent", "components", "euler", "bbox", "area", "degenerateFaces"] as const;

function metricsOf(m: MeshMetrics): Record<string, number | boolean | readonly number[]> {
  const out: Record<string, number | boolean | readonly number[]> = {};
  for (const k of METRIC_KEYS) out[k] = m[k];
  if (m.volume !== null) out["volume"] = m.volume;
  return out;
}

export type GateAsk = {
  readonly cls: AssetClass;
  /** The budget the brief asked for, in triangles (MeshBrief.budgetTris). */
  readonly budgetTris: number;
  /** The delivered glb's metrics (Blender's metrics.py live, ./metrics.ts dry). */
  readonly metrics: Measured<MeshMetrics>;
  /** Present only for a rigged brief: the rigged glb's bytes, or why there are none. */
  readonly rigged?: Measured<Uint8Array>;
};

/** Every gate a finished variant owes, in a fixed order: mesh, budget, scale, then rig when rigged. */
export function gradeFinished(ask: GateAsk): GateResult[] {
  const req = gateRequestFor({ assetClass: ask.cls, stage: "finished", sentBudget: { triangleBudget: ask.budgetTris, topology: "triangles" } });
  const out: GateResult[] = [];
  const m = ask.metrics;
  if (!m.ok) {
    out.push(unmeasured("mesh", MESH_GATE_VERSION, m.why, req.gradedAs));
  } else {
    const card = scoreMesh(m.value, req.deps.thresholds, req.deps.budget, req.deps.size, req.deps.orientation);
    out.push({
      name: "mesh",
      version: MESH_GATE_VERSION,
      score: card.score,
      verdict: card.verdict,
      fails: card.findings.filter((f) => f.severity === "fail").map((f) => f.reason),
      warns: card.findings.filter((f) => f.severity === "warn").map((f) => f.reason),
      metrics: metricsOf(m.value),
      gradedAs: req.gradedAs,
    });
  }

  const budget = gradeFaceBudget(m.ok ? m.value.faces : undefined, req.deps.budget);
  const budgetMetrics = {
    ...(budget.requestedTriangles === undefined ? {} : { requestedTriangles: budget.requestedTriangles }),
    ...(budget.measuredTriangles === undefined ? {} : { measuredTriangles: budget.measuredTriangles }),
    ...(budget.ratio === undefined ? {} : { ratio: budget.ratio }),
  };
  out.push(
    budget.verdict === "unmeasured"
      ? { ...unmeasured("budget", BUDGET_GATE_VERSION, budget.reason ?? "no triangle count"), metrics: budgetMetrics }
      : { name: "budget", version: BUDGET_GATE_VERSION, verdict: budget.verdict === "honored" ? "pass" : "warn", fails: [], warns: budget.reason === undefined ? [] : [budget.reason], metrics: budgetMetrics },
  );

  const scale = gradeWorldScale(m.ok ? m.value.bbox : undefined, req.deps.size);
  const scaleMetrics = {
    ...(scale.measuredExtentM === undefined ? {} : { measuredExtentM: scale.measuredExtentM }),
    ...(scale.targetExtentM === undefined ? {} : { targetExtentM: scale.targetExtentM }),
    ...(scale.importUniformScale === undefined ? {} : { importUniformScale: scale.importUniformScale }),
  };
  out.push(
    scale.verdict === "unmeasured"
      ? { ...unmeasured("scale", SCALE_GATE_VERSION, scale.reason ?? "no bounding box"), metrics: scaleMetrics }
      : { name: "scale", version: SCALE_GATE_VERSION, verdict: scale.verdict === "matches" ? "pass" : "warn", fails: [], warns: scale.reason === undefined ? [] : [scale.reason], metrics: scaleMetrics },
  );

  if (ask.rigged !== undefined) out.push(gradeRig(ask.rigged));
  return out;
}

const RIG_EXPECT = { morphology: "biped", target: "ue5-mannequin" } as const;
const RIG_GRADED_AS = "a biped bound to the ue5-mannequin chains (pelvis-head, clavicle-hand, thigh-foot per side)";

/** The rig gate over a rigged glb's bytes. Unreadable is unmeasured, with the parser's sentence. */
export function gradeRig(rigged: Measured<Uint8Array>): GateResult {
  if (!rigged.ok) return unmeasured("rig", RIG_GATE_VERSION, rigged.why, RIG_GRADED_AS);
  let facts;
  try {
    facts = parseGlbRig(Buffer.from(rigged.value.buffer, rigged.value.byteOffset, rigged.value.byteLength));
  } catch (e) {
    return unmeasured("rig", RIG_GATE_VERSION, `the rigged glb could not be read: ${e instanceof Error ? e.message : String(e)}`, RIG_GRADED_AS);
  }
  const v = scoreRig(facts, RIG_EXPECT);
  return {
    name: "rig",
    version: RIG_GATE_VERSION,
    score: v.score,
    verdict: v.failures.length > 0 ? "fail" : v.warnings.length > 0 ? "warn" : "pass",
    fails: v.failures,
    warns: v.warnings,
    metrics: {
      jointCount: facts.jointCount,
      referencedJoints: facts.referencedJoints,
      zeroWeightVertices: facts.zeroWeightVertices,
      maxInfluences: facts.maxInfluences,
      weightSumMin: facts.weightSumMin,
      weightSumMax: facts.weightSumMax,
    },
    gradedAs: RIG_GRADED_AS,
  };
}

/** A file's bytes, or why it cannot be read: the shape every gate input takes. */
export async function readMeasured(abs: string | undefined, what: string): Promise<Measured<Uint8Array>> {
  if (abs === undefined) return { ok: false, why: `no ${what} was produced` };
  try {
    return { ok: true, value: new Uint8Array(await readFile(abs)) };
  } catch (e) {
    return { ok: false, why: `the ${what} could not be read: ${e instanceof Error ? e.message : String(e)}` };
  }
}
