// THE ENGINE A SCOUT STILL IS DRAWN BY, AND THE LANE IT WAITS ON (spark scout-vision S6).
//
// One switch for every still the night draws from words - a style extract's replicas and transfers,
// a scene's replicas, a game asset's concepts: `SCOUT_REPLICA_GENERATOR`. Its default is the Leonardo
// WEB STUDIO at Low (operator, 2026-10-26: "Leonardo studio still has plenty of credits ... we should
// stick with it in future too"), after four style extracts died the night before on Flare's "Insufficient
// tokens" - the API pool, a different meter, empty until its renewal. Flare stays one word away
// (`leonardo-flare`), and so does Flux 2 on this box's ComfyUI (`comfy-flux2`, 2026-10-25). Each is
// prefer-only in the router (lib/imaging/router.ts): naming it is the whole chain, and a refusal is the
// candidate's sentence, never a quiet second vendor. There is no automatic Flare -> studio fallback: that
// would be a policy change to the router, rejected in the S6 decisions.
//
// THE LANE IS THE ENGINE'S. The studio is a tab in the operator's Chrome on the render box, whose lane
// is box.chrome (capacity 1, shared with Suno and the idea artboards). Flux 2 occupies the card, so
// its job waits on gpu.local and is admitted by the comfy engine's profile - before this file a scene
// on cloud.leonardo drew local Flux outside admission. Flare is a hosted call on cloud.leonardo.
//
// The act asks the lane, not the env, wherever the lane answers: a job's receipt was priced and its
// lane chosen by the process that launched it, and the worker that runs it may read a different env.
// box.chrome is the studio, cloud.leonardo is Flare; gpu.local holds Flux 2 or, for a scene whose
// local clip owns the card, any engine - there the switch is read.

import type { ResourceLane } from "@gt/domain/lane";

/** The engines a scout still may be drawn by; the first is the default. */
export const REPLICA_GENERATORS = ["leonardo-studio", "leonardo-flare", "comfy-flux2"] as const;
export type ReplicaGenerator = (typeof REPLICA_GENERATORS)[number];
export const REPLICA_GENERATOR: ReplicaGenerator = REPLICA_GENERATORS[0];

/** `SCOUT_REPLICA_GENERATOR` when it names one of the three, else the studio. */
export const replicaGenerator = (env: Readonly<Record<string, string | undefined>> = process.env): ReplicaGenerator => {
  const v = env["SCOUT_REPLICA_GENERATOR"]?.trim();
  return REPLICA_GENERATORS.find((g) => g === v) ?? REPLICA_GENERATOR;
};

const LANE_OF: Readonly<Record<ReplicaGenerator, ResourceLane>> = { "leonardo-studio": "box.chrome", "comfy-flux2": "gpu.local", "leonardo-flare": "cloud.leonardo" };

/** The lane a job whose scarce half is its stills waits on. */
export const stillLane = (generator: ReplicaGenerator): ResourceLane => LANE_OF[generator];

/** The engine a still job on `lane` draws with: the lane's own where it names one, else the switch. */
export function generatorOnLane(lane: ResourceLane, env: Readonly<Record<string, string | undefined>> = process.env): ReplicaGenerator {
  if (lane === "box.chrome") return "leonardo-studio";
  if (lane === "cloud.leonardo") return "leonardo-flare";
  return replicaGenerator(env);
}
