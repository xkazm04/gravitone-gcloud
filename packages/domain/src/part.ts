import { z } from "zod";

import { estimateSchema } from "./estimate.ts";
import { partIdSchema } from "./ids.ts";
import { resourceLaneSchema } from "./lane.ts";
import { partMachine } from "./part.machine.ts";

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

/** The table and its union live in ./part.machine.ts, zod-free, so a client can hold them. */
export { partMachine, type PartState } from "./part.machine.ts";
export const partStateSchema = z.enum(partMachine.states);

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
