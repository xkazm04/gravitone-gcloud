// SCORE'S OUTPUTS — the takes this project's cues use, as a PURE projection of
// the spotting record and the sound store's takes, both already read for it.
// The reads are app/_library/projectOutputs.ts's: `readRecord` reaches React
// through the step store, and this module is held to the verdict modules' rule.
//
//   · a cue's active take, when the store has it, is the `in-cut` output;
//   · the cue's other takes the store has are `alternative` outputs — or
//     `unresolved` when the cue has no active take to be an alternative to;
//   · a cue with no active take, or one the store does not hold, is a `missing`
//     row with the code the verdict uses (`take-missing`).

import type { Output } from "../../_library/projectOutputs";
import type { ScoreSpot } from "./spots";

/** The takes the sound store holds for this project, by id. */
export type TakeIndex = ReadonlyMap<string, { provider: string; src: string }>;

export function scoreOutputs(spots: readonly ScoreSpot[], takes: TakeIndex): Output[] {
  const outputs: Output[] = [];
  for (const s of spots) {
    const active = s.activeTakeId ? takes.get(s.activeTakeId) : undefined;
    if (s.activeTakeId && active)
      outputs.push({
        id: `score:${s.id}:${s.activeTakeId}`,
        kind: "audio",
        title: s.title,
        state: "in-cut",
        src: active.src,
        provenance: { step: "score", model: active.provider },
      });
    else
      outputs.push({
        id: `score:${s.id}`,
        kind: "audio",
        title: s.title,
        state: "missing",
        code: "take-missing",
        provenance: { step: "score" },
      });
    for (const id of new Set(s.takeIds ?? [])) {
      const t = takes.get(id);
      if (!t || id === s.activeTakeId) continue;
      outputs.push({
        id: `score:${s.id}:${id}`,
        kind: "audio",
        title: s.title,
        state: s.activeTakeId ? "alternative" : "unresolved",
        src: t.src,
        provenance: { step: "score", model: t.provider },
      });
    }
  }
  return outputs;
}
