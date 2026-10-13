// THE PICTURE, READ BY A DOWNSTREAM STEP — the frames record's units, through
// its def, for Score and the Cut.
//
// Both used to read the record raw (`readStep<FramesStepData>`) and draw its
// `frames` shadow, which holds BEAT units only: a trailer's picture is shots,
// so its Score had nothing to spot and its Cut was `origin: "empty"`. Reading
// through `FRAMES_RECORD` also gives them the def's two other answers — a v1
// record migrated in memory, and a record this build cannot interpret REFUSED
// rather than cast — and this file is where a refusal becomes the read trouble
// both surfaces already draw. A refused record is not "no frames": drawing an
// empty picture over it would tell a creator with a cut on disk that they have
// no film.

import type { StorageTrouble } from "../../_shared/stepStore";
import { readRecord } from "../../_shared/records/registry";
import { FRAMES_RECORD } from "../records";
import type { PictureUnit } from "./unit";

/** `units: null` = the Frames step never saved a cut. */
export type UnitsRead = { ok: true; units: PictureUnit[] | null } | { ok: false; trouble: StorageTrouble };

export async function readUnits(projectId: string): Promise<UnitsRead> {
  const read = await readRecord(FRAMES_RECORD, projectId);
  if (read.ok) return { ok: true, units: read.data?.units ?? null };
  if ("trouble" in read) return read;
  return {
    ok: false,
    trouble: {
      kind: "failed",
      op: "read",
      projectId,
      phase: FRAMES_RECORD.key,
      message: `${read.refused} · ${read.detail}`,
      at: Date.now(),
    },
  };
}
