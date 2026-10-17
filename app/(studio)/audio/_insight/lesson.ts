// THE LESSON DOOR A STRENGTHS CELL HANDS ITS DRAFT TO - L65's (lib/sound/lessons.ts
// `confirmLesson`, the Server Action app/(studio)/audio/_lessons/acts.ts `confirmLessonAct`), as a
// TYPE this lot builds against. The cell proposes; the operator writes or accepts the claim; the
// door is the only write and saves nothing without that confirm (a draft is never stored).
//
// The page hands the door in as a prop (../page.tsx: `confirmLessonAct`), so this section imports
// nothing of the Lessons section's. The shape is L65's documented call shape -
// `{ ...proposal, claim, opId }` with source "triage" and no hunt - spelled with mutable arrays
// so the real action's zod input type accepts it as is.
import type { ActionResult } from "../../../_server/actionCore.ts";

export type CellLessonInput = {
  readonly kind: "music" | "sfx";
  readonly source: "triage";
  readonly provider: string | null;
  readonly huntId: null;
  readonly claim: string;
  readonly technique: string[];
  readonly evidence: { readonly n: number; readonly keepRate: number | null; readonly meanScore: number | null; readonly takeIds: string[] };
  readonly opId: string;
};

export type LessonDoor = (input: CellLessonInput) => Promise<ActionResult<unknown>>;
