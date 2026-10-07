// FRAMES' OUTPUTS — the plates this project's cut holds, read through the typed
// record seam and never from a mounted surface.
//
//   · a unit counts only when its plate is `ready`, whatever its grain: a trailer
//     shot unit is persisted with an empty plate until it is generated, and an
//     empty plate is neither an output nor a gap;
//   · a `refused` plate is a `missing` row with the code the verdict uses;
//   · the kept alternatives of a scene are `alternative` outputs, except the one
//     the cut already uses (a seeded copy of the active plate would count twice)
//     and the stress-mode clones, which are never persisted.

import { readRecord } from "../_shared/records/registry";
import type { Output, SourceRead } from "../../_library/projectOutputs";
import { isSynthetic } from "./alternatives/alts";
import { FRAMES_ALTS, FRAMES_RECORD } from "./records";
import type { PictureUnit } from "./picture/unit";

const titleOf = (u: PictureUnit): string => {
  switch (u.kind) {
    case "shot":
      return `${u.title} · ${u.ordinal}/${u.ofBeat}`;
    case "beat":
      return u.title;
  }
};

export async function collectFramesOutputs(projectId: string): Promise<SourceRead> {
  const read = await readRecord(FRAMES_RECORD, projectId);
  if (!read.ok) {
    if ("refused" in read) return { state: "refused", refused: read.refused, reason: read.detail };
    return { state: "unavailable", reason: read.trouble.message };
  }
  const rec = read.data;
  if (!rec) return { state: "empty" };

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

  let note: string | undefined;
  const alts = await readRecord(FRAMES_ALTS, projectId);
  if (!alts.ok) note = `alternatives: ${"refused" in alts ? alts.detail : alts.trouble.message}`;
  else
    for (const [frameId, scene] of Object.entries(alts.data?.byFrame ?? {})) {
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

  return outputs.length === 0 && !note ? { state: "empty" } : { state: "loaded", outputs, note };
}
