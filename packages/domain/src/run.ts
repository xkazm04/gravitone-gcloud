import { z } from "zod";

import { estimateSchema } from "./estimate.ts";
import { partIdSchema, projectIdSchema, runIdSchema, styleIdSchema } from "./ids.ts";
import { mediaLaneSchema } from "./lane.ts";
import { defineMachine } from "./transitions.ts";

// A RUN: one launch from a Floor composer, or one Part of a Project launched
// as work (plan §2.2). The operator's unit — what the Foundry column lists and
// what a Weir pile points back to. The machine underneath it is the Job; a
// Run's state is what the Floor shows, in the design's words
// (docs/next/prototype/app/model.js: draft | running | awaiting_gate |
// ratified | blocked).

/** The producers of plan §4 (`@gt/producers`), one per v1 mill that launches work. */
export const PRODUCERS = ["forge", "extract", "dojo", "strips", "article", "suno", "mv", "still", "cut", "publish"] as const;
export const producerSchema = z.enum(PRODUCERS);
export type Producer = z.output<typeof producerSchema>;

/**
 * The prototype's five words plus two it implied but never drew:
 *   queued     — it carries `queuePos` (the composer's "queue #2"), so waiting
 *                for a lane is a state, not a running run at 0%.
 *   cancelled  — every v1 queue has it (lib/turns/ledger.ts, lib/sound/mv,
 *                lib/suno), and a draft the operator discards must end somewhere.
 * `blocked` is the prototype's word for "needs the operator": the job failed,
 * stopped for money, was interrupted by a crash, or the Weir rejected the pile.
 * The reason lives on the Job and the Decision, not in more Run states.
 * `awaiting_gate -> running` is a packet sent back for another turn (v1's
 * article `awaiting-approval -> drafting`, lib/articles/types.ts TRANSITIONS).
 */
export const runMachine = defineMachine({
  draft: ["queued", "cancelled"],
  queued: ["running", "cancelled"],
  running: ["awaiting_gate", "blocked"],
  awaiting_gate: ["ratified", "blocked", "running"],
  blocked: ["queued", "cancelled"],
  ratified: [],
  cancelled: [],
});
export const runStateSchema = z.enum(runMachine.states);
export type RunState = z.output<typeof runStateSchema>;

export const runSchema = z
  .object({
    id: runIdSchema,
    lane: mediaLaneSchema,
    producer: producerSchema,
    /** What the composer asked for, as the operator typed or the composer summarised it. */
    prompt: z.string().trim().min(1),
    /** The producer's named preset the composer launched with (a forge plan, a Suno prompt set). */
    recipe: z.string().trim().min(1).optional(),
    styleId: styleIdSchema.optional(),
    estimate: estimateSchema,
    /** 1-based place in its lane's queue; only a queued run has one. */
    queuePos: z.number().int().positive().optional(),
    state: runStateSchema,
    projectId: projectIdSchema.optional(),
    partId: partIdSchema.optional(),
  })
  .superRefine((r, ctx) => {
    if ((r.state === "queued") !== (r.queuePos !== undefined))
      ctx.addIssue({ code: "custom", path: ["queuePos"], message: "a run has a queue position exactly while it is queued" });
    if ((r.projectId === undefined) !== (r.partId === undefined))
      ctx.addIssue({ code: "custom", path: ["partId"], message: "a project run names both its project and its part, or neither" });
  });
export type Run = z.output<typeof runSchema>;
