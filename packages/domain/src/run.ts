import { z } from "zod";

import { estimateSchema } from "./estimate.ts";
import { runIdSchema, styleIdSchema } from "./ids.ts";
import { mediaLaneSchema } from "./lane.ts";
import { runInputSchema } from "./produce.schema.ts";
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
  // A hunt's picked leaves rendered on ElevenLabs as one Run (Phase 6 L72; lib/sound/huntRender.ts).
  "hunt",
  "media-facts",
  "style",
  // The /scout night (spark media-training-loop): bringing a found picture or video onto this box,
  // and a found scene read into words, replicated and animated (lib/foundry/scout/).
  "scout-ingest",
  "scout-scene",
  // An engine's measured footprint (spark game-3d-assets): a command run under the machine probe,
  // its peaks over the baseline recorded as the engine's profile that admission charges.
  "profile",
  // A game asset made on this box (spark game-3d-assets): TRELLIS.2 through ComfyUI makes the mesh,
  // Blender finishes it to its class's budget, renders and (characters) rigs it (lib/foundry/mesh/).
  "mesh",
  "finish",
  // A /scout night's game asset (spark game-3d-assets WP4): its concepts drawn from the brief's words,
  // gated, and handed to the mesh store with the mesh job queued (lib/producers/scoutAsset.ts).
  "scout-asset",
  // A /scout night's idea artboards (spark scout-idea-artboards): each brief drawn as one rough still in
  // the operator's Leonardo studio, the generation deleted once held (lib/producers/scoutIdea.ts).
  "scout-ideas",
  // A /scout night's stats-reel ideas (spark stats-reels): each authored as a full 8 s strip in code on the
  // Claude seat, linted, and its frame 120 rendered as the idea's tile (lib/producers/scoutReel.ts).
  "scout-reels",
  // A /scout night's storyboards (spark scout-storyboards): a kept idea's frames drawn by Flux 2 on this
  // box's ComfyUI, one job per storyboard (lib/producers/scoutStoryboard.ts).
  "scout-storyboard",
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
  /**
   * What launched it, verbatim: a Floor composer's input, or a producer's own launch (its CLI,
   * its route) in that producer's terms (./produce.ts `ProducerRunInput`). For the latter,
   * `recipe` is the catalog recipe whose work part the producer makes (kernel records/runplan.ts).
   */
  input: runInputSchema,
  styleId: styleIdSchema.optional(),
  /** Its units in the recipe's noun (plates, prompts, cards). */
  units: z.number().int().positive(),
  /** The option key its job was launched on (`<kind>/<provider>/<model>`). */
  option: z.string().min(1),
  /** The figures the confirmed receipt showed. */
  estimate: estimateSchema,
  createdAt: z.iso.datetime(),
}).superRefine((r, ctx) => {
  // The input says who launched it; the record may not contradict it. A composer's lane IS the
  // run's media lane; a producer's own launch names the producer its job runs under.
  if ("producer" in r.input) {
    if (r.input.producer !== r.producer) ctx.addIssue({ code: "custom", path: ["producer"], message: `a run launched by ${r.input.producer} runs under ${r.input.producer}` });
  } else if (r.input.lane !== r.lane) ctx.addIssue({ code: "custom", path: ["lane"], message: `a ${r.input.lane} composer launches a run on the ${r.input.lane} lane` });
});
export type Run = z.output<typeof runSchema>;
