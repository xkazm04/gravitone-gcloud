// FRAMES' OUTPUTS — the plates this project's cut holds, as a PURE projection of
// the frames record (and its kept alternatives) that the read seam already handed
// over. The read is app/_library/projectOutputs.ts's: `readRecord` reaches React
// through the step store, and this module is held to the verdict modules' rule.
//
//   · a unit counts only when its plate is `ready`, whatever its grain: a trailer
//     shot unit is persisted with an empty plate until it is generated, and an
//     empty plate is neither an output nor a gap;
//   · a `refused` plate is a `missing` row with the code the verdict uses;
//   · the kept alternatives of a scene are `alternative` outputs, except the one
//     the cut already uses (a seeded copy of the active plate would count twice)
//     and the stress-mode clones, which are never persisted.

import type { Output } from "../../_library/projectOutputs";
import { isSynthetic, type AltsStepData } from "./alternatives/alts";
import type { PictureUnit } from "./picture/unit";
import type { FramesStepData } from "./useFrames";

const titleOf = (u: PictureUnit): string => {
  switch (u.kind) {
    case "shot":
      return `${u.title} · ${u.ordinal}/${u.ofBeat}`;
    case "beat":
      return u.title;
  }
};

export function framesOutputs(rec: FramesStepData, alts: AltsStepData | undefined): Output[] {
  const run = rec.renderId;
  const outputs: Output[] = [];
  const byId = new Map<string, PictureUnit>();
  for (const u of rec.units ?? []) {
    byId.set(u.id, u);
    if (u.plate.state === "refused") {
      outputs.push({
        id: `frames:${u.id}`,
        kind: "image",
        title: titleOf(u),
        state: "missing",
        code: "plate-refused",
        provenance: { step: "frames", run },
      });
    } else if (u.plate.state === "ready" && u.plate.src) {
      outputs.push({
        id: `frames:${u.id}`,
        kind: "image",
        title: titleOf(u),
        state: "in-cut",
        src: u.plate.src,
        provenance: { step: "frames", run, model: u.plate.model, costUsd: u.plate.costUsd },
      });
    }
  }

  for (const [frameId, scene] of Object.entries(alts?.byFrame ?? {})) {
    const unit = byId.get(frameId);
    if (!unit || isSynthetic(frameId)) continue;
    for (const alt of scene.alts) {
      if (alt.plate.state !== "ready" || !alt.plate.src) continue;
      if (alt.id === scene.activeId || alt.plate.src === unit.plate.src) continue;
      outputs.push({
        id: `frames:${unit.id}:${alt.id}`,
        kind: "image",
        title: titleOf(unit),
        state: scene.activeId === null ? "unresolved" : "alternative",
        src: alt.plate.src,
        provenance: { step: "frames", run, model: alt.plate.model, costUsd: alt.plate.costUsd },
      });
    }
  }
  return outputs;
}
