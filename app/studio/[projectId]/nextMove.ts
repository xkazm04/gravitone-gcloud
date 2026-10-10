// THE NEXT MOVE, SEEN FROM INSIDE THE STUDIO.
//
// The shelf already owns the answer to "where does this project need me":
// `nextAction` (app/_projects/shelf.ts), worst news first — a blocked step, then
// a call to make, then continuing, then starting. The race sheet draws it as one
// press. This module does not decide anything of its own; it only asks the
// shelf's question from the step the user is standing on, and withholds the
// answer in the two cases where drawing it would be noise:
//  · it names the step already on screen — you are where it would send you
//  · the project is delivered — "Delivered" is a state, not a move
// Everything else passes through verbatim, so the shelf and the studio can never
// disagree about what is next (tests/golden-path/studio-next-move case 6).

import { nextAction, type NextAction } from "@/app/_projects/shelf";
import type { PhaseKey, Project } from "@/lib/projects";

export function studioNext(project: Project, active: PhaseKey): NextAction | null {
  const next = nextAction(project);
  if (next.tone === "done" || next.step === active) return null;
  return next;
}
