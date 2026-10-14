// TRAILER NOTES — a note is a creator-owned intention against one place in the
// cut ("fix this connector"), as opposed to a finding, which is the checker's
// reading. `notesFromFindings` is the bridge: the critique carries its fix, but
// only as a SUGGESTION the creator takes or dismisses. Nothing here applies
// anything and nothing here gates anything — `./structure.ts` is "never the
// gate", and a suggested note inherits that.
//
// Pure functions, no React, so `pipeline/trailer-structure-regression.mts` can
// run them under bare `tsx`.

import type { TrailerCut } from "@/lib/script/trailer/types";
import type { StructureReport } from "@/lib/script/trailer/report";
import type { StructureRule } from "@/lib/script/trailer/structureTypes";

export type TrailerNoteKind =
  | "fix-connector"
  | "collapse-raises"
  | "name-payer"
  | "hold-asset"
  | "custom";

export interface TrailerNote {
  id: string;
  /** Where the note points. A note about the cut as a whole, or about a budget
   *  asset, carries neither. */
  beatId?: string;
  movementId?: string;
  kind: TrailerNoteKind;
  text?: string;
  /** The rule whose finding proposed this note. Absent on a note the creator
   *  wrote by hand. */
  fromFinding?: StructureRule;
}

/** Which note kind a violation proposes. Anything the rule has no named repair
 *  for becomes `custom`, carrying the finding's own sentence, rather than being
 *  forced into a kind that would tell the model to do the wrong thing. */
function kindFor(rule: StructureRule, raisesMany: boolean): TrailerNoteKind {
  switch (rule) {
    case "connector":
      return "fix-connector";
    case "escalation":
      return raisesMany ? "collapse-raises" : "custom";
    case "promise":
      return "name-payer";
    case "withholding":
      return "hold-asset";
    default:
      return "custom";
  }
}

/** One suggested note per `violation`. `unmeasured`, `not-engaged` and `pass`
 *  rows propose nothing: an unmeasured row is not a defect, and suggesting a
 *  fix for it would turn "could not check" into "wrong".
 *
 *  Ids are derived from rule and subject, so recomputing over the same report
 *  yields the same ids and a dismissed suggestion stays dismissed. `cut` is
 *  optional and only sharpens `escalation`: a rung that raises several
 *  variables is `collapse-raises`; the other escalation violations are not. */
export function notesFromFindings(report: StructureReport, cut?: TrailerCut): TrailerNote[] {
  const beats = new Map((cut?.beats ?? []).map((b) => [b.id, b]));
  return report.findings
    .filter((f) => f.verdict === "violation")
    .map((f): TrailerNote => {
      const raisesMany = !!f.beatId && (beats.get(f.beatId)?.raises?.length ?? 0) > 1;
      const note: TrailerNote = {
        id: `suggest-${f.rule}-${f.subject}`,
        kind: kindFor(f.rule, raisesMany),
        text: f.detail,
        fromFinding: f.rule,
      };
      if (f.beatId) note.beatId = f.beatId;
      return note;
    });
}
