// SCORE'S OUTPUTS — the takes this project's cues use, read from the spotting
// record and the sound store, never from a mounted surface.
//
//   · a cue's active take, when the store has it, is the `in-cut` output;
//   · the cue's other takes the store has are `alternative` outputs — or
//     `unresolved` when the cue has no active take to be an alternative to;
//   · a cue with no active take, or one the store does not hold, is a `missing`
//     row with the code the verdict uses (`take-missing`).
//
// The sound store is another server: if it cannot be reached the whole source is
// `unavailable` with the engine's own words, because half a score is a claim the
// record cannot back.

import { readRecord } from "../_shared/records/registry";
import { listTakes, takeFileUrl } from "@/lib/sound/client";
import type { Output, SourceRead } from "../../_library/projectOutputs";
import { SCORE } from "./records";

export async function collectScoreOutputs(projectId: string): Promise<SourceRead> {
  const read = await readRecord(SCORE, projectId);
  if (!read.ok) {
    if ("refused" in read) return { state: "refused", refused: read.refused, reason: read.detail };
    return { state: "unavailable", reason: read.trouble.message };
  }
  const spots = read.data?.spots ?? [];
  if (spots.length === 0) return { state: "empty" };

  // Nothing to look up when no cue has ever had a take: the store is not asked.
  const wanted = spots.some((s) => s.activeTakeId || (s.takeIds ?? []).length > 0);
  const takes = new Map<string, { title: string; provider: string }>();
  if (wanted) {
    const res = await listTakes({ projectId });
    if (!res.ok) return { state: "unavailable", reason: res.error };
    for (const t of res.data.takes) takes.set(t.id, { title: t.title, provider: t.provider });
  }

  const outputs: Output[] = [];
  for (const s of spots) {
    const active = s.activeTakeId ? takes.get(s.activeTakeId) : undefined;
    if (s.activeTakeId && active)
      outputs.push({
        id: `score:${s.id}:${s.activeTakeId}`,
        kind: "audio",
        title: s.title,
        state: "in-cut",
        src: takeFileUrl(s.activeTakeId),
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
        src: takeFileUrl(id),
        provenance: { step: "score", model: t.provider },
      });
    }
  }
  return { state: "loaded", outputs };
}
