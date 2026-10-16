import { ok, type Result } from "@gt/domain/errors";
import type { ResourceLane } from "@gt/domain/lane";
import type { Producer } from "@gt/kernel/job-core";
import { definePartAct, FREE, refuse, unitOf, type ActPlan, type PartActPorts, type UnitPrice } from "../research/partAct.ts";

// THE SCRIPT PRODUCER (Phase 4 wave C, L37) - a script part's acts as kernel jobs:
//   compose-candidates  the explainer face's COMPOSE turn (v1 /api/script, which had no caller -
//                       the step only ever adopted three fixture renders), written against the
//                       PROJECT CLOCK; on the trailer face, the cut composed from the picked spine
//                       (pure, v1 lib/script/trailer/cut.ts `composeCut`: a free unit);
//   recalibrate         the EDIT-PLAN turn over the notes (v1 /api/recalibrate). Its four guards
//                       (app/_phases/script/recalibrate.ts) refuse BEFORE the plan, never after:
//                       the note guards here at the plan step, the plan guards at the landing;
//   generate-scenarios  the ads scenarios round (v1 /api/ads/scenarios).

export const SCRIPT_ACTS = ["compose-candidates", "recalibrate", "generate-scenarios"] as const;
export type ScriptAct = (typeof SCRIPT_ACTS)[number];

export type ScriptView = {
  readonly face: "document" | "trailer" | "ads";
  readonly scopeConfirmed: boolean;
  readonly spineComposed: boolean;
  readonly notes: number;
  /** A staged version waits for its accept or discard: a second recalibration would bury it. */
  readonly staged: boolean;
  readonly ideaPicked: boolean;
  /** The note guards' refusal (v1 recalibrateRefusal), when the notes cannot be sent. */
  readonly notesRefused?: string;
};

export const scriptDefaultAct = (v: ScriptView): ScriptAct => (v.face === "ads" ? "generate-scenarios" : "compose-candidates");

export function scriptPlan(v: ScriptView, act: string | null, price: UnitPrice): Result<ActPlan> {
  const a = act ?? scriptDefaultAct(v);
  switch (a) {
    case "compose-candidates":
      if (v.face === "ads") return refuse("an ads script part generates scenarios; it composes no candidates");
      if (v.face === "trailer") return v.spineComposed ? ok({ act: a, units: [unitOf("cut", FREE, { face: "trailer" })] }) : refuse("compose cut needs a composed spine");
      return v.scopeConfirmed ? ok({ act: a, units: [unitOf("compose", price, {})] }) : refuse("compose candidates needs a confirmed scope");
    case "recalibrate":
      if (v.face !== "document") return refuse("recalibrate edits an explainer's renders; this part has none");
      if (v.notes === 0) return refuse("recalibrate needs a note");
      if (v.staged) return refuse("recalibrate needs the staged version decided");
      if (v.notesRefused !== undefined) return refuse(v.notesRefused);
      return ok({ act: a, units: [unitOf("edit-plan", price, {})] });
    case "generate-scenarios":
      if (v.face !== "ads") return refuse("scenarios are the ads face's act");
      return v.ideaPicked ? ok({ act: a, units: [unitOf("scenarios", price, {})] }) : refuse("generate scenarios needs a picked idea");
    default:
      return refuse(`${a} is not an act of a script part`);
  }
}

export const defineScript = (lane: ResourceLane, ports: PartActPorts): Producer => definePartAct(lane, ports);
