import { WORK_KINDS } from "@gt/catalog/recipes";
import type { Result } from "@gt/domain/errors";
import type { Job } from "@gt/domain/job";
import type { ResourceLane } from "@gt/domain/lane";
import type { ProducerName } from "@gt/domain/run";
import type { Producer } from "@gt/kernel/job-core";
import type { Reader } from "@gt/kernel/store";
import type { ProducerKey } from "@gt/kernel/job-queue-core";
import { launchOf, modelOptions } from "@gt/kernel/records/options";
import { PROFILE_LANES } from "@gt/producers/profile/define";
import { producerSet, type Bound } from "@gt/producers/set";

import { articleProducer } from "./article.ts";
import { dojoProducer } from "./dojo.ts";
import { extractProducer } from "./extract.ts";
import { researchProducer, type DriveHooks, type StepFactory } from "./research.ts";
import { scriptProducer } from "./script.ts";
import { framesProducer } from "./frames.ts";
import { motionProducer } from "./motion.ts";
import { scoreProducer } from "./score.ts";
import { cutProducer } from "./cut.ts";
import { stillProducer } from "./still.ts";
import { wordsProducer } from "./words.ts";
import { voiceProducer } from "./voice.ts";
import { mvProducer } from "./mv.ts";
import { stripsProducer } from "./strips.ts";
import { sunoProducer } from "./suno.ts";
import { mediaFactsBound } from "./media-facts.ts";
import { styleJobProducer } from "./style.ts";
import { scoutIngestProducer } from "./scoutIngest.ts";
import { SCOUT_SCENE_LANES, scoutSceneProducer } from "./scoutScene.ts";
import { profileProducer } from "./profile.ts";
import { meshProducer } from "./mesh.ts";
import { finishProducer } from "./finish.ts";
import { scoutAssetProducer } from "./scoutAsset.ts";
import { scoutIdeasProducer } from "./scoutIdea.ts";
import { sunoDriver } from "../sound/suno/drivers.ts";
import { sfxProducer } from "../sound/sfxJob.ts";
import { huntProducer } from "../sound/huntRender.ts";

// THE PRODUCERS THIS CHECKOUT CAN RUN (Phase 4, plan §4). One list, read by every
// process that drives a job - the worker (workers/runner.mts), a producer's CLI, a
// route - so "which producers exist" has one answer and the worker can never be
// missing a producer the CLI runs. Each producer lot binds its definition's ports
// to v1's engines in `lib/producers/<name>.ts` and adds ONE line here:
//
//   { name: "extract", producer: extractProducer() },
//
// The list is plain data on purpose: `producerSet` (packages/producers/src/set.ts)
// is where a name the domain does not know, or a name bound twice on one lane, is
// refused - at start, before a job is claimed, never by the job that would have hit
// it. A head job naming a producer that is absent here is reported by `workLoop`
// (`unknown`) and left queued: a missing binding parks work, it does not fail it.
//
// A STEP IS BOUND ON EVERY LANE ITS PART OPTIONS REACH (L41). A part's option decides
// its job's lane (research on the text seat or on Gemini, frames on the card, on Nano
// Banana or on Leonardo), and the worker carries a producer per `<name>@<lane>`
// (job-queue-core `producerKey`). The lanes are READ from the catalog joined with the
// router table (records/options.ts - the same join a launch takes its lane from), so an
// option added to @gt/catalog is a lane the worker carries with no second list to keep.
// Before this a step was bound on its default lane only: a part whose option chose
// another waited forever behind a head the route path (`driveStep`, which builds the
// producer for the job's own lane) could drive and the worker could not.
//
// A STEP'S ENDING OPENS ITS READY GATE, WHOEVER DROVE IT (L41). The part route kicks
// `openReadyGates` after its own drives (app/(studio)/projects/[id]/_part/real.ts); a
// part job the worker drove reached the same READY with no packet opened, so the gate
// waited for the next editor write to notice. The hook below is the step producers'
// `settle` (kernel job-settle.ts runs it after every drive that ends a job), so the
// worker, a CLI and the route open the same gate the same way. It loads lib/parts/gates
// lazily: that module is `server-only` (the worker resolves it through
// pipeline/lib-hooks.mts), and a CLI that imports this registry for a producer with no
// part never loads it. A gate that cannot open is the settle's failure - recorded as
// `job.settle-failed` on the job, never a change to the job's ending.

/** After a part job ends: open the packet of every gate its project now has READY. */
export async function openGatesAfter(job: Job): Promise<void> {
  const projectId = job.correlation?.projectId;
  if (job.of.kind !== "part" || projectId === undefined) return;
  const { LIVE_GATES, openReadyGates } = await import("../parts/gates.ts");
  const r = await openReadyGates(LIVE_GATES, projectId, { by: "agent", surface: "parts", who: "part-gates" });
  if (!r.ok) throw r.error;
}

const STEP_HOOKS: DriveHooks = { onSettled: openGatesAfter };

/** The studio steps, each a factory over its lane (lib/producers/research.ts `StepFactory`). */
const STEPS: readonly (readonly [ProducerName, StepFactory])[] = [
  ["research", researchProducer],
  ["script", scriptProducer],
  ["frames", framesProducer],
  ["motion", motionProducer],
  ["score", scoreProducer],
  ["cut", cutProducer],
  ["still", stillProducer],
  ["words", wordsProducer],
  ["voice", voiceProducer],
];

/** Every lane some part option runs `name` on, in catalog order (the lane is the router's, not the day's). */
export function lanesOf(name: ProducerName, day: string = new Date().toISOString().slice(0, 10)): ResourceLane[] {
  const lanes: ResourceLane[] = [];
  for (const kind of WORK_KINDS) {
    for (const o of modelOptions(kind, day)) if (launchOf(kind, o.key, day)?.producer === name && !lanes.includes(o.lane)) lanes.push(o.lane);
  }
  return lanes;
}

const stepsBound = (): Bound[] => STEPS.flatMap(([name, factory]) => lanesOf(name).map((lane): Bound => ({ name, producer: factory(lane, STEP_HOOKS) })));

export const BOUND: readonly Bound[] = [
  { name: "extract", producer: extractProducer() },
  { name: "article", producer: articleProducer() },
  { name: "mv", producer: mvProducer() },
  { name: "suno", producer: sunoProducer({ driver: sunoDriver() }) },
  { name: "strips", producer: stripsProducer() },
  // Dojo's GOOGLE stack (cloud.google, metered in Node). Its local stacks are gpu.local and Python's
  // (pipeline/foundry/worker.py): this Node worker names such a head an orphan and leaves it queued.
  { name: "dojo", producer: dojoProducer() },
  { name: "media-facts", producer: mediaFactsBound() },
  { name: "style", producer: styleJobProducer() },
  // The /scout night's ingest (spark media-training-loop): a found picture, page or video brought onto this box.
  { name: "scout-ingest", producer: scoutIngestProducer() },
  // A /scout scene: one job per candidate, on the lane of its expensive half (a local clip: gpu.local; else Leonardo's, for the Flare stills and a hosted clip).
  ...SCOUT_SCENE_LANES.map((lane): Bound => ({ name: "scout-scene", producer: scoutSceneProducer(lane) })),
  // The desk's effect batch (Phase 6, L66): one run of N clips through the metered call.
  ...lanesOf("sfx").map((lane): Bound => ({ name: "sfx", producer: sfxProducer(lane) })),
  // A hunt's picked leaves (Phase 6, L72): one Run, a step per leaf, on ElevenLabs only - the leaf's
  // engine is the map's, never a router's choice, so it is bound on that one lane.
  { name: "hunt", producer: huntProducer() },
  // An engine's measured footprint (spark game-3d-assets WP1): on each lane an engine's work occupies.
  ...PROFILE_LANES.map((lane): Bound => ({ name: "profile", producer: profileProducer(lane) })),
  // A game asset's mesh (spark game-3d-assets WP2): TRELLIS.2 through ComfyUI on gpu.local (engine comfy),
  // then the Blender finish on box.blender (engine blender) - two jobs, each admitted by its own engine.
  { name: "mesh", producer: meshProducer() },
  { name: "finish", producer: finishProducer() },
  // A /scout night's game asset (spark game-3d-assets WP4): its concepts on Leonardo's Flare, then the
  // hand-off that writes the mesh asset and queues the mesh job above.
  { name: "scout-asset", producer: scoutAssetProducer() },
  // A /scout night's idea artboards (spark scout-idea-artboards): one batch, one rough still per idea in the
  // operator's Leonardo studio, on box.chrome - the lane the studio's browser is.
  { name: "scout-ideas", producer: scoutIdeasProducer() },
  ...stepsBound(),
];

/** The map a worker hands kernel `workLoop`, keyed by the job's `<producer>@<lane>`. */
export function producers(): Result<ReadonlyMap<ProducerKey, Producer>> {
  return producerSet(BOUND);
}

/**
 * Every bound producer's preflight, by the job it would run (kernel ReadContext / RunOptions
 * `preflightOf`, L45): what a launch or a release outside the worker hands the kernel so a part
 * whose act waits on a human act is held `planned`, named, instead of released into a failure.
 */
export function preflightOf(job: Job, r: Reader): string | undefined {
  return BOUND.find((b) => b.name === job.producer && b.producer.lane === job.lane)?.producer.preflight?.(job, r);
}
