// THE SCRIPT STEP'S RECORDS — declared by their owner, as their READERS see
// them. The writers (useAdoption, useVersions, useTrailerCut) still save through
// `saveStep`; moving them onto these defs is a later stage of phase-shared-A.
// Today the reader is the step verdict (./verdict.ts).

import { defineRecord, isPlainObject, malformed } from "../_shared/records/registry";
import type { ScriptAdoptionStepData, TrailerCutStepData } from "../_shared/stepStore";

import { ADOPTION_PHASE } from "./candidates/adoption";
import type { Note, Version } from "./versions";

/** Which candidate render this project adopted. `""` is "cleared here" and is
 *  kept distinct from no record at all (see useAdoption's `everWritten`). */
export const SCRIPT_ADOPTED = defineRecord<ScriptAdoptionStepData>({
  key: ADOPTION_PHASE,
  owner: "script",
  version: 1,
  parse: (raw) => {
    if (raw.renderId !== undefined && typeof raw.renderId !== "string") return malformed("script-adopted.renderId is not text");
    return { ...raw, renderId: (raw.renderId as string | undefined) ?? "" } as ScriptAdoptionStepData;
  },
});

/** The explainer half's version ledger, as useVersions stores it. */
export interface ScriptVersionsData {
  notes: Note[];
  /** Accepted versions, oldest first. The baseline itself is never stored. */
  accepted: Version[];
  savedAt?: number;
}

export const SCRIPT_VERSIONS = defineRecord<ScriptVersionsData>({
  key: "script-versions",
  owner: "script",
  version: 1,
  parse: (raw) => {
    const accepted = raw.accepted ?? [];
    const notes = raw.notes ?? [];
    if (!Array.isArray(accepted)) return malformed("script-versions.accepted is not a list");
    if (!Array.isArray(notes)) return malformed("script-versions.notes is not a list");
    return { ...raw, accepted, notes } as ScriptVersionsData;
  },
});

/** The trailer half: the composed cut, its budget, and the spine it was
 *  composed from. A record without a cut is not one useTrailerCut wrote — it
 *  never saves a null cut. */
export const SCRIPT_TRAILER = defineRecord<TrailerCutStepData>({
  key: "script-trailer",
  owner: "script",
  version: 1,
  parse: (raw) => {
    if (!isPlainObject(raw.cut)) return malformed("script-trailer.cut is not a cut");
    if (raw.spine !== undefined && !isPlainObject(raw.spine)) return malformed("script-trailer.spine is not a spine");
    return raw as unknown as TrailerCutStepData;
  },
});
