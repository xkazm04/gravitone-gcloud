import { ok, type Result } from "@gt/domain/errors";
import type { ResourceLane } from "@gt/domain/lane";
import type { Producer } from "@gt/kernel/job-core";
import { definePartAct, FREE, refuse, unitOf, type ActPlan, type PartActPorts, type UnitPrice } from "./partAct.ts";

// THE RESEARCH PRODUCER (Phase 4 wave C, L37) - a research part's acts as kernel jobs:
//   run-research   the notebook turn (v1 /api/research, lib/turns/kinds/research.ts: the
//                  retrieval rung first when it is open, then reasoning), ONE paid unit;
//                  on the beats face it deals the beat board, which no engine writes yet (free);
//   follow-up      one REAL turn per queued question (v1 had a 700 ms canned answer,
//                  app/_phases/research/followup.ts `resultFor`), each its own unit, so a crash
//                  after the second of five re-asks only the three left;
//   generate-ideas the ads ideas round (v1 /api/ads/ideas, lib/ads/concepts.ts).
// What each unit asks and how its answer lands is lib/producers/research.ts; this file is the act
// table and the refusals the work states before anything is bought.

export const RESEARCH_ACTS = ["run-research", "follow-up", "generate-ideas"] as const;
export type ResearchAct = (typeof RESEARCH_ACTS)[number];

/** The research part as its acts read it. */
export type ResearchView = {
  readonly face: "notebook" | "beats" | "ads";
  readonly topic: string;
  readonly hasNotebook: boolean;
  /** Follow-ups waiting for a turn, in queue order. */
  readonly queued: readonly { readonly id: string; readonly prompt: string; readonly cardId?: string }[];
  /** The brief's required fields still empty (ads). */
  readonly briefMissing: readonly string[];
};

/** What the part's own plan job does: the face's first act. */
export const researchDefaultAct = (v: ResearchView): ResearchAct => (v.face === "ads" ? "generate-ideas" : "run-research");

export function researchPlan(v: ResearchView, act: string | null, price: UnitPrice): Result<ActPlan> {
  const a = act ?? researchDefaultAct(v);
  switch (a) {
    case "run-research":
      if (v.face === "ads") return refuse("an ads research part generates ideas; it runs no notebook");
      if (v.face === "beats") return ok({ act: a, units: [unitOf("deal", FREE, { face: "beats" })] });
      if (v.topic.trim() === "") return refuse("run research needs topic");
      return ok({ act: a, units: [unitOf("notebook", price, { topic: v.topic })] });
    case "follow-up":
      if (v.face !== "notebook") return refuse("follow-ups revise a notebook; this part has none");
      if (!v.hasNotebook) return refuse("a follow-up needs a notebook");
      if (v.queued.length === 0) return refuse("no follow-up is queued");
      return ok({ act: a, units: v.queued.map((q) => unitOf(`fu:${q.id}`, price, { id: q.id, prompt: q.prompt, ...(q.cardId === undefined ? {} : { cardId: q.cardId }) })) });
    case "generate-ideas":
      if (v.face !== "ads") return refuse("ideas are the ads face's act");
      if (v.briefMissing.length > 0) return refuse(`brief needs ${v.briefMissing.join(" · ")}`);
      return ok({ act: a, units: [unitOf("ideas", price, {})] });
    default:
      return refuse(`${a} is not an act of a research part`);
  }
}

export const defineResearch = (lane: ResourceLane, ports: PartActPorts): Producer => definePartAct(lane, ports);
