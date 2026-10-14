import { z } from "zod";

import { estimateSchema } from "./estimate.ts";
import { partIdSchema } from "./ids.ts";
import { resourceLaneSchema } from "./lane.ts";
import { defineMachine } from "./transitions.ts";

// A PART: one line of a Project's plan — a model on a resource lane, with
// units, a priced estimate and the parts it waits for (plan §2.2). Each Part
// runs as one Job. v1's six studio steps (`@gt/catalog/projects` PHASES)
// become Parts of a `film/<template>` Project; the album and explainer
// recipes add the kinds those steps never had (prototype studio.js CATALOG).

/** Plan §2.2's kinds, plus the two the prototype's recipes use that §2.2's
 *  list elided: `article` (the explainer's first part, a whole lib/articles
 *  run) and `strips` (its HTML/SVG cards). */
export const PART_KINDS = [
  "research",
  "script",
  "frames",
  "motion",
  "voice",
  "score",
  "sfx",
  "cut",
  "still",
  "words",
  "render",
  "article",
  "strips",
  "draft",
  "critique",
  "publish",
] as const;
export const partKindSchema = z.enum(PART_KINDS);
export type PartKind = z.output<typeof partKindSchema>;

/**
 * The prototype's job words (projects.js STATUS_TO_STATE), which are the
 * design's: done -> ratified, planned -> draft, gate -> awaiting_gate.
 *
 * In the prototype a gate was a PART of its own (`gate:frames`). Here it is a
 * property of the part it judges (`gate: "verdict"`), so `awaiting_gate` is a
 * state of that part: its job finished and its pile is at the Weir. A reject
 * at the Weir is `failed` (the prototype's quiet-tariff frames: "gate: 0 of 18
 * plates kept · re-run needs a new route"); a packet sent back for another
 * turn re-queues it. `blocked` is "an upstream part failed or is paused"
 * (the prototype's `blockedBy`), cleared by that part moving again.
 */
export const partMachine = defineMachine({
  draft: ["queued"],
  queued: ["running", "paused", "blocked"],
  running: ["awaiting_gate", "ratified", "failed", "paused"],
  paused: ["queued", "running"],
  awaiting_gate: ["ratified", "failed", "queued"],
  failed: ["queued"],
  blocked: ["queued"],
  ratified: [],
});
export const partStateSchema = z.enum(partMachine.states);
export type PartState = z.output<typeof partStateSchema>;

export const partSchema = z
  .object({
    id: partIdSchema,
    kind: partKindSchema,
    /** The model as the Plan's picker names it ("Flux 2 dev fp8 · ComfyUI"). */
    model: z.string().trim().min(1),
    lane: resourceLaneSchema,
    units: z.number().int().positive(),
    estimate: estimateSchema,
    /** Parts this one waits for, by id, within the same Project. */
    after: z.array(partIdSchema),
    gate: z.literal("verdict").optional(),
    state: partStateSchema,
  })
  .superRefine((p, ctx) => {
    if (new Set(p.after).size !== p.after.length)
      ctx.addIssue({ code: "custom", path: ["after"], message: "a part names each dependency once" });
    if (p.after.includes(p.id)) ctx.addIssue({ code: "custom", path: ["after"], message: "a part cannot wait for itself" });
    if (p.state === "awaiting_gate" && p.gate === undefined)
      ctx.addIssue({ code: "custom", path: ["state"], message: "only a gated part waits at the Weir" });
  });
export type Part = z.output<typeof partSchema>;

/** Where a part goes when its job finishes: to the Weir if it is gated, else
 *  straight to ratified. One rule, so the driver and the Plan's preview agree. */
export function partDoneState(part: Pick<Part, "gate">): "awaiting_gate" | "ratified" {
  return part.gate === undefined ? "ratified" : "awaiting_gate";
}
