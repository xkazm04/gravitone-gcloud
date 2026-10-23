import { existsSync } from "node:fs";

import type { Producer } from "@gt/kernel/job-core";
import { defineMeshStage, FINISH, type UnitIo } from "@gt/producers/mesh/define";

import { finishVariant, liveFinishEngines, type FinishEngines } from "../foundry/mesh/finish.ts";
import { stagePorts, type StageDeps } from "./mesh.ts";

// THE FINISH PRODUCER, BOUND TO THIS BOX (spark game-3d-assets WP2): the definition's finish stage
// (packages/producers/src/mesh/define.ts) over the Blender chain (lib/foundry/mesh/finish.ts) - lane
// box.blender, admitted by the `blender` engine's profile. Launched by the mesh job's settle, or by
// the CLI's `finish <asset> [--variant v]` retry (./mesh.ts `launchStage`). A live job's health is
// the Blender binary being there; it is never started to ask.

/** The bound finish producer; a test hands it a fake Blender command and its own store. */
export function finishProducer(o: StageDeps & { readonly engines?: () => FinishEngines } = {}): Producer {
  const engines = o.engines ?? (() => liveFinishEngines());
  const unit = (assetId: string, variantId: string, io: UnitIo) => finishVariant(assetId, variantId, io, engines());
  const health = async () => {
    const bin = engines().command[0];
    return bin !== undefined && existsSync(bin) ? ({ ok: true } as const) : ({ ok: false, reason: `Blender is not at ${bin ?? "(no command)"}; set BLENDER` } as const);
  };
  return defineMeshStage(FINISH, stagePorts(FINISH, unit, health, o));
}
