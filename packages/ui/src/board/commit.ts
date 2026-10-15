// THE COMMIT FLOW - one act per packet, and the operator sees what it will do before it does
// it (Phase 3 decisions 5 and 6). As data, because the same table decides what the desk's
// commit button draws and what the commit key may do next.
//
//   idle ──commit──▶ refused        something is undecided: shake, jump to the first (decision 5)
//        └────────▶ previewing ──▶ shown       the Consequence is on screen with its token
//                                └▶ failed      the preview's own sentence, verbatim
//   shown ──confirm──▶ committing ──▶ done
//                                 └─▶ previewing  409 stale-preview: the fresh one is shown
//                                 └─▶ failed
//
// v1's forge commit took `undecidedAs` and committed a half-judged pile as rejects; the
// prototype refused and pointed at the first open tile. The prototype's rule wins (decision 5:
// ⇧K/⇧X make bulk cheap), and the kernel refuses too, so this refusal is a courtesy that saves
// a round trip - never the only guard.

import { defineMachine } from "@gt/domain/transitions";
import { EDIT_DIRECTIVES, type EditDirective, type EditPlan } from "@gt/domain/board";

export const commitFlow = defineMachine({
  idle: ["previewing", "refused"],
  refused: ["idle", "previewing", "refused"],
  previewing: ["shown", "failed", "idle"],
  shown: ["committing", "previewing", "idle"],
  committing: ["done", "previewing", "failed"],
  failed: ["idle", "previewing", "refused"],
  done: [],
});
export type CommitStep = (typeof commitFlow.states)[number];

/** Where a commit key goes from `step` with `undecided` candidates open. */
export function onCommitKey(step: CommitStep, undecided: number): CommitStep {
  if (step === "shown") return "committing";
  if (step === "previewing" || step === "committing" || step === "done") return step;
  return undecided > 0 ? "refused" : "previewing";
}

/** Tab / ⇧Tab over the five directives (prototype EditNote), wrapping. */
export function cycleDirective(d: EditDirective, back: boolean): EditDirective {
  const i = EDIT_DIRECTIVES.indexOf(d);
  const n = EDIT_DIRECTIVES.length;
  return EDIT_DIRECTIVES[(i + (back ? n - 1 : 1)) % n] ?? d;
}

/** A note with no text carries its directive's words, as the prototype's did (`more weight`). */
export function noteText(d: EditDirective, typed: string): string {
  const t = typed.trim();
  return t === "" ? d.replace("_", " ") : t;
}

export const notesOn = (plan: EditPlan, section: string): EditPlan => plan.filter((n) => n.section === section);
