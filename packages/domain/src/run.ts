import { z } from "zod";

import { estimateSchema } from "./estimate.ts";
import { runIdSchema, styleIdSchema } from "./ids.ts";
import { mediaLaneSchema } from "./lane.ts";
import { composerInputSchema } from "./produce.schema.ts";
import { runMachine } from "./run.machine.ts";

// A RUN: one launch from a Floor composer (plan §2.2, COMMON decision 2). The operator's unit -
// what the Foundry column lists and what a Weir pile points back to. The machine underneath it is
// its one Job (`job:run:<id>`); a Run's state is what the Floor shows, in the design's words
// (docs/next/prototype/app/model.js: draft | running | awaiting_gate | ratified | blocked), and
// like a Part's it is DERIVED from the job at read (packages/kernel/src/records/state.ts), never
// written - so the stored record carries no state and no queue position (a position is computed,
// COMMON decision 5). A Project's Part is NOT a Run: it is a part row with its own job.

/**
 * The producers of plan §4 (`@gt/producers`): one per v1 mill that launches work, plus the six
 * studio steps and the album parts (COMMON: "the six studio steps" are producers). Named
 * `ProducerName`, not `Producer`: kernel/job-core.ts's `Producer` is the definition a worker runs,
 * and two exported `Producer`s one import apart is a swap waiting to happen.
 */
export const PRODUCERS = [
  "forge",
  "extract",
  "dojo",
  "strips",
  "article",
  "suno",
  "mv",
  "still",
  "cut",
  "research",
  "script",
  "frames",
  "motion",
  "score",
  "voice",
  "words",
  "sfx",
] as const;
export const producerNameSchema = z.enum(PRODUCERS);
export type ProducerName = z.output<typeof producerNameSchema>;

/** The table and its union live in ./run.machine.ts, zod-free, so a client can hold them. */
export { runMachine, type RunState } from "./run.machine.ts";
export const runStateSchema = z.enum(runMachine.states);

export const runSchema = z.object({
  id: runIdSchema,
  lane: mediaLaneSchema,
  producer: producerNameSchema,
  /** The @gt/catalog recipe the composer launched (`style/forge-sweep`, `track/music`...). */
  recipe: z.string().min(1),
  /** What the composer sent, verbatim. */
  input: composerInputSchema,
  styleId: styleIdSchema.optional(),
  /** Its units in the recipe's noun (plates, prompts, cards). */
  units: z.number().int().positive(),
  /** The option key its job was launched on (`<kind>/<provider>/<model>`). */
  option: z.string().min(1),
  /** The figures the confirmed receipt showed. */
  estimate: estimateSchema,
  createdAt: z.iso.datetime(),
});
export type Run = z.output<typeof runSchema>;
