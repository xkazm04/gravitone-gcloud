import { z } from "zod";

import { estimateSchema } from "./estimate.ts";
import { partIdSchema, projectIdSchema, runIdSchema, styleIdSchema } from "./ids.ts";
import { mediaLaneSchema } from "./lane.ts";
import { runMachine } from "./run.machine.ts";

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

/** The table and its union live in ./run.machine.ts, zod-free, so a client can hold them. */
export { runMachine, type RunState } from "./run.machine.ts";
export const runStateSchema = z.enum(runMachine.states);

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
