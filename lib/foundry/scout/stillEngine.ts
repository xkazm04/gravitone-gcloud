// THE ENGINE A SCOUT STILL IS DRAWN BY, AND THE LANE IT WAITS ON (spark scout-vision S6).
//
// One switch for every still the night draws from words - a style extract's replicas and transfers,
// a scene's replicas, a game asset's concepts: `SCOUT_REPLICA_GENERATOR`. Its default is Codex's image_gen
// on the operator's ChatGPT seat (operator, 2026-11-08: "Our main image engine for now will be codex with
// its image generation"). The Leonardo web studio at Low and Flare stay one word away. Each is prefer-only
// in the router (lib/imaging/router.ts): naming it is the whole chain, and a refusal is the candidate's
// sentence, never a quiet second vendor.
//
// THE LANE IS THE ENGINE'S. Codex is a CLI turn on a seat, so its job waits on seat.text (agy's lane,
// capacity 4) and is not admitted by any card profile: nothing of it runs on the GPU. The studio is a tab
// in the operator's Chrome on the render box, whose lane is box.chrome (capacity 1, shared with Suno and
// the idea artboards). Flare is a hosted call on cloud.leonardo.
//
// The act asks the lane, not the env, wherever the lane answers: a job's receipt was priced and its
// lane chosen by the process that launched it, and the worker that runs it may read a different env.
// seat.text is Codex, box.chrome is the studio, cloud.leonardo is Flare; gpu.local belongs to a scene
// whose local clip owns the card, whatever engine draws its stills - there the switch is read.

import { AppError } from "@gt/domain/errors";
import type { ResourceLane } from "@gt/domain/lane";

/** The engines a scout still may be drawn by; the first is the default. */
export const REPLICA_GENERATORS = ["codex", "leonardo-studio", "leonardo-flare"] as const;
export type ReplicaGenerator = (typeof REPLICA_GENERATORS)[number];
export const REPLICA_GENERATOR: ReplicaGenerator = REPLICA_GENERATORS[0];

/** `SCOUT_REPLICA_GENERATOR` when it names one of the three, else Codex; a leftover comfy-flux2 is refused, never re-routed. */
export const replicaGenerator = (env: Readonly<Record<string, string | undefined>> = process.env): ReplicaGenerator => {
  const v = env["SCOUT_REPLICA_GENERATOR"]?.trim();
  if (v === "comfy-flux2") throw new AppError("refused", "SCOUT_REPLICA_GENERATOR=comfy-flux2: Flux 2 was removed on 2026-11-08 (outdated output quality); unset it or name codex, leonardo-studio or leonardo-flare");
  return REPLICA_GENERATORS.find((g) => g === v) ?? REPLICA_GENERATOR;
};

const LANE_OF: Readonly<Record<ReplicaGenerator, ResourceLane>> = { codex: "seat.text", "leonardo-studio": "box.chrome", "leonardo-flare": "cloud.leonardo" };

/** The lane a job whose scarce half is its stills waits on. */
export const stillLane = (generator: ReplicaGenerator): ResourceLane => LANE_OF[generator];

/** The engine a still job on `lane` draws with: the lane's own where it names one, else the switch. */
export function generatorOnLane(lane: ResourceLane, env: Readonly<Record<string, string | undefined>> = process.env): ReplicaGenerator {
  if (lane === "seat.text") return "codex";
  if (lane === "box.chrome") return "leonardo-studio";
  if (lane === "cloud.leonardo") return "leonardo-flare";
  return replicaGenerator(env);
}
