// THE SEEDED DEFAULT for a key with no stored record. Read by both the read path and
// the patch path, so it lives in its own file. Split out of the stepStore.ts door.

import { seededResearchTopic } from "@/app/_studio/projectSeed";

import type { ResearchStepData } from "./stepDataResearch";

/** A seeded project ships with the research its own seed row claims.
 *
 *  THE MATCH USED TO BE `/bitcoin/i` (fixed 2026-09-09). The reasoning was
 *  sound for the project it named — the shipped notebook is the real 2026-08-11
 *  Bitcoin run, so that project's honest starting state is "already has a
 *  notebook" rather than an empty field — but the test was the project's NAME,
 *  and three other seed rows declare `progress.research: "done"` without having
 *  it in theirs. Those three printed "locked" on the shelf and then opened Step
 *  1 on an empty topic field with the guided wizard parked at stage 1 and every
 *  later stage unreachable. The shelf and the step contradicted each other about
 *  the same project, and the step was the one telling the truth.
 *
 *  It asks the seed itself now (`seededResearchTopic`), so the two cannot
 *  disagree again: a row that claims done gets a record, a row that does not,
 *  does not. A project the USER made still starts empty, which is honest —
 *  nothing has been researched for it. */
export function seededFor(projectId: string, phase: string): ResearchStepData | undefined {
  if (phase !== "research") return undefined;
  const topic = seededResearchTopic(projectId);
  return topic ? { topic, researched: true } : undefined;
}
